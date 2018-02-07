#!/bin/bash

# Ensure root
if [[ $EUID -ne 0 ]]
then
	>&2 echo "You must be root to install the browser-cmd service"
	exit 1
fi

# Move into script directory
base_dir=$(dirname "${BASH_SOURCE[0]}")
cd "$base_dir"

# Install service
cp "browser-cmd.service" "/etc/init.d/browser-cmd"
update-rc.d browser-cmd defaults

