#!/usr/bin/env bash
set -euo pipefail

# LLVM code coverage helper for search-service
# Default: generates HTML + lcov. Set CONSOLE=1 for summary-only console output.
#
# Modes:
#  1) Using cargo-llvm-cov (preferred, simpler, richer output)
#  2) Fallback manual instrumentation if cargo-llvm-cov not installed
#
# Usage:
#   bash scripts/coverage.sh            # auto-detect
#   COVERAGE_MODE=manual bash scripts/coverage.sh
#   OPEN=1 bash scripts/coverage.sh     # open HTML report (cargo-llvm-cov mode)

CRATE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CRATE_ROOT"

MODE=${COVERAGE_MODE:-auto}

# Positional arg convenience: scripts/coverage.sh console|summary
case "${1:-}" in
  console|summary)
    CONSOLE=1
    ;;
  help|-h|--help)
    cat <<'USAGE'
Usage: scripts/coverage.sh [console]

Env vars:
  CONSOLE=1            Show summary only (no HTML / lcov)
  SHOW_MISSING=1       With CONSOLE=1, also list uncovered lines (llvm-cov)
  COVERAGE_MODE=manual Force manual instrumentation instead of cargo-llvm-cov

Examples:
  bash scripts/coverage.sh          # full (HTML + lcov)
  CONSOLE=1 bash scripts/coverage.sh
  bash scripts/coverage.sh console  # same as above
USAGE
    exit 0
    ;;
esac

if command -v cargo-llvm-cov >/dev/null 2>&1 && { [ "$MODE" = auto ] || [ "$MODE" = llvm-cov ]; }; then
  echo "[coverage] Using cargo-llvm-cov"
  rustup component add llvm-tools-preview >/dev/null 2>&1 || true
  cargo llvm-cov clean --workspace
  if [ "${CONSOLE:-0}" = 1 ]; then
    echo "[coverage] Console summary mode (set CONSOLE=0 for HTML+lcov)"
    cargo llvm-cov --workspace --summary-only ${SHOW_MISSING:+--show-missing-lines} | tee coverage-summary.txt
    echo "[coverage] Summary saved to coverage-summary.txt"
  else
    cargo llvm-cov --workspace --lcov --output-path lcov.info
    cargo llvm-cov --workspace --html --output-dir coverage
    echo "[coverage] lcov: $CRATE_ROOT/lcov.info"
    echo "[coverage] HTML: $CRATE_ROOT/coverage/index.html"
    if [ "${OPEN:-0}" = 1 ]; then
      xdg-open coverage/index.html 2>/dev/null || open coverage/index.html 2>/dev/null || true
    fi
  fi
  exit 0
fi

if [ "$MODE" = auto ]; then
  echo "[coverage] cargo-llvm-cov not found; falling back to manual instrumentation (set COVERAGE_MODE=llvm-cov after installing 'cargo install cargo-llvm-cov')."
fi

echo "[coverage] Manual instrumentation mode"
rustup component add llvm-tools-preview >/dev/null 2>&1 || true
LLVM_TOOLS_DIR="$(rustc --print target-libdir)/../.." # heuristic
mkdir -p coverage
export LLVM_PROFILE_FILE="coverage/%m-%p-%9m.profraw"
export RUSTFLAGS="-C instrument-coverage -C link-dead-code -C opt-level=0 -C debuginfo=2"
export RUSTDOCFLAGS="-C instrument-coverage -C link-dead-code -C opt-level=0 -C debuginfo=2"

echo "[coverage] Running tests with instrumentation"
cargo test --no-fail-fast >/dev/null

PROFRAW_COUNT=$(ls coverage/*.profraw 2>/dev/null | wc -l || true)
if [ "$PROFRAW_COUNT" = 0 ]; then
  echo "[coverage] No .profraw files generated; aborting" >&2
  exit 1
fi

LLVM_PROFDATA=$(command -v llvm-profdata || true)
LLVM_COV=$(command -v llvm-cov || true)
if [ -z "$LLVM_PROFDATA" ] || [ -z "$LLVM_COV" ]; then
  echo "[coverage] llvm-profdata / llvm-cov not on PATH; install via your package manager (e.g., 'sudo apt install llvm-17-tools')" >&2
  exit 1
fi

echo "[coverage] Merging raw profiles"
llvm-profdata merge -sparse coverage/*.profraw -o coverage/coverage.profdata

BIN_TARGETS=$(find target/debug -maxdepth 1 -type f -executable -printf '%f\n' | grep -E '^(search-service|.*tests.*)$' || true)

if [ "${CONSOLE:-0}" = 1 ]; then
  echo "[coverage] Console summary (manual mode)"
  llvm-cov report \
    --ignore-filename-regex='/.cargo/registry|rustc/.+' \
    --instr-profile=coverage/coverage.profdata \
    $(for b in $BIN_TARGETS; do echo "target/debug/$b"; done) | tee coverage-summary.txt
  echo "[coverage] Summary saved to coverage-summary.txt"
else
  echo "[coverage] Generating lcov.info"
  llvm-cov export \
    --format=lcov \
    --ignore-filename-regex='/.cargo/registry|rustc/.+' \
    --instr-profile=coverage/coverage.profdata \
    $(for b in $BIN_TARGETS; do echo "target/debug/$b"; done) > lcov.info

  echo "[coverage] Generating HTML report"
  mkdir -p coverage/html
  llvm-cov show \
    --format=html \
    --Xdemangler=rustfilt \
    --ignore-filename-regex='/.cargo/registry|rustc/.+' \
    --instr-profile=coverage/coverage.profdata \
    $(for b in $BIN_TARGETS; do echo "target/debug/$b"; done) \
    --output-dir=coverage/html >/dev/null

  echo "[coverage] Done"
  echo "[coverage] lcov: $CRATE_ROOT/lcov.info"
  echo "[coverage] HTML: $CRATE_ROOT/coverage/html/index.html"
fi
