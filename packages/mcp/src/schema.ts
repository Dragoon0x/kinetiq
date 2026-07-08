import { z } from "zod";

/**
 * Package-local copy of the machine-catalog schema. Kept self-contained so
 * the server is publishable/runnable without the site source. Mirrors
 * content/machine-meta.ts in the Kinetiq repo.
 */

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

export const metaItemSchema = z.object({
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
  registryDependencies: z.array(z.string()).optional(),
  docsUrl: z.string().optional(),
  registryItemUrl: z.string(),
  install: installSchema,
});

export const machineMetaSchema = z.object({
  $schema: z.string(),
  registry: z.object({
    name: z.string(),
    namespace: z.string(),
    homepage: z.string(),
    indexUrl: z.string(),
    docsUrl: z.string(),
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
