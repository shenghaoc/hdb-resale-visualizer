## 2025-05-22 - Add aria-pressed to custom UI toggle buttons
**Learning:** Toggle buttons that only visually indicate their state using active classes do not relay their status to screen reader users, preventing them from understanding which options are currently selected.
**Action:** Always add the `aria-pressed` attribute to buttons that function as toggles or presets to ensure their active state is programmatically exposed.
