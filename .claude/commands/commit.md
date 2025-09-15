---
name: commit
description: Intelligent git commit with automatic pre-commit fixes and PR management
argument-hint: "commit message"
---

# Overview

This command automates the git commit process with intelligent pre-commit hook error fixing, automatic code formatting, and pull request management. It ensures all code meets quality standards before committing and handles the entire workflow from staging to PR creation.

## Variables

- `$ARGUMENTS`: The commit message to use for the git commit
- `dev`: Target branch for development work
- `main`: Production branch for pull requests

## Instructions

1. **Pre-flight checks**: Scan for sensitive data and unnecessary files
2. **Branch management**: Ensure we're on the correct development branch
3. **Code quality**: Run linting and formatting tools
4. **Commit attempts**: Try committing with automatic fixes for common issues
5. **PR management**: Create or update pull request to main branch

## Workflow

### Phase 1: Pre-flight Security Check
```bash
# Switch to dev branch first
git checkout dev || git checkout -b dev

# Check current status
git status

# Scan for sensitive information
echo "🔍 Scanning for sensitive data..."

# Check for potential secrets
grep -r "password\|secret\|api_key\|token" --include="*.env*" . 2>/dev/null | grep -v ".env.example" && echo "⚠️ Warning: Potential secrets detected"

# Check for large files
find . -type f -size +10M 2>/dev/null | grep -v node_modules | grep -v .git && echo "⚠️ Warning: Large files detected"

# Remove common unwanted files
rm -f .DS_Store Thumbs.db *.log.* *.tmp 2>/dev/null || true
find . -name "*.orig" -delete 2>/dev/null || true
```

### Phase 2: Code Quality Preparation
```bash
# Read package.json to understand available commands
cat package.json | grep -A 10 '"scripts"' || echo "No package.json found"

# Run initial formatting and linting
echo "🎨 Running code formatters..."
npm run format 2>/dev/null || npx prettier --write . 2>/dev/null || true
npm run lint:fix 2>/dev/null || npm run lint -- --fix 2>/dev/null || true

# TypeScript type checking
echo "📝 Checking TypeScript types..."
npm run type-check 2>/dev/null || npx tsc --noEmit 2>/dev/null || true
```

### Phase 3: Staging Changes
```bash
# Add all changes
git add .

# Show what will be committed
git status --short
```

### Phase 4: Intelligent Commit Process
```bash
# First commit attempt
echo "💾 Attempting to commit..."
if git commit -m "$ARGUMENTS"; then
    echo "✅ Commit successful on first attempt"
else
    echo "⚠️ Pre-commit hook failed, analyzing and fixing..."

    # Capture the error output
    ERROR_OUTPUT=$(git commit -m "$ARGUMENTS" 2>&1 || true)

    # Fix ESLint errors
    if echo "$ERROR_OUTPUT" | grep -q "eslint"; then
        echo "🔧 Fixing ESLint errors..."
        npx eslint . --fix --ext .ts,.tsx,.js,.jsx 2>/dev/null || true
    fi

    # Fix Prettier formatting
    if echo "$ERROR_OUTPUT" | grep -q "prettier"; then
        echo "🔧 Fixing Prettier formatting..."
        npx prettier --write "**/*.{js,jsx,ts,tsx,json,css,scss,md}" 2>/dev/null || true
    fi

    # Fix Python formatting (if applicable)
    if echo "$ERROR_OUTPUT" | grep -q "black\|flake8"; then
        echo "🔧 Fixing Python formatting..."
        black . 2>/dev/null || true
        isort . 2>/dev/null || true
    fi

    # Stage the fixes
    git add .

    # Second commit attempt
    echo "💾 Attempting commit after fixes..."
    if git commit -m "$ARGUMENTS"; then
        echo "✅ Commit successful after automatic fixes"
    else
        # Show detailed errors for manual intervention
        echo "❌ Commit still failing. Detailed errors:"
        npm run lint 2>&1 | head -30 || true
        npm run type-check 2>&1 | head -30 || true

        # Try one more time with --no-verify as last resort
        echo "⚠️ Attempting commit with --no-verify (not recommended)..."
        read -p "Do you want to skip pre-commit hooks? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git commit -m "$ARGUMENTS" --no-verify
            echo "⚠️ Committed with --no-verify. Please fix issues manually."
        else
            echo "❌ Commit aborted. Please fix issues manually."
            exit 1
        fi
    fi
fi
```

### Phase 5: Push Changes
```bash
# Push to remote dev branch
echo "📤 Pushing to remote..."
git push origin dev || git push --set-upstream origin dev
```

### Phase 6: Pull Request Management
```bash
# Check if PR already exists
EXISTING_PR=$(gh pr list --head dev --base main --json number --jq '.[0].number' 2>/dev/null || echo "")

if [ -z "$EXISTING_PR" ]; then
    echo "📝 Creating new pull request..."

    # Create PR with detailed description
    gh pr create \
        --title "$ARGUMENTS" \
        --base main \
        --head dev \
        --body "## Changes

$ARGUMENTS

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
- [ ] All tests pass locally
- [ ] Added new tests for new functionality
- [ ] Existing tests updated as needed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No console.log or debug code left
- [ ] All pre-commit hooks pass

---
*Created with Claude Code*" || echo "⚠️ Could not create PR. Please create manually."
else
    echo "✅ PR #$EXISTING_PR already exists and has been updated with new commits"

    # Add comment to existing PR about new commits
    gh pr comment $EXISTING_PR --body "🔄 Updated with new commits: $ARGUMENTS" 2>/dev/null || true
fi

# Show PR URL
gh pr view --web 2>/dev/null || echo "Visit https://github.com/[owner]/BSMarker/pulls to see your PR"
```

## Report

### Commit Summary
- **Branch**: dev
- **Commit Message**: $ARGUMENTS
- **Files Changed**: [count from git status]
- **Pre-commit Issues Fixed**: [list of auto-fixed issues]

### Quality Checks
```
✅ ESLint: [passed/fixed/failed]
✅ Prettier: [passed/fixed/failed]
✅ TypeScript: [passed/fixed/failed]
✅ Tests: [passed/skipped/failed]
✅ Pre-commit Hooks: [passed/bypassed]
```

### Git Operations
- Committed to: dev branch
- Pushed to: origin/dev
- Pull Request: [created/updated/failed]
- PR Number: #[number]

### Warnings
- [List any sensitive data warnings]
- [List any large file warnings]
- [List any skipped checks]

### Next Steps
1. Review the pull request on GitHub
2. Request code review from team members
3. Monitor CI/CD pipeline status
4. Address any review feedback
5. Merge when approved and tests pass

### Important Notes
- **Never skip pre-commit hooks unless absolutely necessary**
- **Always review changes before committing**
- **Ensure no sensitive data is committed**
- **Keep commits atomic and well-described**
- **Update PR description with testing notes**
