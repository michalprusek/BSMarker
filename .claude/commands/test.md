---
name: test
description: Comprehensive test orchestration with automatic fixing and coverage analysis
argument-hint: [unit|integration|e2e|all] [--fix] [--coverage] [--production]
---

# Overview

This command orchestrates comprehensive testing across the entire BSMarker application stack. It can automatically fix failed tests, generate coverage reports, validate production environments, and provide detailed insights using specialized test agents working in parallel.

## Variables

- `$ARGUMENTS`: Test scope and options
  - Test categories: `unit`, `integration`, `e2e`, `performance`, `all`
  - `--fix`: Automatically fix failed tests
  - `--coverage`: Generate comprehensive coverage analysis
  - `--production`: Validate production environment

## Instructions

1. **Environment Validation**: Ensure all services are running
2. **Test Discovery**: Identify all test suites across the stack
3. **Test Execution**: Run tests systematically with detailed metrics
4. **Failure Analysis**: Categorize and analyze test failures
5. **Automatic Fixing**: Fix failed tests if requested
6. **Coverage Analysis**: Generate and analyze coverage reports
7. **Production Validation**: Test production environment if requested
8. **Reporting**: Generate comprehensive test report

## Workflow

### Phase 1: Environment Preparation
```bash
echo "🔧 Preparing test environment..."

# Check service health
echo "Service Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "bsmarker|spheroseg" | head -10

# Validate test containers
docker exec bsmarker-frontend npm --version > /dev/null 2>&1 && echo "✅ Frontend ready" || echo "❌ Frontend not ready"
docker exec bsmarker-backend npm --version > /dev/null 2>&1 && echo "✅ Backend ready" || echo "❌ Backend not ready"
docker exec bsmarker-ml python --version > /dev/null 2>&1 && echo "✅ ML service ready" || echo "❌ ML not ready"

# Check production if requested
if [[ "$ARGUMENTS" == *"--production"* ]]; then
    echo "🌐 Production health check:"
    curl -s -o /dev/null -w "API: %{http_code}\n" https://bsmarker.utia.cas.cz/api/health
    curl -s -o /dev/null -w "Frontend: %{http_code}\n" https://bsmarker.utia.cas.cz
fi
```

### Phase 2: Test Discovery

Deploy discovery agents to map all test files:

```python
discovery_agents = [
    {
        "agent": "context-gatherer",
        "task": "Gather complete test infrastructure context: test frameworks (Vitest, Playwright, Pytest), test file locations, package.json test scripts"
    },
    {
        "agent": "integration-mapper",
        "task": "Map all test files: *.test.ts, *.test.tsx, *.spec.ts, test_*.py across frontend, backend, and ML service"
    }
]

# Also query knowledge base for test patterns
serena_queries = [
    "test patterns BSMarker",
    "common test failures",
    "test coverage strategies",
    "flaky test solutions"
]
```

### Phase 3: Test Execution

Execute tests based on requested scope:

```bash
# Determine test scope
TEST_SCOPE="${ARGUMENTS%%--*}"
TEST_SCOPE="${TEST_SCOPE:-all}"

echo "🚀 Executing $TEST_SCOPE tests..."

# Unit Tests
if [[ "$TEST_SCOPE" == "unit" ]] || [[ "$TEST_SCOPE" == "all" ]]; then
    echo "📦 Running unit tests..."

    # Frontend unit tests
    docker exec bsmarker-frontend npm run test:unit 2>&1 | tee frontend-unit.log

    # Backend unit tests
    docker exec bsmarker-backend npm run test:unit 2>&1 | tee backend-unit.log

    # ML service unit tests
    docker exec bsmarker-ml pytest tests/unit -v 2>&1 | tee ml-unit.log
fi

# Integration Tests
if [[ "$TEST_SCOPE" == "integration" ]] || [[ "$TEST_SCOPE" == "all" ]]; then
    echo "🔗 Running integration tests..."

    # API integration tests
    docker exec bsmarker-backend npm run test:integration 2>&1 | tee integration.log

    # Database tests
    docker exec bsmarker-backend npm run test:db 2>&1 | tee db-tests.log
fi

# E2E Tests
if [[ "$TEST_SCOPE" == "e2e" ]] || [[ "$TEST_SCOPE" == "all" ]]; then
    echo "🌐 Running E2E tests..."

    # Playwright E2E tests
    docker exec bsmarker-frontend npx playwright test 2>&1 | tee e2e.log
fi

# Performance Tests
if [[ "$TEST_SCOPE" == "performance" ]] || [[ "$TEST_SCOPE" == "all" ]]; then
    echo "⚡ Running performance tests..."

    # Load testing
    docker exec bsmarker-backend npm run test:performance 2>&1 | tee performance.log
fi
```

### Phase 4: Test Fixing (if --fix)

If tests failed and --fix flag is present:

```python
if "--fix" in ARGUMENTS and test_failures_exist:
    fixing_agents = [
        {
            "agent": "test-fixer",
            "task": """Analyze all failed tests and automatically fix them:
                1. Update outdated assertions to match implementation
                2. Add missing mocks for external dependencies
                3. Fix async/timing issues with proper waits
                4. Resolve TypeScript errors and type mismatches
                5. Update API test expectations
                6. Fix DOM selector issues
                Store successful fix patterns for future use."""
        }
    ]

    # Add specialized debuggers based on failure types
    if frontend_tests_failed:
        fixing_agents.append({
            "agent": "frontend-debugger",
            "task": "Debug and fix React component test failures, rendering issues, hook problems"
        })

    if backend_tests_failed:
        fixing_agents.append({
            "agent": "backend-debugger",
            "task": "Fix API endpoint test failures, database mock issues, service problems"
        })

    # Deploy agents in parallel
    # After fixes, re-run failed tests
```

### Phase 5: Coverage Analysis (if --coverage)

Generate comprehensive coverage reports:

```python
if "--coverage" in ARGUMENTS:
    coverage_agents = [
        {
            "agent": "coverage-analyzer",
            "task": """Generate comprehensive coverage analysis:
                1. Frontend coverage (React/TypeScript)
                2. Backend coverage (Node.js/Express)
                3. ML service coverage (Python/FastAPI)
                4. Identify critical uncovered paths
                5. Find untested files and dead code
                6. Generate visual coverage heatmap
                7. Prioritize test additions by risk
                8. Calculate coverage trends"""
        },
        {
            "agent": "ssot-analyzer",
            "task": "Identify test code duplication and consolidation opportunities"
        },
        {
            "agent": "test-generator",
            "task": "Generate test templates for top 10 uncovered critical functions"
        }
    ]

    # Deploy agents and collect results
```

### Phase 6: Production Validation (if --production)

Test production environment:

```bash
if [[ "$ARGUMENTS" == *"--production"* ]]; then
    echo "🚀 Validating production environment..."

    # Check production containers
    docker ps | grep -E "blue|green"

    # Health checks
    curl -s https://bsmarker.utia.cas.cz/api/health | jq '.'

    # Run smoke tests
    echo "Running production smoke tests..."

    # Test login
    curl -X POST https://bsmarker.utia.cas.cz/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"test"}' \
        -w "\nLogin test: %{http_code}\n"

    # Test core workflow
    curl -s https://bsmarker.utia.cas.cz/api/recordings \
        -H "Authorization: Bearer $TOKEN" \
        -w "\nRecordings API: %{http_code}\n"

    # Test WebSocket connectivity
    echo "WebSocket test: [implement WebSocket connection test]"
fi
```

## Report

### Test Execution Summary
```
═══════════════════════════════════════════════════════
                    TEST REPORT
═══════════════════════════════════════════════════════

Test Scope: ${TEST_SCOPE}
Options: ${OPTIONS}
Duration: ${DURATION}
```

### Results by Category

#### Unit Tests
```
Frontend:  [PASSED]/[TOTAL] ([PERCENTAGE]%)
Backend:   [PASSED]/[TOTAL] ([PERCENTAGE]%)
ML Service:[PASSED]/[TOTAL] ([PERCENTAGE]%)
```

#### Integration Tests
```
API Tests:      [PASSED]/[TOTAL]
Database Tests: [PASSED]/[TOTAL]
WebSocket Tests:[PASSED]/[TOTAL]
```

#### E2E Tests
```
User Workflows: [PASSED]/[TOTAL]
Browsers Tested: Chrome, Firefox, Safari
```

#### Performance Tests
```
Response Times: P50=[X]ms, P95=[Y]ms, P99=[Z]ms
Throughput: [N] requests/second
Resource Usage: CPU=[X]%, Memory=[Y]MB
```

### Test Fixes Applied (if --fix used)
```
Tests Fixed: [COUNT]
Fix Categories:
- Assertion updates: [N]
- Mock additions: [N]
- Async fixes: [N]
- Type corrections: [N]
Success Rate: [PERCENTAGE]%
```

### Coverage Analysis (if --coverage used)
```
Coverage Summary:
┌──────────────┬───────┬────────┬──────────┐
│ Component    │ Line  │ Branch │ Function │
├──────────────┼───────┼────────┼──────────┤
│ Frontend     │ X%    │ Y%     │ Z%       │
│ Backend      │ X%    │ Y%     │ Z%       │
│ ML Service   │ X%    │ Y%     │ Z%       │
└──────────────┴───────┴────────┴──────────┘

Critical Gaps:
1. [Uncovered critical path]
2. [Uncovered critical path]
3. [Uncovered critical path]
```

### Production Validation (if --production used)
```
Environment: [blue/green]
Health Status:
- API: [UP/DOWN]
- Frontend: [UP/DOWN]
- Database: [UP/DOWN]

Smoke Tests:
- Login: [PASS/FAIL]
- Core Workflow: [PASS/FAIL]
- WebSocket: [PASS/FAIL]
```

### Recommendations

1. **Priority Fixes**:
   - [Critical test that needs fixing]
   - [Flaky test to investigate]
   - [Coverage gap to address]

2. **Test Improvements**:
   - Add tests for [uncovered area]
   - Refactor [duplicate test code]
   - Optimize [slow test suite]

3. **CI/CD Enhancements**:
   - Set up parallel test execution
   - Add coverage gates
   - Implement test result caching

### Action Items
- [ ] Fix remaining [N] failed tests
- [ ] Achieve [X]% coverage target
- [ ] Investigate [N] flaky tests
- [ ] Add performance benchmarks
- [ ] Update test documentation

### Next Steps
1. Review failed tests in detail
2. Prioritize test fixes by impact
3. Schedule test improvement sprint
4. Set up continuous monitoring
5. Document test patterns in wiki
