# @kinetiqui/mcp

Model Context Protocol server for the **Kinetiq** motion design system. It lets
any MCP-capable AI agent (Claude Code, Cursor, etc.) search the catalog, read a
component's source and docs, and get the exact install command — grounded in the
live registry, with a bundled offline snapshot as a fallback.

## Use it (no install)

```bash
npx @kinetiqui/mcp
```

### Claude Code

```json
{
  "mcpServers": {
    "kinetiq": { "command": "npx", "args": ["-y", "@kinetiqui/mcp"] }
  }
}
```

### Cursor

```json
{
  "mcpServers": {
    "kinetiq": { "command": "npx", "args": ["-y", "@kinetiqui/mcp"] }
  }
}
```

## Tools

- `list_catalog` — every component, block, page and template, grouped and filterable
- `search_components` — rank the catalog by name, tagline, or keyword
- `get_component` — full metadata and source for one item, with its install command
- `get_install_command` — the exact `shadcn add` line for any items
- `get_motion_system` — the five calibrated springs, the tween scale, and cascade rules
- `get_conventions` — the authoring rules (AGENTS.md) as markdown

Plus resources for the machine catalog, the full-ingest reference, and the
authoring conventions.

MIT licensed.
