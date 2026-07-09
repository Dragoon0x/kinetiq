import { fileURLToPath } from "node:url";

/** The registry to read from. Override to point at a local site or a fork. */
export const REGISTRY_URL = (
  process.env.KINETIQ_REGISTRY_URL ?? "https://kinetiqui.vercel.app"
).replace(/\/$/, "");

/** How long to wait on the live registry before falling back to the snapshot. */
export const FETCH_TIMEOUT_MS = 3000;

/** Bundled offline snapshot (shipped in the package alongside dist/). */
export const snapshotPath = (file: string) =>
  fileURLToPath(new URL(`../snapshot/${file}`, import.meta.url));

export const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];
