# CJK Search Empty Match — Bugfix Design

## Overview

When a user types Chinese characters that are not in the known search alias map (e.g., "你好"), the search pipeline strips all CJK characters during normalization, producing an empty string. The tokenizer returns zero tokens for an empty string, and `searchMatchesBlock` treats zero tokens as "match everything" — returning `true` for every block in the dataset. This means any unrecognized CJK input (as well as emoji-only or symbol-only input) silently matches every block instead of matching nothing.

The fix targets two functions in `src/lib/filtering.ts`: `normalizeSearchText` and `searchMatchesBlock`. The core semantic issue is that the system conflates "user typed nothing" (empty search field → show all blocks) with "user typed something that normalized to nothing" (unrecognized input → should show no blocks). The fix introduces a distinction between these two cases by checking the raw query string before falling back to the "match all" behavior.

## Glossary

- **Bug_Condition (C)**: The user's search query is non-empty but normalizes to an empty string after CJK alias resolution, lowercasing, and regex stripping — producing zero search tokens that cause universal matching.
- **Property (P)**: When a non-empty query normalizes to zero tokens, `searchMatchesBlock` should return `false` (match nothing), not `true` (match everything).
- **Preservation**: All existing search behaviors must remain unchanged — empty search field matches all blocks, known CJK aliases resolve correctly, English/numeric searches work identically, and geographic intent resolution is unaffected.
- **`normalizeSearchText`**: Function in `src/lib/filtering.ts` that lowercases input, resolves multilingual aliases, strips non-alphanumeric characters via `/[^a-z0-9+]+/g`, and trims whitespace.
- **`tokenizeSearchText`**: Function in `src/lib/filtering.ts` that normalizes a search string and splits it into `SearchToken[]`. Returns `[]` for empty normalized strings.
- **`searchMatchesBlock`**: Function in `src/lib/filtering.ts` that checks whether a block matches a search query. Currently returns `true` when `searchTokens.length === 0`.
- **`resolveMultilingualSearchAliases`**: Function in `src/lib/i18n/domain.ts` that replaces known CJK characters (e.g., "大巴窑" → "toa payoh") with their English equivalents. Unknown CJK characters pass through unchanged.
- **`matchesFilter`**: The top-level filter function that calls `searchMatchesBlock` as part of its filter chain.

## Bug Details

### Bug Condition

The bug manifests when a user types characters in the search field that are not recognized by the multilingual alias map and are outside the `[a-z0-9+]` character class. The normalization pipeline strips these characters entirely, producing an empty string that the tokenizer converts to zero tokens. The `searchMatchesBlock` function then treats zero tokens as a universal match.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { rawQuery: string }
  OUTPUT: boolean

  normalized ← normalizeSearchText(input.rawQuery)
  tokens ← tokenizeSearchText(input.rawQuery)

  RETURN input.rawQuery.trim().length > 0
         AND tokens.length = 0
END FUNCTION
```

**The pipeline for a buggy input ("你好"):**
1. `resolveMultilingualSearchAliases("你好")` → `"你好"` (no alias match, unchanged)
2. `.toLowerCase()` → `"你好"`
3. `.replace(/[^a-z0-9+]+/g, " ")` → `" "` (CJK chars stripped)
4. `.trim()` → `""` (empty string)
5. `tokenizeSearchText("")` → `[]` (empty tokens)
6. `searchMatchesBlock(block, "你好")` → `true` for ALL blocks (empty tokens = match all)

### Examples

- **Unrecognized Chinese**: User types "你好" (hello). No alias exists. Normalized to `""`. Tokens: `[]`. Result: matches ALL blocks. Expected: matches NO blocks.
- **Emoji input**: User types "🏠🏢". No alias exists. Normalized to `""`. Tokens: `[]`. Result: matches ALL blocks. Expected: matches NO blocks.
- **Symbol-only input**: User types "###". Normalized to `""`. Tokens: `[]`. Result: matches ALL blocks. Expected: matches NO blocks.
- **Known Chinese alias**: User types "大巴窑". Alias resolves to `" toa payoh "`. Normalized to `"toa payoh"`. Tokens: `["toa", "payoh"]`. Result: matches Toa Payoh blocks correctly. This case is NOT affected by the bug.
- **Mixed unrecognized CJK + English**: User types "你好 bedok". CJK stripped, "bedok" remains. Tokens: `["bedok"]`. Result: matches Bedok blocks. This case is NOT affected by the bug (tokens are non-empty).
- **Empty search field**: User has typed nothing. Raw query is `""`. Tokens: `[]`. Result: matches ALL blocks. This is CORRECT behavior and must be preserved.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- An empty search field (raw query is `""` or whitespace-only) must continue to match all blocks, showing the full unfiltered dataset.
- Known CJK aliases (大巴窑 → Toa Payoh, 碧山 → Bishan, 宏茂桥 → Ang Mo Kio, etc.) must continue to resolve and filter correctly.
- All English and numeric search queries must continue to produce identical results.
- Geographic intent resolution (`resolveGeographicSearchIntent`) must continue to work for coordinate searches, "near me" queries, and MRT station searches (including Chinese MRT aliases like "宏茂桥地铁").
- The tokenization cache, block token cache, and all other caching mechanisms must continue to function correctly.
- Typo tolerance (`isNearMatch`), street abbreviation normalization, and search alias replacements must remain unchanged.
- The `matchesFilter` function's short-circuit evaluation order must remain unchanged — search is the last (most expensive) check.

**Scope:**
All inputs where the raw query is empty OR the normalized query produces at least one token should be completely unaffected by this fix. This includes:
- Empty search field (no input)
- English text searches ("bedok", "ang mo kio", "block 123")
- Numeric searches ("560123", "123+")
- Known CJK alias searches ("大巴窑", "碧山")
- Mixed known-CJK + English searches ("碧山 block 123")
- Geographic intent queries ("near ang mo kio mrt", "1.3692, 103.8492")

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is a semantic conflation in `searchMatchesBlock`:

1. **`searchMatchesBlock` conflates two distinct empty-token scenarios**: The function checks `if (searchTokens.length === 0) return true`. This is correct when the user hasn't typed anything (empty search field = show all blocks). But it's incorrect when the user typed something that was fully stripped during normalization (unrecognized CJK, emoji, symbols). The function has no way to distinguish these two cases because it only sees the tokenized result, not the raw query.

2. **`normalizeSearchText` is lossy for non-Latin scripts**: The regex `/[^a-z0-9+]+/g` strips everything outside `[a-z0-9+]`. This is by design — the search is English-centric with explicit CJK alias support. But when the alias map doesn't cover a CJK input, the entire input is silently discarded with no signal that meaningful content was lost.

3. **`tokenizeSearchText` returns `[]` for empty normalized strings**: This is correct behavior for the tokenizer — an empty string has no tokens. The problem is upstream (the conflation in `searchMatchesBlock`).

4. **The fix point is in `searchMatchesBlock`**: The function already receives the raw `query` parameter. It can check whether the raw query (after trimming) is non-empty before returning `true` for zero tokens. If the raw query is non-empty but tokens are empty, the user typed something that was fully stripped — return `false` (match nothing).

## Correctness Properties

Property 1: Bug Condition — Non-empty query with zero tokens matches nothing

_For any_ search query where the raw query string is non-empty (after trimming) but `tokenizeSearchText` produces zero tokens, the `searchMatchesBlock` function SHALL return `false` for all blocks, indicating no match.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Empty query continues to match everything

_For any_ search query where the raw query string is empty (or whitespace-only), the `searchMatchesBlock` function SHALL return `true` for all blocks, preserving the existing "show all blocks when search is empty" behavior.

**Validates: Requirements 3.1**

Property 3: Preservation — Known CJK aliases continue to resolve correctly

_For any_ search query containing known CJK aliases (characters present in the `searchAliases` map), the search pipeline SHALL resolve the alias to its English equivalent and produce correct token-based matching, identical to the pre-fix behavior.

**Validates: Requirements 3.2**

Property 4: Preservation — English and numeric searches unchanged

_For any_ search query containing only characters in `[a-zA-Z0-9+ ]`, the `searchMatchesBlock` function SHALL produce the same result as the original (unfixed) function for all blocks.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/filtering.ts`

**Function**: `searchMatchesBlock`

**Specific Changes**:

1. **Add raw query emptiness check before the zero-token early return**: The current code returns `true` when `searchTokens.length === 0`. The fix adds a check: if the raw query (trimmed) is non-empty but tokens are empty, return `false` instead of `true`. This distinguishes "user typed nothing" from "user typed something that normalized to nothing".

   **Current code:**
   ```typescript
   function searchMatchesBlock(block: BlockSummary, query: string): boolean {
     const searchTokens = tokenizeSearchText(query);
     if (searchTokens.length === 0) {
       return true;
     }
     // ... token matching logic
   }
   ```

   **Fixed code:**
   ```typescript
   function searchMatchesBlock(block: BlockSummary, query: string): boolean {
     const searchTokens = tokenizeSearchText(query);
     if (searchTokens.length === 0) {
       // Empty search field → match all blocks (show full dataset).
       // Non-empty query that normalized to zero tokens (e.g., unrecognized CJK,
       // emoji, symbols) → match nothing. The user typed with intent to filter.
       return query.trim().length === 0;
     }
     // ... token matching logic (unchanged)
   }
   ```

2. **No changes to `normalizeSearchText`**: The normalization function is working as designed. The regex correctly strips non-Latin characters. The fix is not about changing normalization but about correctly interpreting the result of normalization in the matching function.

3. **No changes to `tokenizeSearchText`**: The tokenizer correctly returns `[]` for empty strings. No change needed.

4. **No changes to `resolveMultilingualSearchAliases`**: The alias resolution is working correctly for known aliases. Unknown CJK characters passing through unchanged is expected behavior.

5. **No changes to `matchesFilter`**: The top-level filter function already passes `filters.search` to `searchMatchesBlock`. The fix is entirely within `searchMatchesBlock`.

**Impact assessment**: This is a single-line semantic change. The blast radius is minimal — only the zero-token branch of `searchMatchesBlock` is affected. All other code paths (token matching, caching, geographic intent) are untouched.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that unrecognized CJK input matches all blocks on the unfixed code.

**Test Plan**: Write unit tests that call `searchMatchesBlock` (via `matchesFilter`) with unrecognized CJK input and verify it returns `true` for all blocks. Run these tests on the UNFIXED code to observe the bug.

**Test Cases**:
1. **Unrecognized Chinese Test**: Call `matchesFilter(block, { search: "你好" })` — will return `true` for all blocks on unfixed code (demonstrates bug)
2. **Emoji Input Test**: Call `matchesFilter(block, { search: "🏠🏢" })` — will return `true` for all blocks on unfixed code (demonstrates bug)
3. **Symbol-Only Test**: Call `matchesFilter(block, { search: "###" })` — will return `true` for all blocks on unfixed code (demonstrates bug)
4. **Mixed Unrecognized CJK Test**: Call `matchesFilter(block, { search: "你好世界" })` — will return `true` for all blocks on unfixed code (demonstrates bug)

**Expected Counterexamples**:
- `searchMatchesBlock` returns `true` for every block when given unrecognized CJK input
- The root cause is confirmed: `tokenizeSearchText("你好")` returns `[]`, and `searchMatchesBlock` treats `[]` as "match all"

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function returns `false` (match nothing).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := searchMatchesBlock_fixed(anyBlock, input.rawQuery)
  ASSERT result = false
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT searchMatchesBlock_original(block, input) = searchMatchesBlock_fixed(block, input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random English/numeric search strings to verify identical behavior
- It catches edge cases like single-character searches, very long strings, and boundary inputs
- It provides strong guarantees that the fix doesn't regress any existing search behavior

**Test Plan**: Observe behavior on UNFIXED code first for English/numeric searches and known CJK aliases, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Empty Search Preservation**: Verify `matchesFilter(block, { search: "" })` returns `true` for all blocks (unchanged)
2. **English Search Preservation**: Verify English searches produce identical results before and after fix
3. **Known CJK Alias Preservation**: Verify "大巴窑", "碧山", "宏茂桥" continue to match correct blocks
4. **Numeric Search Preservation**: Verify postal code and block number searches work identically
5. **Geographic Intent Preservation**: Verify "near ang mo kio mrt" and coordinate searches are unaffected

### Unit Tests

- Test `searchMatchesBlock` with unrecognized CJK input returns `false` (fix verification)
- Test `searchMatchesBlock` with empty string returns `true` (preservation)
- Test `searchMatchesBlock` with whitespace-only string returns `true` (preservation)
- Test `searchMatchesBlock` with emoji-only input returns `false` (fix verification)
- Test `searchMatchesBlock` with symbol-only input returns `false` (fix verification)
- Test `searchMatchesBlock` with known CJK alias returns correct match (preservation)
- Test `searchMatchesBlock` with mixed unrecognized CJK + English returns correct match (edge case)
- Test `matchesFilter` integration with the full filter pipeline for all above cases

### Property-Based Tests

- Generate random strings from `[a-zA-Z0-9+ ]` character set and verify `searchMatchesBlock` produces identical results on original and fixed code (preservation)
- Generate random strings from CJK Unicode ranges not in the alias map and verify `searchMatchesBlock` returns `false` for all blocks (fix checking)
- Generate random strings mixing known CJK aliases with English text and verify correct matching (preservation)

### Integration Tests

- Test full `matchesFilter` pipeline with unrecognized CJK input across multiple blocks
- Test that the tokenization cache correctly handles the new behavior (cache key includes raw query)
- Test that `resolveGeographicSearchIntent` is unaffected by the fix (it has its own empty-check logic)
