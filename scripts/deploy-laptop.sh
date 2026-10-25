#!/usr/bin/env bash
# Deploys the app on the self-hosted runner (your laptop):
#   stop old app -> back up -> copy new files -> start -> health check -> roll back if unhealthy
set -euo pipefail

: "${DEPLOY_PATH:?}" "${BACKUP_ROOT:?}" "${PORT:?}" "${RUN_NUMBER:?}"
DEPLOY_PATH="${DEPLOY_PATH/#\~/$HOME}"
BACKUP_ROOT="${BACKUP_ROOT/#\~/$HOME}"
PID_FILE="$DEPLOY_PATH/app.pid"
KEEP_BACKUPS=3

stop_app() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Stopping running app (pid $(cat "$PID_FILE"))"
    kill "$(cat "$PID_FILE")"
    for _ in $(seq 1 20); do kill -0 "$(cat "$PID_FILE")" 2>/dev/null || break; sleep 0.5; done
  fi
}

start_app() {
  cd "$DEPLOY_PATH"
  # Clearing RUNNER_TRACKING_ID stops the runner from killing the app when the job ends
  RUNNER_TRACKING_ID="" PORT="$PORT" DEMO_BUG="${DEMO_BUG:-}" setsid nohup node app/server.js > app.log 2>&1 < /dev/null &
  echo $! > "$PID_FILE"
  cd - > /dev/null
  echo "Started on port $PORT (pid $(cat "$PID_FILE"))${DEMO_BUG:+ with DEMO_BUG=$DEMO_BUG}"
}

healthy() {
  for _ in $(seq 1 20); do
    curl -sf "http://localhost:$PORT/health" > /dev/null && return 0
    sleep 0.5
  done
  return 1
}

# 1. Stop
stop_app

# 2. Back up the live folder, keep only the newest few
BACKUP=""
if [ -d "$DEPLOY_PATH/app" ]; then
  mkdir -p "$BACKUP_ROOT"
  BACKUP="$BACKUP_ROOT/run-$RUN_NUMBER"
  rm -rf "$BACKUP"
  cp -a "$DEPLOY_PATH" "$BACKUP"
  echo "Backup: $BACKUP"
  ls -1dt "$BACKUP_ROOT"/run-* | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -rf
fi

# 3. Copy the new version (app code + production node_modules)
mkdir -p "$DEPLOY_PATH"
rm -rf "$DEPLOY_PATH/app" "$DEPLOY_PATH/node_modules"
cp -a app node_modules package.json "$DEPLOY_PATH"/

# 4. Start and check
start_app
if healthy; then
  echo "Health check OK: http://localhost:$PORT/health"
  exit 0
fi

# 5. Unhealthy: put the previous version back
echo "::error::Health check failed. Last log lines:"
tail -20 "$DEPLOY_PATH/app.log" || true
stop_app
if [ -n "$BACKUP" ]; then
  echo "Rolling back to $BACKUP"
  rm -rf "$DEPLOY_PATH/app" "$DEPLOY_PATH/node_modules"
  cp -a "$BACKUP/app" "$BACKUP/node_modules" "$DEPLOY_PATH"/
  DEMO_BUG="" start_app
  healthy && echo "Rollback OK: previous version is running" || echo "::error::Rollback also failed"
fi
exit 1
