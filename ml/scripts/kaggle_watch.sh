#!/bin/bash
# Usage: scripts/kaggle_watch.sh <user/kernel> [interval_s]. Exits when status is no longer queued/running.
K=$1; I=${2:-300}
while true; do
  S=$(.venv/bin/kaggle kernels status "$K" 2>&1 | tail -1)
  echo "$(date +%H:%M) $S"
  case "$S" in *RUNNING*|*QUEUED*) sleep "$I";; *) exit 0;; esac
done
