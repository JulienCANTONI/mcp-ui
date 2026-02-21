# CLAUDE.md — mcp-ui

This file provides AI assistants with the context needed to work effectively in this repository.

## Project Overview

**mcp-ui** is a multi-language SDK implementing the [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) standard for delivering interactive UI over the [Model Context Protocol](https://modelcontextprotocol.io/). It pioneered the concept of UI-over-MCP and its patterns directly influenced the MCP Apps specification.

The project provides:
- **`@mcp-ui/server`** (TypeScript) — Create UI resources to embed in MCP tool responses
- **`@mcp-ui/client`** (TypeScript, React) — Render those UI resources inside MCP host applications
- **`mcp_ui_server`** (Ruby) — Server-side UI resource creation in Ruby
- **`mcp-ui-server`** (Python) — Server-side UI resource creation in Python

---

## Repository Structure

```
mcp-ui/
├── sdks/
│   ├── typescript/
│   │   ├── client/          # @mcp-ui/client — React components for hosts
│   │   ├── server/          # @mcp-ui/server — createUIResource for MCP servers
│   │   └── shared/          # @mcp-ui/shared — internal shared utilities
│   ├── ruby/                # mcp_ui_server gem
│   └── python/              # mcp-ui-server Python package
├── examples/
│   ├── server/              # Full-featured Cloudflare-hosted demo server
│   ├── typescript-server-demo/
│   ├── mcp-apps-demo/
│   ├── remote-dom-demo/
│   ├── external-url-demo/
│   ├── wc-demo/             # Web Component demo
│   ├── appssdk-adapter-demo/
│   ├── ruby-server-demo/
│   └── python-server-demo/
├── docs/                    # VitePress documentation site
├── package.json             # Root workspace (pnpm)
├── pnpm-workspace.yaml      # Workspace: sdks/typescript/*, examples/*, docs
├── tsconfig.base.json       # Shared TypeScript config
├── vitest.config.ts         # Root Vitest config (covers all TS packages)
├── vitest.setup.ts          # @testing-library/jest-dom setup
├── vitest.global-setup.ts   # Builds adapter runtime bundle if missing
├── eslint.config.mjs        # ESLint flat config (TS + React + a11y + Prettier)
└── lefthook.yml             # Git pre-commit hooks
```

---

## Package Manager

This repo uses **pnpm** exclusively (enforced via `preinstall` script).

```bash
pnpm install          # Install all dependencies
```

> Do NOT use `npm` or `yarn`. The `preinstall` hook will reject them.

---

## Development Commands

All commands run from the **repo root** unless stated otherwise.

### Build

```bash
pnpm build            # Build all TypeScript SDK packages
pnpm dev              # Start dev servers for all TS packages in parallel
pnpm preview          # Preview built packages
```

### Testing

```bash
pnpm test             # Run all tests: TypeScript (vitest) + Ruby (rspec)
pnpm test:ts          # Run TypeScript tests only (vitest run)
pnpm test:ruby        # Run Ruby tests only (bundle exec rake spec)
pnpm test:watch       # Run TypeScript tests in watch mode
pnpm coverage         # Run tests with v8 coverage report
```

Tests use **jsdom** as the default environment (configured in `vitest.config.ts`). The global setup (`vitest.global-setup.ts`) auto-builds the adapter runtime bundle if it doesn't exist.

### Linting & Formatting

```bash
pnpm lint             # ESLint on all TypeScript/TSX files
pnpm lint:fix         # ESLint with auto-fix
pnpm format           # Prettier on all supported files
```

### Documentation

```bash
pnpm docs:dev         # Start VitePress dev server
pnpm docs:build       # Build docs site
pnpm docs:preview     # Preview built docs
```

### Release

Releases use **semantic-release** driven by Conventional Commits. Client and server packages have independent version tags (`client/vX.Y.Z`, `server/vX.Y.Z`).

```bash
pnpm version:patch    # Bump version with Changesets, then run pnpm install
pnpm publish-packages # Build + publish via Changesets
```

---

## Pre-commit Hooks (lefthook)

`lefthook.yml` configures hooks that run automatically on `git commit`:

- **TypeScript/TSX files**: `eslint --fix --max-warnings=0` + `prettier --write`
- **JS/JSX/MJS/CJS files**: `prettier --write`
- **JSON/CSS/SCSS files**: `prettier --write`
- **YAML files**: `prettier --write`

Hooks run in **parallel** and auto-stage fixed files.

---

## TypeScript SDK Architecture

### `@mcp-ui/server` (`sdks/typescript/server/`)

**Purpose**: Used by MCP tool servers to create UI resource payloads.

**Key exports:**
- `createUIResource(options)` — Main factory function; returns a `UIResource` object to embed in tool responses
- `postUIActionResult(result)` — Called from within the guest iframe to send actions back to the host
- `sendExperimentalRequest(method, params, options)` — Sends experimental JSON-RPC requests from a guest iframe to the host
- `wrapHtmlWithAdapters(html, adaptersConfig)` — Injects adapter scripts into HTML for cross-host compatibility
- `getAdapterMimeType(adaptersConfig)` — Returns the MIME type for the active adapter
- Helper factories: `uiActionResultToolCall`, `uiActionResultPrompt`, `uiActionResultLink`, `uiActionResultIntent`, `uiActionResultNotification`
- Constants: `RESOURCE_MIME_TYPE`, `RESOURCE_URI_META_KEY`

**`createUIResource` options:**
```ts
{
  uri: 'ui://my-server/widget',    // Must start with ui://
  content: {
    type: 'rawHtml',               // or 'externalUrl'
    htmlString: '<h1>Hi</h1>',
  },
  encoding: 'text',                // or 'blob' (base64)
  uiMetadata?: { 'preferred-frame-size': ['400px', '300px'] },
  metadata?: Record<string, unknown>,
  adapters?: {                     // Only ONE adapter at a time
    appsSdk: { enabled: true, config?: { intentHandling, timeout, hostOrigin } }
    // OR:
    mcpApps: { enabled: true, config?: { timeout } }
  }
}
```

**Adapters** (`sdks/typescript/server/src/adapters/`):
- `appssdk/` — Translates mcp-ui postMessage calls to Apps SDK API (for ChatGPT/OpenAI environments). MIME type: `text/html+skybridge`
- `mcp-apps/` — Compatibility adapter for MCP Apps spec hosts. MIME type: `text/html;profile=mcp-app`

Adapter scripts are pre-bundled at build time via `scripts/bundle-adapter.js`. The bundled output is imported as `adapter-runtime.bundled.ts`.

**Wire format (UIResource):**
```ts
{
  type: 'resource',
  resource: {
    uri: 'ui://...',
    mimeType: 'text/html;profile=mcp-app',  // or 'text/html', 'text/html+skybridge'
    text?: string,   // inline HTML or iframe URL
    blob?: string,   // base64-encoded content
    _meta?: Record<string, unknown>,
  }
}
```

---

### `@mcp-ui/client` (`sdks/typescript/client/`)

**Purpose**: Used by MCP host applications (React) to render tool UIs.

**Key exports:**

#### MCP Apps (recommended)
- `AppRenderer` — Renders tool UI by fetching the linked resource via MCP client and rendering it in a sandboxed iframe using `AppBridge`
- `AppFrame` — Lower-level sandboxed iframe component
- `AppBridge`, `PostMessageTransport`, `McpUiHostContext` — Re-exported from `@modelcontextprotocol/ext-apps/app-bridge`

#### Legacy MCP-UI
- `UIResourceRenderer` — Renders a `UIResource` directly (for hosts that embed resources in tool responses)

#### Utilities
- `isUIResource(content)` — Type guard: checks `type === 'resource'` and URI starts with `ui://`
- `getUIResourceMetadata(resource)` — Extracts `mcpui.dev/ui-*` prefixed metadata fields
- `getResourceMetadata(resource)` — Returns raw `_meta` object

#### Capabilities
- `UI_EXTENSION_CAPABILITIES` — Include in MCP client capabilities to declare UI rendering support
- `UI_EXTENSION_NAME`, `UI_EXTENSION_CONFIG`, `ClientCapabilitiesWithExtensions`

#### Remote DOM
- `basicComponentLibrary` — Default component library for remote DOM rendering
- Element definitions: `remoteCardDefinition`, `remoteButtonDefinition`, `remoteTextDefinition`, `remoteStackDefinition`, `remoteImageDefinition`

**`AppRenderer` props (key ones):**
```ts
{
  client?: Client,              // MCP client (omit to disable auto-fetching)
  toolName: string,             // Tool name to render UI for
  sandbox: { url: string },     // Sandbox/proxy URL
  toolInput?: Record<string, unknown>,
  toolResult?: CallToolResult,
  hostContext?: McpUiHostContext,
  onOpenLink?: (params, extra) => Promise<McpUiOpenLinkResult>,
  onMessage?: (params, extra) => Promise<McpUiMessageResult>,
  onFallbackRequest?: (request, extra) => Promise<unknown>,
}
```

**`UIResourceRenderer` props:**
```ts
{
  resource: Partial<EmbeddedResource['resource']>,
  onUIAction?: (result: UIActionResult) => Promise<unknown>,
  supportedContentTypes?: ResourceContentType[],
  htmlProps?: ...,
  remoteDomProps?: ...,
}
```

Content type detection in `UIResourceRenderer`:
- `text/html` or `text/html;profile=mcp-app` → `rawHtml` → `HTMLResourceRenderer`
- `text/uri-list` → `externalUrl` → `HTMLResourceRenderer`
- `application/vnd.mcp-ui.remote-dom+...` → `remoteDom` → `RemoteDOMResourceRenderer`

Also exported as a **Web Component**: `<ui-resource-renderer>` (via `ui-resource-renderer.wc.js`)

---

### `@mcp-ui/shared` (`sdks/typescript/shared/`)

Internal shared utilities. Not published as a public-facing package in the same way. Used as a workspace dependency.

---

## UIAction Protocol

Guest UIs (inside iframes) communicate with the host by posting messages via `window.parent.postMessage`. The host handles these via `onUIAction` or `onMessage` callbacks.

**Action types:**
```ts
{ type: 'tool',   payload: { toolName: string, params: Record<string, unknown> } }
{ type: 'prompt', payload: { prompt: string } }
{ type: 'link',   payload: { url: string } }
{ type: 'intent', payload: { intent: string, params: Record<string, unknown> } }
{ type: 'notify', payload: { message: string } }
```

**Experimental JSON-RPC** (from guest to host): Use `sendExperimentalRequest(method, params)` exported from `@mcp-ui/server`. The host must register an `onFallbackRequest` handler on `AppRenderer`.

---

## Metadata Conventions

UI-specific metadata is stored in the resource's `_meta` field with the prefix `mcpui.dev/ui-`:

```ts
// Setting (server-side):
createUIResource({
  uiMetadata: { 'preferred-frame-size': ['400px', '300px'] }
})
// Stored as: _meta['mcpui.dev/ui-preferred-frame-size'] = ['400px', '300px']

// Reading (client-side):
getUIResourceMetadata(resource)
// Returns: { 'preferred-frame-size': ['400px', '300px'] }
```

Constants:
- `UI_METADATA_PREFIX = 'mcpui.dev/ui-'`
- `UIMetadataKey.PREFERRED_FRAME_SIZE = 'preferred-frame-size'`
- `UIMetadataKey.INITIAL_RENDER_DATA = 'initial-render-data'`

---

## TypeScript Conventions

- **Strict mode** enabled (`"strict": true` in `tsconfig.base.json`)
- **Module system**: ESNext modules with `"moduleResolution": "bundler"`
- **Target**: ES2022
- **Type imports**: Always use `import type { ... }` for type-only imports (enforced by ESLint `@typescript-eslint/consistent-type-imports`)
- **Unused variables**: Prefix with `_` to suppress ESLint errors (e.g., `_unused`)
- **Exhaustive checks**: Use `const exhaustiveCheck: never = value` pattern for exhaustive switch/union checks
- **`.js` extensions in imports**: TypeScript source files use `.js` extensions in imports (for ESM compatibility)

---

## ESLint Configuration

Flat config in `eslint.config.mjs`. Applied to `**/*.ts` and `**/*.tsx` files.

Key rules:
- `@typescript-eslint/consistent-type-imports`: enforces `import type`
- `@typescript-eslint/no-unused-vars`: errors on unused vars (prefix `_` to ignore)
- `react/prop-types`: off (TypeScript handles this)
- React Hooks rules enforced
- JSX accessibility (jsx-a11y) enforced
- Prettier runs last to override formatting rules

**Ignored paths**: `node_modules`, `dist`, `coverage`, all `.js/.mjs/.cjs` files, `examples/`, `docs/`, and the iframe bundle file.

---

## Testing

**Framework**: [Vitest](https://vitest.dev/) for TypeScript packages, [RSpec](https://rspec.info/) for Ruby.

**Test file location**: `src/**/__tests__/**/*.test.ts` (co-located with source)

**Environment**: jsdom (browser simulation) by default.

**Global APIs** (`describe`, `it`, `expect`, etc.) are available without imports.

**Setup**:
- `vitest.setup.ts` — imports `@testing-library/jest-dom` for DOM matchers
- `vitest.global-setup.ts` — ensures adapter runtime is bundled before tests run

**Coverage** (v8):
- Reports: text, JSON, HTML (in `./coverage/`)
- Includes: `sdks/typescript/*/src/**/*.{ts,tsx}`
- Excludes: index files, type definitions, test files, dist

**Running a specific package's tests:**
```bash
# From the package directory:
pnpm test

# Or from root, targeting a package:
pnpm --filter @mcp-ui/server test
```

---

## Ruby SDK (`sdks/ruby/`)

**Gem**: `mcp_ui_server`

**Key API**:
```ruby
McpUiServer.create_ui_resource(
  uri: 'ui://greeting/1',
  content: { type: :raw_html, htmlString: '<p>Hello!</p>' },
  encoding: :text  # or :blob
)
```

Content types: `:raw_html`, `:external_url`, `:remote_dom`

**Tests**: RSpec via `bundle exec rake spec`

---

## Python SDK (`sdks/python/`)

**Package**: `mcp-ui-server`

**Key API**:
```python
from mcp_ui_server import create_ui_resource

resource = create_ui_resource({
  "uri": "ui://greeting/1",
  "content": { "type": "rawHtml", "htmlString": "<p>Hello!</p>" },
  "encoding": "text",
})
```

---

## Release Process

- Releases are automated via **semantic-release**
- Follows **Conventional Commits** (feat, fix, chore, docs, refactor, etc.)
- `@mcp-ui/client` and `@mcp-ui/server` have independent versioning with separate tag formats:
  - `client/vX.Y.Z`
  - `server/vX.Y.Z`
- CHANGELOG.md is auto-generated per package
- Ruby gem uses a separate `release.config.js`
- Release is triggered on push to `main` (or `alpha` for pre-releases)

**Commit message format:**
```
feat: add new action type         → minor bump
fix: resolve iframe sizing bug    → patch bump
feat!: rename encoding option     → major bump (BREAKING CHANGE)
chore(release): ...               → skipped (CI-generated)
```

---

## Security Model

All remote content (HTML, external URLs, remote-dom scripts) is executed inside **sandboxed iframes** with restricted permissions. This is a core security guarantee — never bypass sandbox restrictions.

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | Core MCP protocol SDK |
| `@modelcontextprotocol/ext-apps` | MCP Apps extension (AppBridge, AppRenderer) |
| `@remote-dom/core`, `@remote-dom/react` | Remote DOM rendering |
| `@quilted/threads` | Cross-iframe thread communication |
| `@r2wc/react-to-web-component` | Web Component wrapper for React |
| `zod` | Schema validation |
| `react`, `react-dom` | Peer dependencies for client SDK |
| `vite`, `vite-plugin-dts` | Build tooling |
| `vitest` | Testing framework |

---

## Common Patterns

### MCP Apps Pattern (Recommended)

```ts
// Server: link tool → UI via _meta
import { registerAppTool, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import { createUIResource } from '@mcp-ui/server';

const widgetUI = createUIResource({
  uri: 'ui://my-server/widget',
  content: { type: 'rawHtml', htmlString: '<h1>Widget</h1>' },
  encoding: 'text',
});

registerAppResource(server, 'widget_ui', widgetUI.resource.uri, {}, async () => ({
  contents: [widgetUI.resource]
}));

registerAppTool(server, 'show_widget', {
  description: 'Show widget',
  inputSchema: { query: z.string() },
  _meta: { ui: { resourceUri: widgetUI.resource.uri } }  // ← key link
}, async ({ query }) => ({ content: [{ type: 'text', text: query }] }));
```

```tsx
// Client: AppRenderer fetches and renders the UI
import { AppRenderer } from '@mcp-ui/client';

<AppRenderer
  client={mcpClient}
  toolName="show_widget"
  sandbox={{ url: sandboxProxyUrl }}
  toolInput={toolInput}
  toolResult={toolResult}
  onOpenLink={async ({ url }) => window.open(url)}
  onMessage={async (params) => handleMessage(params)}
/>
```

### Legacy MCP-UI Pattern

```tsx
import { UIResourceRenderer, isUIResource } from '@mcp-ui/client';

// Check if content is a UI resource
if (isUIResource(content)) {
  return (
    <UIResourceRenderer
      resource={content.resource}
      onUIAction={(action) => handleAction(action)}
    />
  );
}
```

### Declaring UI Capability in MCP Client

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { UI_EXTENSION_CAPABILITIES } from '@mcp-ui/client';

const client = new Client(
  { name: 'my-app', version: '1.0.0' },
  { capabilities: { extensions: UI_EXTENSION_CAPABILITIES } }
);
```
