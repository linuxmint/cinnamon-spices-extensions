#!/bin/bash

# WARNING: The compiled JavaScript in /files is currently manually patched and
# ahead of the TypeScript source in /src. Running this build may overwrite
# critical manual fixes.

# REQUIREMENTS:
# - typescript installed
# Usage: ./build.sh [version_folder] [--no-pot] (e.g., ./build.sh 5_4 --no-pot)

# Getting bash script file location
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null && pwd )"

# Save current dir for convenience
path=${PWD}

cd "$DIR"

# Argument 1: Version folder (defaults to all in src except 'base')
# Argument 2: Use --no-pot to skip translation file generation
TARGETS=${1:-$(ls src | grep -v base)}
SKIP_POT=$2

for v in $TARGETS; do
    if [ -f "src/$v/webpack.config.js" ]; then
        echo "Building Cinnamon version: $v"
        npx webpack --config "src/$v/webpack.config.js" --context "src/$v"
    fi
done

if [ "$SKIP_POT" != "--no-pot" ]; then
    cd ..
    ./cinnamon-spices-makepot gTile@shuairan
fi

cd "$path"
