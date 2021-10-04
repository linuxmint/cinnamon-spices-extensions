#!/bin/bash
./build.sh
cp -rf files/gTile@shuairan/* ~/.local/share/cinnamon/extensions/gTile@shuairan/
export DISPLAY=:0; cinnamon --replace &