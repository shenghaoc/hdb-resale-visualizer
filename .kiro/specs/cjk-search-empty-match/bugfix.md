# Bugfix Requirements Document

## Introduction

When a user types CJK characters (e.g., "你好"), emoji, or symbol-only input that is not recognized by the multilingual search alias map, the `normalizeSearchText` function strips all non-Latin characters via `/[^a-z0-9+]+/g`, producing an empty string. `tokenizeSearchText` returns zero tokens for this empty string, and `searchMatchesBlock` treats zero tokens as "match everything" — so unrecognized input matches ALL blocks instead of matching nothing. The root cause is that `searchMatchesBlock` conflates "user typed nothing" (empty search field) with "user typed something that normalized to nothing" (unrecognized CJK/emoji/symbols). Both produce zero tokens, but only the first should match all blocks.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user types unrecognized CJK characters (e.g., "你好") in the search field THEN the system matches ALL blocks because the input normalizes to an empty string, produces zero tokens, and `searchMatchesBlock` returns `true` for every block

1.2 WHEN a user types emoji-only input (e.g., "🏠🏢") in the search field THEN the system matches ALL blocks because the input normalizes to an empty string, produces zero tokens, and `searchMatchesBlock` returns `true` for every block

1.3 WHEN a user types symbol-only input (e.g., "###") in the search field THEN the system matches ALL blocks because the input normalizes to an empty string, produces zero tokens, and `searchMatchesBlock` returns `true` for every block

### Expected Behavior (Correct)

2.1 WHEN a user types unrecognized CJK characters (e.g., "你好") in the search field THEN the system SHALL match NO blocks, because the raw query is non-empty but produces zero tokens, indicating the user typed with intent to filter but no searchable content was recognized

2.2 WHEN a user types emoji-only input (e.g., "🏠🏢") in the search field THEN the system SHALL match NO blocks, because the raw query is non-empty but produces zero tokens

2.3 WHEN a user types symbol-only input (e.g., "###") in the search field THEN the system SHALL match NO blocks, because the raw query is non-empty but produces zero tokens

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the search field is empty (raw query is "" or whitespace-only) THEN the system SHALL CONTINUE TO match ALL blocks, showing the full unfiltered dataset

3.2 WHEN a user types known CJK aliases (e.g., "大巴窑", "碧山", "宏茂桥") THEN the system SHALL CONTINUE TO resolve them to their English equivalents and filter blocks correctly

3.3 WHEN a user types English text searches (e.g., "bedok", "ang mo kio", "block 123") THEN the system SHALL CONTINUE TO produce identical search results as before the fix

3.4 WHEN a user types numeric or postal code searches (e.g., "560123", "123+") THEN the system SHALL CONTINUE TO produce identical search results as before the fix

3.5 WHEN a user types mixed recognized CJK and English input (e.g., "碧山 block 123") THEN the system SHALL CONTINUE TO resolve the CJK alias and match blocks using the combined tokens

3.6 WHEN a user types geographic intent queries (e.g., "near ang mo kio mrt", "1.3692, 103.8492") THEN the system SHALL CONTINUE TO resolve geographic search intent correctly

---

## Bug Condition

**Bug Condition Function** — Identifies inputs that trigger the bug:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type { rawQuery: string }
  OUTPUT: boolean

  tokens ← tokenizeSearchText(X.rawQuery)

  // The bug triggers when the user typed something (non-empty raw query)
  // but normalization stripped everything, leaving zero tokens.
  RETURN X.rawQuery.trim().length > 0
         AND tokens.length = 0
END FUNCTION
```

**Examples of buggy inputs**: `"你好"`, `"🏠🏢"`, `"###"`, `"你好世界"`, `"★★★"`

**Examples of non-buggy inputs**: `""`, `"  "`, `"bedok"`, `"大巴窑"`, `"560123"`, `"碧山 block 123"`

---

## Fix Checking Property

**Goal**: For all inputs where the bug condition holds, the fixed function returns `false` (match nothing).

```pascal
// Property: Fix Checking — Non-empty query with zero tokens matches nothing
FOR ALL X WHERE isBugCondition(X) DO
  FOR ALL block IN blocks DO
    result ← searchMatchesBlock'(block, X.rawQuery)
    ASSERT result = false
  END FOR
END FOR
```

This ensures that when a user types something that normalizes to nothing (unrecognized CJK, emoji, symbols), no blocks are matched.

---

## Preservation Checking Property

**Goal**: For all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

```pascal
// Property: Preservation Checking — Non-buggy inputs behave identically
FOR ALL X WHERE NOT isBugCondition(X) DO
  FOR ALL block IN blocks DO
    ASSERT searchMatchesBlock(block, X.rawQuery) = searchMatchesBlock'(block, X.rawQuery)
  END FOR
END FOR
```

This ensures that empty search fields, English searches, numeric searches, known CJK aliases, and all other non-buggy inputs produce identical results before and after the fix.
