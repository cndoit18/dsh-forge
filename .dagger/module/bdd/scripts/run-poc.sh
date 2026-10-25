#!/bin/sh
set -eu

cd /bdd
printf '1\n' > /bdd/.e2e/test-status.txt
corepack yarn bddgen

log=/tmp/dsh-forge-web.log
cd /workspace/third_party/deepseek-harness
"$@" >"$log" 2>&1 &
web_pid=$!
cleanup() {
  kill "$web_pid" 2>/dev/null || true
  wait "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT

redact_log() {
  sed -E 's/([?&]token=)[^[:space:]]+/\1<redacted>/g' "$log" >&2
}

launch_url=
attempt=0
while [ "$attempt" -lt 180 ]; do
  if ! kill -0 "$web_pid" 2>/dev/null; then
    echo 'Web exited before readiness:' >&2
    redact_log
    exit 1
  fi
  launch_url=$(sed -n 's/^dsh web: \(http:\/\/[^[:space:]]*\).*$/\1/p' "$log" | head -n 1)
  if [ -n "$launch_url" ]; then break; fi
  attempt=$((attempt + 1))
  sleep 1
done
if [ -z "$launch_url" ]; then
  echo 'Web did not become ready within 180 seconds:' >&2
  redact_log
  exit 1
fi

token=${launch_url#*token=}
token=${token%%&*}
if [ -z "$token" ] || [ "$token" = "$launch_url" ]; then
  echo 'Web readiness URL did not contain a launch token' >&2
  exit 1
fi

export DSH_APP_URL="http://127.0.0.1:3080"
export DSH_TEST_TOKEN="$token"

if [ "${BDD_WAIT_AIMOCK:-0}" = "1" ]; then
  attempt=0
  until node -e "fetch('http://aimock:4010/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; do
    if [ "$attempt" -ge 30 ]; then
      echo 'aimock did not become ready within 30 seconds' >&2
      exit 1
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
fi

cd /bdd
set +e
corepack yarn playwright test
status=$?
set -e
if [ "${BDD_WAIT_AIMOCK:-0}" = "1" ]; then
  node -e "fetch('http://aimock:4010/__aimock/journal').then(async r => require('node:fs').writeFileSync('/bdd/.e2e/aimock-journal.json', await r.text())).catch(() => {})"
fi
printf '%s\n' "$status" > /bdd/.e2e/test-status.txt
exit "$status"
