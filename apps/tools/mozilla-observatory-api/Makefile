REPOSITORY=abh1sek/appsec-workflow-mozilla-observatory-api

build:
	docker build -t $(REPOSITORY) .
release: build
	docker push -- $(REPOSITORY)

.PHONY: all
all:
	build
