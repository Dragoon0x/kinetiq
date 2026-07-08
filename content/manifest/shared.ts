import type { KinetiqItem } from "./types";

/**
 * Hooks and libs distributed as registryDependencies of the catalog items
 * (the calibration set, cn, shared hooks). Not shown in the docs nav.
 */
export const shared: KinetiqItem[] = [
  {
    name: "utils",
    type: "registry:lib",
    title: "Utils",
    description: "Class-name composition helper shared by every component.",
    files: [{ path: "registry/lib/utils.ts", type: "registry:lib" }],
    dependencies: ["clsx", "tailwind-merge"],
    tagline: "cn() — class composition.",
    keywords: [],
  },
];
