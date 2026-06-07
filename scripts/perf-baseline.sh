#!/usr/bin/env bash
set -euo pipefail

# Performance baseline capture script.
# Outputs a JSON summary for before/after comparison.
# Usage: ./scripts/perf-baseline.sh > baseline-$(date +%Y%m%d).json

OUTPUT_FILE="${1:-/dev/stdout}"

echo "Capturing performance baseline..." >&2

# Build timing
BUILD_START=$(date +%s%N)
npm run build >/dev/null 2>&1
BUILD_END=$(date +%s%N)
BUILD_MS=$(( (BUILD_END - BUILD_START) / 1000000 ))

echo "  Build: ${BUILD_MS}ms" >&2

# Bundle check (extract preload metrics from output)
BUNDLE_OUTPUT=$(npm run check:bundle 2>&1)
PRELOAD_COUNT=$(echo "$BUNDLE_OUTPUT" | grep -oP '\d+ modulepreloads' | grep -oP '^\d+' || echo "0")
PRELOAD_GZIP=$(echo "$BUNDLE_OUTPUT" | grep -oP '\d+ B gzip total' | grep -oP '^\d+' || echo "0")

echo "  Bundle: ${PRELOAD_COUNT} preloads, ${PRELOAD_GZIP}B gzip" >&2

# Test timing
TEST_START=$(date +%s%N)
TEST_OUTPUT=$(npm run test -- --run 2>&1)
TEST_END=$(date +%s%N)
TEST_MS=$(( (TEST_END - TEST_START) / 1000000 ))
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+ passed' | tail -1 | grep -oP '^\d+' || echo "0")
TEST_FILES=$(echo "$TEST_OUTPUT" | grep -oP 'Test Files\s+\d+ passed' | grep -oP '\d+' || echo "0")

echo "  Tests: ${TEST_COUNT} passed in ${TEST_MS}ms (${TEST_FILES} files)" >&2

# Typecheck timing
TC_START=$(date +%s%N)
npm run typecheck >/dev/null 2>&1
TC_END=$(date +%s%N)
TC_MS=$(( (TC_END - TC_START) / 1000000 ))

echo "  Typecheck: ${TC_MS}ms" >&2

# Lint timing
LINT_START=$(date +%s%N)
npm run lint >/dev/null 2>&1
LINT_END=$(date +%s%N)
LINT_MS=$(( (LINT_END - LINT_START) / 1000000 ))

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
