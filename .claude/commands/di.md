---
name: di
description: Debug issues or implement features with intelligent agent orchestration
argument-hint: [error description or feature request]
---

# Overview

This command provides comprehensive debugging and feature implementation capabilities for the BSMarker application. It orchestrates multiple specialized agents in parallel to gather context, analyze issues, implement solutions, and verify results using a systematic two-phase approach.

## Variables

- `$ARGUMENTS`: The error description or feature request to address
- Agent types: `context-gatherer`, `ssot-analyzer`, `frontend-debugger`, `backend-debugger`, `ml-debugger`, `docker-debugger`, `websocket-debugger`, `performance-debugger`, `feature-implementor`, `test-generator`, `integration-mapper`

## Instructions

1. **Context Collection**: Gather system state and error logs
2. **Agent Deployment**: Launch specialized agents for analysis
3. **Root Cause Analysis**: Consolidate findings from all agents
4. **Solution Design**: Create comprehensive fix or implementation plan
5. **Implementation**: Deploy implementation agents to apply changes
6. **Verification**: Test and validate the solution
7. **Knowledge Storage**: Document the solution for future reference

## Workflow

### Phase 1: System Context Collection
```bash
echo "🔍 Collecting system context for: $ARGUMENTS"

# Docker container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "bsmarker|spheroseg" || echo "No relevant containers"

# Recent logs from all services
echo "📋 Backend logs:"
docker logs bsmarker-backend --tail 50 2>&1 || echo "Backend not available"

echo "📋 Frontend logs:"
docker logs bsmarker-frontend --tail 30 2>&1 || echo "Frontend not available"

echo "📋 ML Service logs:"
docker logs bsmarker-ml --tail 30 2>&1 || echo "ML service not available"

# Database connection test
docker exec bsmarker-backend npm run db:test 2>&1 || echo "Database connection test failed"

# Git status
git status --short

# Environment check
[ -f .env ] && echo "✅ .env exists" || echo "❌ .env missing"

# TypeScript compilation check
cd /home/prusek/BSMarker/backend && npx tsc --noEmit 2>&1 | head -20 || echo "TypeScript check passed"
```

### Phase 2: Maximum Context Gathering

Deploy specialized agents in parallel based on the issue type:

```python
# Core agents (always deploy)
core_agents = [
    {
        "agent": "context-gatherer",
        "task": f"Gather comprehensive context about: {ARGUMENTS}. Analyze all touchpoints, dependencies, and related components."
    },
    {
        "agent": "ssot-analyzer",
        "task": f"Identify code patterns, reusable components, and architectural violations related to: {ARGUMENTS}"
    }
]

# Specialized agents (deploy based on error type)
specialized_agents = []

# Analyze the error/request to determine which agents to deploy
if any(keyword in ARGUMENTS.lower() for keyword in ['ui', 'react', 'frontend', 'component']):
    specialized_agents.append({
        "agent": "frontend-debugger",
        "task": f"Debug React/UI issues related to: {ARGUMENTS}. Check components, state management, rendering."
    })

if any(keyword in ARGUMENTS.lower() for keyword in ['api', 'backend', 'database', 'prisma']):
    specialized_agents.append({
        "agent": "backend-debugger",
        "task": f"Debug backend issues related to: {ARGUMENTS}. Check API endpoints, database queries, middleware."
    })

if any(keyword in ARGUMENTS.lower() for keyword in ['ml', 'model', 'segmentation', 'pytorch']):
    specialized_agents.append({
        "agent": "ml-debugger",
        "task": f"Debug ML issues related to: {ARGUMENTS}. Check model loading, inference, GPU usage."
    })

if any(keyword in ARGUMENTS.lower() for keyword in ['docker', 'container', 'build']):
    specialized_agents.append({
        "agent": "docker-debugger",
        "task": f"Debug Docker issues related to: {ARGUMENTS}. Check containers, networking, volumes."
    })

if any(keyword in ARGUMENTS.lower() for keyword in ['websocket', 'realtime', 'socket.io']):
    specialized_agents.append({
        "agent": "websocket-debugger",
        "task": f"Debug WebSocket issues related to: {ARGUMENTS}. Check connections, events, real-time updates."
    })

if any(keyword in ARGUMENTS.lower() for keyword in ['slow', 'performance', 'memory', 'cpu']):
    specialized_agents.append({
        "agent": "performance-debugger",
        "task": f"Analyze performance issues related to: {ARGUMENTS}. Check bottlenecks, memory leaks, optimization opportunities."
    })

# Deploy all agents in parallel
all_agents = core_agents + specialized_agents
```

### Phase 3: Consolidate Findings

Analyze all agent reports to identify:
- Root causes
- Affected components
- Existing patterns to follow
- Potential side effects
- Required changes

### Phase 4: Solution Implementation

Deploy implementation agents based on findings:

```python
implementation_agents = [
    {
        "agent": "feature-implementor",
        "task": f"Implement comprehensive solution for: {ARGUMENTS}. Follow patterns: [identified patterns]. Include all touchpoints: [affected components]."
    }
]

# Add supporting agents as needed
if "new functionality" in findings:
    implementation_agents.append({
        "agent": "test-generator",
        "task": f"Generate tests for: {ARGUMENTS}. Cover unit tests, integration tests, and edge cases."
    })

if "multiple components" in findings:
    implementation_agents.append({
        "agent": "integration-mapper",
        "task": f"Map all integration points for: {ARGUMENTS}. Ensure seamless integration across components."
    })

# Deploy implementation agents in parallel
```

### Phase 5: Verification
```bash
echo "✅ Verifying solution..."

# Run relevant tests
npm test -- --related 2>&1 || echo "Tests need attention"

# Check affected workflows
# [Specific verification steps based on the issue]

# Verify no regressions
docker-compose -f docker-compose.dev.yml ps

# Confirm issue resolution
echo "Original issue: $ARGUMENTS"
echo "Status: [RESOLVED/PARTIALLY_RESOLVED/NEEDS_REVIEW]"
```

### Phase 6: Knowledge Storage

Store the solution pattern for future reference:

```javascript
const solutionPattern = {
    issue: ARGUMENTS,
    symptoms: [/* observed symptoms */],
    rootCauses: [/* identified root causes */],
    solution: {
        approach: "Description of solution approach",
        changes: [/* list of changes made */],
        patterns: [/* reusable patterns */]
    },
    affectedComponents: [/* list of affected files/services */],
    testingNotes: "How to verify the fix",
    preventionTips: "How to prevent similar issues"
};

// Store in knowledge base
```

### Phase 7: Commit Changes
```bash
# Ensure pre-commit hooks pass
npm run lint:fix
npm run format

# Stage changes
git add .

# Commit with descriptive message
git commit -m "fix: $ARGUMENTS

- Root cause: [description]
- Solution: [description]
- Testing: [what was tested]

Closes #[issue-number]"

# Push to dev branch
git push origin dev
```

## Report

### Debug/Implementation Summary
- **Request**: $ARGUMENTS
- **Type**: [Bug Fix / Feature Implementation / Performance Fix]
- **Severity**: [Critical / High / Medium / Low]
- **Status**: [Resolved / Partially Resolved / Needs Review]

### Analysis Results
```
📊 Context Gathering:
- Agents Deployed: [count]
- Components Analyzed: [list]
- Patterns Identified: [count]
- Root Causes Found: [count]
```

### Root Cause Analysis
1. **Primary Cause**: [description]
2. **Contributing Factors**: [list]
3. **Affected Systems**: [list]

### Solution Implementation
```
✅ Changes Applied:
- Files Modified: [count]
- Lines Changed: [+X / -Y]
- Tests Added: [count]
- Documentation Updated: [yes/no]
```

### Verification Results
- Unit Tests: [pass/fail]
- Integration Tests: [pass/fail]
- Manual Testing: [completed/pending]
- Performance Impact: [improved/neutral/degraded]

### Knowledge Base Entry
```yaml
pattern_id: [unique-id]
category: [error-type]
solution: [reusable-solution]
prevention: [prevention-tips]
```

### Recommendations
1. **Immediate Actions**:
   - Monitor the fix in development
   - Run full test suite
   - Review related code for similar issues

2. **Follow-up Tasks**:
   - Add monitoring for this error pattern
   - Update documentation
   - Consider architectural improvements

3. **Prevention Strategies**:
   - Add linting rules to catch similar issues
   - Improve test coverage in affected areas
   - Document the pattern for team awareness

### Next Steps
- Deploy to staging: `/deploy --staging`
- Run comprehensive tests: `/test all`
- Create pull request: `/commit "Fix: $ARGUMENTS"`
- Monitor for 24 hours
- Update team documentation
