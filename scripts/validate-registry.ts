/**
 * Validates every emitted public/r/*.json against a zod mirror of the
 * registry-item schema, and cross-checks the set of emitted files against
 * the manifest. Run after `pnpm generate`.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { allItems } from "../content/manifest";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "r");

const publishedItemSchema = z.object({
  name: z.string().min(1),
  type: z.string().startsWith("registry:"),
  title: z.string().min(1),
  description: z.string().min(1),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        type: z.string().startsWith("registry:"),
        content: z.string().min(1),
        target: z.string().optional(),
      }),
    )
    .min(1),
  dependencies: z.array(z.string()).optional(),
  registryDependencies: z.array(z.string().url()).optional(),
  categories: z.array(z.string()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

async function main() {
  const emitted = (await readdir(OUT_DIR).catch(() => [])).filter(
    (f) => f.endsWith(".json") && f !== "registry.json",
  );

  const expected = new Set(allItems.map((item) => `${item.name}.json`));
  const problems: string[] = [];

  for (const name of expected) {
    if (!emitted.includes(name)) problems.push(`missing artifact: r/${name}`);
  }
  for (const file of emitted) {
    if (!expected.has(file)) problems.push(`orphan artifact: r/${file}`);
  }

  for (const file of emitted) {
    const raw = await readFile(path.join(OUT_DIR, file), "utf8");
    const parsed = publishedItemSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      problems.push(`r/${file}: ${parsed.error.message}`);
    }
  }

  if (problems.length > 0) {
    console.error(`registry validation failed:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }

  console.log(`registry validation: ${emitted.length} artifact(s) OK`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
