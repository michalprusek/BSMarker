---
argument-hint: [--fix] [--coverage] [--production] [category: unit|integration|e2e|performance|all]
description: Comprehensive test execution, automatic fixing, and coverage analysis across the entire application stack
---

# Comprehensive Test Suite Manager

## Test Configuration
**Test Target:** ${ARGUMENTS:-all}
**Auto-Fix Mode:** ${ARGUMENTS:---fix}
**Coverage Analysis:** ${ARGUMENTS:---coverage}
**Production Check:** ${ARGUMENTS:---production}

## Initial System Health Check

### Service Status
!`make health 2>&1 | head -20 || echo "Health check failed - services may need to be started"`

### Docker Container Status
!`docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "spheroseg|frontend|backend|ml" | head -10`

### Production Environment Check
!`if [[ "$ARGUMENTS" == *"--production"* ]]; then docker ps | grep -E "blue|green" | head -5 && curl -s -o /dev/null -w "Production Health: %{http_code}\n" https://spherosegapp.utia.cas.cz/health || echo "Production not accessible"; fi`

### Quick Test Environment Validation
!`docker exec spheroseg-frontend npm --version > /dev/null 2>&1 && echo "✅ Frontend container ready" || echo "❌ Frontend container not ready"`
!`docker exec spheroseg-backend npm --version > /dev/null 2>&1 && echo "✅ Backend container ready" || echo "❌ Backend container not ready"`
!`docker exec spheroseg-ml python --version > /dev/null 2>&1 && echo "✅ ML container ready" || echo "❌ ML container not ready"`

## Your Mission

You are the master test orchestrator for the SpheroSeg application. Your goal is to comprehensively test the entire application stack, automatically fix failures, and provide detailed coverage insights using a sophisticated multi-phase approach with specialized agents.

---

# PHASE 1: COMPREHENSIVE TEST DISCOVERY & EXECUTION
**Objective**: Discover and execute all test suites across the stack

## Step 1: Initialize Test Management
Use the TodoWrite tool to create a comprehensive task list for all test phases:
1. Test discovery and inventory
2. Test execution (unit, integration, e2e, performance)
3. Failure analysis and categorization
4. Automatic test fixing (if --fix flag present)
5. Coverage analysis and gap detection
6. Production validation (if --production flag present)
7. Final report generation

## Step 2: Test Discovery & Initial Analysis

### Deploy Discovery Agents (IN PARALLEL):
Launch these agents simultaneously for comprehensive test discovery:

**CRITICAL: Provide detailed instructions to each agent:**

1. **context-gatherer**: 
   - "Gather complete context about the test infrastructure, test frameworks (Vitest, Playwright, Pytest), test file locations, and test scripts in package.json files"
   
2. **integration-mapper**: 
   - "Map all test files across the application: unit tests (*.test.ts, *.test.tsx), integration tests, e2e tests (*.spec.ts), and Python tests (test_*.py)"

### Retrieve Serena memories for Test Knowledge:
- Search for "test patterns SpheroSeg"
- Query "test failures common fixes"
- Look for "coverage improvement strategies"
- Find "flaky test solutions"

## Step 3: Execute Test Suites

### Deploy Test Execution Agent:
Use the Task tool with **test-runner** agent:
- "Execute ALL test suites systematically: 
  1. Frontend unit tests (Vitest in Docker)
  2. Backend unit tests (Vitest in Docker)  
  3. ML service tests (Pytest in Docker)
  4. Integration tests (API tests with Supertest)
  5. E2E tests (Playwright in Docker)
  6. Performance tests if available
  Collect detailed metrics for each category including: total tests, passed, failed, skipped, duration, and specific failure details with stack traces. Use Desktop Commander for long-running tests to prevent terminal crashes."

**IMPORTANT**: The test-runner agent will handle Docker execution using Desktop Commander MCP to prevent macOS terminal crashes.

---

# PHASE 2: INTELLIGENT TEST FIXING (if --fix flag present)
**Objective**: Automatically fix all failed tests

## Step 1: Analyze Test Failures

Review the test-runner report and categorize failures:
- Assertion failures (outdated expectations)
- Missing mocks or dependencies
- Async/timing issues
- TypeScript/compilation errors
- Environment configuration issues
- API contract changes

## Step 2: Deploy Test Fixing Agents (IN PARALLEL)

### Primary Fixing Agent:
Use Task tool with **test-fixer** agent:
- "Analyze all failed tests from the test execution report and automatically fix them:
  1. Update outdated assertions to match current implementation
  2. Add missing mocks for external dependencies
  3. Fix async/timing issues with proper waits
  4. Resolve TypeScript errors and type mismatches
  5. Update API test expectations to match current endpoints
  6. Fix DOM selector issues in component tests
  Store successful fix patterns in Serena memories for future use."

### Supporting Agents (deploy based on failure types):
1. **frontend-debugger** (if React/UI tests failed):
   - "Debug and fix React component test failures, rendering issues, and hook test problems"

2. **backend-debugger** (if API/backend tests failed):
   - "Fix API endpoint test failures, database mock issues, and service test problems"

3. **websocket-debugger** (if real-time tests failed):
   - "Fix WebSocket and Socket.io test failures, connection mocking issues"

## Step 3: Verify Fixes

After fixes are applied, re-run affected test suites:
- Execute only previously failed tests first
- If all pass, run full suite to ensure no regression
- Document all applied fixes

---

# PHASE 3: COMPREHENSIVE COVERAGE ANALYSIS (if --coverage flag present)
**Objective**: Deep coverage analysis and gap identification

## Step 1: Generate Coverage Reports

Use Task tool with **coverage-analyzer** agent:
- "Generate comprehensive coverage analysis:
  1. Collect coverage metrics for frontend (React/TypeScript)
  2. Collect coverage metrics for backend (Node.js/Express)
  3. Collect coverage metrics for ML service (Python/FastAPI)
  4. Identify critical uncovered code paths
  5. Find untested files and dead code
  6. Generate visual coverage heatmap
  7. Prioritize test additions by risk and complexity
  8. Calculate coverage trends over time"

## Step 2: Gap Analysis & Recommendations

### Deploy Analysis Agents (IN PARALLEL):
1. **ssot-analyzer**:
   - "Identify code duplication in tests and suggest consolidation opportunities"

2. **test-generator**:
   - "Generate test templates for the top 10 most critical uncovered functions/components based on the coverage report"

---

# PHASE 4: PRODUCTION VALIDATION (if --production flag present)
**Objective**: Ensure production environment stability

## Step 1: Production Health Checks

Run production-specific validations:
```bash
# Check production containers
docker ps | grep -E "blue|green"

# Validate production endpoints
curl -s https://spherosegapp.utia.cas.cz/health
curl -s https://spherosegapp.utia.cas.cz/api/health

# Check production database
docker exec spheroseg-db-blue psql -U spheroseg -c "SELECT COUNT(*) FROM users;"
```

## Step 2: Smoke Tests Against Production

Run critical E2E tests against production URL:
- Login flow
- Core segmentation workflow
- API availability
- WebSocket connectivity

---

# PHASE 5: COMPREHENSIVE REPORTING
**Objective**: Generate detailed test report with actionable insights

## Final Report Structure

### Executive Summary
- Total tests across all categories
- Pass rate by category
- Tests fixed (if --fix was used)
- Coverage percentages
- Production status (if checked)

### Detailed Results by Category

#### Unit Tests
- Frontend: [passed]/[total] ([percentage]%)
- Backend: [passed]/[total] ([percentage]%)
- ML Service: [passed]/[total] ([percentage]%)

#### Integration Tests
- API Tests: [passed]/[total]
- Database Tests: [passed]/[total]
- WebSocket Tests: [passed]/[total]

#### E2E Tests
- User Workflows: [passed]/[total]
- Cross-browser: [results by browser]

#### Performance Tests
- Response Times: P50, P95, P99
- Throughput: requests/second
- Resource Usage: CPU, Memory

### Test Fixes Applied (if --fix used)
- Number of tests fixed: [count]
- Fix categories: [assertion updates, mock additions, etc.]
- Success rate: [percentage]

### Coverage Analysis (if --coverage used)
- Line Coverage: Frontend [X]%, Backend [Y]%, ML [Z]%
- Branch Coverage: [percentages]
- Function Coverage: [percentages]
- Critical Gaps: [top 5 uncovered areas]

### Production Validation (if --production used)
- Environment: [blue/green]
- Health Status: [all endpoints]
- Smoke Test Results: [pass/fail]

### Recommendations
1. Priority test additions
2. Flaky tests to investigate
3. Performance optimizations needed
4. Coverage improvement targets

## Step 3: Store Knowledge

Store test patterns and solutions in Serena memories:
1. Document common test failure patterns
2. Save successful fix strategies
3. Record coverage improvement techniques
4. Store performance benchmarks

---

## Execution Command Examples

```bash
# Run all tests with automatic fixing and coverage
/test --fix --coverage

# Run only unit tests
/test unit

# Run tests and check production
/test --production

# Run specific category with coverage
/test integration --coverage

# Full comprehensive test with all options
/test all --fix --coverage --production
```

## Critical Execution Guidelines

### Test Execution:
1. **Always use Docker containers** - Never run tests directly with npm
2. **Use Desktop Commander for long tests** - Prevents terminal crashes
3. **Run in parallel when possible** - Deploy multiple agents simultaneously
4. **Collect all metrics** - Duration, memory, failures

### Test Fixing:
1. **Understand root cause first** - Don't just update assertions blindly
2. **Preserve test intent** - Maintain what the test is trying to verify
3. **Add missing coverage** - When fixing, also add related tests
4. **Document patterns** - Store successful fixes in knowledge base

### Coverage Analysis:
1. **Focus on critical paths** - Auth, payments, core business logic
2. **Consider complexity** - High complexity + low coverage = priority
3. **Identify dead code** - Remove or test appropriately
4. **Set realistic targets** - 80% is good, 100% is often impractical

## Success Metrics

✅ All test suites discovered and executed
✅ Failed tests automatically fixed (if --fix)
✅ Comprehensive coverage report generated (if --coverage)
✅ Production environment validated (if --production)
✅ Detailed report with actionable insights
✅ Knowledge stored for future use
✅ No terminal crashes (Desktop Commander used)
✅ All Docker containers utilized properly

## Common Issues & Solutions

### Docker Container Issues
- If containers not running: `make up` first
- If permission issues: Check container user matches host user
- If network issues: Restart Docker service

### Test Timeout Issues
- Increase timeout in Desktop Commander calls
- Check if services are healthy before testing
- Ensure database migrations are complete

### Coverage Generation Issues
- Ensure coverage packages installed
- Check for .nycrc or vitest.config coverage settings
- Verify coverage output directories exist

**Remember**: This command orchestrates multiple specialized agents to provide comprehensive test management. Focus on actionable insights and continuous improvement of test quality!
