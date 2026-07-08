import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { PACKAGE_MANAGERS, type PackageManager } from "./config.js";
import { didYouMean, fetchSource, loadConventions, loadMeta } from "./data.js";
import { rankComponents } from "./search.js";

const TYPE_ENUM = [
  "registry:ui",
  "registry:block",
  "registry:lib",
  "registry:hook",
  "registry:file",
] as const;

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "search_components",
    {
      title: "Search components",
      description:
        "Search the Kinetiq catalog by name, tagline, or keyword. Returns ranked matches with slug, title, tagline, category, and serial.",
      inputSchema: {
        query: z.string().describe("Free-text query, e.g. 'button' or 'toast'."),
        type: z.enum(TYPE_ENUM).optional().describe("Filter by registry type."),
        category: z.string().optional().describe("Filter by category."),
        limit: z.number().int().positive().max(25).optional(),
      },
    },
    async ({ query, type, category, limit }) => {
      const meta = await loadMeta();
      const results = rankComponents(query, meta.items, {
        type,
        category,
        limit,
      });
      return json(
        results.length > 0
          ? { results }
          : { results: [], hint: "No matches. Try list_catalog to browse." },
      );
    },
  );

  server.registerTool(
    "get_component",
    {
      title: "Get component",
      description:
        "Full metadata for one component or block: description, props, usage notes, install commands, dependencies, and (by default) its source code.",
      inputSchema: {
        slug: z.string().describe("The component slug, e.g. 'pressure-button'."),
        includeSource: z
          .boolean()
          .optional()
          .describe("Include source code (default true)."),
      },
    },
    async ({ slug, includeSource = true }) => {
      const meta = await loadMeta();
      const item = meta.items.find((i) => i.slug === slug);
      if (!item) {
        return json({
          error: `Unknown slug "${slug}".`,
          didYouMean: didYouMean(
            slug,
            meta.items.map((i) => i.slug),
          ),
        });
      }
      if (!includeSource) return json(item);
      const source = await fetchSource(slug);
      return json(
        source === null ? { ...item, source: null, sourceError: "source fetch failed; use registryItemUrl" } : { ...item, source },
      );
    },
  );

  server.registerTool(
    "list_catalog",
    {
      title: "List catalog",
      description:
        "List the whole catalog grouped into components, blocks, and shared libraries. Optionally filter by type or category.",
      inputSchema: {
        type: z.enum(TYPE_ENUM).optional(),
        category: z.string().optional(),
      },
    },
    async ({ type, category }) => {
      const meta = await loadMeta();
      const match = (kind: string) =>
        meta.items
          .filter((i) => i.kind === kind)
          .filter((i) => (type ? i.type === type : true))
          .filter((i) =>
            category ? (i.categories ?? []).includes(category) : true,
          )
          .map((i) => ({
            slug: i.slug,
            title: i.title,
            serial: i.serial,
            category: i.categories?.[0],
          }));
      return json({
        counts: meta.registry.counts,
        groups: {
          components: match("component"),
          blocks: match("block"),
          shared: match("shared"),
        },
      });
    },
  );

  server.registerTool(
    "get_install_command",
    {
      title: "Get install command",
      description:
        "The exact `shadcn add` command to install one or more items, for the chosen package manager (default pnpm).",
      inputSchema: {
        slugs: z.array(z.string()).min(1),
        packageManager: z.enum(PACKAGE_MANAGERS).optional(),
      },
    },
    async ({ slugs, packageManager = "pnpm" as PackageManager }) => {
      const meta = await loadMeta();
      const known = new Map(meta.items.map((i) => [i.slug, i]));
      const found = slugs.filter((s) => known.has(s));
      const unknown = slugs.filter((s) => !known.has(s));
      const refs = found.map((s) => `@kinetiq/${s}`).join(" ");
      const runner = { pnpm: "pnpm dlx", npm: "npx", yarn: "yarn dlx", bun: "bunx --bun" }[
        packageManager
      ];
      return json({
        command: found.length ? `${runner} shadcn@latest add ${refs}` : null,
        perSlug: Object.fromEntries(
          found.map((s) => [s, known.get(s)?.install]),
        ),
        unknown,
      });
    },
  );

  server.registerTool(
    "get_motion_system",
    {
      title: "Get motion system",
      description:
        "The Kinetiq calibration set: the five springs (values, damping ratio, role), the tween scale, the cascade budget, the exit rule, and the reduced-motion policy. Read this to stay on-vocabulary.",
      inputSchema: {},
    },
    async () => {
      const meta = await loadMeta();
      return json(meta.motion);
    },
  );

  server.registerTool(
    "get_conventions",
    {
      title: "Get conventions",
      description:
        "The Kinetiq operating rules (AGENTS.md) as markdown: motion language, tokens, reduced-motion policy, composition, and install flow.",
      inputSchema: {},
    },
    async () => {
      const markdown = await loadConventions();
      return json({ markdown });
    },
  );
}
