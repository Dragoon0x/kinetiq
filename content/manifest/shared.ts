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
  {
    name: "motion",
    type: "registry:lib",
    title: "Calibration Set",
    description:
      "Kinetiq's five calibrated springs plus the tween scale, cascade budget, and exit rules — the shared physics vocabulary every component draws from.",
    files: [{ path: "registry/lib/motion.ts", type: "registry:lib" }],
    dependencies: ["motion"],
    tagline: "flick · snap · glide · drift · recoil.",
    keywords: ["spring", "easing", "physics", "tokens"],
  },
  {
    name: "use-motion-safe",
    type: "registry:hook",
    title: "useMotionSafe",
    description:
      "Single source of truth for reduced-motion decisions: combines the OS preference with an optional app-level override context.",
    files: [
      { path: "registry/hooks/use-motion-safe.ts", type: "registry:hook" },
    ],
    dependencies: ["motion"],
    tagline: "Reduced motion, decided once.",
    keywords: ["reduced motion", "accessibility"],
  },
];
