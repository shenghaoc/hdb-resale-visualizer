# AI Agent Quickstart (Kiro Workflow)

Use this file as a **thin router**. Keep task execution focused; treat deeper process docs as references only when relevant.

## 1) Read steering first (required)
Before coding or reviewing, read:
- [`.kiro/steering/product.md`](.kiro/steering/product.md)
- [`.kiro/steering/tech.md`](.kiro/steering/tech.md)
- [`.kiro/steering/pipeline.md`](.kiro/steering/pipeline.md)
- [`.kiro/steering/structure.md`](.kiro/steering/structure.md)
- [`.kiro/steering/ui-standards.md`](.kiro/steering/ui-standards.md)

## 2) Non-negotiable architecture guardrails
- Frontend (`src/`) must only consume static artifacts from `public/data/`.
- All geocoding + MRT proximity computation must stay in `scripts/` (build-time only).
- Persistent user state must remain browser-local (`localStorage`).
- Do **not** load or analyze `public/data/` unless explicitly requested; use `tests/fixtures/public-data/` for schema-oriented work.
- Runtime/tooling baseline: **Node 26 + npm only** (no bun/yarn/pnpm lockfiles).

## 3) Active specs (open only if task-related)
- [Header & Map Control Fixes](.kiro/specs/header-blocks-map-controls/tasks.md)
- [UI Redesign](.kiro/specs/redesign-ui/tasks.md)
- [IME Composition Input](.kiro/specs/ime-composition-input/tasks.md)

## 4) Useful local commands
```bash
npm install
npm run dev
npm run sync-data
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

## 5) Reference docs (review/process details)
- Workspace MCP config: [`.kiro/settings/mcp.json`](.kiro/settings/mcp.json)
- Review policy and platform trigger conventions live in `.kiro/` specs/steering; consult when performing formal PR review work.
