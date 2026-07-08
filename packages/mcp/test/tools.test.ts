import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";

import { _resetCaches } from "../src/data.js";
import { createServer } from "../src/server.js";

// Force the offline snapshot path: no network in CI.
beforeAll(() => {
  _resetCaches();
  globalThis.fetch = (() => {
    throw new Error("network disabled in tests");
  }) as typeof fetch;
});

async function connect() {
  const server = createServer();
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as { type: string; text: string }[];
  return JSON.parse(content[0]!.text);
}

describe("kinetiq mcp tools", () => {
  it("lists the six tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "get_component",
        "get_conventions",
        "get_install_command",
        "get_motion_system",
        "list_catalog",
        "search_components",
      ].sort(),
    );
  });

  it("search_components finds pressure-button with its serial", async () => {
    const client = await connect();
    const out = await call(client, "search_components", { query: "button" });
    const hit = out.results.find((r: { slug: string }) => r.slug === "pressure-button");
    expect(hit).toBeTruthy();
    expect(hit.serial).toBe("KQ-001");
  });

  it("get_component returns props with holdToConfirm and absolute deps", async () => {
    const client = await connect();
    const out = await call(client, "get_component", {
      slug: "pressure-button",
    });
    expect(out.props.some((p: { name: string }) => p.name === "holdToConfirm")).toBe(true);
    expect(out.registryDependencies.every((d: string) => d.startsWith("http"))).toBe(true);
    // Source fetch is stubbed to fail → graceful null + note.
    expect(out.source).toBeNull();
    expect(out.sourceError).toBeTruthy();
  });

  it("get_component includeSource:false does not attempt a fetch", async () => {
    const client = await connect();
    const out = await call(client, "get_component", {
      slug: "pressure-button",
      includeSource: false,
    });
    expect(out.source).toBeUndefined();
    expect(out.slug).toBe("pressure-button");
  });

  it("get_component suggests alternatives for a typo", async () => {
    const client = await connect();
    const out = await call(client, "get_component", { slug: "presure-buton" });
    expect(out.error).toBeTruthy();
    expect(out.didYouMean).toContain("pressure-button");
  });

  it("get_install_command builds the pnpm command", async () => {
    const client = await connect();
    const out = await call(client, "get_install_command", {
      slugs: ["pressure-button"],
      packageManager: "pnpm",
    });
    expect(out.command).toBe(
      "pnpm dlx shadcn@latest add @kinetiq/pressure-button",
    );
    expect(out.unknown).toEqual([]);
  });

  it("list_catalog filters to blocks only", async () => {
    const client = await connect();
    const out = await call(client, "list_catalog", { type: "registry:block" });
    expect(out.groups.blocks.length).toBeGreaterThan(0);
    expect(out.groups.components.length).toBe(0);
  });

  it("get_motion_system reports the calibration set", async () => {
    const client = await connect();
    const out = await call(client, "get_motion_system", {});
    expect(out.springs.flick.stiffness).toBe(1100);
    expect(out.cascadeRule).toContain("600ms");
  });

  it("get_conventions returns the rules markdown", async () => {
    const client = await connect();
    const out = await call(client, "get_conventions", {});
    expect(out.markdown).toContain("five calibrated springs");
    expect(out.markdown.toLowerCase()).toContain("reduced motion");
  });

  it("exposes the three resources", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual([
      "kinetiq://conventions",
      "kinetiq://llms-full",
      "kinetiq://registry-meta",
    ]);
    const read = await client.readResource({ uri: "kinetiq://registry-meta" });
    const text = (read.contents[0] as { text: string }).text;
    expect(JSON.parse(text).items.length).toBeGreaterThan(40);
  });
});
