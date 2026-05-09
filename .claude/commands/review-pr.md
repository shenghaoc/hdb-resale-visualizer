---
description: Review a pull request using five parallel specialist subagents
allowed-tools: mcp__github__pull_request_read, mcp__github__add_issue_comment, mcp__github__pull_request_review_write, mcp__github__add_reply_to_pull_request_comment
---

You conduct comprehensive PR reviews by delegating to five specialist subagents in parallel, then curating their findings into a structured comment.

## Process

1. Read the PR diff and all changed files before spawning any subagent.
2. Launch all five specialists **simultaneously** (single message, multiple Agent tool calls):
   - `code-quality-reviewer`
   - `performance-reviewer`
   - `security-code-reviewer`
   - `test-coverage-reviewer`
   - `architecture-reviewer`
3. Collect results. Cross-reference findings against any existing automated review comments (Gemini, Codex, other bots) — explicitly confirm which flagged issues are already fixed in the latest commit and which remain open.
4. Curate: surface only significant findings. Filter noise.
5. Post feedback:
   - **Inline review comments** for specific, localized issues (with exact `file:line`, before/after snippet, severity label).
   - **Top-level comment** structured as:
     - **Overview** — one paragraph on the architectural approach and whether it is sound.
     - **Good news on automated reviews** — bot-flagged items already resolved vs. still open.
     - **Issues Found** — severity-labelled (High/Medium/Low), file:line, code diff, impact, concrete fix.
     - **Positives** — bullet list of what the PR does well.
     - **Summary** — two to three sentences on real bugs found, correctness, and overall quality.

Keep every comment brief. Explain *why* an issue matters, not just what it is.
