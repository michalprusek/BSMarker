---
argument-hint: [file-path or directory] (optional, defaults to entire project)
description: Perform comprehensive code audit, analyze recommendations, and create TODO items
---

## Context

- Current git status: !`git status --short`
- Recent changes: !`git diff --stat HEAD~3..HEAD`
- Project structure: !`find . -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | head -20` or Repomix MCP
- TODO file: @TODO.md
- Repomix MCP, Context7 MCP
- Docker logs
- Browser console logs


## Task

You will coordinate a comprehensive code audit workflow:

### Phase 1: Code Audit
Use the @.claude/agents/code-audit-analyzer.md subagent to perform a thorough code review of $ARGUMENTS (or the entire project if no argument provided).

The audit should examine:
- Code quality and maintainability
- Security vulnerabilities
- Performance bottlenecks
- Architectural issues
- Technical debt
- Test coverage gaps
- Dependency problems

### Phase 2: Analysis and Prioritization
After receiving the audit report from code-audit-analyzer, use the @.claude/agents/context-analyzer-planner.md subagent to:

1. Validate and prioritize the recommendations
2. Categorize issues by:
   - **Critical** (security, data loss risks)
   - **High** (performance, major bugs)
   - **Medium** (maintainability, minor bugs)
   - **Low** (code style, nice-to-have)

3. Create actionable TODO items with:
   - Clear task description
   - Priority level
   - Estimated effort (S/M/L/XL)
   - Affected files/components
   - Suggested approach

### Phase 3: Update TODO
Append the prioritized tasks to TODO.md in this format:

Code Audit [Current Date]

Critical Priority

 - TASK_NAME: Brief description (Effort: X, Files: Y)
 - Details: Specific issue and recommended fix
 - Agent: Which subagent should handle this



High Priority

 ...

Medium Priority

 ...

Low Priority

 ...


Provide a summary of:
- Total issues found
- Issues by category
- Recommended immediate actions (top 3)