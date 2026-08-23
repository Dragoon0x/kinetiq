import { z } from "zod";

/**
 * One record per distributable item. The registry fields mirror
 * registry-item.json exactly; site-only fields are stripped by
 * scripts/build-registry.ts before anything is published.
 *
 * NOTE: files in content/ and lib/ that scripts import must use relative
 * imports internally (tsx executes them outside the Next.js alias map).
 */

export const propRowSchema = z.object({
  name: z.string(),
  type: z.string(),
  defaultValue: z.string().optional(),
  description: z.string(),
});

export type PropRow = z.infer<typeof propRowSchema>;

export const registryFileSchema = z.object({
  /** Repo-relative path, e.g. "registry/ui/pressure-button.tsx". */
  path: z.string().regex(/^registry\//),
  type: z.enum([
    "registry:ui",
    "registry:component",
    "registry:block",
    "registry:hook",
    "registry:lib",
    "registry:file",
    "registry:page",
  ]),
  /**
   * Where the CLI writes the file in a consuming app. Optional for component
   * files, which land under the user's configured registry path — but
   * REQUIRED for registry:page and registry:file, which have no such default
   * and would otherwise be written nowhere. Enforced below.
   */
  target: z.string().optional(),
});

const baseKinetiqItemSchema = z.object({
  /** Slug. Doubles as the registry item name and the docs URL segment. */
  name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  type: z.enum([
    "registry:ui",
    "registry:block",
    "registry:hook",
    "registry:lib",
    "registry:file",
    "registry:page",
  ]),
  title: z.string(),
  description: z.string(),
  files: z.array(registryFileSchema).min(1),
  /** npm dependencies ("motion", "pkg@1.2.3"). */
  dependencies: z.array(z.string()).optional(),
  /** Sibling slugs; expanded to absolute /r/<slug>.json URLs at build time. */
  registryDependencies: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  meta: z
    .object({
      /**
       * Specimen serial, shown in docs, OG, and the registry.
       * KQ-### components · KB-### blocks and sections · KP-### pages.
       */
      serial: z.string().regex(/^K[QBP]-\d{3}$/),
    })
    .optional(),

  // ── site-only fields (never published) ────────────────────────────────
  /** Short line for cards, search results, and OG images. */
  tagline: z.string(),
  keywords: z.array(z.string()),
  props: z.array(propRowSchema).optional(),
  usageNotes: z.array(z.string()).optional(),
  /** Hide from nav/index while a piece is under construction. */
  draft: z.boolean().optional(),
});

/**
 * A page or a bare file has no default destination the way a component does,
 * so the CLI needs an explicit `target` or it has nowhere to write. Enforced
 * here rather than in a lint rule, so a page that forgets one cannot reach
 * the registry at all.
 */
export const kinetiqItemSchema = baseKinetiqItemSchema.superRefine(
  (item, ctx) => {
    for (const [index, file] of item.files.entries()) {
      const needsTarget =
        file.type === "registry:page" || file.type === "registry:file";
      if (needsTarget && !file.target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["files", index, "target"],
          message: `${file.type} requires a target path (e.g. "app/login/page.tsx") — the CLI has no default for it.`,
        });
      }
    }
  },
);

export type KinetiqItem = z.infer<typeof kinetiqItemSchema>;

/** Fields allowed through to the published registry item. */
export const REGISTRY_FIELDS = [
  "name",
  "type",
  "title",
  "description",
  "files",
  "dependencies",
  "registryDependencies",
  "categories",
  "meta",
] as const satisfies readonly (keyof KinetiqItem)[];
