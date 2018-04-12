#!/bin/bash

. /etc/os-release

# Check if the os id exists as a watermark file
if [ -e "$1/$ID.svg" ]
then echo -n "$ID"
fi
