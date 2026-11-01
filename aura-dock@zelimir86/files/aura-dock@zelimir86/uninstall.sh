#!/usr/bin/env bash
#
# Disable Aura Dock and remove it from the current user's profile.
#
set -euo pipefail

UUID="aura-dock@zelimir86"
DEST_DIR="${HOME}/.local/share/cinnamon/extensions/${UUID}"

python3 - "$UUID" <<'PY'
import sys
from gi.repository import Gio

uuid = sys.argv[1]
settings = Gio.Settings.new("org.cinnamon")
enabled = list(settings.get_strv("enabled-extensions"))

if uuid in enabled:
    enabled.remove(uuid)
    settings.set_strv("enabled-extensions", enabled)
    print(f"{uuid}: disabled")
PY

if [ -d "${DEST_DIR}" ]; then
    rm -rf "${DEST_DIR}"
    echo "removed ${DEST_DIR}"
fi

# The extension keeps its settings in a separate JSON file; leave it in place
# so a later reinstall keeps the user's configuration.
echo "done. settings in ~/.config/cinnamon/spices/${UUID} were kept."
