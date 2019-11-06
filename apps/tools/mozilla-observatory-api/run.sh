#!/bin/bash

export OBSERVATORY_API_DELAY="${OBSERVATORY_API_DELAY:=20}"

if (($# != 1)); then
	>&2 echo "Host not given"
	exit -1
fi

scan_id=$(curl -s -XPOST \
	https://http-observatory.security.mozilla.org/api/v1/analyze?host=$1 \
	-d 'hidden=true&rescan=true' | jq .scan_id | tr -d "\\n")

if [[ $scan_id == "null" ]]; then
	>&2 echo "Failed to submit scan: Got ($scan_id) as scan_id"
	exit -1
fi

>&2 echo "[Observatory] Submitted scan with scan_id: $scan_id"

# Fix me - Query for scan status
>&2 echo "[Observatory] Waiting for scan to finish ($OBSERVATORY_API_DELAY seconds)"
sleep $OBSERVATORY_API_DELAY

curl -s https://http-observatory.security.mozilla.org/api/v1/getScanResults?scan=$scan_id
