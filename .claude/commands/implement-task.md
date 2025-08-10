---
argument-hint: [task-numbers/keywords/description OR "batch" for multiple tasks] (defaults to highest priority or batch of independent tasks)
description: Implement one or multiple independent tasks from TODO, with smart dependency detection
---

## Context

- Current git status: !`git status --short`
- Recent changes: !`git diff --stat HEAD~3..HEAD`
- Project structure: !`find . -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | head -20`
- TODO file: @TODO.md
- Current branch: !`git branch --show-current`
- Uncommitted changes check: !`git diff --exit-code --quiet || echo "WARNING: Uncommitted changes detected"`

## Task

Execute implementation workflow for one or multiple TODO items based on dependency analysis.

### Phase 1: Task Selection and Dependency Analysis

Parse TODO.md to identify all pending tasks. Look for:
- Task priorities marked as [CRITICAL], [HIGH], [MEDIUM], [LOW]
- Task numbers like #1, #2 or - [ ] format
- Dependencies indicated by "depends on", "after", "requires", "blocked by"
- Task categories or labels in parentheses like (frontend), (backend), (ml)

Determine execution mode based on $ARGUMENTS:
- If "batch" → find all independent tasks that can be done in parallel
- If contains comma-separated numbers (e.g., "1,3,5") or task names → verify they're and proceed with parallel implementation
- If single task identifier → process that task only
- If no arguments → select highest priority task OR up to 5 independent high-priority tasks

Tasks are considered INDEPENDENT when they:
- Don't modify the same files (check file paths in task descriptions)
- Don't affect the same components or services
- Have no explicit dependencies mentioned
- Don't require sequential database migrations
- Don't modify the same API endpoints or routes

Display task analysis in this format:

```
====================================
TASK DEPENDENCY ANALYSIS
====================================
Total Pending Tasks: [number]
Analyzing for parallel execution...

SELECTED FOR IMPLEMENTATION:
----------------------------------
✓ Task #1: [description]
  Priority: [level]
  Component: [area]
  Files: [count] files
  
✓ Task #3: [description]
  Priority: [level]
  Component: [area]
  Files: [count] files

DEPENDENCY CHECK:
----------------------------------
✓ No file conflicts detected
✓ Different service areas
✓ Independent test suites
✓ Can execute in parallel

EXCLUDED TASKS (with reasons):
----------------------------------
✗ Task #2 - Depends on Task #1
✗ Task #4 - Modifies same files as Task #3
✗ Task #5 - Marked as blocked
```

If conflicts detected, fall back to tasks with no dependencies. If none, proceed with single task with explanation.

### Phase 2: Multi-Task Specification Creation

IMPORTANT: For each single selected task, use the @.claude/agents/context-analyzer-planner.md subagent in parallel with others!.

For EACH task provide:
1. Isolated scope with specific files (ensure no overlap between tasks)
2. Independent test cases that won't interfere
3. Separate success criteria
4. Conflict-free implementation approach
5. Estimated effort in hours

Verify that no files are shared between tasks. If any conflicts found, mark them clearly."

Expected specification structure:
```
IMPLEMENTATION SPECIFICATION
============================
Mode: [SINGLE/PARALLEL]
Total Tasks: [number]

[For each task:]
------------------------
TASK #X: [Title]
------------------------
Scope: [description]
Priority: [level]
Estimated Time: [hours]

Files to Modify:
- [file1.ts] (No conflicts ✓)
- [file2.tsx] (No conflicts ✓)

Files to Create:
- [newfile.ts]

Implementation Steps:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Success Criteria:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

Test Requirements:
- Unit tests for [component]
- Integration test for [feature]

Risk Assessment:
- [Risk 1]: [Mitigation]
- [Risk 2]: [Mitigation]
```

### Phase 3: Implementation Execution

IMPORTANT: Pass the specifications to each @.claude/agents/feature-implementer.md subagent in parallel.

For each SINGLE task:
"Implement this specification completely. Follow all steps, create all files, include proper error handling and validation."

Monitor implementation progress and handle any issues that arise.

### Phase 4: Comprehensive Verification

After implementation completes:

#### 4.1 Individual Task Verification
For each implemented task:
- List all files changed
- Run task-specific tests if they exist
- Verify each success criterion
- Check for unintended side effects

#### 4.2 Integration Verification
- Run full test suite: !`npm test 2>&1 | tail -20`
- Check build status: !`npm run build 2>&1 | tail -10`
- Verify no TypeScript errors: !`npx tsc --noEmit 2>&1 | grep -c "error"`
- Check for lint issues: !`npm run lint 2>&1 | grep -c "error"`

#### 4.3 Update TODO.md
Mark completed tasks with timestamp and status:
```markdown
- [x] Task 1: Description (✓ Completed: YYYY-MM-DD HH:MM)
- [x] Task 3: Description (✓ Completed: YYYY-MM-DD HH:MM)
```

### Phase 5: Commit Strategy

Analyze changes and recommend commit approach.

### Phase 6: Final Report

Generate comprehensive summary:

```
========================================
IMPLEMENTATION SUMMARY
========================================
Execution Mode: [SINGLE/PARALLEL]
Total Time: [minutes]
Tasks Completed: [X] of [Y]

COMPLETED TASKS:
----------------------------------------
✅ Task #1: [Title]
   Files Changed: [count]
   Tests Added: [count]
   Status: Fully Implemented
   
✅ Task #3: [Title]
   Files Changed: [count]
   Tests Added: [count]
   Status: Fully Implemented

VERIFICATION RESULTS:
----------------------------------------
✅ All tests passing
✅ Build successful
✅ No TypeScript errors
✅ No lint errors
✅ No merge conflicts

METRICS:
----------------------------------------
Total Files Modified: [count]
Total Lines Added: [count]
Total Lines Removed: [count]
Test Coverage Change: [+X%]
Time Saved (parallel): [~X%]

NEXT RECOMMENDED ACTIONS:
----------------------------------------
1. Review the changes in detail
2. Run manual testing for [features]
3. Consider implementing Task #X (now unblocked)
4. Create PR with changes

## Error Handling

If errors occur at any phase:
- Phase 1: No tasks found → Show helpful message about TODO.md format
- Phase 2: Specification conflicts → Fall back to single task mode
- Phase 3: Implementation errors → Attempt fixes or report specific issues
- Phase 4: Test failures → Run @.claude/agents/test-debugger-reporter.md
- Phase 5: Commit conflicts → Provide resolution steps

## Advanced Features

### Intelligent Task Selection
When in batch mode, prefer tasks that:
- Are marked as high priority
- Affect different services (frontend/backend/ml)
- Have similar estimated effort
- Can share testing infrastructure

### Conflict Prevention
Before starting:
- Check for uncommitted changes
- Verify clean git status
- Ensure all tests currently passing
- Check for running development servers

### Efficiency Optimizations
- Group similar file modifications
- Reuse test setup when possible
- Batch dependency installations
- Cache build artifacts between tasks

## Final Output

End with clear status message:
- "✅ Successfully implemented [X] task(s). Ready for review and commit."
- "⚠️ Partial implementation: [X] of [Y] tasks completed. See report for details."
- "❌ Implementation blocked: [specific reason]. Please resolve and retry."

Always provide actionable next steps and make it easy for the user to proceed with confidence.