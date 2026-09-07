import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/docs/code-block";
import { InstallCommand } from "@/components/docs/install-command";
import { catalogBlocks, catalogComponents } from "@/content/manifest";
import { siteConfig } from "@/lib/site-config";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, webPageLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMeta({
  title: "MCP server",
  description:
    "Connect any AI agent to Kinetiq. The Model Context Protocol server exposes search, read, install, and motion-vocabulary tools backed by a complete machine catalog.",
  path: "/mcp",
  keywords: [
    "MCP server",
    "Model Context Protocol",
    "AI agent",
    "coding agent",
  ],
});

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
claude mcp add kinetiq -- npx -y @kinetiqui/mcp

# Point it at a local or forked registry
claude mcp add kinetiq --env KINETIQ_REGISTRY_URL=http://localhost:3000 -- npx -y @kinetiqui/mcp`;

const CURSOR = `{
  "mcpServers": {
    "kinetiq": {
      "command": "npx",
      "args": ["-y", "@kinetiqui/mcp"],
      "env": { "KINETIQ_REGISTRY_URL": "${siteConfig.url}" }
    }
  }
}`;

const GENERIC = `{
  "command": "npx",
  "args": ["-y", "@kinetiqui/mcp"],
  "env": { "KINETIQ_REGISTRY_URL": "${siteConfig.url}" }
}`;

export default function McpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <JsonLd
        data={[
          webPageLd({
            name: "MCP server",
            description:
              "Connect any AI agent to Kinetiq. The Model Context Protocol server exposes search, read, install, and motion-vocabulary tools backed by a complete machine catalog.",
            path: "/mcp",
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "MCP server", path: "/mcp" },
          ]),
        ]}
      />
      <p className="text-label text-ink-3">MACHINE INTERFACE</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">MCP server</h1>
      <p className="mt-3 max-w-xl text-ink-2">
        Connect your coding agent to Kinetiq. The Model Context Protocol server
        reads the machine catalog and hands your agent tools to search, read,
        and install components — and to stay on the motion vocabulary while it
        composes. {catalogComponents.length} components and{" "}
        {catalogBlocks.length} blocks, one command away.
      </p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Tools</h2>
        <div className="mt-4 overflow-x-auto rounded-3 border border-hairline">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-1">
                <th className="px-4 py-2.5 text-left text-label text-ink-3">
                  Tool
                </th>
                <th className="px-4 py-2.5 text-left text-label text-ink-3">
                  What it does
                </th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, desc]) => (
                <tr
                  key={name}
                  className="border-b border-hairline last:border-0"
                >
                  <td className="px-4 py-2.5 align-top font-mono text-[13px]">
                    {name}
                  </td>
                  <td className="px-4 py-2.5 align-top text-ink-2">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-ink-2">
          Plus three read-only resources for agents that prefer attaching the
          whole system at once:
        </p>
        <ul className="mt-2 space-y-1.5">
          {RESOURCES.map(([uri, desc]) => (
            <li key={uri} className="flex gap-3 text-sm">
              <code className="font-mono text-[13px] text-cobalt-bright">
                {uri}
              </code>
              <span className="text-ink-2">{desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Setup</h2>
        <p className="text-sm text-ink-2">
          The server runs locally over stdio — no hosting, no account. It reads
          the live catalog and falls back to a bundled snapshot offline. Set{" "}
          <code className="font-mono text-[13px]">KINETIQ_REGISTRY_URL</code> to
          point it at a local or forked registry.
        </p>
        <div>
          <p className="mb-2 text-label text-ink-3">CLAUDE CODE</p>
          <CodeBlock code={CLAUDE_CODE} lang="bash" filename="terminal" />
        </div>
        <div>
          <p className="mb-2 text-label text-ink-3">
            CURSOR · ~/.cursor/mcp.json
          </p>
          <CodeBlock code={CURSOR} lang="json" filename="mcp.json" />
        </div>
        <div>
          <p className="mb-2 text-label text-ink-3">ANY MCP CLIENT</p>
          <CodeBlock code={GENERIC} lang="json" filename="server entry" />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">
          Rules for your agent
        </h2>
        <p className="mt-2 text-sm text-ink-2">
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
              <code className="font-mono text-[13px] text-cobalt-bright">
                {path}
              </code>
              <span className="text-ink-2">{description}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ink-3">
          Prefer raw registry access without an agent?{" "}
          <Link href="/agents" className="text-cobalt-bright hover:underline">
            See the integration guide →
          </Link>
        </p>
      </section>
    </main>
  );
}
