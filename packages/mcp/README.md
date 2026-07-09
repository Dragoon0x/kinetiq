# @kinetiq/mcp

Model Context Protocol server for the **Kinetiq** motion design system. It lets
any MCP-capable AI agent (Claude Code, Cursor, etc.) search the catalog, read a
component's source and docs, and get the exact install command — grounded in the
live registry, with a bundled offline snapshot as a fallback.

## Use it (no install)

```bash
npx @kinetiq/mcp
```

### Claude Code

```json
{
  "mcpServers": {
    "kinetiq": { "command": "npx", "args": ["-y", "@kinetiq/mcp"] }
  }
}
```

### Cursor

```json
{
  "mcpServers": {
    "kinetiq": { "command": "npx", "args": ["-y", "@kinetiq/mcp"] }
  }
}
```

## Tools

- `list_catalog` — every component and block, with categories and taglines
- `search` — keyword search across the catalog
- `get_component` — a component's full docs, props, and install command
- `get_source` — the exact source a consumer would install
- `get_motion_system` — the five calibrated springs and the tween scale
- `install_command` — the copy-paste `shadcn add` line for a slug

Plus resources for the machine catalog, the full-ingest reference, and the
authoring conventions.

MIT licensed.
