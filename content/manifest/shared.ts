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
    keywords: [
      "utils",
      "cn",
      "clsx",
      "tailwind-merge",
      "class names",
      "helper",
    ],
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
  {
    name: "spatial",
    type: "registry:lib",
    title: "Spatial Set",
    description:
      "The shared geometry vocabulary of the spatial instruments — house perspective range, angle detents, contact-lift shadows, orbit projection, and deterministic seeding.",
    files: [{ path: "registry/lib/spatial.ts", type: "registry:lib" }],
    tagline: "Perspective, detents, orbits, lift.",
    keywords: ["spatial", "3d", "perspective", "geometry", "orbit"],
  },
  {
    name: "use-pointer-tilt",
    type: "registry:hook",
    title: "usePointerTilt",
    description:
      "Normalized pointer tracking mapped to sprung tilt values — the house idiom for pointer-driven perspective, with an underdamped rebalance on leave and a fine-pointer gate.",
    files: [
      { path: "registry/hooks/use-pointer-tilt.ts", type: "registry:hook" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["motion"],
    tagline: "Pointer → sprung perspective.",
    keywords: ["tilt", "pointer", "3d", "parallax", "hook"],
  },
  {
    name: "agents-rules",
    type: "registry:file",
    title: "Agent Rules",
    description:
      "Kinetiq's operating rules for coding agents: the five-spring motion language, the tween scale, the 600ms cascade budget, the reduced-motion policy, token usage, and composition guidance. Installs as AGENTS.md at your repo root so your agent stays on the system's vocabulary.",
    files: [
      {
        path: "registry/files/agents-rules.md",
        type: "registry:file",
        target: "AGENTS.md",
      },
    ],
    tagline: "The design-system operating rules for agents.",
    keywords: ["agents", "conventions", "rules", "motion language", "mcp"],
  },
  {
    name: "agent-skill",
    type: "registry:file",
    title: "Agent Skill",
    description:
      "A packaged skill that teaches a coding agent the whole system in one install: discovering the catalog through MCP or the machine metadata, picking components by the verb their spring performs, installing by serial or slug, and composing under the five-spring doctrine. Installs to .claude/skills/kinetiq/SKILL.md; pairs with the agents-rules item, which carries the full operating rules.",
    files: [
      {
        path: "registry/files/kinetiq-skill/SKILL.md",
        type: "registry:file",
        target: ".claude/skills/kinetiq/SKILL.md",
      },
    ],
    tagline: "The library, taught to your agent.",
    keywords: ["skill", "agent", "mcp", "claude", "distribution", "install"],
  },
];
