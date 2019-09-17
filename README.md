# KubeSecO
Application Security Workflow Automation using Docker and Kubernetes

This project contains proof of concept implementation of a *solution* consisting of scripts, `Dockerfile`, Kubernetes deployment specs etc. that together deploys a system that can

1. Orchestrate 3rd party security tools
2. Transform tool output (JSON) and generate event triggers
3. API endpoints to submit input and collect aggregated result

## How to Use

1. Try out the solution by following *this* document
2. Read the [Internals](Internals.md) doc to get an idea of data schema etc.
3. Read the [Development](Development.md) doc to get an idea on local setup for development.
4. Refer to [Tasks](Tasks.todo)

## Requirements

* Kubernetes cluster
* kubectl (configured to use cluster)
* helm

## Get Started

### Deploy Apps and Infra

Ensure `kubectl` is configured to use the Kubernetes cluster where you want to deploy the setup. Execute the following script to setup the cluster.

```
./setup.sh
```

> Refer to `Under The Hood` section in this document for details on what the script does.

> To setup a Kubernetes cluster in Google Cloud and configure `kubectl`, refer to `cluster_create.sh` script in this repository.

### Expose API Service

```
kubectl port-forward service/api-service 3000
```

### Submit Scan

```
curl -H "Content-Type: application/json" \
-d '{"asset_type":"domain", "asset_value":"example.com"}' \
http://localhost:3000/scans
```

### Get Result

```
curl http://localhost:3000/scans/:scan_id
```

> :scan_id is obtained after successful scan submission

## Under The Hood

### What is being deployed?

1. NATS
2. Minio
3. API Service
4. Feedback Processor
5. Security Tools (Containers)

### How is the scan executed?

1. API service exposes HTTP endpoint to submit scan
2. On submission, it pushes input to NATS
3. Security Tools listening on corresponding NATS topic is triggered
4. Output is stored in Minio
5. Output JSON is processed by Feedback Processor to generate new input (feedback loop)

### Where are the results stored?

Minio

## Extend 

### How to integrate a tool?

1. Identify security tool that produce JSON output
2. Write `Dockerfile` to package security tool as a container
3. Include `Tool Adapter` as entrypoint program for the container
4. Push docker image to your preferred registry
5. Write Kubernetes deployment spec (YAML)
6. Deploy to Kubernetes
7. (Optional) Write `rule` to process tool output JSON and generate feedback event
8. (Optional) Update `feedback-processor` in cluster

### What are the current limitations and constraints?

* No state management.
  * There is no way to know when all activities of a scan is finished
* Bulk input
  * The system supports sending single input events to each security tools. For example 1 domain/url/host instead of an array of inputs
* Topic persistence
  * All inputs are lost if the Pod (Security Tool) processing the input is evicted/killed
* No de-duplication
  * Different security tools may produce overlapping result. No common data schema or parsing of JSON output produced by individual security tools.
