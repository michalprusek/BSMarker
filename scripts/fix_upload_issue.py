#!/usr/bin/env python3
"""
Fix and monitor upload issues in BSMarker production
"""
import json
import subprocess
import sys
import time


def run_command(cmd, capture=True):
    """Run shell command and return output"""
    try:
        if capture:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            return result.stdout.strip() if result.returncode == 0 else None
        else:
            subprocess.run(cmd, shell=True)
            return True
    except Exception as e:
        print(f"Error running command: {e}")
        return None


def check_docker_containers():
    """Check if all containers are running"""
    print("\n🐋 Checking Docker containers...")
    containers = run_command("docker-compose -f docker-compose.prod.yml ps --format json")
    if not containers:
        print("❌ Cannot check containers. Are you in the right directory?")
        return False

    required = ["backend", "minio", "postgres", "redis", "nginx", "frontend"]
    running = []

    for line in containers.split("\n"):
        if line.strip():
            try:
                data = json.loads(line)
                if data.get("State") == "running":
                    for req in required:
                        if req in data.get("Name", "").lower():
                            running.append(req)
            except json.JSONDecodeError as e:
                print(f"Warning: Failed to parse container JSON: {e}")
                continue

    for service in required:
        if service in running:
            print(f"  ✅ {service}: Running")
        else:
            print(f"  ❌ {service}: Not running")

    return len(running) == len(required)


def test_minio_connection():
    """Test MinIO connection from backend container"""
    print("\n🔌 Testing MinIO connection from backend...")

    test_script = """
import os
import sys
from minio import Minio
from io import BytesIO

endpoint = os.getenv('MINIO_ENDPOINT', 'minio:9000')
access_key = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
secret_key = os.getenv('MINIO_SECRET_KEY', 'minioadmin')

print(f'Connecting to MinIO at {endpoint}...')

try:
    client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=False)

    # Check buckets
    buckets = list(client.list_buckets())
    print(f'✅ Connected successfully! Found {len(buckets)} buckets')

    # Ensure required buckets exist
    for bucket_name in ['recordings', 'spectrograms']:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            print(f'  Created bucket: {bucket_name}')
        else:
            print(f'  Bucket exists: {bucket_name}')

    # Test upload
    test_data = b'Test upload from fix script'
    client.put_object('recordings', 'test/fix_test.txt', BytesIO(test_data), len(test_data))
    print('✅ Test upload successful')

    # Cleanup
    client.remove_object('recordings', 'test/fix_test.txt')
    print('✅ Test cleanup successful')

except Exception as e:
    print(f'❌ MinIO connection failed: {e}')
    sys.exit(1)
"""

    # Write test script to temporary file for safer execution
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(test_script)
        temp_script_path = f.name

    try:
        # Copy script to container and execute
        copy_cmd = f"docker cp {temp_script_path} $(docker-compose -f docker-compose.prod.yml ps -q backend | head -1):/tmp/minio_test.py"
        run_command(copy_cmd, capture=False)
        cmd = "docker-compose -f docker-compose.prod.yml exec -T backend python3 /tmp/minio_test.py"
    finally:
        # Cleanup temp file
        import os

        try:
            os.unlink(temp_script_path)
        except OSError:
            pass
    result = run_command(cmd)
    if result:
        print(result)
        return True
    else:
        print("❌ MinIO connection test failed")
        return False


def check_backend_logs():
    """Check backend logs for errors"""
    print("\n📋 Recent backend errors (last 20 lines)...")
    cmd = "docker-compose -f docker-compose.prod.yml logs --tail=20 backend 2>&1 | grep -E '(ERROR|CRITICAL|Exception|Failed|500)'"
    logs = run_command(cmd)
    if logs:
        print(logs)
    else:
        print("  No recent errors found")


def restart_backend():
    """Restart backend container"""
    print("\n🔄 Restarting backend container...")
    if run_command("docker-compose -f docker-compose.prod.yml restart backend", capture=False):
        print("  Backend restarted")
        time.sleep(10)  # Wait for startup
        return True
    return False


def check_minio_health():
    """Check MinIO health directly"""
    print("\n🏥 Checking MinIO health...")

    # Check from inside the network
    cmd = "docker-compose -f docker-compose.prod.yml exec -T backend curl -s http://minio:9000/minio/health/live"
    result = run_command(cmd)
    if result:
        print("  ✅ MinIO is healthy (internal check)")
    else:
        print("  ❌ MinIO health check failed")
        return False

    # Check MinIO logs
    print("\n  Recent MinIO logs:")
    cmd = "docker-compose -f docker-compose.prod.yml logs --tail=10 minio 2>&1 | grep -v 'Browser Access'"
    logs = run_command(cmd)
    if logs:
        for line in logs.split("\n")[:5]:  # Show only first 5 lines
            if line.strip():
                print(f"    {line.strip()}")

    return True


def fix_permissions():
    """Fix volume permissions if needed"""
    print("\n🔐 Checking volume permissions...")

    # Check MinIO data directory
    cmd = "docker-compose -f docker-compose.prod.yml exec -T minio ls -la /data/ | head -5"
    result = run_command(cmd)
    if result:
        print("  MinIO data directory accessible")
    else:
        print("  ⚠️ Cannot access MinIO data directory")


def apply_fixes():
    """Apply fixes for common issues"""
    print("\n🔧 Applying fixes...")

    fixes_applied = []

    # 1. Ensure buckets exist
    print("  1. Ensuring MinIO buckets exist...")
    bucket_cmd = "docker-compose -f docker-compose.prod.yml exec -T backend python3 -c \"from app.services.minio_client import minio_client; print('Buckets initialized')\""
    result = run_command(bucket_cmd)
    if result and "Buckets initialized" in result:
        fixes_applied.append("MinIO buckets initialized")
        print(f"    Result: {result}")
    else:
        print(f"    Failed: {result or 'No output'}")
        warning("Failed to initialize MinIO buckets")

    # 2. Clear any stale connections
    print("  2. Clearing stale connections...")
    if restart_backend():
        fixes_applied.append("Backend restarted")

    return fixes_applied


def main():
    """Main diagnostic and fix routine"""
    print("=" * 60)
    print(" BSMarker Upload Issue Diagnostic & Fix Tool")
    print("=" * 60)

    # Change to BSMarker directory
    import os

    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    os.chdir(parent_dir)
    print(f"Working directory: {os.getcwd()}")

    # Run diagnostics
    all_good = True

    if not check_docker_containers():
        print("\n⚠️ Some containers are not running!")
        all_good = False

    if not check_minio_health():
        print("\n⚠️ MinIO health check failed!")
        all_good = False

    if not test_minio_connection():
        print("\n⚠️ MinIO connection test failed!")
        all_good = False

        # Try to fix
        print("\n🔨 Attempting automatic fixes...")
        fixes = apply_fixes()

        if fixes:
            print(f"\n  Applied fixes: {', '.join(fixes)}")

            # Retest
            print("\n🔄 Retesting after fixes...")
            time.sleep(5)
            if test_minio_connection():
                print("\n✅ MinIO connection fixed!")
                all_good = True

    # Check logs
    check_backend_logs()

    # Final status
    print("\n" + "=" * 60)
    if all_good:
        print("✅ All systems operational!")
        print("\nNext steps:")
        print("1. Try uploading a file again from the web interface")
        print("2. If issues persist, check network connectivity between containers")
        print("3. Monitor backend logs: docker-compose -f docker-compose.prod.yml logs -f backend")
    else:
        print("⚠️ Issues detected!")
        print("\nManual intervention may be needed:")
        print("1. Check .env.production file for correct MinIO credentials")
        print("2. Restart all services: docker-compose -f docker-compose.prod.yml restart")
        print("3. Check disk space: df -h")
        print("4. Check Docker logs: docker-compose -f docker-compose.prod.yml logs")
    print("=" * 60)


if __name__ == "__main__":
    main()
