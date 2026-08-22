#!/usr/bin/env bash
#
# Installs Tiler the way the Spices store does: the extension's files go to
# ~/.local/share/cinnamon/extensions, and its translations are compiled into
# ~/.local/share/locale. Since those are the same places the store uses,
# installing from System Settings later simply takes this copy over.
#
#   ./install.sh              install or update Tiler
#   ./install.sh --uninstall  remove it again

set -euo pipefail

: "${HOME:?is not set}"

UUID="tiler@zquestz"

# The Spices store installs to these literal paths (Spices.py) rather than
# reading XDG_DATA_HOME, and the settings UI lists extensions from the same
# place, so this matches the store exactly.
EXTENSIONS="$HOME/.local/share/cinnamon/extensions"
LOCALES="$HOME/.local/share/locale"

# Settings are different: Cinnamon reads them through XDG_CONFIG_HOME.
SETTINGS="${XDG_CONFIG_HOME:-$HOME/.config}/cinnamon/spices/$UUID"

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$HERE/files/$UUID"

# Compiles each translation the extension ships. Missing gettext is not worth
# failing over: without the catalogues Tiler simply speaks English.
install_translations() {
  if ! command -v msgfmt >/dev/null; then
    echo "msgfmt not found; skipping translations (install gettext for them)."
    return
  fi

  local count=0
  local po lang

  for po in "$SOURCE"/po/*.po; do
    [ -e "$po" ] || continue
    lang="$(basename "$po" .po)"
    mkdir -p "$LOCALES/$lang/LC_MESSAGES"
    msgfmt -c "$po" -o "$LOCALES/$lang/LC_MESSAGES/$UUID.mo"
    count=$((count + 1))
  done

  echo "Compiled $count translations."
}

install_tiler() {
  if [ ! -f "$SOURCE/metadata.json" ]; then
    echo "Cannot find $SOURCE/metadata.json" >&2
    echo "install.sh must sit inside its tiler@zquestz directory, next to files/." >&2
    echo "Run it from a full checkout of the repository." >&2
    exit 1
  fi

  mkdir -p "$EXTENSIONS"
  # ':?' refuses to expand if empty - this rm can never see a bare "/".
  rm -rf "${EXTENSIONS:?}/$UUID"
  cp -r "$SOURCE" "$EXTENSIONS/$UUID"
  echo "Installed to $EXTENSIONS/$UUID"

  install_translations

  echo
  echo "Enable Tiler in System Settings > Extensions."
}

uninstall_tiler() {
  rm -rf "${EXTENSIONS:?}/$UUID"

  # Every language it was ever installed with, not merely the ones this copy
  # happens to ship today.
  local mo
  for mo in "$LOCALES"/*/LC_MESSAGES/"$UUID.mo"; do
    [ -e "$mo" ] || continue
    rm -f "$mo"
  done

  echo "Tiler removed."

  if [ -d "$SETTINGS" ]; then
    echo
    echo "Your settings are still at $SETTINGS,"
    echo "so reinstalling keeps your grids and spacing. Delete that"
    echo "directory to start over instead."
  fi
}

usage() {
  echo "Usage: $(basename "$0") [--uninstall]" >&2
  exit 2
}

[ "$#" -le 1 ] || usage

case "${1-}" in
  "")
    install_tiler
    ;;
  --uninstall | -u)
    uninstall_tiler
    ;;
  *)
    usage
    ;;
esac
