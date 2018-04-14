#!/bin/bash

# Declare input variables
workspace_index=$1
extension_directory="$HOME/.local/share/cinnamon/extensions/desktop-icons-per-workspace@cardsurf"
workspace_directory="$extension_directory/workspaces"
workspace_file="$workspace_directory/$workspace_index.csv"
delimeter=","

# Set localized desktop directory if xdg-user-dir command is available
desktop_directory="$HOME/Desktop"
if hash xdg-user-dir 2>/dev/null; then
    desktop_directory=$(xdg-user-dir DESKTOP)
fi

# Automatically split array elements in for loops on newline only
IFS=$'\n'





# Run script
function run {
    # If CSV file exists
    if [ -f "$workspace_file" ]; then
        # Read desktop files configuration from CSV file
        workspace_lines=($(cat $workspace_file))

        # Set positions of desktop files
        for workspace_line in "${workspace_lines[@]}"; do
            path=$(echo $workspace_line | gawk '{split($0, substrings, ","); print substrings[1]}' ) # Get filepath
            x=$(echo $workspace_line | gawk '{split($0, substrings, ","); print substrings[2]}' ) # Get x position
            y=$(echo $workspace_line | gawk '{split($0, substrings, ","); print substrings[3]}' ) # Get y position
            gvfs-set-attribute '-t' 'string' "$path" 'metadata::nemo-icon-position' $x$delimeter$y # Set icon attributes
        done
    fi
}

run

