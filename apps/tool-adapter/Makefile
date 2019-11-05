VERSION=v1.0.0
GITREV=gitrev-$(shell git log -1 --pretty=format:%h)

.PHONY: all
all:
	CGO_ENABLED=0 GOOS=linux go build -ldflags "-X main.TOOL_ADAPTER_VERSION=$(GITREV)" && \
	gsutil cp tool-adapter gs://appsec-workflow-k8s-poc/tool-adapter/$(VERSION)/tool-adapter
