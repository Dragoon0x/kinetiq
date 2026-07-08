import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

/** Build the wired server without connecting a transport (tests use this). */
export function createServer(): McpServer {
  const server = new McpServer({ name: "kinetiq", version: "0.1.0" });
  registerTools(server);
  registerResources(server);
  return server;
}
