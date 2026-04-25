---
name: MCP Developer Tools
description: Provides core MCP tools for repository management, browser automation, and data pipeline verification.
keywords: ["mcp", "github", "playwright", "filesystem"]
---

# MCP Developer Power

## Required Servers
- **github**: For managing issues, PRs, and repository metadata.
- **playwright**: For e2e test validation and browser-based data verification.
- **filesystem**: For safe, surgical file operations across the project tree.

## Configuration (Reference)
The following directories are authorized for filesystem MCP operations:
- `./src`
- `./scripts`
- `./public`
- `./data`
- `./.github`
- `./.kiro`

## Usage
Activate this power when performing cross-repository coordination or running visual verification tests.
