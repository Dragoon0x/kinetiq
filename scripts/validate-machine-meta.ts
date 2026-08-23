/**
 * Validates public/registry-meta.json against the schema and cross-checks it
 * against the manifest + emitted registry artifacts. Run after pnpm generate.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { machineMetaSchema } from "../content/machine-meta";
import {
  allItems,
  catalogBlocks,
  catalogComponents,
  catalogPages,
  catalogTemplates,
  shared,
} from "../content/manifest";

const ROOT = path.resolve(import.meta.dirname, "..");
const META_PATH = path.join(ROOT, "public", "registry-meta.json");
const R_DIR = path.join(ROOT, "public", "r");

async function main() {
  const problems: string[] = [];

  if (!existsSync(META_PATH)) {
    console.error("registry-meta.json missing — run `pnpm generate` first.");
    process.exit(1);
  }

  const parsed = machineMetaSchema.safeParse(
    JSON.parse(await readFile(META_PATH, "utf8")),
  );
  if (!parsed.success) {
    console.error(
      `registry-meta.json schema invalid:\n${parsed.error.message}`,
    );
    process.exit(1);
  }
  const meta = parsed.data;

  // Counts match the manifest.
  if (meta.registry.counts.components !== catalogComponents.length) {
    problems.push("counts.components does not match the manifest");
  }
  if (meta.registry.counts.blocks !== catalogBlocks.length) {
    problems.push("counts.blocks does not match the manifest");
  }
  if (meta.registry.counts.pages !== catalogPages.length) {
    problems.push("counts.pages does not match the manifest");
  }
  if (meta.registry.counts.templates !== catalogTemplates.length) {
    problems.push("counts.templates does not match the manifest");
  }
  if (meta.registry.counts.shared !== shared.length) {
    problems.push("counts.shared does not match the manifest");
  }

  // Every non-draft item is present — derived from allItems rather than a
  // hand-written list of wings. Enumerating wings here is what let the whole
  // pages wing ship invisible to the machine catalog: the manifest knew about
  // them and this file did not.
  const emitted = new Set(meta.items.map((i) => i.slug));
  const expected = allItems.filter((item) => !item.draft);
  for (const item of expected) {
    if (!emitted.has(item.name)) {
      problems.push(`missing item: ${item.name}`);
    }
  }
  if (meta.items.length !== expected.length) {
    problems.push(
      `registry-meta.json holds ${meta.items.length} item(s) but the manifest has ${expected.length} non-draft item(s) — a wing is likely missing from the builder.`,
    );
  }

  // Counts must also sum to the whole, so a new wing cannot be counted
  // nowhere while every per-wing count still agrees with itself.
  const counted = Object.values(meta.registry.counts).reduce(
    (sum, n) => sum + n,
    0,
  );
  if (counted !== expected.length) {
    problems.push(
      `registry.counts sum to ${counted} but there are ${expected.length} non-draft items — a wing is missing from counts.`,
    );
  }

  // Each item's registry artifact exists and deps are absolute URLs.
  for (const item of meta.items) {
    if (!existsSync(path.join(R_DIR, `${item.slug}.json`))) {
      problems.push(
        `no registry artifact for ${item.slug} (r/${item.slug}.json)`,
      );
    }
    for (const dep of item.registryDependencies ?? []) {
      if (!dep.startsWith("http")) {
        problems.push(`${item.slug}: non-absolute registryDependency "${dep}"`);
      }
    }
  }

  if (meta.motion.springs.flick?.stiffness !== 1100) {
    problems.push("motion.springs.flick.stiffness drifted from 1100");
  }

  if (problems.length > 0) {
    console.error(
      `machine-meta validation failed:\n- ${problems.join("\n- ")}`,
    );
    process.exit(1);
  }

  console.log(`machine-meta validation: ${meta.items.length} item(s) OK`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
