import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { version } from "../package.json";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

/**
 * Build the wired server without connecting a transport (tests use this).
 * The version is the package's own, inlined at build time, so a client asking
 * what it is talking to hears the number npm published rather than a literal
 * that was last touched at 0.1.0.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "kinetiq", version });
  registerTools(server);
  registerResources(server);
  return server;
}
