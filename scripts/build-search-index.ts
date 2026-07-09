/**
 * Flattens the manifest plus static pages into .generated/search-index.json
 * for the command deck (⌘K). A few KB, statically imported — no service.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { itemsByCategory } from "../content/categories";
import { itemsByCollection } from "../content/collections";
import { guides } from "../content/guides";
import { labs } from "../content/labs";
import { catalogBlocks, catalogComponents } from "../content/manifest";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, ".generated");

type SearchEntry = {
  section: "Components" | "Blocks" | "Playground" | "Guides" | "Pages";
  title: string;
  tagline: string;
  keywords: string[];
  href: string;
};

async function main() {
  const entries: SearchEntry[] = [
    ...catalogComponents.map(
      (c): SearchEntry => ({
        section: "Components",
        title: c.title,
        tagline: c.tagline,
        keywords: c.keywords,
        href: `/components/${c.name}`,
      }),
    ),
    ...catalogBlocks.map(
      (b): SearchEntry => ({
        section: "Blocks",
        title: b.title,
        tagline: b.tagline,
        keywords: b.keywords,
        href: `/blocks/${b.name}`,
      }),
    ),
    ...labs.map(
      (lab): SearchEntry => ({
        section: "Playground",
        title: lab.title,
        tagline: lab.tagline,
        keywords: [lab.serial, "playground", "lab", lab.slug],
        href: `/playground/${lab.slug}`,
      }),
    ),
    ...guides.map(
      (guide): SearchEntry => ({
        section: "Guides",
        title: guide.title,
        tagline: guide.tagline,
        keywords: [guide.serial, "guide", "manual"],
        href: `/guides/${guide.slug}`,
      }),
    ),
    {
      section: "Pages",
      title: "Home",
      tagline: "Motion, calibrated.",
      keywords: ["kinetiq", "home"],
      href: "/",
    },
    {
      section: "Pages",
      title: "Explore",
      tagline: "The whole catalog, live and filterable.",
      keywords: ["explore", "gallery", "filter", "browse", "catalog"],
      href: "/explore",
    },
    {
      section: "Pages",
      title: "Spatial wing",
      tagline: "Depth as a material — the spatial collections, live.",
      keywords: ["spatial", "3d", "depth", "wing", "collections", "gallery"],
      href: "/spatial",
    },
    ...itemsByCollection(catalogComponents).map(
      ({ collection }): SearchEntry => ({
        section: "Pages",
        title: `${collection.label} — Spatial wing`,
        tagline: collection.blurb,
        keywords: [collection.slug, "spatial", "collection"],
        href: `/components/category/spatial#${collection.slug}`,
      }),
    ),
    ...itemsByCategory(catalogComponents).map(
      ({ category }): SearchEntry => ({
        section: "Pages",
        title: `${category.label} components`,
        tagline: category.blurb,
        keywords: [category.slug, "category", category.label.toLowerCase()],
        href: `/components/category/${category.slug}`,
      }),
    ),
    {
      section: "Pages",
      title: "Playground",
      tagline: "Learn motion by operating it.",
      keywords: ["labs", "benches", "learn"],
      href: "/playground",
    },
    {
      section: "Pages",
      title: "MCP server",
      tagline: "Connect any AI agent to Kinetiq.",
      keywords: ["mcp", "agents", "tools", "claude", "cursor", "ai"],
      href: "/mcp",
    },
    {
      section: "Pages",
      title: "For AI agents",
      tagline: "Programmatic registry access.",
      keywords: ["llms", "registry", "api", "agents"],
      href: "/agents",
    },
  ];

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "search-index.json"),
    `${JSON.stringify(entries, null, 2)}\n`,
  );

  console.log(`search: ${entries.length} entries → .generated/search-index.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
