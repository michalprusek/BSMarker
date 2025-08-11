#!/usr/bin/env python3
"""
Secret rotation script for existing BSMarker deployments
Safely rotates all secrets while maintaining service availability
"""

import os
import sys
import shutil
import argparse
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

# Add backend directory to path
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from app.core.generate_secrets import generate_all_secrets, write_env_file


def backup_env_file(env_path: Path) -> Path:
    """
    Create a backup of the current .env file
    
    Args:
        env_path: Path to the .env file
        
    Returns:
        Path to the backup file
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = env_path.parent / f".env.backup.{timestamp}"
    
    if env_path.exists():
        shutil.copy2(env_path, backup_path)
        print(f"✓ Backup created: {backup_path}")
        return backup_path
    else:
        print("⚠️  No existing .env file found")
        return backup_path


def parse_existing_env(env_path: Path) -> Dict[str, str]:
    """
    Parse existing .env file to preserve non-secret values
    
    Args:
        env_path: Path to the .env file
        
    Returns:
        Dictionary of environment variables
    """
    env_vars = {}
    
    if not env_path.exists():
        return env_vars
    
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                # Remove quotes if present
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                env_vars[key] = value
    
    return env_vars


def merge_configurations(existing: Dict[str, str], new_secrets: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge existing configuration with new secrets
    
    Args:
        existing: Existing environment variables
        new_secrets: New secrets to use
        
    Returns:
        Merged configuration
    """
    # Start with existing config
    merged = existing.copy()
    
    # List of keys that should always be rotated (secrets)
    secret_keys = {
        'SECRET_KEY',
        'DATABASE_PASSWORD', 
        'REDIS_PASSWORD',
        'MINIO_ACCESS_KEY',
        'MINIO_SECRET_KEY',
        'FIRST_ADMIN_PASSWORD'
    }
    
    # Update URLs with new credentials
    if 'DATABASE_USER' in new_secrets and 'DATABASE_PASSWORD' in new_secrets:
        db_user = new_secrets['DATABASE_USER']
        db_pass = new_secrets['DATABASE_PASSWORD']
        db_host = existing.get('DATABASE_HOST', 'localhost')
        db_port = existing.get('DATABASE_PORT', '5432')
        db_name = existing.get('DATABASE_NAME', 'bsmarker_db')
        merged['DATABASE_URL'] = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    elif 'DATABASE_URL' in new_secrets:
        merged['DATABASE_URL'] = new_secrets['DATABASE_URL']
    
    if 'REDIS_PASSWORD' in new_secrets:
        redis_host = existing.get('REDIS_HOST', 'localhost')
        redis_port = existing.get('REDIS_PORT', '6379')
        redis_db = existing.get('REDIS_DB', '0')
        merged['REDIS_URL'] = f"redis://:{new_secrets['REDIS_PASSWORD']}@{redis_host}:{redis_port}/{redis_db}"
    elif 'REDIS_URL' in new_secrets:
        merged['REDIS_URL'] = new_secrets['REDIS_URL']
    
    # Update all secret values
    for key in secret_keys:
        if key in new_secrets:
            merged[key] = new_secrets[key]
    
    return merged


def write_rotation_summary(backup_path: Path, rotated_keys: set) -> None:
    """
    Write a summary of what was rotated
    
    Args:
        backup_path: Path to the backup file
        rotated_keys: Set of keys that were rotated
    """
    summary_path = backup_path.parent / f"rotation_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    
    with open(summary_path, 'w') as f:
        f.write("BSMarker Secret Rotation Summary\n")
        f.write("=" * 40 + "\n")
        f.write(f"Date: {datetime.now().isoformat()}\n")
        f.write(f"Backup: {backup_path.name}\n\n")
        f.write("Rotated Secrets:\n")
        for key in sorted(rotated_keys):
            f.write(f"  - {key}\n")
        f.write("\nPost-Rotation Steps Required:\n")
        f.write("  1. Update database user credentials\n")
        f.write("  2. Update Redis authentication\n") 
        f.write("  3. Update MinIO credentials\n")
        f.write("  4. Restart all services\n")
        f.write("  5. Validate configuration with: python scripts/validate_config.py\n")
    
    print(f"✓ Rotation summary written to: {summary_path}")


def main():
    parser = argparse.ArgumentParser(description='Rotate secrets for BSMarker deployment')
    parser.add_argument('--env-file', '-e', type=str, default='.env',
                        help='Path to .env file (default: .env)')
    parser.add_argument('--preserve-admin', action='store_true',
                        help='Preserve admin password (useful for testing)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be changed without making changes')
    parser.add_argument('--force', action='store_true',
                        help='Skip confirmation prompts')
    
    args = parser.parse_args()
    
    env_path = Path(args.env_file)
    
    print("🔄 BSMarker Secret Rotation")
    print("=" * 40)
    
    # Parse existing configuration
    print("📖 Reading existing configuration...")
    existing_config = parse_existing_env(env_path)
    
    # Generate new secrets
    print("🎲 Generating new secrets...")
    new_secrets = generate_all_secrets()
    
    if args.preserve_admin and 'FIRST_ADMIN_PASSWORD' in existing_config:
        new_secrets['FIRST_ADMIN_PASSWORD'] = existing_config['FIRST_ADMIN_PASSWORD']
        print("✓ Preserving existing admin password")
    
    # Merge configurations
    merged_config = merge_configurations(existing_config, new_secrets)
    
    # Show what will change
    secret_keys = {'SECRET_KEY', 'DATABASE_URL', 'REDIS_URL', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'}
    if not args.preserve_admin:
        secret_keys.add('FIRST_ADMIN_PASSWORD')
    
    print("\n🔑 Secrets to be rotated:")
    for key in sorted(secret_keys):
        if key in merged_config:
            if key in ['SECRET_KEY', 'DATABASE_URL', 'REDIS_URL']:
                print(f"  - {key}: {'*' * 20}")
            else:
                print(f"  - {key}: ****")
    
    if args.dry_run:
        print("\n✋ Dry run mode - no changes made")
        return
    
    # Confirmation
    if not args.force:
        response = input("\n⚠️  This will rotate all secrets. Continue? (yes/no): ")
        if response.lower() not in ['yes', 'y']:
            print("❌ Operation cancelled")
            return
    
    # Create backup
    print("\n📋 Creating backup...")
    backup_path = backup_env_file(env_path)
    
    # Write new configuration
    print("💾 Writing new configuration...")
    write_env_file(merged_config, env_path)
    
    # Write summary
    write_rotation_summary(backup_path, secret_keys)
    
    print("\n✅ Secret rotation completed!")
    print("\n⚠️  IMPORTANT: You must now:")
    print("  1. Update database with new credentials")
    print("  2. Update Redis configuration") 
    print("  3. Update MinIO with new credentials")
    print("  4. Restart all BSMarker services")
    print("  5. Validate with: python scripts/validate_config.py")
    print(f"\n📋 Backup available at: {backup_path}")


if __name__ == "__main__":
    main()