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

# Use gio tool if it is available
is_gio=false
if hash gio 2>/dev/null; then
    is_gio=true
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

            # If file exists
            if [ -e "$path" ]; then
                x=$(echo $workspace_line | gawk '{split($0, substrings, ","); print substrings[2]}' ) # Get x position
                y=$(echo $workspace_line | gawk '{split($0, substrings, ","); print substrings[3]}' ) # Get y position
                if [ "$is_gio" = true ] ; then
                    gio set '-t' 'string' "$path" 'metadata::nemo-icon-position' $x$delimeter$y # Set icon attributes
                else
                    gvfs-set-attribute '-t' 'string' "$path" 'metadata::nemo-icon-position' $x$delimeter$y # Set icon attributes
                fi
            fi
        done
    fi
}

run

