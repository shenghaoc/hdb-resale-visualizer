# UI/UX Standards

## Core Principles
1. **High Information Density**: Prioritize professional, concise layouts over excessive white space. Use tight headers and small, uppercase labels for secondary metadata.
2. **Shadcn Compliance**:
   - Strictly follow the `shadcn` composition rules (Items inside Groups, correct triggers).
   - Use semantic color tokens (`bg-primary`, `text-muted-foreground`) exclusively.
   - Use `data-icon` attribute for all Lucide icons inside buttons.
   - Use `FieldGroup`, `FieldSet`, and `FieldLegend` for semantic form structure.
3. **Map Grounding**:
   - All proximity data (Schools, Hawkers) must be visually supported by 1km/2km radius circles on the map when a block is selected.
   - OneMap GreyLite attribution must always be visible.

## Components & Patterns
- **Cards**: Use `Card` with `size="sm"` and `bg-muted/20` for metadata grouping.
- **Badges**: Use `Badge` for quick-read facts (Town, Price Rank).
- **Formatters**: Always use the standard formatters in `src/lib/format.ts` for currency, meters, and lease values.
- **Density**: Headers should be compact. Use `col-span-full` in grid headers to ensure text breathing room.
