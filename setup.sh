#!/bin/bash

if [ -z `which kubectl` ]; then
	echo "[-] kubectl not found"
	exit
fi;

if [ -z `which helm` ]; then
	echo "[-] helm not found"
	exit
fi;

echo "[+] Installing Helm tiller service"
kubectl apply -f infra/helm-rbac.yaml
helm init --service-account tiller --history-max 200
sleep 30

echo "[+] Fixing helm tiller default security issue for 2.x"
kubectl -n kube-system delete service tiller-deploy
kubectl -n kube-system patch deployment tiller-deploy --patch '
spec:
  template:
    spec:
      containers:
        - name: tiller
          ports: []
          command: ["/tiller"]
          args: ["--listen=localhost:44134"]
'
sleep 40
helm version

echo "[+] Deploying nginx ingress using helm"
helm install --namespace kube-system \
  --name nginx-ingress stable/nginx-ingress --set rbac.create=true

echo "[+] Installing NATS"
helm install --name nats stable/nats --set auth.enabled=false

echo "[+] In cluster NATS should be accessible at: nats-nats-client.default.svc.cluster.local:4222"

echo "[+] Creating Minio secret"
kubectl create secret generic minio-secret \
  --from-literal=accesskey=$(openssl rand -hex 8) \
  --from-literal=secretkey=$(openssl rand -hex 16)

echo "[+] Installing Minio"
helm install --name minio --set existingSecret=minio-secret \
  --set serviceAccount.create=false stable/minio

echo "[+] Creating common secrets"
kubectl create secret generic common-secrets \
  --from-literal=NATS_URL="nats://nats-nats-client.default.svc.cluster.local:4222" \
  --from-literal=MINIO_ENDPOINT=minio.default.svc.cluster.local:9000

echo "[+] Deploying API service"
kubectl apply -f infra/deploy-api-service.yml

echo "[+] Deploying Feedback processor"
kubectl apply -f infra/deploy-feedback-processor.yml

echo "[+] Deploying certspotter tool"
kubectl apply -f apps/tools/certspotter/deploy.yml

echo "[+] Deploying appdiscovery tool"
kubectl apply -f apps/tools/appdiscovery/deploy.yml

echo "[+] Deploying mozilla observatory (API) tool"
kubectl apply -f apps/tools/mozilla-observatory-api/deploy.yml

