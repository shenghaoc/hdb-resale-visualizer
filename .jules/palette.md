## 2025-04-22 - Visual Feedback on Copy
**Learning:** Adding inline visual feedback (like a changing icon on copy actions) removes ambiguity for users without needing heavy toast notification systems.
**Action:** Always provide immediate, localized visual state changes for clipboard actions to confirm success implicitly.
## 2025-05-01 - Title Tooltips on Icon-Only Buttons
**Learning:** While `aria-label` ensures screen reader accessibility, icon-only buttons remain ambiguous for sighted mouse users. Adding a native `title` attribute that matches the `aria-label` provides a lightweight, zero-dependency tooltip.
**Action:** Always verify that icon-only interactive elements possess both an `aria-label` and a `title` attribute.
