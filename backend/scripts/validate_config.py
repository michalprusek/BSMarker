#!/usr/bin/env python3
"""
Configuration validation script for BSMarker
Validates all settings and optionally tests external connections
"""

import os
import sys
import argparse
import asyncio
import warnings
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import time

# Add backend directory to path
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

try:
    import psycopg2
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

try:
    import minio
    MINIO_AVAILABLE = True
except ImportError:
    MINIO_AVAILABLE = False


def load_env_file(env_path: Path) -> Dict[str, str]:
    """Load environment variables from .env file"""
    env_vars = {}
    
    if not env_path.exists():
        return env_vars
    
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                # Remove quotes
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                env_vars[key] = value
    
    return env_vars


def validate_configuration() -> List[Tuple[str, str, str]]:
    """
    Validate BSMarker configuration
    
    Returns:
        List of (level, field, message) tuples
    """
    issues = []
    
    # Load environment
    env_path = Path('.env')
    env_vars = load_env_file(env_path)
    
    # Set environment variables for validation
    for key, value in env_vars.items():
        os.environ[key] = value
    
    try:
        # Import after setting environment variables
        from app.core.config import Settings
        
        # Suppress warnings during validation
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            
            # Try to create settings instance
            try:
                settings = Settings()
                
                # Check for validation warnings
                for warning in w:
                    issues.append(("WARNING", "VALIDATION", str(warning.message)))
                
                # Validate required secrets are not defaults/weak
                secret_checks = [
                    ("SECRET_KEY", settings.SECRET_KEY, ["your-secret-key", "change-in-production"]),
                    ("DATABASE_URL", settings.DATABASE_URL, ["bsmarker_pass", "password"]),
                    ("MINIO_ACCESS_KEY", settings.MINIO_ACCESS_KEY, ["minioadmin"]),
                    ("MINIO_SECRET_KEY", settings.MINIO_SECRET_KEY, ["minioadmin"]),
                    ("FIRST_ADMIN_PASSWORD", settings.FIRST_ADMIN_PASSWORD, ["admin123", "password"])
                ]
                
                for field_name, value, weak_patterns in secret_checks:
                    for pattern in weak_patterns:
                        if pattern in value.lower():
                            issues.append(("ERROR", field_name, f"Contains weak pattern: {pattern}"))
                
                # Check secret lengths
                if len(settings.SECRET_KEY) < 32:
                    issues.append(("ERROR", "SECRET_KEY", "Must be at least 32 characters"))
                
                if len(settings.FIRST_ADMIN_PASSWORD) < 8:
                    issues.append(("ERROR", "FIRST_ADMIN_PASSWORD", "Must be at least 8 characters"))
                
                # Validate URL formats
                if not settings.DATABASE_URL.startswith('postgresql://'):
                    issues.append(("ERROR", "DATABASE_URL", "Must start with postgresql://"))
                
                if not settings.REDIS_URL.startswith('redis://'):
                    issues.append(("ERROR", "REDIS_URL", "Must start with redis://"))
                
                # Check CORS origins
                for origin in settings.CORS_ORIGINS:
                    if not origin.startswith(('http://', 'https://')):
                        issues.append(("ERROR", "CORS_ORIGINS", f"Invalid origin format: {origin}"))
                
                print("✅ Configuration loaded successfully")
                
            except Exception as e:
                issues.append(("ERROR", "CONFIG", f"Failed to load configuration: {str(e)}"))
                return issues
                
    except ImportError as e:
        issues.append(("ERROR", "IMPORT", f"Failed to import settings: {str(e)}"))
    
    return issues


def test_database_connection(database_url: str) -> Tuple[bool, str]:
    """Test PostgreSQL database connection"""
    if not POSTGRES_AVAILABLE:
        return False, "psycopg2 not available"
    
    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        return True, f"Connected: {version}"
    except Exception as e:
        return False, str(e)


def test_redis_connection(redis_url: str) -> Tuple[bool, str]:
    """Test Redis connection"""
    if not REDIS_AVAILABLE:
        return False, "redis package not available"
    
    try:
        r = redis.from_url(redis_url)
        info = r.info()
        version = info.get('redis_version', 'unknown')
        return True, f"Connected: Redis {version}"
    except Exception as e:
        return False, str(e)


def test_minio_connection(endpoint: str, access_key: str, secret_key: str, secure: bool = False) -> Tuple[bool, str]:
    """Test MinIO connection"""
    if not MINIO_AVAILABLE:
        return False, "minio package not available"
    
    try:
        client = minio.Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
        
        # Test connection by listing buckets
        buckets = list(client.list_buckets())
        return True, f"Connected: {len(buckets)} buckets found"
    except Exception as e:
        return False, str(e)


def test_connections(env_vars: Dict[str, str]) -> Dict[str, Tuple[bool, str]]:
    """Test all external service connections"""
    results = {}
    
    # Test database
    if 'DATABASE_URL' in env_vars:
        print("🔌 Testing database connection...")
        results['database'] = test_database_connection(env_vars['DATABASE_URL'])
    
    # Test Redis
    if 'REDIS_URL' in env_vars:
        print("🔌 Testing Redis connection...")
        results['redis'] = test_redis_connection(env_vars['REDIS_URL'])
    
    # Test MinIO
    if all(key in env_vars for key in ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY']):
        print("🔌 Testing MinIO connection...")
        secure = env_vars.get('MINIO_SECURE', 'false').lower() == 'true'
        results['minio'] = test_minio_connection(
            env_vars['MINIO_ENDPOINT'],
            env_vars['MINIO_ACCESS_KEY'],
            env_vars['MINIO_SECRET_KEY'],
            secure
        )
    
    return results


def print_results(issues: List[Tuple[str, str, str]], connection_results: Optional[Dict[str, Tuple[bool, str]]] = None):
    """Print validation results in a formatted way"""
    
    # Print configuration issues
    errors = [issue for issue in issues if issue[0] == 'ERROR']
    warnings = [issue for issue in issues if issue[0] == 'WARNING']
    
    if not errors and not warnings:
        print("✅ Configuration validation passed")
    else:
        if errors:
            print(f"\n❌ {len(errors)} Error(s):")
            for level, field, message in errors:
                print(f"   {field}: {message}")
        
        if warnings:
            print(f"\n⚠️  {len(warnings)} Warning(s):")
            for level, field, message in warnings:
                print(f"   {field}: {message}")
    
    # Print connection test results
    if connection_results:
        print("\n🔌 Connection Tests:")
        for service, (success, message) in connection_results.items():
            status = "✅" if success else "❌"
            print(f"   {service}: {status} {message}")
    
    # Summary
    print("\n" + "=" * 40)
    total_errors = len(errors)
    total_warnings = len(warnings)
    
    if total_errors == 0:
        print("✅ Configuration is valid")
    else:
        print(f"❌ Configuration has {total_errors} error(s)")
    
    if connection_results:
        failed_connections = sum(1 for success, _ in connection_results.values() if not success)
        if failed_connections == 0:
            print("✅ All connections successful")
        else:
            print(f"❌ {failed_connections} connection(s) failed")


def main():
    parser = argparse.ArgumentParser(description='Validate BSMarker configuration')
    parser.add_argument('--test-connections', '-t', action='store_true',
                        help='Test connections to external services')
    parser.add_argument('--env-file', '-e', type=str, default='.env',
                        help='Path to .env file (default: .env)')
    parser.add_argument('--quiet', '-q', action='store_true',
                        help='Only show errors and warnings')
    
    args = parser.parse_args()
    
    if not args.quiet:
        print("🔍 BSMarker Configuration Validator")
        print("=" * 40)
    
    # Change to env file directory
    env_path = Path(args.env_file)
    if env_path.parent != Path('.'):
        os.chdir(env_path.parent)
        env_path = Path(env_path.name)
    
    if not env_path.exists():
        print(f"❌ Environment file not found: {args.env_file}")
        print("   Generate one with: python app/core/generate_secrets.py")
        sys.exit(1)
    
    # Validate configuration
    if not args.quiet:
        print("🔧 Validating configuration...")
    
    issues = validate_configuration()
    
    # Test connections if requested
    connection_results = None
    if args.test_connections:
        env_vars = load_env_file(env_path)
        connection_results = test_connections(env_vars)
    
    # Print results
    print_results(issues, connection_results)
    
    # Exit with appropriate code
    errors = [issue for issue in issues if issue[0] == 'ERROR']
    if errors:
        sys.exit(1)
    elif connection_results and any(not success for success, _ in connection_results.values()):
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()