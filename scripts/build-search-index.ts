/**
 * Flattens the whole library into public/search-index.json for the command
 * deck (⌘K).
 *
 * Everything an item knows about itself goes in: title, tagline, serial,
 * category, keywords, prop names, prop types and docs, usage notes, and the
 * full description. Searching a prop name, a serial, or a phrase from a
 * paragraph should land on the item that owns it, so the index has to carry
 * all three.
 *
 * It ships as a fetched file rather than an import: at this size an import
 * would ride in every page's bundle, and the deck needs it only once the
 * reader opens it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { sectionFamilyOf } from "../content/block-categories";
import {
  categoryBySlug,
  categoryOf,
  itemsByCategory,
} from "../content/categories";
import { itemsByCollection } from "../content/collections";
import { guides } from "../content/guides";
import { labs } from "../content/labs";
import {
  catalogBlocks,
  catalogComponents,
  catalogPages,
  catalogTemplates,
} from "../content/manifest";
import type { KinetiqItem } from "../content/manifest/types";
import { pageFamilyOf } from "../content/page-categories";
import { SHOWCASES } from "../content/showcases";
import { templateKindOf } from "../content/template-categories";
import type { SearchDoc } from "../lib/search-doc";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public");

/** Collapses whitespace so the payload carries no formatting artefacts. */
const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * The body blob: everything matchable that is not already a field of its
 * own. Prop types go in beside their descriptions, so a search for
 * "() => void" or "boolean" finds the components that take one.
 */
function bodyOf(item: KinetiqItem): string {
  const parts = [
    item.description,
    ...(item.usageNotes ?? []),
    ...(item.props ?? []).map(
      (prop) =>
        `${prop.name} ${prop.type} ${prop.defaultValue ?? ""} ${prop.description}`,
    ),
    ...(item.dependencies ?? []),
    ...(item.registryDependencies ?? []),
  ];
  return squash(parts.join(" "));
}

function docFor(
  item: KinetiqItem,
  section: SearchDoc["s"],
  routeBase: string,
  category: string | undefined,
): SearchDoc {
  const doc: SearchDoc = {
    s: section,
    t: item.title,
    d: item.tagline,
    h: `/${routeBase}/${item.name}`,
    g: item.name,
  };
  if (item.meta?.serial) doc.n = item.meta.serial;
  if (category) doc.c = category;
  if (item.keywords.length) doc.k = item.keywords;
  const props = (item.props ?? []).map((prop) => prop.name);
  if (props.length) doc.p = props;
  const body = bodyOf(item);
  if (body) doc.b = body;
  return doc;
}

async function main() {
  const docs: SearchDoc[] = [
    ...catalogComponents.map((component) =>
      docFor(
        component,
        "c",
        "components",
        categoryBySlug(categoryOf(component))?.label,
      ),
    ),
    ...catalogBlocks.map((block) =>
      docFor(block, "b", "blocks", sectionFamilyOf(block)?.label),
    ),
    ...catalogPages.map((page) =>
      docFor(page, "p", "pages", pageFamilyOf(page)?.label),
    ),
    ...catalogTemplates.map((template) =>
      docFor(template, "t", "templates", templateKindOf(template)?.label),
    ),
    ...labs.map((lab): SearchDoc => ({
      s: "l",
      t: lab.title,
      d: lab.tagline,
      h: `/playground/${lab.slug}`,
      n: lab.serial,
      k: ["playground", "lab", "bench", lab.slug],
    })),
    ...guides.map((guide): SearchDoc => ({
      s: "g",
      t: guide.title,
      d: guide.tagline,
      h: `/guides/${guide.slug}`,
      n: guide.serial,
      k: ["guide", "manual", "learn", guide.slug],
    })),

    // ── the site's own rooms ───────────────────────────────────────────────
    {
      s: "x",
      t: "Home",
      d: "Motion, calibrated.",
      h: "/",
      k: ["kinetiq", "home", "start"],
    },
    {
      s: "x",
      t: "Explore",
      d: "The whole catalog, live and filterable.",
      h: "/explore",
      k: ["explore", "gallery", "filter", "browse", "catalog", "all"],
    },
    {
      s: "x",
      t: "Spatial wing",
      d: "Depth as a material — the spatial collections, live.",
      h: "/spatial",
      k: ["spatial", "3d", "depth", "wing", "collections", "gallery"],
    },
    {
      s: "x",
      t: "Blocks",
      d: "Larger assemblies — complete, product-ready sections.",
      h: "/blocks",
      k: ["blocks", "sections", "assemblies", "index"],
    },
    {
      s: "x",
      t: "Pages",
      d: "Whole pages, assembled from shipped sections.",
      h: "/pages",
      k: ["pages", "routes", "index"],
    },
    {
      s: "x",
      t: "Templates",
      d: "Complete sites, assembled.",
      h: "/templates",
      k: ["templates", "sites", "index"],
    },
    {
      s: "x",
      t: "Showcases",
      d: "Each category, staged as a scene.",
      h: "/showcase",
      k: ["showcase", "scenes", "rooms", "index"],
    },
    {
      s: "x",
      t: "Playground",
      d: "Learn motion by operating it.",
      h: "/playground",
      k: ["labs", "benches", "learn", "playground"],
    },
    {
      s: "x",
      t: "Guides",
      d: "The field manuals behind the doctrine.",
      h: "/guides",
      k: ["guides", "manuals", "docs", "learn"],
    },
    {
      s: "x",
      t: "MCP server",
      d: "Connect any AI agent to Kinetiq.",
      h: "/mcp",
      k: ["mcp", "agents", "tools", "claude", "cursor", "ai", "server"],
    },
    {
      s: "x",
      t: "For AI agents",
      d: "Programmatic registry access.",
      h: "/agents",
      k: ["llms", "registry", "api", "agents", "json", "machine"],
    },
    ...itemsByCategory(catalogComponents).map(({ category }): SearchDoc => ({
      s: "x",
      t: `${category.label} components`,
      d: category.blurb,
      h: `/components/category/${category.slug}`,
      c: category.label,
      k: [category.slug, "category", category.label.toLowerCase()],
    })),
    ...SHOWCASES.map((showcase): SearchDoc => {
      const label = categoryBySlug(showcase.slug)?.label ?? showcase.slug;
      return {
        s: "x",
        t: `${label} showcase`,
        d: showcase.deck,
        h: `/showcase/${showcase.slug}`,
        c: label,
        k: [showcase.slug, "showcase", "gallery", "room", label.toLowerCase()],
      };
    }),
    ...itemsByCollection(catalogComponents).map(
      ({ collection }): SearchDoc => ({
        s: "x",
        t: `${collection.label} — Spatial wing`,
        d: collection.blurb,
        h: `/components/category/spatial#${collection.slug}`,
        k: [collection.slug, "spatial", "collection", "hall"],
      }),
    ),
  ];

  await mkdir(OUT_DIR, { recursive: true });

  // Two files, because the prose is three times the weight of everything
  // else. The head alone answers most searches — names, serials, keywords,
  // props, categories — so the deck fetches it first and is usable at once;
  // the bodies follow and quietly deepen the same results.
  const head = docs.map((doc) => {
    const record: SearchDoc = { ...doc };
    delete record.b;
    return record;
  });
  const bodies = docs.map((doc) => doc.b ?? "");

  const headJson = JSON.stringify(head);
  const bodyJson = JSON.stringify(bodies);
  await writeFile(path.join(OUT_DIR, "search-index.json"), `${headJson}\n`);
  await writeFile(path.join(OUT_DIR, "search-body.json"), `${bodyJson}\n`);

  const propCount = docs.reduce(
    (total, doc) => total + (doc.p?.length ?? 0),
    0,
  );
  const kb = (json: string) => Math.round(json.length / 1024);
  console.log(
    `search: ${docs.length} records, ${propCount} props → public/search-index.json (${kb(headJson)}KB) + search-body.json (${kb(bodyJson)}KB)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
