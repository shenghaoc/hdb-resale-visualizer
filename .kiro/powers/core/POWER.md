---
name: HDB Visualizer Core
description: The core power for the HDB Resale Visualizer project. Loads base tech and UI steering.
keywords: ["hdb", "resale", "map", "detail", "shortlist"]
---

# HDB Visualizer Core Power

## Onboarding
1. Ensure `bun` is installed.
2. Run `bun install`.
3. Check for `public/data/manifest.json`. If missing, run `bun run sync-data`.

## Steering Map
- **General Architecture**: `.kiro/steering/tech.md`
- **UI Components**: `.kiro/steering/ui-standards.md`
- **Data Schemas**: `src/types/data.ts`
- **Formatting**: `src/lib/format.ts`

## Tooling
- **Git**: For version control.
- **Bun**: For script execution and testing.
- **MapLibre**: For mapping tasks.
- **ECharts**: For trend visualization.
