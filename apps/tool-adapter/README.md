# Tool Adapter

## Overview

This program performs the following:

1. Listen to NATS topic
2. Execute shell command (external tool) using configured exec pattern
3. Collect output from tool
4. Persist output in Minio bucket
5. Send completion event to NATS (success/error)

## Build

```
glide install
go build
```

## Deployment

The generated binary is hosted in a public storage bucket such as S3/GCS whose URL is embedded in scanner tool's `Dockerfile`.

## Configuration Options

TODO