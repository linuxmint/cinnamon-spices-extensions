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
    # Create CSV directory if it does not exist
    mkdir -p $workspace_directory

    # Create CSV file if it does not exist
    touch $workspace_file

    # Declare array of ouptut lines
    lines=()

    # For each desktop file
    for desktop_path in $desktop_directory/*; do
        line="";

        # Add desktop file configuration
        attributes=$(gvfs-info -a 'metadata::nemo-icon-position' "$desktop_path") # Read icon attributes
        position=$(echo $attributes | gawk '{split($0, substrings, "metadata::nemo-icon-position:"); print substrings[2]}' ) # Get icon position
        position=$(echo $position | gawk '{gsub(/\s+/,"",$0); print}') # Remove whitespaces
        x=$(echo $position | gawk '{split($0, substrings, ","); print substrings[1]}' ) # Get x position
        y=$(echo $position | gawk '{split($0, substrings, ","); print substrings[2]}' ) # Get y position
        line=$desktop_path$delimeter$x$delimeter$y

        lines+=("$line")
    done

    # If mktemp command is available
    if hash mktemp 2>/dev/null; then
        tmp_file=$(mktemp) # Create temporary file
        printf "%s\n" "${lines[@]}" > $tmp_file # Save desktop files configuration to temporary file
        mv $tmp_file $workspace_file # Replace CSV file with temporary file
    else
        printf "%s\n" "${lines[@]}" > $workspace_file # Save desktop files configuration to CSV file
    fi
}

run

