# AI Agent Steering

## Overview
This repository uses the **Kiro workflow** for agent-led development. The source of truth for the project is located in the `.kiro/` directory.

## Core Requisites
- **Read Steering First**: Before any task, agents MUST read all files in `.kiro/steering/`.
- **Check Specs**: For active features or bugfixes, consult the relevant subfolder in `.kiro/specs/`.
- **Update Tasks**: As you complete implementation steps, mark them off in the relevant `tasks.md`.

## Steering Roadmap
- [Product Vision](.kiro/steering/product.md)
- [Technical Constraints](.kiro/steering/tech.md)
- [Repository Structure](.kiro/steering/structure.md)
- [UI/UX Standards](.kiro/steering/ui-standards.md)

## Active Work
- [UI Redesign Spec](.kiro/specs/redesign-ui/tasks.md)

## Command Summary
```bash
bun install
bun run sync-data  # Refresh precomputed artifacts
bun run dev        # Local development
bun run test       # Run all tests
bun run lint       # Run ESLint
bun run build      # Production build
```
