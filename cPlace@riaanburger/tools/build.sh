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
# The bundle is esbuild's ES module output with its closing export statement
# cut off, so that init, enable and disable stand as top-level function
# declarations and nothing else is exported or assigned. That is the one
# form both of Cinnamon's loaders read: up to 6.6, requireModule in
# misc/fileUtils.js finds no module.exports line and gathers the top-level
# declarations itself; from 6.8, the native importer exports the top-level
# var and function declarations, and module is undefined while the main
# file loads, so a module.exports line would throw before init was found.

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
    --format=esm \
    --target=firefox78 \
    --define:CPLACE_DEVELOPMENT="${DEVELOPMENT}" \
    --outfile="${OUT}/extension.js" \
    --log-level=warning
# The export statement is the file's last, from "export {" to the closing
# brace; the three names stay as top-level functions above it.
python3 - "${OUT}/extension.js" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path).read()
cut = re.sub(r"\nexport \{[^}]*\};\n?$", "\n", text)
if cut == text or re.search(r"^(export |import |module\.exports)", cut, re.M):
    sys.exit("build.sh: the bundle is not in the form both loaders read")
open(path, "w").write(cut)
PY
cp src/metadata.json "${OUT}/metadata.json"
cp src/settings-schema.json "${OUT}/settings-schema.json"
cp src/stylesheet.css "${OUT}/stylesheet.css"
cp src/icon.png "${OUT}/icon.png"
cp LICENSE "${OUT}/LICENSE"

echo "Built ${OUT}"
