#!/bin/bash

# Ensure root
if [[ $EUID -ne 0 ]]
then
	>&2 echo "You must be root to install the chrome-cmd service"
	exit 1
fi

# Move into script directory
base_dir=$(dirname "${BASH_SOURCE[0]}")
cd "$base_dir"

# Install service
cp "chrome-cmd.service" "/etc/init.d/chrome-cmd"
update-rc.d chrome-cmd defaults
