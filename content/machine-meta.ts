import { z } from "zod";

import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "../registry/lib/motion";
import { REGISTRY_ITEM_URL, siteConfig } from "../lib/site-config";
import {
  catalogBlocks,
  catalogComponents,
  shared,
  type KinetiqItem,
} from "./manifest";

/**
 * The machine catalog: the complete, machine-readable description of the
 * Kinetiq design system. The site serves it at /registry-meta.json and the
 * MCP package bundles a snapshot of it. Built from the manifest + the
 * calibration set — one source, no drift.
 *
 * Runs under tsx (build script) and in a force-static route, so it uses
 * relative imports and never touches the filesystem itself; the AGENTS.md
 * text is injected by the caller.
 */

const PACKAGE_RUNNERS = {
  pnpm: "pnpm dlx",
  npm: "npx",
  yarn: "yarn dlx",
  bun: "bunx --bun",
} as const;

type PackageManager = keyof typeof PACKAGE_RUNNERS;

/**
 * Damping ratio (ζ), settle time, and the one-line role for each spring —
 * the documented vocabulary from registry/lib/motion.ts, carried as literals
 * (they annotate the springs in prose, not in the runtime values).
 */
const SPRING_PROFILE: Record<
  keyof typeof springs,
  { dampingRatio: number; settleMs: number; role: string }
> = {
  flick: {
    dampingRatio: 0.99,
    settleMs: 120,
    role: "Press states, tick draws, focus. Confirms.",
  },
  snap: {
    dampingRatio: 0.83,
    settleMs: 300,
    role: "Toggles, tab indicators, menus — one crisp overshoot. Switches.",
  },
  glide: {
    dampingRatio: 0.98,
    settleMs: 450,
    role: "Layout shifts, reorders, morphs. Moves.",
  },
  drift: {
    dampingRatio: 1.0,
    settleMs: 800,
    role: "Large surfaces, ambient drift, parallax settle. Breathes.",
  },
  recoil: {
    dampingRatio: 0.53,
    settleMs: 700,
    role: "Toasts, stamps, landings — two visible bounces. Celebrates.",
  },
};

function installCommands(slug: string) {
  const add = (runner: string) =>
    `${runner} shadcn@latest add ${siteConfig.registryNamespace}/${slug}`;
  return {
    pnpm: add(PACKAGE_RUNNERS.pnpm),
    npm: add(PACKAGE_RUNNERS.npm),
    yarn: add(PACKAGE_RUNNERS.yarn),
    bun: add(PACKAGE_RUNNERS.bun),
    direct: `npx shadcn@latest add ${REGISTRY_ITEM_URL(slug)}`,
  } satisfies Record<PackageManager | "direct", string>;
}

function expandDeps(item: KinetiqItem): string[] | undefined {
  if (!item.registryDependencies) return undefined;
  return item.registryDependencies.map((dep) =>
    dep.startsWith("http") ? dep : REGISTRY_ITEM_URL(dep),
  );
}

function toMetaItem(item: KinetiqItem, kind: "component" | "block" | "shared") {
  const docsUrl =
    kind === "component"
      ? `${siteConfig.url}/components/${item.name}`
      : kind === "block"
        ? `${siteConfig.url}/blocks/${item.name}`
        : undefined;

  return {
    slug: item.name,
    kind,
    type: item.type,
    title: item.title,
    serial: item.meta?.serial,
    tagline: item.tagline,
    description: item.description,
    categories: item.categories,
    keywords: item.keywords,
    props: item.props,
    usageNotes: item.usageNotes,
    dependencies: item.dependencies,
    registryDependencies: expandDeps(item),
    docsUrl,
    registryItemUrl: REGISTRY_ITEM_URL(item.name),
    install: installCommands(item.name),
  };
}

/** The complete machine catalog. Deterministic — no timestamps — so the
 * committed offline snapshot never churns; freshness comes from the live
 * registry. */
export function buildMachineMeta(): MachineMeta {
  const springBlock = Object.fromEntries(
    (Object.keys(springs) as (keyof typeof springs)[]).map((name) => {
      const s = springs[name];
      const profile = SPRING_PROFILE[name];
      return [
        name,
        {
          stiffness: s.stiffness,
          damping: s.damping,
          mass: s.mass,
          dampingRatio: profile.dampingRatio,
          settleMs: profile.settleMs,
          role: profile.role,
        },
      ];
    }),
  );

  const items = [
    ...catalogComponents.map((c) => toMetaItem(c, "component")),
    ...catalogBlocks.map((b) => toMetaItem(b, "block")),
    ...shared.map((s) => toMetaItem(s, "shared")),
  ];

  return {
    $schema: `${siteConfig.url}/schema/registry-meta.json`,
    registry: {
      name: siteConfig.registryName,
      namespace: siteConfig.registryNamespace,
      homepage: siteConfig.url,
      indexUrl: `${siteConfig.url}/r/registry.json`,
      docsUrl: siteConfig.url,
      counts: {
        components: catalogComponents.length,
        blocks: catalogBlocks.length,
        shared: shared.length,
      },
    },
    motion: {
      springs: springBlock,
      tweens: {
        durations: { ...durations },
        easings: Object.fromEntries(
          Object.entries(easings).map(([k, v]) => [k, [...v]]),
        ),
        distances: { ...distances },
      },
      cascadeRule:
        "Stagger interval = clamp(0.6 / (count - 1), 0.02, 0.06)s so the whole choreography stays under a 600ms budget; dense lists tighten automatically.",
      exitRule:
        "Exits are always tweens at 0.6x the enter duration with the exit easing — springs on exit read as indecision.",
      reducedMotion:
        "prefers-reduced-motion is a first-class state. Transform enters become opacity fades; discrete springs snap to position with a color tween; direct manipulation keeps 1:1 tracking but drops inertia; autoplay loops go static; scroll-linked renders its final frame; number rolls swap instantly. Every component reads useMotionSafe(), never matchMedia directly.",
    },
    cascadeExample: cascade(6),
    items,
  };
}

/** The full-ingest text: conventions + motion system + per-item summaries,
 * so an agent can absorb the whole system in one fetch. `agentsRules` is the
 * authored AGENTS.md markdown, injected by the caller (fs-free builder). */
export function buildLlmsFull(agentsRules: string): string {
  const meta = buildMachineMeta();
  const lines: string[] = [
    `# ${siteConfig.name} — full reference`,
    "",
    `> ${siteConfig.description}`,
    "",
    `Machine catalog: ${siteConfig.url}/registry-meta.json · MCP server: ${siteConfig.url}/mcp`,
    "",
    "## Operating rules (AGENTS.md)",
    "",
    agentsRules.trim(),
    "",
    "## Motion system",
    "",
    "Five calibrated springs — every animation uses one of them:",
    "",
    ...Object.entries(meta.motion.springs).map(
      ([name, s]) =>
        `- \`springs.${name}\` — stiffness ${s.stiffness}, damping ${s.damping}, mass ${s.mass} (ζ ${s.dampingRatio}, settles ~${s.settleMs}ms). ${s.role}`,
    ),
    "",
    `Cascade: ${meta.motion.cascadeRule}`,
    `Exits: ${meta.motion.exitRule}`,
    `Reduced motion: ${meta.motion.reducedMotion}`,
    "",
    "## Catalog",
    "",
    ...meta.items.flatMap((item) => {
      const out: string[] = [
        `### ${item.title}${item.serial ? ` (${item.serial})` : ""} — \`${item.slug}\``,
        item.tagline,
        "",
        item.description,
        "",
        `Install: \`${item.install.pnpm}\``,
      ];
      if (item.props && item.props.length > 0) {
        out.push("", "Props:");
        for (const p of item.props) {
          out.push(
            `- \`${p.name}\`: ${p.type}${p.defaultValue ? ` (default ${p.defaultValue})` : ""} — ${p.description}`,
          );
        }
      }
      if (item.usageNotes && item.usageNotes.length > 0) {
        out.push("", "Notes:");
        for (const n of item.usageNotes) out.push(`- ${n}`);
      }
      out.push("");
      return out;
    }),
  ];
  return lines.join("\n");
}

// ── validation schema (mirrored, package-local copy in the MCP server) ──────

const springSchema = z.object({
  stiffness: z.number(),
  damping: z.number(),
  mass: z.number(),
  dampingRatio: z.number(),
  settleMs: z.number(),
  role: z.string(),
});

const installSchema = z.object({
  pnpm: z.string(),
  npm: z.string(),
  yarn: z.string(),
  bun: z.string(),
  direct: z.string(),
});

const metaItemSchema = z.object({
  slug: z.string(),
  kind: z.enum(["component", "block", "shared"]),
  type: z.string(),
  title: z.string(),
  serial: z.string().optional(),
  tagline: z.string(),
  description: z.string(),
  categories: z.array(z.string()).optional(),
  keywords: z.array(z.string()),
  props: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        defaultValue: z.string().optional(),
        description: z.string(),
      }),
    )
    .optional(),
  usageNotes: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  registryDependencies: z.array(z.string().url()).optional(),
  docsUrl: z.string().url().optional(),
  registryItemUrl: z.string().url(),
  install: installSchema,
});

export const machineMetaSchema = z.object({
  $schema: z.string(),
  registry: z.object({
    name: z.string(),
    namespace: z.string(),
    homepage: z.string(),
    indexUrl: z.string().url(),
    docsUrl: z.string().url(),
    counts: z.object({
      components: z.number(),
      blocks: z.number(),
      shared: z.number(),
    }),
  }),
  motion: z.object({
    springs: z.record(z.string(), springSchema),
    tweens: z.object({
      durations: z.record(z.string(), z.number()),
      easings: z.record(z.string(), z.array(z.number())),
      distances: z.record(z.string(), z.number()),
    }),
    cascadeRule: z.string(),
    exitRule: z.string(),
    reducedMotion: z.string(),
  }),
  cascadeExample: z.number(),
  items: z.array(metaItemSchema),
});

export type MachineMeta = z.infer<typeof machineMetaSchema>;
export type MachineMetaItem = z.infer<typeof metaItemSchema>;
