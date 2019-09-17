# System Internals

## API Service Input Format

```json
{
  "asset_type": "domain|host|url",
  "asset_value": "example.com"
}
```

## Queue Names

| Queue Name   | Description                                             |
| ------------ | ------------------------------------------------------- |
| input.domain | All tools that take input domain should listen here     |
| input.host   | All tools that take input host should listen here       |
| input.url    | All tools that take input URL should listen here        |
| output.*     | All tools that processes tool output should listen here |

Tools should send their output to `output.<tool_name>` topic so that any handler that processes specific tool can listen to specific topic instead of `output.*`.

## JSON Schema

## Input Event

```json
{
  "scan_id": "546fbd69-47f4-49fe-a1da-72d70a628fde",
  "asset_type": "domain",
  "asset_value": "example.com"
}
```

> The input JSON is pushed to NATS queue (input.*) by `api-service` or `feedback-processor`

### Tool Output Event

```json
{
  "scan_id": "546fbd69-47f4-49fe-a1da-72d70a628fde",
  "status": "Success",
  "tool_name": "certspotter",
  "target_info": {
    "asset_type": "domain",
    "asset_value": "example.com"
  },
  "path": "scans/546fbd69-47f4-49fe-a1da-72d70a628fde/tool-certspotter-1568208558114364849.json"
}
```