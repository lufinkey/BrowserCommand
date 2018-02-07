#!/bin/bash

# Ensure root
if [[ $EUID -ne 0 ]]
then
	>&2 echo "You must be root to uninstall the chrome-cmd service"
	exit 1
fi

# Move into script directory
base_dir=$(dirname "${BASH_SOURCE[0]}")
cd "$base_dir"

# Uninstall service
service browser-cmd stop
update-rc.d browser-cmd remove
rm -rf /etc/init.d/browser-cmd

