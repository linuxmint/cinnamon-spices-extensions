#!/bin/sh
WIDTH=$1
HEIGHT=$2
LOGFILE=$HOME/.xsession-errors
ICON=/usr/share/icons/gnome/48x48/emotes/face-glasses.png
TITLE="${HOME}/.xsession-errors"
tail --lines=+1 -f $LOGFILE | zenity --title "${TITLE}" --text-info --width ${WIDTH} --height ${HEIGHT} --window-icon="${ICON}"
exit 0
