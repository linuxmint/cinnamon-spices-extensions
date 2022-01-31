#!/bin/bash
./build.sh
cp -rf files/extra-panel-settings@gr3q/* ~/.local/share/cinnamon/extensions/extra-panel-settings@gr3q/
export DISPLAY=:0; cinnamon --replace &