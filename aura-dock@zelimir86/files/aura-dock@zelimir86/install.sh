#!/usr/bin/env bash
#
# Install Aura Dock into the current user's Cinnamon profile and enable it.
#
set -euo pipefail

UUID="aura-dock@zelimir86"
NAME="Aura Dock"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${HOME}/.local/share/cinnamon/extensions/${UUID}"

FILES=(
    metadata.json
    settings-schema.json
    stylesheet.css
    extension.js
    dock.js
    appIcon.js
    menu.js
)

RELOAD=0

usage() {
    cat <<EOF
Usage: ./install.sh [--reload]

  (no option)  install the extension and enable it
  --reload     also reload it, for when it is already running

Everything is installed under ~/.local, no root is required.
EOF
}

for arg in "$@"; do
    case "${arg}" in
        --reload) RELOAD=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: ${arg}" >&2; usage; exit 1 ;;
    esac
done

if ! command -v gsettings >/dev/null 2>&1; then
    echo "error: gsettings was not found, is this a Cinnamon desktop?" >&2
    exit 1
fi

if ! python3 -c "from gi.repository import Gio" >/dev/null 2>&1; then
    echo "error: python3-gi is required (sudo apt install python3-gi)" >&2
    exit 1
fi

set_extension_state() {
    python3 - "$UUID" "$1" <<'PY'
import sys
from gi.repository import Gio

uuid, action = sys.argv[1], sys.argv[2]
settings = Gio.Settings.new("org.cinnamon")
enabled = list(settings.get_strv("enabled-extensions"))

if action == "enable":
    if uuid not in enabled:
        enabled.append(uuid)
        settings.set_strv("enabled-extensions", enabled)
        print(f"{uuid}: enabled")
    else:
        print(f"{uuid}: already enabled")
else:
    if uuid in enabled:
        enabled.remove(uuid)
        settings.set_strv("enabled-extensions", enabled)
        print(f"{uuid}: disabled")
    else:
        print(f"{uuid}: already disabled")
PY
}

echo "Installing ${NAME} to ${DEST_DIR}"
mkdir -p "${DEST_DIR}"
install -m 644 "${FILES[@]/#/${SRC_DIR}/}" "${DEST_DIR}/"

if [ "${RELOAD}" -eq 1 ]; then
    set_extension_state disable
    sleep 0.5
fi

set_extension_state enable

if [ "${RELOAD}" -eq 0 ]; then
    cat <<EOF

${NAME} is installed and enabled. The dock appears on the primary monitor.
Right click the dock for its settings menu.
If it does not show up, reload Cinnamon (Alt+F2, "r", Enter on X11) or log out
and back in.
EOF
fi
