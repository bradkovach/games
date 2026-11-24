#!/bin/sh
set -e

# Bind mounts that Docker creates on the host are owned by root, so
# the data directory is prepared as root before dropping to `node`.
if [ "$(id -u)" = '0' ]; then
  dir="${DATA_DIR:-/data}"
  mkdir -p "$dir"
  chown -R node:node "$dir"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
