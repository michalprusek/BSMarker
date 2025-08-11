#!/usr/bin/env python3
"""
BSMarker Local Development Runner (Enhanced)

A robust local development script for BSMarker that provides:
- Port conflict detection and resolution
- Single instance management with PID tracking
- Automatic cleanup on exit
- Force kill option for development
- Status monitoring and process management

Features:
- Checks ports 3456 (frontend) and 8123 (backend) for conflicts
- Prevents multiple instances from running simultaneously
- Graceful shutdown with proper cleanup
- Detailed status reporting
- Cross-platform compatibility (macOS/Linux)

Requirements: Python 3.11+, PostgreSQL, Redis, psutil

Author: BSMarker Development Team
Version: 2.0.0 (Enhanced with port management)
"""

import subprocess
import sys
import os
import time
import signal
import socket
import argparse
import atexit
from pathlib import Path

# psutil will be imported later after checking if it's available

# Global variables for process tracking
VERSION = "2.0.0"
FRONTEND_PORT = 3456
BACKEND_PORT = 8123
PID_FILE = Path(".bsmarker.pid")
running_processes = []

def cleanup_on_exit():
    """Cleanup function called on exit"""
    print("\n🧹 Cleaning up resources...")
    
    # Kill tracked processes
    for proc in running_processes:
        try:
            if proc.poll() is None:  # Process is still running
                proc.terminate()
                proc.wait(timeout=5)
        except (subprocess.TimeoutExpired, AttributeError):
            try:
                proc.kill()
            except:
                pass
    
    # Remove PID file
    if PID_FILE.exists():
        PID_FILE.unlink()
    
    # Kill any remaining processes on our ports
    for port in [FRONTEND_PORT, BACKEND_PORT]:
        kill_process_on_port(port, silent=True)
    
    print("✓ Cleanup complete")

def register_cleanup():
    """Register cleanup handlers"""
    atexit.register(cleanup_on_exit)
    signal.signal(signal.SIGINT, lambda sig, frame: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda sig, frame: sys.exit(0))

def is_port_in_use(port):
    """Check if a port is already in use"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        result = sock.connect_ex(('localhost', port))
        return result == 0

def find_process_on_port(port):
    """Find process using a specific port"""
    try:
        import psutil
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                # Use net_connections() to avoid deprecation warning
                connections = proc.net_connections() if hasattr(proc, 'net_connections') else proc.connections()
                for conn in connections:
                    if conn.laddr.port == port and conn.status == psutil.CONN_LISTEN:
                        return proc
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
    except ImportError:
        print("⚠️  psutil not available, cannot identify processes on ports")
        return None
    except:
        pass
    return None

def kill_process_on_port(port, silent=False):
    """Kill process running on a specific port"""
    proc = find_process_on_port(port)
    if proc:
        try:
            import psutil
            if not silent:
                print(f"  Killing process {proc.pid} ({proc.name()}) on port {port}")
            proc.terminate()
            proc.wait(timeout=5)
            return True
        except (psutil.TimeoutExpired, psutil.NoSuchProcess):
            try:
                proc.kill()
                return True
            except:
                pass
        except ImportError:
            if not silent:
                print(f"  Warning: psutil not available, trying system kill...")
            # Fallback to lsof + kill for Unix systems
            try:
                result = subprocess.run(
                    ["lsof", "-ti", f":{port}"], 
                    capture_output=True, text=True
                )
                if result.returncode == 0:
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        if pid:
                            subprocess.run(["kill", "-TERM", pid], check=True)
                            if not silent:
                                print(f"  Killed process {pid} on port {port}")
                    return True
            except (subprocess.CalledProcessError, FileNotFoundError):
                if not silent:
                    print(f"  Warning: Could not kill process on port {port}")
            return False
        except Exception as e:
            if not silent:
                print(f"  Warning: Could not kill process on port {port}: {e}")
    return False

def check_and_handle_ports(force=False):
    """Check ports and handle conflicts"""
    ports_to_check = {
        FRONTEND_PORT: "Frontend (React)",
        BACKEND_PORT: "Backend (FastAPI)"
    }
    
    conflicts = []
    for port, service in ports_to_check.items():
        if is_port_in_use(port):
            proc = find_process_on_port(port)
            proc_info = f" (PID: {proc.pid}, {proc.name()})" if proc else ""
            conflicts.append((port, service, proc_info))
    
    if not conflicts:
        return True
    
    print(f"\n⚠️  Port conflicts detected:")
    for port, service, proc_info in conflicts:
        print(f"  • Port {port} ({service}) is in use{proc_info}")
    
    if force:
        print(f"\n🔧 Force flag enabled - killing conflicting processes...")
        all_killed = True
        for port, service, _ in conflicts:
            if not kill_process_on_port(port):
                print(f"  ❌ Failed to kill process on port {port}")
                all_killed = False
        
        if all_killed:
            print("✓ All conflicting processes terminated")
            time.sleep(2)  # Give ports time to be released
            return True
        else:
            return False
    
    print(f"\nOptions:")
    print(f"  1. Kill conflicting processes and continue (y)")
    print(f"  2. Exit and handle manually (n)")
    print(f"  3. Use --force flag next time to auto-kill")
    
    choice = input(f"\nKill conflicting processes? (y/n): ").lower().strip()
    
    if choice in ['y', 'yes']:
        print(f"\n🔧 Terminating conflicting processes...")
        all_killed = True
        for port, service, _ in conflicts:
            if not kill_process_on_port(port):
                all_killed = False
        
        if all_killed:
            print("✓ All conflicting processes terminated")
            time.sleep(2)  # Give ports time to be released
            return True
        else:
            print("❌ Some processes could not be terminated")
            return False
    else:
        print("❌ Cannot proceed with port conflicts")
        print("   Manually stop services or use --force flag")
        return False

def check_existing_instance():
    """Check if BSMarker is already running"""
    if not PID_FILE.exists():
        return False
    
    try:
        import psutil
        pid = int(PID_FILE.read_text().strip())
        if psutil.pid_exists(pid):
            proc = psutil.Process(pid)
            if 'python' in proc.name().lower() and 'run_local.py' in ' '.join(proc.cmdline()):
                return pid
    except ImportError:
        print("⚠️  psutil not available, cannot check existing instances")
        return False
    except (ValueError, psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    
    # PID file exists but process doesn't - clean it up
    PID_FILE.unlink()
    return False

def create_pid_file():
    """Create PID file to track this instance"""
    PID_FILE.write_text(str(os.getpid()))

def show_status():
    """Show current BSMarker status"""
    print("🎵 BSMarker Status Check")
    print("=" * 40)
    
    # Check if instance is running
    existing_pid = check_existing_instance()
    if existing_pid:
        print(f"✅ BSMarker is running (PID: {existing_pid})")
        
        # Check port status
        for port, service in [(FRONTEND_PORT, "Frontend"), (BACKEND_PORT, "Backend")]:
            if is_port_in_use(port):
                proc = find_process_on_port(port)
                proc_info = f" (PID: {proc.pid})" if proc else ""
                print(f"  • {service}: Running on port {port}{proc_info}")
            else:
                print(f"  • {service}: Not responding on port {port}")
    else:
        print("❌ BSMarker is not running")
        
        # Check if ports are occupied by other processes
        for port, service in [(FRONTEND_PORT, "Frontend"), (BACKEND_PORT, "Backend")]:
            if is_port_in_use(port):
                proc = find_process_on_port(port)
                proc_info = f" (PID: {proc.pid}, {proc.name()})" if proc else ""
                print(f"  ⚠️  Port {port} ({service}) occupied by other process{proc_info}")
    
    print("\n📍 Expected access points:")
    print(f"  • Frontend: http://localhost:{FRONTEND_PORT}")
    print(f"  • Backend API: http://localhost:{BACKEND_PORT}")
    print(f"  • API Docs: http://localhost:{BACKEND_PORT}/docs")
    print("=" * 40)

def check_python_requirements():
    """Check and install Python requirements for this script"""
    try:
        import psutil
        return True
    except ImportError:
        print("📦 Installing required Python packages...")
        try:
            subprocess.run([
                sys.executable, "-m", "pip", "install", 
                "-r", "system_requirements.txt"
            ], check=True, capture_output=True)
            print("✓ Python packages installed")
            # Re-import to make sure it's available
            import psutil
            return True
        except subprocess.CalledProcessError:
            print("❌ Failed to install Python packages")
            print("   Try manually: pip3 install psutil")
            return False

def check_requirements():
    """Check if required services are available"""
    requirements = {
        "python3": "Python 3.11+",
        "psql": "PostgreSQL",
        "redis-cli": "Redis"
    }
    
    missing = []
    for cmd, name in requirements.items():
        try:
            subprocess.run([cmd, "--version"], capture_output=True, check=True)
            print(f"✓ {name} found")
        except (subprocess.CalledProcessError, FileNotFoundError):
            missing.append(name)
            print(f"✗ {name} not found")
    
    if missing:
        print(f"\n❌ Missing requirements: {', '.join(missing)}")
        print("\nInstall with Homebrew:")
        print("  brew install postgresql@15 redis python@3.11")
        return False
    
    # Check Python requirements
    if not check_python_requirements():
        return False
        
    return True

def setup_database():
    """Create database and user if not exists"""
    print("\n📦 Setting up PostgreSQL database...")
    
    # Start PostgreSQL if not running
    subprocess.run(["brew", "services", "start", "postgresql@15"], capture_output=True)
    time.sleep(2)
    
    # Create database and user
    commands = [
        "CREATE USER bsmarker WITH PASSWORD 'bsmarker123';",
        "CREATE DATABASE bsmarker_db OWNER bsmarker;",
        "GRANT ALL PRIVILEGES ON DATABASE bsmarker_db TO bsmarker;"
    ]
    
    for cmd in commands:
        try:
            subprocess.run(["psql", "-U", os.getenv("USER"), "-d", "postgres", "-c", cmd], 
                         capture_output=True, check=False)
        except:
            pass  # Ignore if already exists
    
    print("✓ Database configured")

def start_redis():
    """Start Redis server"""
    print("\n🔴 Starting Redis...")
    subprocess.run(["brew", "services", "start", "redis"], capture_output=True)
    time.sleep(2)
    print("✓ Redis started")

def setup_backend_env():
    """Setup Python virtual environment and install dependencies"""
    print("\n🐍 Setting up Python environment...")
    
    backend_path = Path("backend")
    venv_path = backend_path / "venv"
    
    if not venv_path.exists():
        subprocess.run([sys.executable, "-m", "venv", str(venv_path)], check=True)
        print("✓ Virtual environment created")
    
    # Install dependencies
    pip_path = venv_path / "bin" / "pip"
    requirements_path = backend_path / "requirements.txt"
    
    print("📦 Installing Python dependencies...")
    subprocess.run([str(pip_path), "install", "-r", str(requirements_path)], check=True)
    print("✓ Dependencies installed")
    
    return venv_path

def create_env_file():
    """Create .env file for local development if it doesn't exist"""
    env_path = Path("backend/.env")
    
    # Check if .env already exists
    if env_path.exists():
        print("✓ Environment file already exists - preserving existing configuration")
        return
    
    print("📝 Creating new environment file...")
    
    # Try to generate secure secrets
    try:
        # Import the secret generator
        sys.path.insert(0, str(Path("backend")))
        from app.core.generate_secrets import generate_all_secrets, write_env_file
        
        # Generate secure secrets for local development
        secrets = generate_all_secrets()
        
        # Override some values for local development
        secrets.update({
            "DATABASE_URL": "postgresql://bsmarker:bsmarker123@localhost:5432/bsmarker_db",
            "REDIS_URL": "redis://localhost:6379/0",
            "MINIO_ENDPOINT": "localhost:9000",
            "MINIO_ACCESS_KEY": "minioadmin", 
            "MINIO_SECRET_KEY": "minioadmin",
            "CORS_ORIGINS": '["http://localhost:3456"]'
        })
        
        # Write the secure .env file
        write_env_file(secrets, env_path)
        print("✓ Environment file created with secure secrets")
        
    except ImportError:
        # Fallback to basic .env if generate_secrets not available
        env_content = """# BSMarker Local Development Environment
# WARNING: Using fallback configuration with weak secrets
# Run 'python app/core/generate_secrets.py' to generate secure secrets

DATABASE_URL=postgresql://bsmarker:bsmarker123@localhost:5432/bsmarker_db
REDIS_URL=redis://localhost:6379/0
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=false
SECRET_KEY=your-super-secret-jwt-key-change-this-in-production-INSECURE-DEV-ONLY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=["http://localhost:3456"]
FIRST_ADMIN_EMAIL=admin@bsmarker.com
FIRST_ADMIN_PASSWORD=admin123
"""
        
        env_path.write_text(env_content)
        print("⚠️  Environment file created with basic secrets")
        print("🔐 SECURITY WARNING: Run 'cd backend && python app/core/generate_secrets.py' to generate secure secrets")

def start_minio():
    """Start MinIO in background"""
    print("\n📁 Starting MinIO (S3-compatible storage)...")
    
    # Create data directory
    minio_data = Path("minio-data")
    minio_data.mkdir(exist_ok=True)
    
    # Start MinIO server
    minio_cmd = [
        "minio", "server", str(minio_data),
        "--console-address", ":9001"
    ]
    
    try:
        subprocess.Popen(minio_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("✓ MinIO started on :9000 (console: :9001)")
    except FileNotFoundError:
        print("⚠️  MinIO not found. Install with: brew install minio")
        print("   Continuing without file storage...")

def run_migrations(venv_path):
    """Run database migrations"""
    print("\n🔄 Running database migrations...")
    
    python_path = venv_path / "bin" / "python"
    
    # Create a simple migration script
    migration_script = """
import sys
import os
# Add backend directory to path
backend_path = os.path.join(os.getcwd(), 'backend')
sys.path.insert(0, backend_path)

# Set environment variables from .env file
from dotenv import load_dotenv
load_dotenv('backend/.env')

from app.db.database import engine, Base
from app.models import user, project, recording, spectrogram, annotation

print("Creating database tables...")
Base.metadata.create_all(bind=engine)
print("✓ Database tables created")

# Create admin user
from app.db.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

db = SessionLocal()
try:
    admin = db.query(User).filter(User.email == "admin@bsmarker.com").first()
    if not admin:
        admin = User(
            email="admin@bsmarker.com",
            username="admin",
            hashed_password=get_password_hash("admin123"),
            full_name="Administrator",
            is_active=True,
            is_admin=True
        )
        db.add(admin)
        db.commit()
        print("✓ Admin user created (admin@bsmarker.com / admin123)")
    else:
        print("✓ Admin user already exists")
finally:
    db.close()
"""
    
    Path("migrate.py").write_text(migration_script)
    subprocess.run([str(python_path), "migrate.py"], check=True, cwd=".")
    Path("migrate.py").unlink()  # Clean up

def start_backend(venv_path):
    """Start FastAPI backend"""
    print(f"\n🚀 Starting backend server on port {BACKEND_PORT}...")
    
    # Use absolute path for python
    python_path = Path.cwd() / "backend" / "venv" / "bin" / "python"
    
    if not python_path.exists():
        print(f"❌ Python not found at: {python_path}")
        return None
    
    backend_process = subprocess.Popen([
        str(python_path), "-m", "uvicorn",
        "app.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", str(BACKEND_PORT)
    ], cwd="backend")
    
    # Track the process for cleanup
    running_processes.append(backend_process)
    
    # Wait a moment and check if it started successfully
    time.sleep(2)
    if backend_process.poll() is not None:
        print(f"❌ Backend failed to start (exit code: {backend_process.returncode})")
        return None
    
    print(f"✓ Backend started successfully")
    return backend_process

def start_frontend():
    """Start React frontend"""
    print(f"\n⚛️  Starting frontend on port {FRONTEND_PORT}...")
    
    frontend_dir = Path("frontend")
    original_dir = Path.cwd()
    
    try:
        os.chdir(frontend_dir)
        
        # Install npm dependencies if needed
        if not Path("node_modules").exists():
            print("📦 Installing npm dependencies...")
            subprocess.run(["npm", "install"], check=True)
        
        # Set environment variables for frontend
        env = os.environ.copy()
        env["PORT"] = str(FRONTEND_PORT)
        env["REACT_APP_API_URL"] = f"http://localhost:{BACKEND_PORT}"
        
        # Start development server
        frontend_process = subprocess.Popen(["npm", "start"], env=env)
        
        # Track the process for cleanup
        running_processes.append(frontend_process)
        
        # Wait a moment and check if it started successfully
        time.sleep(3)
        if frontend_process.poll() is not None:
            print(f"❌ Frontend failed to start (exit code: {frontend_process.returncode})")
            return None
        
        print(f"✓ Frontend started successfully")
        return frontend_process
    
    finally:
        os.chdir(original_dir)

def main():
    """Main runner with argument parsing"""
    parser = argparse.ArgumentParser(
        description="BSMarker Local Development Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 run_local.py              # Start BSMarker (check for conflicts)
  python3 run_local.py --force      # Start BSMarker (auto-kill conflicts)
  python3 run_local.py --status     # Show current status
  python3 run_local.py --stop       # Stop running instance
        """
    )
    
    parser.add_argument(
        "--force", 
        action="store_true",
        help="Automatically kill processes on conflicting ports"
    )
    parser.add_argument(
        "--status", 
        action="store_true",
        help="Show current BSMarker status and exit"
    )
    parser.add_argument(
        "--stop", 
        action="store_true",
        help="Stop running BSMarker instance and exit"
    )
    parser.add_argument(
        "--version", 
        action="version",
        version=f"BSMarker Local Runner v{VERSION}"
    )
    
    args = parser.parse_args()
    
    # Handle status check
    if args.status:
        show_status()
        return
    
    # Handle stop command
    if args.stop:
        print("🛑 Stopping BSMarker...")
        existing_pid = check_existing_instance()
        if existing_pid:
            try:
                import psutil
                proc = psutil.Process(existing_pid)
                proc.terminate()
                proc.wait(timeout=10)
                print(f"✓ BSMarker stopped (PID: {existing_pid})")
            except ImportError:
                print("⚠️  psutil not available, trying OS kill command...")
                try:
                    subprocess.run(["kill", str(existing_pid)], check=True)
                    print(f"✓ BSMarker stopped (PID: {existing_pid})")
                except subprocess.CalledProcessError:
                    print("❌ Failed to stop process")
            except (psutil.NoSuchProcess, psutil.TimeoutExpired):
                print("⚠️  Process already stopped or unresponsive")
            
            # Clean up ports and PID file
            cleanup_on_exit()
        else:
            print("❌ No running BSMarker instance found")
        return
    
    # Main startup logic
    print("🎵 BSMarker Local Development Setup")
    print("=" * 40)
    
    # Register cleanup handlers
    register_cleanup()
    
    # Check for existing instance
    existing_pid = check_existing_instance()
    if existing_pid:
        print(f"❌ BSMarker is already running (PID: {existing_pid})")
        print("   Use --stop to stop it or --status to check status")
        sys.exit(1)
    
    # Check and handle port conflicts
    if not check_and_handle_ports(force=args.force):
        sys.exit(1)
    
    # Create PID file to track this instance
    create_pid_file()
    
    # Check requirements
    if not check_requirements():
        sys.exit(1)
    
    try:
        # Setup services
        setup_database()
        start_redis()
        start_minio()
        create_env_file()
        
        venv_path = setup_backend_env()
        run_migrations(venv_path)
        
        # Start backend
        backend_proc = start_backend(venv_path)
        if not backend_proc:
            print("❌ Failed to start backend")
            sys.exit(1)
        
        # Wait for backend to be ready
        print("⏳ Waiting for backend to be ready...")
        max_wait = 30
        wait_time = 0
        while wait_time < max_wait:
            if is_port_in_use(BACKEND_PORT):
                print("✓ Backend is ready")
                break
            time.sleep(1)
            wait_time += 1
        else:
            print("⚠️  Backend may not be fully ready yet, continuing...")
        
        # Start frontend
        frontend_proc = start_frontend()
        if not frontend_proc:
            print("❌ Failed to start frontend")
            sys.exit(1)
        
        # Success message
        print("\n" + "=" * 50)
        print("✅ BSMarker is running successfully!")
        print("\n📍 Access points:")
        print(f"  • Frontend: http://localhost:{FRONTEND_PORT}")
        print(f"  • Backend API: http://localhost:{BACKEND_PORT}")
        print(f"  • API Docs: http://localhost:{BACKEND_PORT}/docs")
        print("  • MinIO Console: http://localhost:9001")
        print("\n👤 Default login credentials:")
        print("  • Email: admin@bsmarker.com")
        print("  • Password: admin123")
        print(f"\n📊 Process info:")
        print(f"  • Main PID: {os.getpid()}")
        print(f"  • Backend PID: {backend_proc.pid}")
        print(f"  • Frontend PID: {frontend_proc.pid}")
        print("\n💡 Commands:")
        print("  • python3 run_local.py --status  # Check status")
        print("  • python3 run_local.py --stop    # Stop services")
        print("\nPress Ctrl+C to stop all services")
        print("=" * 50)
        
        # Wait for processes to finish (or interrupt)
        try:
            while backend_proc.poll() is None and frontend_proc.poll() is None:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        
        # If we get here, one of the processes died
        if backend_proc.poll() is not None:
            print(f"\n⚠️  Backend process exited with code {backend_proc.returncode}")
        if frontend_proc.poll() is not None:
            print(f"\n⚠️  Frontend process exited with code {frontend_proc.returncode}")
        
    except KeyboardInterrupt:
        print("\n\n🛑 Shutdown requested...")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        # Cleanup is handled by atexit and signal handlers
        pass

if __name__ == "__main__":
    main()