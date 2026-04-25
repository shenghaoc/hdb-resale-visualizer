## 2024-04-25 - React.memo on List Item Components
**Learning:** Virtualized or long lists of complex components (like `BlockCard` in `ResultsPane`) will re-render all items when the parent container's state changes (like scrolling or sorting), which causes significant performance bottlenecks.
**Action:** Always wrap list item components in `React.memo` when rendering arrays of items to prevent unnecessary re-renders of items whose props haven't changed.
