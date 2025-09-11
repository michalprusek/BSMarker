---
argument-hint: [error description or browser console log]
description: Comprehensive error analysis and fix for BSMarker
---

# Comprehensive Error Debugging and Resolution for BSMarker

## Error Context
**User-reported error:** $ARGUMENTS

## System Context Collection

### Current Docker Container Status
!`docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "bsmarker" || echo "No BSMarker containers running"`

### Backend Container Logs (last 50 lines)
!`docker logs bsmarker_backend_1 --tail 50 2>&1 || docker logs bsmarker_backend_2 --tail 50 2>&1 || echo "Backend container not found"`

### Frontend Container Logs (last 30 lines)
!`docker logs bsmarker_frontend_1 --tail 30 2>&1 || docker logs bsmarker_frontend_2 --tail 30 2>&1 || echo "Frontend container not found"`

### Nginx Container Logs (last 30 lines)
!`docker logs bsmarker_nginx_1 --tail 30 2>&1 || echo "Nginx container not found"`

### Database Connection Status
!`docker exec bsmarker_backend_1 python -c "from app.db.database import engine; print('DB connected')" 2>&1 || echo "Could not test database connection"`

### Current Git Status
!`git status --short`

### Recent Git Changes
!`git diff HEAD~1 --name-status | head -20`

### Environment Check
!`[ -f .env ] && echo ".env file exists" || echo ".env file missing"`
!`[ -f .env.production ] && echo ".env.production file exists" || echo ".env.production file missing"`

### Python Dependencies Status (Backend)
!`cd backend && pip list | head -20 || echo "Could not list Python dependencies"`

### Node Dependencies Status (Frontend)
!`cd frontend && npm ls 2>&1 | grep -E "UNMET|missing|error" | head -10 || echo "No dependency issues found"`

### TypeScript Compilation Check (Frontend)
!`cd frontend && npm run type-check 2>&1 | head -20 || echo "TypeScript check passed"`

### Current Directory Structure
!`ls -la | head -15`

## Your Mission

You are an expert debugging engineer with deep knowledge of the BSMarker bird song annotation application. Your goal is to systematically diagnose and fix the reported error using a sophisticated two-phase approach.

---

# PHASE 1: MAXIMUM CONTEXT GATHERING
**Objective**: Gather comprehensive context about the error using specialized subagents in parallel

## Step 1: Initial Error Analysis
Use the TodoWrite tool to create a task list for debugging phases, then analyze the error logs above to determine which specialized debugging agents to deploy.

## Step 2: Deploy Specialized Context-Gathering Agents (IN PARALLEL)

**IMPORTANT**: Launch multiple agents simultaneously for maximum efficiency. Based on the error type, use these specialized agents:

### Core Debugging Agents:
- **context-gatherer**: ALWAYS use first - gathers comprehensive context from codebase and knowledge systems
- **ssot-analyzer**: Identifies code patterns, reusable components, and architectural violations

### Specialized Debugging Agents (choose based on error type):
- **frontend-debugger**: React errors, TypeScript issues, UI rendering problems, state management bugs
- **backend-debugger**: FastAPI errors, SQLAlchemy/database problems, API failures, authentication issues
- **docker-debugger**: Container failures, build issues, networking problems, volume errors
- **websocket-debugger**: Real-time update failures, WebSocket disconnections, event handling issues
- **performance-debugger**: Slow queries, memory leaks, high CPU usage, bottlenecks
- **spectrogram-debugger**: Audio processing issues, librosa errors, spectrogram generation failures

**Example parallel launch for a full-stack error:**
```
Use Task tool with:
1. context-gatherer: "Analyze all touchpoints for [error description]"
2. frontend-debugger: "Investigate UI issues related to [error]"
3. backend-debugger: "Check API and database for [error]"
4. ssot-analyzer: "Find reusable patterns for fixing [error]"
```


## Step 3: Consolidate Findings

1. Review all agent reports
2. Identify common patterns and root causes
3. Map all affected components and dependencies
4. Document the complete error context

## Step 4: Knowledge System Investigation

After you gather context from subagents

1. Search ByteRover knowledge base for similar errors and solutions
2. Query for best practices and architectural patterns
3. Look for previous fixes to related issues
---

# PHASE 2: SOPHISTICATED FIX IMPLEMENTATION
**Objective**: Apply comprehensive fixes using specialized implementation agents

## Step 5: Solution Design

Based on Phase 1 findings, design a solution that:
- Addresses all identified root causes
- Follows discovered patterns and best practices
- Considers all affected components
- Includes proper error handling and monitoring

## Step 6: Deploy Implementation Agents (IN PARALLEL)

### Primary Implementation Agent:
- **feature-implementor**: Use for comprehensive fixes that span multiple files/components
  - Provide detailed implementation plan from Phase 1
  - Include all touchpoints identified by context-gatherer
  - Specify SSOT patterns to follow

### Supporting Implementation Agents (as needed):
- **test-generator**: Create tests BEFORE implementation (TDD approach)
- **integration-mapper**: Map all integration points for complex fixes
- **i18n-updater**: Update translations if UI messages change

**Example parallel implementation:**
```
Use Task tool with:
1. test-generator: "Write tests for [fix description] based on [error scenario]..."
2. feature-implementor: "Implement fix for [error] following patterns: [list patterns]..."
3. integration-mapper: "Ensure fix integrates with [list of components]..."
```

## Step 7: Verification Phase

Deploy verification agents:
1. Run implemented tests
2. Check all affected workflows
3. Verify no regressions introduced
4. Confirm error is resolved

## Step 8: Knowledge Storage

Store the complete solution in ByteRover:
1. Document the error pattern and symptoms
2. Explain all root causes discovered
3. Detail the solution approach and implementation
4. Include code patterns for future reference
5. List all affected components and integration points

## Critical Guidelines

### Phase 1 - Context Gathering:
1. **ALWAYS use parallel agent deployment** - Launch multiple agents simultaneously
2. **ALWAYS start with context-gatherer** - It provides the foundation for other agents
3. **Provide comprehensive instructions to agents** - They don't share context with you
4. **Include specific error details** - Give agents the exact error messages and logs
5. **Request specific deliverables** - Tell agents exactly what information to return

### Phase 2 - Implementation:
1. **No Hot Fixes**: Every change must be architecturally sound
2. **Use SSOT patterns**: Follow patterns identified by ssot-analyzer
3. **TDD Approach**: Generate tests before implementation when possible
4. **Comprehensive Testing**: Verify all affected workflows
5. **Knowledge Preservation**: Store solutions for future use

### General Principles:
1. **Root Cause Focus**: Fix underlying issues, not symptoms
2. **Pattern Consistency**: Follow existing codebase patterns
3. **Error Handling**: Add proper validation and user-friendly messages
4. **Performance Impact**: Consider and measure performance changes
5. **Security First**: Ensure no vulnerabilities are introduced

## Expected Deliverables

### After Phase 1 (Context Gathering):
1. **Complete Error Context**: Consolidated findings from all agents
2. **Root Cause Analysis**: Multiple perspectives on why the error occurred
3. **Affected Components Map**: All files, services, and integrations involved
4. **Pattern Analysis**: Existing patterns that apply to this fix
5. **Risk Assessment**: Potential side effects and regression risks

### After Phase 2 (Implementation):
1. **Implementation Summary**: What was changed and why
2. **Test Results**: Evidence that the fix works
3. **Integration Verification**: Confirmation that all touchpoints work
4. **Performance Metrics**: Any performance impact measurements
5. **Knowledge Base Entry**: Stored solution for future reference

## Execution Flow Summary

```
1. Receive Error → Create Todo List
2. Launch Context Agents (parallel) → Gather Maximum Context
3. Analyze Findings → Design Solution
4. Launch Implementation Agents (parallel) → Apply Fixes
5. Verify Solution → Store Knowledge
```

VERY IMPORTANT: Subagents have their own context - always make sure you descripe them everything comprehensively

**Remember**: The power of this approach is in parallel agent execution and comprehensive context gathering. Never skip Phase 1 to rush into fixing - understanding must come first!
