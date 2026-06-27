#!/usr/bin/env bash
set -euo pipefail

# Performance baseline capture script.
# Outputs a JSON summary for before/after comparison.
# Usage: ./scripts/perf-baseline.sh > baseline-$(date +%Y%m%d).json

OUTPUT_FILE="${1:-/dev/stdout}"

echo "Capturing performance baseline..." >&2

# Portable millisecond timestamp (date +%s%N's nanoseconds are GNU-only and
# break on BSD/macOS date). Node is already a project dependency.
get_time_ms() {
  node -e 'console.log(Temporal.Now.instant().epochMilliseconds)'
}

# Build timing
BUILD_START=$(get_time_ms)
pnpm run build >/dev/null 2>&1
BUILD_END=$(get_time_ms)
BUILD_MS=$(( (BUILD_END - BUILD_START) ))

echo "  Build: ${BUILD_MS}ms" >&2

# Bundle check (extract preload metrics from output)
BUNDLE_OUTPUT=$(pnpm run check:bundle 2>&1)
PRELOAD_COUNT=$(echo "$BUNDLE_OUTPUT" | grep -oE '[0-9]+ modulepreloads' | grep -oE '^[0-9]+' || echo "0")
PRELOAD_GZIP=$(echo "$BUNDLE_OUTPUT" | grep -oE '[0-9]+ B gzip total' | grep -oE '^[0-9]+' || echo "0")

echo "  Bundle: ${PRELOAD_COUNT} preloads, ${PRELOAD_GZIP}B gzip" >&2

# Test timing
TEST_START=$(get_time_ms)
TEST_OUTPUT=$(pnpm run test 2>&1)
TEST_END=$(get_time_ms)
TEST_MS=$(( (TEST_END - TEST_START) ))
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -oE '[0-9]+ passed' | tail -1 | grep -oE '^[0-9]+' || echo "0")
TEST_FILES=$(echo "$TEST_OUTPUT" | grep -oE 'Test Files[[:space:]]+[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")

echo "  Tests: ${TEST_COUNT} passed in ${TEST_MS}ms (${TEST_FILES} files)" >&2

# Typecheck timing
TC_START=$(get_time_ms)
pnpm run typecheck >/dev/null 2>&1
TC_END=$(get_time_ms)
TC_MS=$(( (TC_END - TC_START) ))

echo "  Typecheck: ${TC_MS}ms" >&2

# Lint timing
LINT_START=$(get_time_ms)
pnpm run lint >/dev/null 2>&1
LINT_END=$(get_time_ms)
LINT_MS=$(( (LINT_END - LINT_START) ))

echo "  Lint: ${LINT_MS}ms" >&2

# Output JSON
cat <<EOF > "$OUTPUT_FILE"
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "build": {
    "durationMs": $BUILD_MS
  },
  "bundle": {
    "preloadCount": $PRELOAD_COUNT,
    "preloadGzipBytes": $PRELOAD_GZIP
  },
  "tests": {
    "fileCount": $TEST_FILES,
    "testCount": $TEST_COUNT,
    "durationMs": $TEST_MS
  },
  "typecheck": {
    "durationMs": $TC_MS
  },
  "lint": {
    "durationMs": $LINT_MS
  }
}
EOF

echo "Done. Output written to ${OUTPUT_FILE}" >&2
