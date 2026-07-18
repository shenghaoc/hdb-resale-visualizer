# Design: Analyst's Workbench Design System

> Status: Implemented by the design-system phase PR. This specification
> records the final behavior and boundaries after pre-merge review.

## Problem

The app had strong buyer-facing workflows but inconsistent typography,
translucent and rounded surface treatments, ad hoc micro-label styles, and
responsive rules that sometimes coupled visual size to hit-target size. The
result felt less like a trustworthy analysis tool and made future UI work
harder to keep coherent.

The phase also introduced shortlist Undo. Its initial toggle-based wiring could
recreate only a minimal item and therefore discard buyer-entered offer-board
data. The final design must make recovery exact, not merely make the item
visible again.

## Goals

- Establish one documented workbench visual language across existing views.
- Consolidate typography and repeated surface/label styles without replacing
  Shadcn primitives or changing product architecture.
- Improve coarse-pointer, tablet, keyboard, and screen-reader behavior.
- Preserve the complete shortlist item when a removal is undone.
- Keep runtime data boundaries and all existing buyer workflows intact.

## Non-goals

- A new information architecture, route structure, or map interaction model.
- New data sources, D1 schema changes, geocoding, or prediction logic.
- A second component library beside the existing Shadcn and Lucide stack.
- Native macOS UI; this remains a responsive web application.

## Architecture

### Typography and tokens

`src/styles.css` owns the IBM Plex Sans `@font-face` declarations, semantic
color variables, type scale, tracking values, and workbench utilities. Local
Latin subsets avoid runtime font downloads. Component arbitrary values use
Tailwind's `length:` type hint where a CSS variable supplies the font size.

The minimum auxiliary size is `--text-xs` (11px). `v2-kicker`,
`v2-section-title`, and `v2-field-label` share that floor and differ through
weight and role rather than unreadably small text.

### Surfaces and component composition

`v2-chrome`, `v2-panel`, and `v2-card` layer styling onto the existing Shadcn
components. They are opaque, square, and use a single restrained shadow tier.
Feature components continue to compose `Button`, `Card`, `Input`, `Badge`,
`Tabs`, `Tooltip`, and the Lucide icon library; no parallel primitive system is
introduced.

Square geometry applies to primary chrome. Switch tracks and slider thumbs
remain rounded because their familiar shape communicates control state.

### Pointer and responsive behavior

A coarse-pointer media query expands only shared buttons and controls tagged
with `data-touch-target`. Custom switches wrap a visually sized track inside
that hit area, so 44px accessibility sizing does not turn the track itself into
a square. No fine-pointer reset overrides explicit component utility classes.

`AppPanelShell` derives its mobile/tablet top offset from whether active filter
chips are present. The tablet media query controls width and height only and
does not overwrite that state-dependent clearance.

### Shortlist removal recovery

`restoreShortlistItem` is a pure helper that rejects duplicates, respects the
capacity limit, and inserts the exact item at its prior bounded index.
`useShortlist.restore` applies that helper through the existing persistence and
sync-observed state path.

`useShortlistRemovalUndo` owns the pending item, original index, and five-second
timer. `ShortlistDrawer` renders the status notification and calls an explicit
`onRestore`; it does not reuse `onRemove`. This keeps timer state out of the
large drawer and persistence rules out of the view.

## User flow

1. The buyer scopes the map, opens filters, results, listing check, or Saved,
   and sees consistent opaque workbench surfaces.
2. On touch input, controls have usable hit areas while custom switch tracks
   retain their expected visual proportions.
3. The buyer records shortlist offer-board data and removes an item.
4. A live-status notification offers Undo for five seconds.
5. Undo restores the exact item and original ordering, after which normal local
   persistence and optional sync continue.

## Testing

- Unit tests verify exact item data and position restoration.
- Drawer tests verify that Undo invokes restore and not a second removal.
- Control tests verify that custom switches expose an explicit touch target
  while keeping their inner visual track dimensions.
- The full `check:pr` command covers formatting, lint, type checking, unit and
  integration tests, production build, and Playwright E2E tests.

## Risks and mitigations

- **Large visual diff:** focused utility classes and existing component
  composition limit the creation of one-off systems; full regression and E2E
  gates catch behavioral drift.
- **Touch sizing regressions:** hit-area and visual-track sizing are separated
  and covered by component tests.
- **Undo data loss:** the pending state stores the complete typed item and the
  restoration path has focused data-preservation tests.
