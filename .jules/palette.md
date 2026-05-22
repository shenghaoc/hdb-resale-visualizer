## 2026-05-22 - Expose button active state to assistive technology
**Learning:** Buttons that only visually indicate their state using active classes do not relay their status to screen reader users, preventing them from understanding which options are currently selected.
**Action:** For independent on/off toggle buttons (click to select, click again to deselect), use `aria-pressed`. For mutually exclusive selections where one option must always be active, prefer `role="radiogroup"` with `role="radio"` and `aria-checked` on each button.
