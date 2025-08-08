#!/usr/bin/env python3
"""
Local development runner for BSMarker without Docker
Requires: Python 3.11+, PostgreSQL, Redis
"""

import subprocess
import sys
import os
import time
from pathlib import Path

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
    """Create .env file for local development"""
    env_content = """DATABASE_URL=postgresql://bsmarker:bsmarker123@localhost:5432/bsmarker_db
REDIS_URL=redis://localhost:6379/0
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=bsmarker
SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
CORS_ORIGINS=["http://localhost:3000"]
"""
    
    env_path = Path("backend/.env")
    env_path.write_text(env_content)
    print("✓ Environment file created")

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
    print("\n🚀 Starting backend server...")
    
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
        "--port", "8000"
    ], cwd="backend")
    
    return backend_process

def start_frontend():
    """Start React frontend"""
    print("\n⚛️  Starting frontend...")
    
    os.chdir("frontend")
    
    # Install npm dependencies if needed
    if not Path("node_modules").exists():
        print("📦 Installing npm dependencies...")
        subprocess.run(["npm", "install"], check=True)
    
    # Start development server
    frontend_process = subprocess.Popen(["npm", "start"])
    
    os.chdir("..")
    return frontend_process

def main():
    """Main runner"""
    print("🎵 BSMarker Local Development Setup")
    print("=" * 40)
    
    if not check_requirements():
        sys.exit(1)
    
    try:
        setup_database()
        start_redis()
        start_minio()
        create_env_file()
        
        venv_path = setup_backend_env()
        run_migrations(venv_path)
        
        # Start services
        backend_proc = start_backend(venv_path)
        if not backend_proc:
            print("❌ Failed to start backend")
            sys.exit(1)
        time.sleep(3)  # Wait for backend to start
        
        frontend_proc = start_frontend()
        
        print("\n" + "=" * 40)
        print("✅ BSMarker is running!")
        print("\n📍 Access points:")
        print("  • Frontend: http://localhost:3000")
        print("  • Backend API: http://localhost:8000")
        print("  • API Docs: http://localhost:8000/docs")
        print("  • MinIO Console: http://localhost:9001")
        print("\n👤 Login credentials:")
        print("  • Email: admin@bsmarker.com")
        print("  • Password: admin123")
        print("\nPress Ctrl+C to stop all services")
        print("=" * 40)
        
        # Wait for interrupt
        backend_proc.wait()
        
    except KeyboardInterrupt:
        print("\n\n🛑 Shutting down services...")
        try:
            backend_proc.terminate()
            frontend_proc.terminate()
        except:
            pass
        print("✓ Services stopped")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()