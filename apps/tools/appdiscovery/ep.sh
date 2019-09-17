#!/bin/bash

# WHAT THE HACK!

TARGET=$1
OUTPUT=""

if [ -z "$TARGET" ]; then
	exit 1
fi;

store_output() {
	OUTPUT+="{ \"url\": \"$1\" },"
}

test_url() {
	curl -s -I -k --connect-timeout 3 --max-time 10 \
		$1 > /dev/null 2>&1 && store_output $1
}

test_url "http://$TARGET"
test_url "https://$TARGET"
test_url "http://$TARGET:8080"
test_url "https://$TARGET:8443"

OUTPUT=`echo $OUTPUT | sed '$s/,$//'`
echo "[ $OUTPUT ]" | jq .
