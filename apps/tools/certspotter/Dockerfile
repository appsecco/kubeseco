FROM alpine:3.7

ADD https://storage.googleapis.com/appsec-workflow-k8s-poc/tool-adapter/v1.0.0/tool-adapter /usr/bin/workflow-tool-adapter

RUN apk update && \
	apk add --no-cache curl jq libc6-compat && \
	chmod +x /usr/bin/workflow-tool-adapter

CMD ["/usr/bin/workflow-tool-adapter"]
