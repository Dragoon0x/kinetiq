import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadConventions, loadLlmsFull, loadMeta } from "./data.js";

/**
 * Read-only resources for agents that prefer attaching the whole system in
 * one shot instead of calling tools.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    "registry-meta",
    "kinetiq://registry-meta",
    {
      title: "Kinetiq machine catalog",
      description: "The complete machine-readable catalog (JSON).",
      mimeType: "application/json",
    },
    async (uri) => {
      const meta = await loadMeta();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(meta),
          },
        ],
      };
    },
  );

  server.registerResource(
    "conventions",
    "kinetiq://conventions",
    {
      title: "Kinetiq agent rules",
      description: "The design-system operating rules (AGENTS.md).",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const markdown = await loadConventions();
      return {
        contents: [
          { uri: uri.href, mimeType: "text/markdown", text: markdown },
        ],
      };
    },
  );

  server.registerResource(
    "llms-full",
    "kinetiq://llms-full",
    {
      title: "Kinetiq full reference",
      description: "Conventions + motion system + every item's docs, one text.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const text = await loadLlmsFull();
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain", text }],
      };
    },
  );
}
