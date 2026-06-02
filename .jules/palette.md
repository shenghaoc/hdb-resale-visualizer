## 2026-05-22 - Expose button active state to assistive technology
**Learning:** Buttons that only visually indicate their state using active classes do not relay their status to screen reader users, preventing them from understanding which options are currently selected.
**Action:** For independent on/off toggle buttons (click to select, click again to deselect), use `aria-pressed`. For mutually exclusive selections where one option must always be active, prefer `role="radiogroup"` with `role="radio"` and `aria-checked` on each button.

## 2026-06-02 - Custom UI elements lack focus indicators
**Learning:** When building highly custom selectable UI buttons or complex wizards (like the search profile wizard preset options), default Tailwind styling often omits or disables explicit focus outlines. Without manual inclusion of focus ring utilities, keyboard-only or screen-reader users have no visual indication of their current navigation position on interactive elements.
**Action:** Always explicitly define focus states using utilities like `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50` on custom buttons, especially inside iterators or option groups, to guarantee baseline accessibility.

## 2026-06-02 - Focus ring contrast on primary-filled chips
**Learning:** Preset chips that use `bg-primary` when selected can hide a `ring-primary/50` focus ring because the ring shares the same hue as the background. Popover listbox options are easy to miss when adding focus styles to a wizard's main controls.
**Action:** Add `focus-visible:ring-offset-2 focus-visible:ring-offset-background` to selectable chips that can render with a primary background. Apply the same base focus ring utilities to every keyboard-reachable button in nested pickers (e.g. MRT station listbox options), not just the trigger.
