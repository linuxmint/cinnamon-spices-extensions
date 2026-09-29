#!/usr/bin/env bash
# Write the translation template, files/cPlace@riaanburger/po/cPlace@riaanburger.pot,
# from the release build, with Cinnamon's own cinnamon-xlet-makepot, which the
# Spices' makepot runs too. It reads the bundle for _() and ngettext(), and
# the metadata and settings schema for their labels, so the release is built
# first.
#
#   makepot.sh           build the release and write the template
#   makepot.sh --check   build the release and fail if the template's
#                        phrases differ from the bundle's, writing nothing
#
# The tool reads every .js file in the folder it is given, and a development
# tree holds node_modules/, so it is given a copy of the release alone.

set -euo pipefail
cd "$(dirname "$0")/.."

UUID="cPlace@riaanburger"
POT="files/${UUID}/po/${UUID}.pot"

tools/build.sh --release >/dev/null
stage="$(mktemp -d)"
trap 'rm -rf "${stage}"' EXIT
mkdir -p "${stage}/${UUID}/files"
cp -r "files/${UUID}" "${stage}/${UUID}/files/"
rm -rf "${stage}/${UUID}/files/${UUID}/po"
(cd "${stage}/${UUID}" && cinnamon-xlet-makepot -o "${stage}/${UUID}.pot" . >/dev/null)

# The phrases alone, without where each was found or when the template was
# written, sorted, so two templates compare by what translators see.
phrases() {
    msgattrib --no-location --no-wrap --sort-output "$1" |
        grep -v -e '^"POT-Creation-Date:' -e '^#'
}

case "${1:-}" in
    "")
        mkdir -p "$(dirname "${POT}")"
        cp "${stage}/${UUID}.pot" "${POT}"
        echo "Wrote ${POT}"
        ;;
    --check)
        if [[ ! -f "${POT}" ]] || ! diff <(phrases "${POT}") <(phrases "${stage}/${UUID}.pot"); then
            echo "makepot: ${POT} is out of date; run tools/makepot.sh" >&2
            exit 1
        fi
        ;;
    *)
        echo "usage: makepot.sh [--check]" >&2
        exit 2
        ;;
esac
