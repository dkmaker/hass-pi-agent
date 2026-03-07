#!/usr/bin/env bash
set -e

# s6-overlay stores env vars in files — source them if SUPERVISOR_TOKEN is missing
if [ -z "$SUPERVISOR_TOKEN" ] && [ -f /run/s6/container_environment/SUPERVISOR_TOKEN ]; then
  SUPERVISOR_TOKEN=$(cat /run/s6/container_environment/SUPERVISOR_TOKEN)
  export SUPERVISOR_TOKEN
  echo "Loaded SUPERVISOR_TOKEN from s6 container_environment"
fi

echo "=== ENVIRONMENT ==="
echo "SUPERVISOR_TOKEN present: $([ -n "$SUPERVISOR_TOKEN" ] && echo YES || echo NO)"
echo "SUPERVISOR_TOKEN length: ${#SUPERVISOR_TOKEN}"
env | sort

echo ""
echo "=== FILESYSTEM MOUNTS ==="
for dir in /homeassistant /config /addon_configs /ssl /share /media /backup /data; do
  if [ -d "$dir" ]; then
    echo "$dir: EXISTS ($(ls -1 "$dir" 2>/dev/null | wc -l) items)"
    ls -la "$dir" 2>/dev/null | head -10
  else
    echo "$dir: NOT FOUND"
  fi
  echo ""
done

echo "=== SUPERVISOR API TEST ==="
curl -sS -H "Authorization: Bearer $SUPERVISOR_TOKEN" http://supervisor/supervisor/ping 2>&1 || echo "FAILED"

echo ""
echo "=== SUPERVISOR INFO ==="
curl -sS -H "Authorization: Bearer $SUPERVISOR_TOKEN" http://supervisor/info 2>&1 | jq . || echo "FAILED"

echo ""
echo "=== CORE API TEST ==="
curl -sS -H "Authorization: Bearer $SUPERVISOR_TOKEN" http://supervisor/core/api/ 2>&1 || echo "FAILED"

echo ""
echo "=== CORE CONFIG ==="
curl -sS -H "Authorization: Bearer $SUPERVISOR_TOKEN" http://supervisor/core/api/config 2>&1 | jq . || echo "FAILED"

echo ""
echo "=== HA .storage files ==="
ls -la /homeassistant/.storage/ 2>/dev/null | head -20 || echo "NOT ACCESSIBLE"

echo ""
echo "=== SERVICES (MQTT etc) ==="
curl -sS -H "Authorization: Bearer $SUPERVISOR_TOKEN" http://supervisor/services 2>&1 | jq . || echo "FAILED"

echo ""
echo "=== DONE — sleeping forever ==="
sleep infinity
