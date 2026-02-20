# O*NET MCP Demo

An MCP server that exposes **O\*NET occupational data** via **MCP-UI** using the
**MCP Apps adapter connector** (`text/html;profile=mcp-app`).

This example validates the connector integration added in the client SDK.

## Tools

| Tool | Description |
|------|-------------|
| `onet_search` | Search by keyword → interactive results list with salary & outlook |
| `onet_details` | Fetch full profile by SOC code → skills, tasks, education, wages |
| `onet_list` | List all occupations in the dataset |

## Quick Start

```bash
# From repo root
pnpm install

# Start the server
cd examples/onet-demo
pnpm dev
# → http://localhost:3002
```

## Connect with an MCP Client

```
MCP endpoint: http://localhost:3002/mcp
```

Example calls:
```
onet_search(keyword: "developer")
onet_details(code: "15-1252.00")
onet_details(code: "15-2051.00")   # Data Scientists
onet_details(code: "29-1141.00")   # Registered Nurses
```

## Connector Used

Resources are wrapped with the **MCP Apps SEP adapter**:

```ts
createUIResource({
  uri: 'ui://onet/occupation/15-1252.00',
  content: { type: 'rawHtml', htmlString: html },
  encoding: 'text',
  adapters: { mcpApps: { enabled: true } },   // ← connector
});
```

This produces `text/html;profile=mcp-app` MIME type, which the updated
`@mcp-ui/client` now renders correctly via the connector integration.
