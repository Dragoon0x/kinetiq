import { categoryBySlug, itemsByCategory } from "@/content/categories";
import { guides } from "@/content/guides";
import { labs } from "@/content/labs";
import {
  catalogBlocks,
  catalogComponents,
  catalogPages,
  catalogTemplates,
  shared,
} from "@/content/manifest";
import { SHOWCASES } from "@/content/showcases";
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
      (s) =>
        `- ${s.title} (\`${s.name}\`): ${s.description} · JSON: ${REGISTRY_ITEM_URL(s.name)}`,
    ),
    "",
    "## Pages",
    "",
    ...catalogPages.map(
      (p) =>
        `- [${p.title}](${siteConfig.url}/pages/${p.name}): ${p.description} · JSON: ${REGISTRY_ITEM_URL(p.name)}`,
    ),
    "",
    "## Templates",
    "",
    ...catalogTemplates.map(
      (t) =>
        `- [${t.title}](${siteConfig.url}/templates/${t.name}): ${t.description} · JSON: ${REGISTRY_ITEM_URL(t.name)}`,
    ),
    "",
    "## Categories",
    "",
    ...itemsByCategory(catalogComponents).map(
      ({ category, items }) =>
        `- [${category.label}](${siteConfig.url}/components/category/${category.slug}): ${category.blurb} (${items.length} components)`,
    ),
    "",
    "## Showcases",
    "",
    ...SHOWCASES.map((showcase) => {
      const label = categoryBySlug(showcase.slug)?.label ?? showcase.slug;
      return `- [${label} showcase](${siteConfig.url}/showcase/${showcase.slug}): ${showcase.deck}`;
    }),
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
    "## Site",
    "",
    `- [Explore](${siteConfig.url}/explore): every component in one live, filterable gallery`,
    `- [Spatial wing](${siteConfig.url}/spatial): the depth collections, live`,
    `- [Blocks](${siteConfig.url}/blocks), [Pages](${siteConfig.url}/pages), [Templates](${siteConfig.url}/templates): the assemblies, in ascending scale`,
    `- [Showcases](${siteConfig.url}/showcase): each category staged as a scene`,
    `- [Sitemap](${siteConfig.url}/sitemap.xml)`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
