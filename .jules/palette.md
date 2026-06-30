## 2026-05-22 - Expose button active state to assistive technology
**Learning:** Buttons that only visually indicate their state using active classes do not relay their status to screen reader users, preventing them from understanding which options are currently selected.
**Action:** For independent on/off toggle buttons (click to select, click again to deselect), use `aria-pressed`. For mutually exclusive selections where one option must always be active, prefer `role="radiogroup"` with `role="radio"` and `aria-checked` on each button.

## 2026-06-02 - Custom UI elements lack focus indicators
**Learning:** When building highly custom selectable UI buttons or complex wizards (like the search profile wizard preset options), default Tailwind styling often omits or disables explicit focus outlines. Without manual inclusion of focus ring utilities, keyboard-only or screen-reader users have no visual indication of their current navigation position on interactive elements.
**Action:** Always explicitly define focus states using utilities like `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50` on custom buttons, especially inside iterators or option groups, to guarantee baseline accessibility.

## 2026-06-02 - Focus ring contrast on primary-filled chips
**Learning:** Preset chips that use `bg-primary` when selected can hide a `ring-primary/50` focus ring because the ring shares the same hue as the background. Popover listbox options are easy to miss when adding focus styles to a wizard's main controls.
**Action:** Add `focus-visible:ring-offset-2 focus-visible:ring-offset-background` to selectable chips that can render with a primary background. Apply the same base focus ring utilities to every keyboard-reachable button in nested pickers (e.g. MRT station listbox options), not just the trigger.

## 2026-06-04 - Focus ring pattern for expandable rows
**Learning:** The `CardHeader` component often contains custom clickable elements (like `div` or `button` wrappers for expandable rows) that use custom flexbox layouts. These elements might lack standard focus styling, which makes keyboard navigation difficult. Adding focus rings directly to these elements requires carefully maintaining their layout properties while adding the `focus-visible` utility classes.
**Action:** When implementing expandable rows or custom clickable areas, always verify keyboard focus visibility. If it's a custom `button` or `div` acting as a trigger, ensure `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50` (and a `rounded` utility if needed to match the shape) is applied so screen reader and keyboard users can easily identify the active element.

## 2026-06-04 - Jules memory folder must be `.jules` (lowercase)
**Learning:** Jules sometimes writes learnings to `.Jules/` (capital J) instead of this repo’s canonical `.jules/` directory. On case-insensitive filesystems (macOS, Windows) both paths alias to the same folder and the mistake is easy to miss in review; on Linux CI they are separate directories and ESLint ignore rules only list `.jules`.
**Action:** When reviewing Jules PRs, confirm palette/bolt/sentinel learnings land in `.jules/`, delete stray `.Jules/` files, and merge misplaced content into the lowercase file using real Markdown line breaks—not literal `\n` escape sequences in a single line.

## 2026-06-06 - Missing focus ring on Block micro-row buttons
**Learning:** In highly customized list elements, such as block list items disguised as flex-box containers inside the `TownProfileSection` component, standard Tailwind UI defaults leave interactive elements without visual focus states.
**Action:** Verify explicit focus indicators for any new or existing custom interactive elements acting as `<button>` row items, especially when mapped inside a list or data view. Apply utilities like `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background` to resolve it.

## 2026-06-14 - Accessible tooltips on icon-only buttons
**Learning:** Icon-only buttons often have an `aria-label` for screen reader accessibility, but lack a visual tooltip. Sighted mouse and keyboard users may be unsure of their function without a tooltip. Using native `title` attributes is discouraged as they are not keyboard-accessible and can cause redundant screen reader announcements.
**Action:** When an icon-only button is created or encountered, wrap it in the custom, accessible `Tooltip` component to provide a consistent and accessible tooltip for both hover and focus states.

## 2026-06-17 - Missing accessible explicit toggle states on Bookmark buttons
**Learning:** Custom UI buttons that function as toggles (like the Bookmark/Save icon buttons) often lack the explicit `aria-pressed` attribute, causing screen reader users to miss their active state entirely.
**Action:** Always add the `aria-pressed` attribute when custom UI buttons act as presets or toggle controls so that their state is natively exposed to accessibility trees.

## 2026-06-30 - Accessible selected state on month picker options
**Learning:** Calendar and month picker controls often iterate mutually exclusive options (like months) as buttons. Without explicit radio semantics, screen reader users cannot quickly determine which option is currently selected or how the options relate to each other.
**Action:** For mutually exclusive month/day choices, prefer `role="radiogroup"` with an accessible label, `role="radio"` plus `aria-checked` on each option, and full radio keyboard support with roving `tabIndex` and arrow-key navigation.
