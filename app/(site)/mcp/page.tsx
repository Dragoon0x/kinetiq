import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/docs/code-block";
import { InstallCommand } from "@/components/docs/install-command";
import { catalogBlocks, catalogComponents } from "@/content/manifest";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "MCP server",
  description:
    "Connect any AI agent to Kinetiq. The Model Context Protocol server exposes search, read, install, and motion-vocabulary tools backed by a complete machine catalog.",
};

const TOOLS = [
  ["search_components", "Rank the catalog by name, tagline, or keyword."],
  ["get_component", "Full metadata + source for one component or block."],
  ["list_catalog", "Browse everything, grouped and filterable."],
  ["get_install_command", "The exact shadcn add command for any items."],
  ["get_motion_system", "The five springs, tween scale, and cascade rules."],
  ["get_conventions", "The AGENTS.md operating rules as markdown."],
] as const;

const RESOURCES = [
  ["kinetiq://registry-meta", "The whole machine catalog (JSON)."],
  ["kinetiq://conventions", "The agent rules (markdown)."],
  ["kinetiq://llms-full", "Conventions + motion + every item's docs (text)."],
] as const;

const CLAUDE_CODE = `# After the package is published
claude mcp add kinetiq -- npx -y @kinetiq/mcp

# Point it at a local or forked registry
claude mcp add kinetiq --env KINETIQ_REGISTRY_URL=http://localhost:3000 -- npx -y @kinetiq/mcp`;

const CURSOR = `{
  "mcpServers": {
    "kinetiq": {
      "command": "npx",
      "args": ["-y", "@kinetiq/mcp"],
      "env": { "KINETIQ_REGISTRY_URL": "${siteConfig.url}" }
    }
  }
}`;

const GENERIC = `{
  "command": "npx",
  "args": ["-y", "@kinetiq/mcp"],
  "env": { "KINETIQ_REGISTRY_URL": "${siteConfig.url}" }
}`;

export default function McpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-label text-ink-3">MACHINE INTERFACE</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">MCP server</h1>
      <p className="text-ink-2 mt-3 max-w-xl">
        Connect your coding agent to Kinetiq. The Model Context Protocol server
        reads the machine catalog and hands your agent tools to search, read,
        and install components — and to stay on the motion vocabulary while it
        composes. {catalogComponents.length} components and{" "}
        {catalogBlocks.length} blocks, one command away.
      </p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Tools</h2>
        <div className="border-hairline mt-4 overflow-x-auto rounded-3 border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-hairline bg-surface-1 border-b">
                <th className="text-label text-ink-3 px-4 py-2.5 text-left">
                  Tool
                </th>
                <th className="text-label text-ink-3 px-4 py-2.5 text-left">
                  What it does
                </th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, desc]) => (
                <tr key={name} className="border-hairline border-b last:border-0">
                  <td className="px-4 py-2.5 align-top font-mono text-[13px]">
                    {name}
                  </td>
                  <td className="text-ink-2 px-4 py-2.5 align-top">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-2 mt-4 text-sm">
          Plus three read-only resources for agents that prefer attaching the
          whole system at once:
        </p>
        <ul className="mt-2 space-y-1.5">
          {RESOURCES.map(([uri, desc]) => (
            <li key={uri} className="flex gap-3 text-sm">
              <code className="text-cobalt-bright font-mono text-[13px]">
                {uri}
              </code>
              <span className="text-ink-2">{desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Setup</h2>
        <p className="text-ink-2 text-sm">
          The server runs locally over stdio — no hosting, no account. It reads
          the live catalog and falls back to a bundled snapshot offline. Set{" "}
          <code className="font-mono text-[13px]">KINETIQ_REGISTRY_URL</code> to
          point it at a local or forked registry.
        </p>
        <div>
          <p className="text-label text-ink-3 mb-2">CLAUDE CODE</p>
          <CodeBlock code={CLAUDE_CODE} lang="bash" filename="terminal" />
        </div>
        <div>
          <p className="text-label text-ink-3 mb-2">
            CURSOR · ~/.cursor/mcp.json
          </p>
          <CodeBlock code={CURSOR} lang="json" filename="mcp.json" />
        </div>
        <div>
          <p className="text-label text-ink-3 mb-2">ANY MCP CLIENT</p>
          <CodeBlock code={GENERIC} lang="json" filename="server entry" />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">
          Rules for your agent
        </h2>
        <p className="text-ink-2 mt-2 text-sm">
          Install the operating rules so your agent stays on Kinetiq&apos;s
          vocabulary automatically — it drops an{" "}
          <code className="font-mono text-[13px]">AGENTS.md</code> at your repo
          root.
        </p>
        <InstallCommand slug="agents-rules" className="mt-4" />
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">
          Machine endpoints
        </h2>
        <ul className="mt-4 space-y-2">
          {[
            ["/registry-meta.json", "the complete machine catalog"],
            ["/llms.txt", "the index, as plain text"],
            ["/llms-full.txt", "the full reference in one fetch"],
            ["/r/<slug>.json", "one registry item, sources inlined"],
          ].map(([path, description]) => (
            <li key={path} className="flex gap-3 text-sm">
              <code className="text-cobalt-bright font-mono text-[13px]">
                {path}
              </code>
              <span className="text-ink-2">{description}</span>
            </li>
          ))}
        </ul>
        <p className="text-ink-3 mt-6 text-sm">
          Prefer raw registry access without an agent?{" "}
          <Link href="/agents" className="text-cobalt-bright hover:underline">
            See the integration guide →
          </Link>
        </p>
      </section>
    </main>
  );
}
