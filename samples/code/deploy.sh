#!/usr/bin/env bash
# Shell sample
set -euo pipefail
for host in plc-01 plc-02; do
  if ping -c1 -W1 "$host" >/dev/null; then
    echo "$host is up"
  else
    echo "$host is DOWN" >&2
  fi
done
