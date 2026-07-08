import { guides } from "@/content/guides";
import { labs } from "@/content/labs";
import {
  catalogBlocks,
  catalogComponents,
  shared,
} from "@/content/manifest";
import { REGISTRY_ITEM_URL, siteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description}`,
    "",
    "Kinetiq distributes animated React components as source code through a",
    "shadcn-compatible registry. Every component draws its physics from five",
    "calibrated springs (flick, snap, glide, drift, recoil) shipped in",
    "`lib/motion.ts`, respects prefers-reduced-motion, and carries full",
    "WAI-ARIA keyboard support.",
    "",
    "## Install (agents)",
    "",
    "```sh",
    "# Direct URL — zero configuration",
    `npx shadcn@latest add ${siteConfig.url}/r/<slug>.json`,
    "",
    "# Or configure the namespace once, then add by name",
    `npx shadcn@latest registry add ${siteConfig.registryNamespace}=${siteConfig.url}/r/{name}.json`,
    `npx shadcn@latest add ${siteConfig.registryNamespace}/<slug>`,
    "```",
    "",
    `Registry index: ${siteConfig.url}/r/registry.json`,
    `Machine catalog (JSON): ${siteConfig.url}/registry-meta.json`,
    `Full reference (one fetch): ${siteConfig.url}/llms-full.txt`,
    `MCP server + agent setup: ${siteConfig.url}/mcp`,
    `Integration guide: ${siteConfig.url}/agents`,
    "",
    "## Components",
    "",
    ...catalogComponents.map(
      (c) =>
        `- [${c.title}](${siteConfig.url}/components/${c.name}): ${c.description} · JSON: ${REGISTRY_ITEM_URL(c.name)}`,
    ),
    "",
    "## Blocks",
    "",
    ...catalogBlocks.map(
      (b) =>
        `- [${b.title}](${siteConfig.url}/blocks/${b.name}): ${b.description} · JSON: ${REGISTRY_ITEM_URL(b.name)}`,
    ),
    "",
    "## Shared libraries (installed automatically as dependencies)",
    "",
    ...shared.map(
      (s) => `- ${s.title} (\`${s.name}\`): ${s.description} · JSON: ${REGISTRY_ITEM_URL(s.name)}`,
    ),
    "",
    "## Playground",
    "",
    ...labs.map(
      (lab) =>
        `- [${lab.title}](${siteConfig.url}/playground/${lab.slug}): ${lab.tagline}`,
    ),
    "",
    "## Guides",
    "",
    ...guides.map(
      (guide) =>
        `- [${guide.title}](${siteConfig.url}/guides/${guide.slug}): ${guide.tagline}`,
    ),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
