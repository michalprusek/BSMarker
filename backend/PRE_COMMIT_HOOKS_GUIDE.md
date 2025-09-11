# BSMarker Pre-commit Hooks Documentation

## 🚀 Overview

This document describes the comprehensive pre-commit hooks system implemented for the BSMarker project. The system ensures code quality, security, and consistency across both backend (Python/FastAPI) and frontend (React/TypeScript) codebases.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Hook Architecture](#hook-architecture)
3. [Checks Performed](#checks-performed)
4. [Configuration](#configuration)
5. [Commit Message Convention](#commit-message-convention)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Usage](#advanced-usage)

## Quick Start

### Installation

```bash
# Navigate to backend directory
cd backend

# Run the setup script
./setup-hooks.sh

# Or manually install
pip install pre-commit
pre-commit install
npm install -g husky
husky install
```

### First Commit

```bash
# Stage your changes
git add .

# Commit with conventional format
git commit -m "feat(backend): add new authentication endpoint"

# The hooks will automatically run all checks
```

## Hook Architecture

### Three-Layer System

1. **Pre-commit Hook**: Runs before each commit
2. **Commit-msg Hook**: Validates commit message format
3. **Pre-push Hook**: Final checks before pushing to remote

### Technologies Used

- **Python**: Black, isort, Flake8, MyPy, Pylint, Bandit
- **JavaScript/TypeScript**: ESLint, Prettier, TypeScript compiler
- **Security**: detect-secrets, safety, npm audit
- **Docker**: Hadolint, docker-compose validation
- **General**: YAML/JSON validation, file size checks

## Checks Performed

### 🐍 Backend (Python)

| Check | Tool | Purpose | Auto-fix |
|-------|------|---------|----------|
| Code Formatting | Black | Ensures consistent Python formatting | ✅ |
| Import Sorting | isort | Organizes imports alphabetically | ✅ |
| Linting | Flake8 | Catches style and logic errors | ❌ |
| Type Checking | MyPy | Validates type annotations | ❌ |
| Advanced Linting | Pylint | Deep code analysis | ❌ |
| Security | Bandit | Identifies security vulnerabilities | ❌ |
| Test Coverage | pytest-cov | Ensures 70% minimum coverage | ❌ |

### 🎨 Frontend (React/TypeScript)

| Check | Tool | Purpose | Auto-fix |
|-------|------|---------|----------|
| JavaScript Linting | ESLint | Catches errors and enforces style | ✅ |
| TypeScript Check | tsc | Validates TypeScript types | ❌ |
| Code Formatting | Prettier | Ensures consistent formatting | ✅ |
| CSS Linting | Stylelint | Validates stylesheets | ✅ |
| HTML Validation | HTMLHint | Checks HTML files | ❌ |

### 🔒 Security Checks

| Check | Description | Severity |
|-------|-------------|----------|
| Hardcoded Secrets | Detects passwords, API keys, tokens | Critical |
| AWS Keys | Identifies AWS access keys | Critical |
| Private Keys | Finds RSA/SSH private keys | Critical |
| Dependency Vulnerabilities | Scans for known CVEs | High |
| SQL Injection | Identifies potential SQL injection | High |

### 🐳 Docker & Configuration

| Check | Tool | Purpose |
|-------|------|---------|
| Dockerfile Linting | Hadolint | Best practices for Dockerfiles |
| Compose Validation | docker-compose | Validates YAML syntax |
| YAML Linting | yamllint | Ensures proper YAML formatting |
| JSON Validation | jsonlint | Validates JSON syntax |

## Configuration

### Hook Configuration File (.hookconfig)

```bash
# Enable/disable specific checks
ENABLE_PYTHON_CHECKS=true
ENABLE_FRONTEND_CHECKS=true
ENABLE_DOCKER_CHECKS=true
ENABLE_SECURITY_CHECKS=true

# Test settings
RUN_TESTS=false  # Run tests on commit
RUN_TESTS_ON_PUSH=true  # Run tests before push

# Coverage thresholds
PYTHON_COVERAGE_THRESHOLD=70
FRONTEND_COVERAGE_THRESHOLD=60

# Performance
PARALLEL_CHECKS=true
STRICT_MODE=false  # Fail on warnings
```

### Pre-commit Configuration (.pre-commit-config.yaml)

Customize checks by editing the configuration file:

```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 24.3.0
    hooks:
      - id: black
        args: [--line-length=100]
```

## Commit Message Convention

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| feat | New feature | `feat(api): add user profile endpoint` |
| fix | Bug fix | `fix(frontend): resolve login issue` |
| docs | Documentation | `docs: update API documentation` |
| style | Code style | `style(backend): format with black` |
| refactor | Code refactoring | `refactor(db): optimize queries` |
| perf | Performance | `perf(api): cache database queries` |
| test | Tests | `test(auth): add unit tests` |
| build | Build system | `build: update dependencies` |
| ci | CI/CD | `ci: add GitHub Actions workflow` |
| chore | Maintenance | `chore: update .gitignore` |
| security | Security fix | `security(api): fix SQL injection` |

### Scopes

- `backend`, `frontend`, `api`, `auth`, `db`, `docker`
- `annotations`, `recordings`, `projects`, `users`
- `spectrogram`, `minio`, `redis`, `nginx`

### Examples

```bash
# Good commits
git commit -m "feat(backend): implement JWT refresh tokens"
git commit -m "fix(frontend): resolve canvas rendering issue in Safari"
git commit -m "security(api): sanitize user input in search endpoint"

# Bad commits (will be rejected)
git commit -m "fixed stuff"
git commit -m "WIP"
git commit -m "Update code"
```

## Troubleshooting

### Common Issues

#### 1. Python Import Errors

```bash
# Solution: Install in virtual environment
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### 2. ESLint Not Found

```bash
# Solution: Install frontend dependencies
cd frontend
npm install
```

#### 3. Hooks Not Running

```bash
# Solution: Reinstall hooks
husky install
pre-commit install
```

#### 4. Auto-fix Formatting Issues

```bash
# Python
cd backend
black app/
isort app/

# Frontend
cd frontend
npm run format
npm run lint:fix
```

### Bypassing Hooks (Emergency Only!)

```bash
# Skip pre-commit hooks
git commit --no-verify -m "emergency: critical hotfix"

# Skip pre-push hooks
git push --no-verify
```

⚠️ **Warning**: Only bypass hooks in emergencies. Always fix issues afterward.

## Advanced Usage

### Running Checks Manually

```bash
# Run all pre-commit checks
pre-commit run --all-files

# Run specific check
pre-commit run black --all-files
pre-commit run eslint --all-files

# Run on specific files
pre-commit run --files backend/app/main.py
```

### Custom Hooks

Add custom checks in `.pre-commit-config.yaml`:

```yaml
- repo: local
  hooks:
    - id: custom-check
      name: My Custom Check
      entry: ./scripts/custom-check.sh
      language: script
      files: \.py$
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run pre-commit
  uses: pre-commit/action@v3.0.0
```

### Performance Optimization

```bash
# Run checks in parallel
PARALLEL_CHECKS=true git commit

# Skip slow checks during development
RUN_TESTS=false git commit

# Run full checks before push
RUN_TESTS=true git push
```

## Hook Performance

| Hook | Typical Duration | Can be Parallelized |
|------|-----------------|---------------------|
| Black | 1-2s | ✅ |
| isort | 1s | ✅ |
| Flake8 | 2-3s | ✅ |
| MyPy | 5-10s | ✅ |
| ESLint | 3-5s | ✅ |
| TypeScript | 5-15s | ❌ |
| Tests | 30-60s | ✅ |

## Best Practices

1. **Fix issues immediately**: Don't accumulate technical debt
2. **Run hooks locally**: Catch issues before CI/CD
3. **Keep dependencies updated**: Regular security updates
4. **Write meaningful commits**: Help future developers
5. **Don't bypass hooks**: Fix the underlying issues
6. **Configure IDE integration**: Real-time feedback

## IDE Integration

### VS Code

```json
// .vscode/settings.json
{
  "python.formatting.provider": "black",
  "python.linting.enabled": true,
  "python.linting.flake8Enabled": true,
  "python.linting.mypyEnabled": true,
  "editor.formatOnSave": true,
  "eslint.autoFixOnSave": true
}
```

### PyCharm

1. Settings → Tools → File Watchers
2. Add Black, isort, ESLint watchers
3. Enable "Reformat on Save"

## Team Onboarding

### For New Developers

1. Clone repository
2. Run `./setup-hooks.sh`
3. Read this documentation
4. Make a test commit
5. Review hook output

### Training Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Black Documentation](https://black.readthedocs.io/)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Security Best Practices](https://owasp.org/)

## Metrics & Monitoring

Track code quality over time:

```bash
# Generate reports
pre-commit run --all-files --verbose > quality-report.txt

# Coverage trends
pytest --cov=app --cov-report=html

# Security audit
safety check --json > security-report.json
```

## Maintenance

### Weekly Tasks

- Update dependencies: `pip-review --auto`
- Security scan: `safety check`
- Clean up: `pre-commit gc`

### Monthly Tasks

- Review hook configuration
- Update baseline: `detect-secrets scan --update .secrets.baseline`
- Audit npm packages: `npm audit fix`

## Support

### Getting Help

1. Check this documentation
2. Run `pre-commit --help`
3. Check tool-specific docs
4. Ask team lead
5. Create GitHub issue

### Reporting Issues

Include:
- Error message
- Git command used
- Files changed
- System information

## Future Enhancements

- [ ] Add mutation testing
- [ ] Integrate SAST tools
- [ ] Add performance benchmarks
- [ ] Create custom BSMarker rules
- [ ] Add automatic PR checks
- [ ] Implement semantic versioning

---

**Last Updated**: January 2025
**Maintained By**: BSMarker Development Team
**Version**: 1.0.0
