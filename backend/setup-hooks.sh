#!/bin/bash

# BSMarker Pre-commit Hooks Setup Script
# This script sets up all the necessary pre-commit hooks for the project

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}BSMarker Pre-commit Hooks Setup${NC}"
echo "=================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Python package
install_python_package() {
    local package="$1"
    echo -e "${BLUE}Installing Python package: ${package}${NC}"
    pip install --upgrade "$package" || pip3 install --upgrade "$package"
}

# Function to install Node package
install_node_package() {
    local package="$1"
    local global="${2:-false}"

    if [ "$global" = "true" ]; then
        echo -e "${BLUE}Installing global Node package: ${package}${NC}"
        npm install -g "$package"
    else
        echo -e "${BLUE}Installing Node package: ${package}${NC}"
        npm install --save-dev "$package"
    fi
}

# 1. Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists python && ! command_exists python3; then
    echo -e "${RED}Python is not installed. Please install Python 3.8+${NC}"
    exit 1
fi

if ! command_exists node; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 14+${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}npm is not installed. Please install npm${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}\n"

# 2. Install Python tools for backend
echo -e "${YELLOW}Installing Python tools for backend checks...${NC}"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${BLUE}Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate 2>/dev/null || . venv/Scripts/activate 2>/dev/null || true

# Install Python packages
PYTHON_PACKAGES=(
    "black==24.3.0"
    "isort==5.13.2"
    "flake8==7.0.0"
    "flake8-docstrings"
    "flake8-bugbear"
    "flake8-comprehensions"
    "flake8-simplify"
    "mypy==1.9.0"
    "bandit==1.7.8"
    "pylint==3.1.0"
    "pytest>=7.0.0"
    "pytest-cov"
    "safety"
    "radon"
    "pre-commit"
    "detect-secrets==1.4.0"
    "yamllint"
    "sqlfluff==3.0.3"
)

for package in "${PYTHON_PACKAGES[@]}"; do
    install_python_package "$package"
done

echo -e "${GREEN}✓ Python tools installed${NC}\n"

# 3. Install Node tools for frontend
echo -e "${YELLOW}Installing Node tools for frontend checks...${NC}"

# Navigate to frontend directory if it exists
if [ -d "frontend" ]; then
    cd frontend

    # Install ESLint and related packages
    NODE_PACKAGES=(
        "eslint"
        "eslint-config-prettier"
        "eslint-plugin-react"
        "eslint-plugin-react-hooks"
        "@typescript-eslint/eslint-plugin"
        "@typescript-eslint/parser"
        "prettier"
        "stylelint"
        "stylelint-config-standard"
        "htmlhint"
        "husky"
        "lint-staged"
        "@commitlint/cli"
        "@commitlint/config-conventional"
    )

    for package in "${NODE_PACKAGES[@]}"; do
        install_node_package "$package"
    done

    cd ..
fi

echo -e "${GREEN}✓ Node tools installed${NC}\n"

# 4. Install system tools
echo -e "${YELLOW}Installing system tools...${NC}"

# Check for shellcheck
if ! command_exists shellcheck; then
    echo -e "${YELLOW}shellcheck not found. Installing...${NC}"
    if command_exists apt-get; then
        sudo apt-get update && sudo apt-get install -y shellcheck
    elif command_exists brew; then
        brew install shellcheck
    else
        echo -e "${YELLOW}Please install shellcheck manually${NC}"
    fi
fi

# Check for hadolint
if ! command_exists hadolint; then
    echo -e "${YELLOW}hadolint not found. Installing...${NC}"
    if command_exists brew; then
        brew install hadolint
    else
        # Download hadolint binary
        wget -O /tmp/hadolint https://github.com/hadolint/hadolint/releases/latest/download/hadolint-Linux-x86_64
        chmod +x /tmp/hadolint
        sudo mv /tmp/hadolint /usr/local/bin/hadolint
    fi
fi

echo -e "${GREEN}✓ System tools checked${NC}\n"

# 5. Initialize Husky
echo -e "${YELLOW}Initializing Husky...${NC}"

# Initialize husky
npx husky install

# Make hooks executable
chmod +x .husky/pre-commit 2>/dev/null || true
chmod +x .husky/commit-msg 2>/dev/null || true
chmod +x .husky/pre-push 2>/dev/null || true

echo -e "${GREEN}✓ Husky initialized${NC}\n"

# 6. Set up pre-commit for Python
echo -e "${YELLOW}Setting up pre-commit for Python...${NC}"

if [ -f ".pre-commit-config.yaml" ]; then
    pre-commit install
    pre-commit install --hook-type commit-msg
    pre-commit install --hook-type pre-push

    # Run pre-commit on all files to create initial baseline
    echo -e "${BLUE}Running initial pre-commit checks (this may take a while)...${NC}"
    pre-commit run --all-files || true

    echo -e "${GREEN}✓ Pre-commit installed${NC}\n"
else
    echo -e "${YELLOW}No .pre-commit-config.yaml found${NC}\n"
fi

# 7. Create git hooks symlinks (backup method)
echo -e "${YELLOW}Creating git hooks symlinks...${NC}"

HOOKS_DIR=".git/hooks"
if [ -d "$HOOKS_DIR" ]; then
    # Backup existing hooks
    for hook in pre-commit commit-msg pre-push; do
        if [ -f "$HOOKS_DIR/$hook" ] && [ ! -L "$HOOKS_DIR/$hook" ]; then
            mv "$HOOKS_DIR/$hook" "$HOOKS_DIR/$hook.backup"
            echo -e "${YELLOW}Backed up existing $hook hook${NC}"
        fi
    done

    # Create symlinks
    ln -sf "../../.husky/pre-commit" "$HOOKS_DIR/pre-commit"
    ln -sf "../../.husky/commit-msg" "$HOOKS_DIR/commit-msg"
    ln -sf "../../.husky/pre-push" "$HOOKS_DIR/pre-push"

    echo -e "${GREEN}✓ Git hooks symlinks created${NC}\n"
fi

# 8. Create secrets baseline
echo -e "${YELLOW}Creating secrets baseline...${NC}"

if command_exists detect-secrets; then
    detect-secrets scan --baseline .secrets.baseline
    echo -e "${GREEN}✓ Secrets baseline created${NC}\n"
fi

# 9. Configure git
echo -e "${YELLOW}Configuring git settings...${NC}"

# Set up git config for better diff output
git config diff.algorithm histogram
git config merge.conflictstyle diff3

echo -e "${GREEN}✓ Git configured${NC}\n"

# 10. Create hook configuration file
echo -e "${YELLOW}Creating hook configuration...${NC}"

cat > .hookconfig <<EOF
# BSMarker Pre-commit Hook Configuration
# Edit this file to customize hook behavior

# Enable/disable specific checks
ENABLE_PYTHON_CHECKS=true
ENABLE_FRONTEND_CHECKS=true
ENABLE_DOCKER_CHECKS=true
ENABLE_SECURITY_CHECKS=true

# Test settings
RUN_TESTS=false  # Set to true to run tests on commit
RUN_TESTS_ON_PUSH=true  # Run tests before push
BUILD_DOCKER_ON_PUSH=false  # Build Docker images before push

# Performance settings
RUN_PERF_CHECK=false  # Run performance checks

# Coverage thresholds
PYTHON_COVERAGE_THRESHOLD=70
FRONTEND_COVERAGE_THRESHOLD=60

# Max file size (in KB)
MAX_FILE_SIZE=1000

# Parallel execution
PARALLEL_CHECKS=true

# Strict mode (fail on warnings)
STRICT_MODE=false
EOF

echo -e "${GREEN}✓ Hook configuration created${NC}\n"

# Summary
echo "=================================="
echo -e "${GREEN}✅ Pre-commit hooks setup complete!${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "1. Review and customize .hookconfig file"
echo "2. Test hooks with: git commit --allow-empty -m 'test: hook setup'"
echo "3. View hook output with: pre-commit run --all-files"
echo "4. Update team documentation with new commit conventions"
echo ""
echo -e "${CYAN}Commit message format:${NC}"
echo "  <type>(<scope>): <subject>"
echo "  Example: feat(backend): add user authentication"
echo ""
echo -e "${CYAN}To bypass hooks (emergency only):${NC}"
echo "  git commit --no-verify"
echo ""
echo -e "${GREEN}Happy coding with better code quality! 🚀${NC}
