# Developer Guide

Kubernetes deployed services can be made available locally using `port-forward` for development.

## Minio

```bash
kubectl port-forward service/minio 9000

export MINIO_ENDPOINT=localhost:9000
export MINIO_OUTPUT_BUCKET=tools-output
export MINIO_ACCESS_KEY=$(kubectl get secret minio-secret -o jsonpath='{.data.accesskey}' | base64 -d)
export MINIO_SECRET_KEY=$(kubectl get secret minio-secret -o jsonpath='{.data.secretkey}' | base64 -d)
```

## NATS

```bash
kubectl port-forward service/nats-nats-client 4222

export NATS_URL=nats://localhost:4222
export NATS_CONSUMER_TOPIC=output.tool.*
export NATS_QUEUE_GROUP_NAME=Test-Group-$(openssl rand -hex 8)
```

## API Service

```bash
kubectl port-forward service/api-service 3000
```

```bash
curl -H "Content-Type: application/json" \
-d '{"asset_type":"domain", "asset_value":"example.com"}' \
http://localhost:3000/scans
```
