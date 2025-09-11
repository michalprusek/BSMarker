# 🔐 Security Updates Applied - BSMarker

## Important: New Credentials

Your application has been secured with the following updates:

### Admin Login Credentials:
- **Email**: admin@bsmarker.com  
- **Password**: BSMarker2024Admin!

### MinIO Credentials (for local development):
- **Access Key**: minio_dev_access_key_2024
- **Secret Key**: minio_dev_secret_key_bsmarker_secure_2024

## Security Improvements Implemented

✅ **Secret Rotation**: All hardcoded secrets have been removed and replaced with secure values
✅ **Path Traversal Fix**: File upload vulnerability has been patched
✅ **Rate Limiting**: API endpoints are now protected against abuse
✅ **DateTime Fix**: Updated to use timezone-aware datetime for Python 3.12+ compatibility

## Required Actions

1. **Install new dependency**:
   ```bash
   cd backend
   pip install slowapi==0.1.9
   ```

2. **Update MinIO in docker-compose.yml** (if using Docker):
   Change the MinIO environment variables to:
   ```yaml
   MINIO_ROOT_USER: minio_dev_access_key_2024
   MINIO_ROOT_PASSWORD: minio_dev_secret_key_bsmarker_secure_2024
   ```

3. **Run the application**:
   ```bash
   python3 run_local.py
   ```

## Testing the Security Updates

1. **Test login with new credentials**:
   - Go to http://localhost:3456
   - Login with admin@bsmarker.com / BSMarker2024Admin!

2. **Test rate limiting**:
   - Try logging in more than 10 times per minute
   - You should receive a 429 "Rate limit exceeded" error

3. **Test file upload security**:
   - Upload an audio file to a project
   - The file will be securely handled with path validation

## Notes

- The `.env` file has been updated with secure values
- Never commit the `.env` file to version control
- For production, generate new secrets using:
  ```bash
  cd backend
  python app/core/generate_secrets.py
  ```

## Validation

Run the validation script to ensure everything is configured correctly:
```bash
cd backend
python scripts/validate_config.py
```
