🎯 **What:** Added tests for `safeStorage` in `src/lib/storage.ts` to cover the error paths when `localStorage` methods (`getItem`, `setItem`, `removeItem`) throw errors (e.g. in Private/Incognito modes where storage might be disabled or quota exceeded).

📊 **Coverage:**
- Happy path for `getItem`, `setItem`, and `removeItem`.
- Error path for `getItem` (returns `null`).
- Error path for `setItem` (gracefully catches and ignores the error).
- Error path for `removeItem` (gracefully catches and ignores the error).

✨ **Result:** Improved test coverage and confidence that `safeStorage` handles restricted environments correctly without crashing the application.
