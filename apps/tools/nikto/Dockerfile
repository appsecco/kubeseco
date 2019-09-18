FROM alpine:3.10.0

ENV NIKTO_GITHUB https://github.com/sullo/nikto
ENV NIKTO_TAG 2.1.6

ADD https://storage.googleapis.com/appsec-workflow-k8s-poc/tool-adapter/v1.0.0/tool-adapter /usr/bin/workflow-tool-adapter

WORKDIR /app
RUN apk update && \
  apk add --no-cache --virtual .build-deps \
    perl perl-net-ssleay \
    git libc6-compat && \
  rm -rf /var/cache/apk/* &&
  git clone --depth 1 $NIKTO_GITHUB && \
  cd nikto && git checkout $NIKTO_TAG && \
	chmod +x /usr/bin/workflow-tool-adapter

WORKDIR /app/nikto/program

CMD ["/usr/bin/workflow-tool-adapter"]
