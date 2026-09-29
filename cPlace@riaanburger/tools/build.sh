#!/usr/bin/env bash
# Build the extension: bundle src/extension.ts and lay the installable tree.
#
#   build.sh            the development build, in build/cPlace@riaanburger/,
#                       which is what an extensions symlink points at while
#                       working on cPlace; it registers the development
#                       handle, global.cPlaceDev
#   build.sh --release  the release build, in files/cPlace@riaanburger/, the
#                       folder the Spices install from, which leaves the
#                       development handle out altogether; the translations
#                       in its po/ folder are kept
#
# The target is SpiderMonkey 78's, the engine under the cjs of Cinnamon 5.4,
# the oldest Cinnamon cPlace runs on; esbuild lowers any syntax newer than
# that, and tsconfig.json's library keeps out newer methods, which esbuild
# can't lower.
#
# CommonJS output on purpose: Cinnamon's requireModule (misc/fileUtils.js)
# wraps the file in a function and, when the file assigns module.exports
# itself, uses that as the module. esbuild's cjs output does exactly that,
# so init, enable and disable are real exports rather than declarations
# scraped by the loader's line-anchored regex fallback.

set -euo pipefail
cd "$(dirname "$0")/.."

UUID="cPlace@riaanburger"

case "${1:-}" in
    "")
        OUT="build/${UUID}"
        DEVELOPMENT=true
        ;;
    --release)
        OUT="files/${UUID}"
        DEVELOPMENT=false
        # Everything but the translations is built afresh, so a file
        # dropped from the build leaves the release too.
        if [[ -d "${OUT}" ]]; then
            find "${OUT}" -mindepth 1 -maxdepth 1 ! -name po -exec rm -rf {} +
        fi
        ;;
    *)
        echo "usage: build.sh [--release]" >&2
        exit 2
        ;;
esac

mkdir -p "${OUT}"
npx esbuild src/extension.ts \
    --bundle \
    --format=cjs \
    --target=firefox78 \
    --define:CPLACE_DEVELOPMENT="${DEVELOPMENT}" \
    --outfile="${OUT}/extension.js" \
    --log-level=warning
cp src/metadata.json "${OUT}/metadata.json"
cp src/settings-schema.json "${OUT}/settings-schema.json"
cp src/stylesheet.css "${OUT}/stylesheet.css"
cp src/icon.png "${OUT}/icon.png"
cp LICENSE "${OUT}/LICENSE"

echo "Built ${OUT}"
