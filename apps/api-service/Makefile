REPOSITORY=abh1sek/appsec-workflow-api-service

build:
	docker build -t $(REPOSITORY) .
release: build
	docker push -- $(REPOSITORY)

.PHONY: all
all:
	build
