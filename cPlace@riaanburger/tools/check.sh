#!/usr/bin/env bash
# The one entry point for checks. Subcommands:
#
#   check.sh build   the source typechecks, and the development and release
#                    bundles build, the release one with nothing of the
#                    development handle in it, its _() and ngettext() calls
#                    under their own names, and the translation template
#                    holding its phrases; fails hard
#   check.sh test    the contract tests, through node --test; fails hard
#   check.sh lint    the ESLint report over src/ and tests/; its warnings
#                    inform, its errors fail
#   check.sh docs    docs/contributing/: its links and paths resolve and the
#                    guide's examples compile and pass their tests, which
#                    fail hard; headings too deep are reported
#   check.sh all     build, test, lint and docs
#
# The readability limits are warnings, which report rather than gate, so
# they do not fail this script; an ESLint error does, as build and test
# failures do. The tests are tables over pure functions: no desktop, no
# Cinnamon, no windows.

set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-all}" in
    build)
        npx tsc --noEmit
        tools/build.sh
        tools/build.sh --release
        # The handle's name and its probe window's title are the two
        # strings nothing but the handle carries.
        if grep -n -e cPlaceDev -e cplace-probe \
            files/cPlace@riaanburger/extension.js; then
            echo "check build: the release bundle carries the development handle" >&2
            exit 1
        fi
        # The template's tools find the phrases by these two names, which
        # esbuild would change if another module took either.
        if grep -n -E '\b(_|ngettext)[0-9]+\(' files/cPlace@riaanburger/extension.js; then
            echo "check build: the bundle renamed _() or ngettext()" >&2
            exit 1
        fi
        tools/makepot.sh --check
        ;;
    test)
        npx tsc --noEmit
        # Compiled tests are generated output; a test file deleted from
        # tests/ must not keep running from a stale bundle here.
        rm -rf build/tests
        npx esbuild tests/*.test.ts \
            --bundle \
            --platform=node \
            --format=cjs \
            --target=es2022 \
            --outdir=build/tests \
            --out-extension:.js=.cjs \
            --log-level=warning
        node --test build/tests/*.test.cjs
        ;;
    lint)
        npx eslint src tests
        ;;
    docs)
        node tools/check-docs.mjs
        ;;
    all)
        "$0" build
        "$0" test
        "$0" lint
        "$0" docs
        ;;
    *)
        echo "usage: check.sh [build|test|lint|docs|all]" >&2
        exit 2
        ;;
esac
