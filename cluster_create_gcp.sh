#!/bin/bash

export GCP_PROJECT="${GCP_PROJECT:=your-project-name}"
export GCP_ZONE="${GCP_ZONE:=us-central1-a}"
export GCP_CLUSTER_NAME="${GCP_CLUSTER_NAME:=kubeseco-cluster-1}"

# Create cluster on GCP
gcloud beta container --project $GCP_PROJECT clusters create $GCP_CLUSTER_NAME --zone $GCP_ZONE --no-enable-basic-auth --cluster-version "1.13.11-gke.9" --machine-type "n1-standard-1" --image-type "COS" --disk-type "pd-standard" --disk-size "100" --metadata disable-legacy-endpoints=true --scopes "https://www.googleapis.com/auth/devstorage.read_only","https://www.googleapis.com/auth/logging.write","https://www.googleapis.com/auth/monitoring","https://www.googleapis.com/auth/servicecontrol","https://www.googleapis.com/auth/service.management.readonly","https://www.googleapis.com/auth/trace.append" --preemptible --num-nodes "3" --enable-cloud-logging --enable-cloud-monitoring --enable-ip-alias --network "projects/$GCP_PROJECT/global/networks/default" --subnetwork "projects/$GCP_PROJECT/regions/us-central1/subnetworks/default" --default-max-pods-per-node "110" --addons HorizontalPodAutoscaling,HttpLoadBalancing --no-enable-autoupgrade --enable-autorepair

# Fetch credentials for kubectl
gcloud container clusters --project=$GCP_PROJECT get-credentials $GCP_CLUSTER_NAME --zone $GCP_ZONE

