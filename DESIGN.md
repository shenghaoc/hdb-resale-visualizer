---
name: HDB Resale Explorer
description: Map-first due-diligence tool for Singapore HDB resale buyers — data-dense, no decoration, every pixel earns its place.
colors:
  deep-cyan: "#0e7490"
  deep-cyan-dark: "#22d3ee"
  deep-ink: "#0f172a"
  cool-slate-bg: "#f8fafc"
  paper-white: "#ffffff"
  quiet-slate: "#f1f5f9"
  muted-slate: "#5f6b7c"
  cyan-wash: "#ecfeff"
  subtle-rule: "#0f172a14"
  verified-green: "#047857"
  caution-amber: "#b45309"
  critical-red: "#b91c1c"
  chart-indigo: "#6366f1"
  chart-amber: "#f59e0b"
  chart-emerald: "#10b981"
  chart-pink: "#ec4899"
typography:
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    letterSpacing: "0.05em"
    textTransform: "uppercase"
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    letterSpacing: "0.12em"
    textTransform: "uppercase"
rounded:
  none: "0px"
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.deep-cyan}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    padding: "10px 24px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.deep-cyan}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.none}"
    padding: "10px 24px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.none}"
    padding: "10px 24px"
    typography: "{typography.label}"
  card-default:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.none}"
    padding: "32px 32px"
  card-sm:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.none}"
    padding: "20px 20px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.none}"
    padding: "4px 0"
    height: "40px"
  badge-default:
    backgroundColor: "transparent"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.none}"
    typography: "{typography.label}"
---

# Design System: HDB Resale Explorer

## 1. Overview

**Creative North Star: "The Analyst's Workbench"**

The HDB Resale Explorer is a precision tool dressed as a web application. Every element on screen serves the buyer's due-diligence workflow; decoration that doesn't advance understanding is removed. The system inherits Stripe Dashboard's clarity of information architecture but pushes further toward analytical density — this is a workspace, not a consumer product.

The visual language is restrained and utilitarian: cyan is the sole accent, deployed sparingly on primary actions and data highlights. Surfaces are flat, borders are subtle hairlines, and typography is a single family (IBM Plex Sans) used across all roles. Badges and buttons are squared-off, uppercase, and tightly tracked — industrial typography that signals "data, not marketing."

This system explicitly rejects: cluttered marketplace grids (PropertyGuru), lifestyle imagery and vague sentiment scores (Zillow), gradient hero sections and animated stat counters (flashy real-estate startups). The aesthetic is professional, not promotional.

**Key Characteristics:**

- Single-accent palette: cyan as the only chromatic voice; everything else is slate
- Squared-off geometry: no rounded corners on interactive elements (buttons, badges, inputs)
- Uppercase micro-labels: `var(--text-xs)`, 600 weight, `var(--tracking-label)` tracking for metadata and actions
- Underline inputs: border-bottom only, no full-border input fields
- Subtle elevation: cards use `shadow-sm` + `ring-1` at 5% opacity; the system is nearly flat
- Light/dark parity: every color token uses `light-dark()` for automatic theme switching

## 2. Colors

The palette is deliberately restrained. Cyan is the only accent; slate neutrals carry the rest. Semantic colors (green, amber, red) appear only when they carry meaning — success, warning, error — never as decoration.

### Primary

- **Deep Cyan** (#0e7490 / cyan-700): Primary buttons, focus rings, chart series 1, active states. The only chromatic voice in the interface. In dark mode, lifts to cyan-400 (#22d3ee) for luminosity.
- **Cyan Wash** (#ecfeff / cyan-50): Accent background for selected rows, hover tints, subtle highlights. In dark mode, deepens to a navy-cyan blend (#193353).

### Neutral

- **Cool Slate BG** (#f8fafc / slate-50): Page background. Near-white with negligible chroma — deliberately not warm/cream. In dark mode, drops to near-black navy (#080e1a).
- **Paper White** (#ffffff): Card and popover surfaces. In dark mode, lifts slightly to (#0d1628).
- **Deep Ink** (#0f172a / slate-900): Body text, headings, primary content. In dark mode, lightens to (#e2e8f0).
- **Quiet Slate** (#f1f5f9 / slate-100): Muted surface backgrounds, secondary button fills. In dark mode, deepens to (#0d1628).
- **Muted Slate** (#5f6b7c / slate-600): Secondary text, captions, placeholder text. Must clear ≥4.5:1 against Cool Slate BG. In dark mode, lightens to (#94a3b8).
- **Subtle Rule** (rgba(15, 23, 42, 0.08)): Card rings, dividers, hairline borders. In dark mode, shifts to a cyan-tinted transparency (rgba(34, 211, 238, 0.12)).

### Semantic

- **Verified Green** (#047857 / emerald-700): Positive signals — budget match, price below median, lease health. Dark mode: emerald-400.
- **Caution Amber** (#b45309 / amber-700): Warning signals — lease decay approaching, price above range. Dark mode: amber-400.
- **Critical Red** (#b91c1c / red-700): Destructive actions, errors, price significantly above market. Dark mode: red-400.

### Chart

- **Chart Indigo** (#6366f1): Secondary chart series. Dark mode: indigo-400.
- **Chart Amber** (#f59e0b): Tertiary chart series. Dark mode: orange-400.
- **Chart Emerald** (#10b981): Quaternary chart series. Dark mode: emerald-400.
- **Chart Pink** (#ec4899): Quinary chart series. Dark mode: pink-400.

### Named Rules

**The One Voice Rule.** Deep Cyan is the only accent. It appears on primary buttons, focus rings, links, and chart series 1 — and nowhere else. Secondary colors (indigo, amber, emerald, pink) exist only in charts where multiple series need discrimination. Never introduce a second UI accent.

**The Cold Neutral Rule.** Backgrounds and surfaces are cool or neutral in chroma — never warm-tinted. The system's warmth comes from data utility, not from beige backgrounds.

## 3. Typography

**Primary Font:** IBM Plex Sans (with system-ui, sans-serif fallback)
**Mono Font:** SF Mono, ui-monospace, monospace

**Character:** IBM Plex Sans is a pragmatic grotesk with an engineering sensibility — open apertures, rational proportions, no stylistic indulgence. A single family across all roles (headings, body, labels, data) reinforces the tool-like character. No serif pairing; the contrast comes from weight and scale, not classification.

### Hierarchy

- **--text-2xl** (1.5rem / 24px): Large display headings. Used sparingly.
- **--text-xl** (1.25rem / 20px): Guide prose h1, prominent section headers.
- **--text-lg** (1.125rem / 18px): Card titles, section headers. Uppercase with subtle tracking.
- **--text-base** (1rem / 16px): Primary body content, descriptions, transaction rows. Max line length 65ch in prose contexts.
- **--text-sm** (0.8125rem / 13px): Secondary data, compact values, stats in table cells.
- **Tab size** (0.75rem / 12px): Mode toggles, panel tab labels, empty-state prompts, field hints.
- **--text-xs** (0.625rem / 10px): Badges, button text, metadata tags, filter labels, table column headers. The workhorse of the micro-typography system. Label tracking at `var(--tracking-label)` (0.12em), uppercase.
- **Kicker** (0.56rem / ~9px): The smallest intentional size — used only for `.v2-kicker` eyebrow text. Same `var(--tracking-label)` as labels.
- **Data** (400–500 weight, inherits size): Numbers, prices, statistics. Tabular figures via `.v2-tabular`; right-aligned in table columns.

### Letter-Spacing Tokens

- `--tracking-label`: 0.12em — uppercase micro-labels, kickers, section titles, field hints.
- `--tracking-wide`: 0.05em — tab buttons, action labels at `--text-xs`.
- `--tracking-tight`: -0.01em — guide prose headings (h1–h3).

These replace the ad-hoc 0.04em/0.14em/0.16em/0.18em values that previously proliferated.

### Named Rules

**The Single Family Rule.** IBM Plex Sans everywhere. No heading/secondary font pair. Weight (400→500→600→700) and scale (`var(--text-xs)`→1rem→1.125rem) create the hierarchy.

**The Micro-Label Rule.** Secondary metadata, filter chips, action buttons, and badge text are always `var(--text-xs)` (0.625rem) / 600 weight / `var(--tracking-label)` (0.12em) / uppercase. This is the system's signature typographic gesture — consistent, not sprinkled.

## 4. Elevation

The system is essentially flat. Depth is conveyed through tonal layering (Cool Slate BG behind Paper White cards) and a single subtle shadow tier, not a multi-level elevation ramp.

### Shadow Vocabulary

- **Card Rest** (`box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); ring: 1px solid rgba(15,23,42,0.05)`): The only elevation state. Cards and popovers sit slightly above the background with a hairline ring and minimal shadow. In dark mode, the ring shifts to a cyan tint.
- **No Elevation**: Buttons, inputs, badges, and chips are flat. They indicate state through color change, not lift.

### Named Rules

**The Flat-at-Rest Rule.** Nothing casts a shadow unless it's a card or popover hovering above the page background. Interactive elements stay flat; state changes use color and border, not elevation.

## 5. Components

### Buttons

**Character:** Tactile but restrained — solid fills for primary, transparent with hairlines for secondary. Always squared-off, always uppercase.

- **Shape:** `rounded-none` (0px radius). Sharp corners are deliberate and consistent.
- **Primary:** `bg-deep-cyan text-white`. Hover: 80% opacity on the background. Active: slight translate-y shift (1px down).
- **Outline:** `border-border bg-transparent`. Hover: muted background fill.
- **Ghost:** `bg-transparent`. Hover: muted background fill.
- **Destructive:** `bg-critical-red/10 text-critical-red`. Hover: 20% background opacity.
- **Sizes:** Default (h-10, px-6), sm (h-9, px-4), xs (h-7, px-3), lg (h-11, px-8), plus icon-only variants (size-10, size-9, size-7, size-11).
- **Typography:** `var(--text-xs)` (0.625rem), 600 weight, `var(--tracking-label)` tracking, uppercase.
- **Focus:** `ring-2 ring-ring/30` with ring matching Deep Cyan.

### Cards

**Character:** Clean data containers, not decorative panels. Subtle border + minimal shadow. Internal spacing is generous but content is dense.

- **Shape:** `rounded-none`.
- **Default:** `bg-paper-white text-deep-ink`. Ring: 1px foreground/5. Shadow: `shadow-sm`. Padding: `py-8 px-8`, `gap-8`.
- **Small:** `data-[size=sm]`. Padding: `py-5 px-5`, `gap-5`.
- **Header:** Grid with `auto-rows-min`, supports optional action slot (top-right).
- **Title:** font-heading, text-lg, font-semibold, uppercase, tracking-wider.

### Inputs

**Character:** Underline-only — a single bottom border. No box, no full-border, no background fill. Feels like filling in a form on paper.

- **Shape:** `rounded-none`. No background. Border-bottom only (`border-b-input`).
- **Height:** h-10 (40px).
- **Typography:** text-base (16px) on mobile, text-sm (14px) on desktop.
- **Placeholder:** `text-muted-foreground` — must pass ≥4.5:1 contrast.
- **Focus:** Bottom border shifts to ring color (Deep Cyan). No outline, no ring.
- **Invalid:** Bottom border shifts to Critical Red.

### Badges

**Character:** The smallest typographic element — purely textual, no background, no border. Identified by weight, tracking, and case.

- **Shape:** `rounded-none`. `bg-transparent`, `border-0`, `px-0 py-0`. Zero chrome.
- **Typography:** `var(--text-xs)`, 600 weight, `var(--tracking-label)` tracking, uppercase.
- **Variants:** default (foreground), secondary (muted-foreground), destructive (critical-red).
- **Usage:** Town names, price ranks, flat types, metadata tags in lists and tables.

### Tables

**Character:** Data-first with minimal chrome. Headers are uppercase labels; rows are separated by subtle dividers.

- **Shape:** `rounded-none`. No outer border.
- **Header:** `text-muted-foreground`, uppercase label typography.
- **Row:** Hover state uses muted background. Selected state uses Cyan Wash background.
- **Divider:** Subtle horizontal rules between rows.

### Tooltips

**Character:** Compact data tooltips for map markers and chart points. Dark surface with light text, minimal padding.

- **Shape:** `rounded-md` (the exception — tooltips are informational, not interactive).
- **Surface:** `bg-popover text-popover-foreground`.
- **Typography:** text-xs, max-width constrained.

## 6. Do's and Don'ts

### Do

- ✅ Use Deep Cyan sparingly — primary buttons, focus rings, active links only
- ✅ Keep cards squared-off (`rounded-none`) and clean — data containers, not decorative panels
- ✅ Use uppercase micro-labels (`var(--text-xs)`, 600w, `var(--tracking-label)` tracking) consistently for metadata
- ✅ Use underline-only inputs — `border-b-input` with no background fill
- ✅ Prefer high-density layouts: tight headers, compact tables, small badges
- ✅ Let `light-dark()` handle theme switching automatically
- ✅ Use semantic colors (green, amber, red) only when they carry real meaning

### Don't

- ❌ Don't add a second accent color — cyan is the only chromatic voice
- ❌ Don't add rounded corners to interactive elements (buttons, inputs, badges)
- ❌ Don't use gradient text, glassmorphism, or decorative blurs
- ❌ Don't add side-stripe borders (border-left/right >1px as accent)
- ❌ Don't render "hero metric" templates (big number + small label + gradient accent)
- ❌ Don't add numbered section markers (01/02/03) or eyebrow kickers above every section
- ❌ Don't use warm-tinted backgrounds (cream, sand, beige, parchment)
- ❌ Don't nest cards inside cards
- ❌ Don't animate CSS layout properties (prefer transform + opacity)
- ❌ Don't ship animations without `prefers-reduced-motion` fallbacks
