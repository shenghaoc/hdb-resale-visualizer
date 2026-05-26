---
description: Review a pull request
allowed-tools: Task, Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*),mcp__github_inline_comment__create_inline_comment
---

Read and follow the review policy in @AGENTS.md and @CLAUDE.md before reviewing.

REPO: use the pull request's repository from `gh pr view`.
PR NUMBER: use the pull request tied to this thread (from `gh pr view` when needed).

Perform a comprehensive code review using subagents for key areas:

- code-quality-reviewer
- performance-reviewer
- test-coverage-reviewer
- documentation-accuracy-reviewer
- security-code-reviewer

Instruct each subagent to only provide noteworthy feedback and to apply the project rules in @AGENTS.md. Launch them in parallel when possible.

Once they finish, curate the feedback and post only what you also deem noteworthy.

Provide feedback using inline comments (`mcp__github_inline_comment__create_inline_comment` with `confirmed: true`) for specific, localized issues.
Use a single top-level PR comment for the summary. Structure the summary per @AGENTS.md:

- **Overview**
- **Automated Review Status** (which bot findings are fixed vs. still open)
- **Issues Found** (Critical/High/Medium/Low, file:line, impact, fix)
- **Positives**
- **Summary**

Keep comments concise. Do not nitpick formatting unless it materially hurts readability.
