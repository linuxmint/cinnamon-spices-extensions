#!/bin/bash

# Declare input variables
delay=$1





# Run script
function run {
    gsettings set org.nemo.desktop show-desktop-icons false
    sleep $delay
    gsettings set org.nemo.desktop show-desktop-icons true
}

run

