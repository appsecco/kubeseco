# Certspotter API

```
curl -s https://certspotter.com/api/v0/certs?domain="example.com" | jq '[.[].dns_names] | flatten | sort | unique'
```
