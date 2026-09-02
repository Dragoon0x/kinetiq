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
  {
    name: "figure",
    type: "registry:lib",
    title: "Figure runtime",
    description:
      "The lazy 3D runtime behind the figures: loads three and its loaders after mount, builds preset shapes or sniffs a GLB, glTF, SVG, or image by its bytes, and stages the object under studio light with orbit and idle motion.",
    files: [{ path: "registry/lib/figure.ts", type: "registry:lib" }],
    dependencies: ["three"],
    registryDependencies: [],
    tagline: "Three, loaded only when a figure asks for it.",
    keywords: ["3d", "three", "gltf", "glb", "svg", "figure", "runtime"],
  },
  {
    name: "paint",
    type: "registry:lib",
    title: "Paint",
    description:
      "The DOM painter behind the effects wing: rasterises a live subtree \u2014 backgrounds, borders, text laid out by the browser itself, images, inline SVG \u2014 onto a canvas so a shader can sample the interface as a texture. Every browser, no experimental flag; what it will and will not paint is a stated contract.",
    files: [{ path: "registry/lib/paint.ts", type: "registry:lib" }],
    tagline: "The interface, painted so a shader can hold it.",
    keywords: ["effects", "paint", "canvas", "texture", "rasterise", "dom"],
  },
  {
    name: "glsl",
    type: "registry:lib",
    title: "GLSL Helper",
    description:
      "The WebGL2 vocabulary every effect composes: programs with useful error output, uniform setting by arity, a fullscreen pass with DOM-oriented texture coordinates, indexed grid meshes for cloth and tiles, framebuffers that fall back from half-float to bytes and say so, resize, context loss, and disposal that deletes exactly what it made.",
    files: [{ path: "registry/lib/glsl.ts", type: "registry:lib" }],
    tagline: "A shader is the whole effect; this is the rest.",
    keywords: ["effects", "webgl", "glsl", "shader", "framebuffer", "mesh"],
  },
  {
    name: "use-painted-surface",
    type: "registry:hook",
    title: "usePaintedSurface",
    description:
      "Owns a painter for a ref and mirrors its version into React, so an effect uploads a texture only after a completed paint and never samples a half-drawn one.",
    files: [
      { path: "registry/hooks/use-painted-surface.ts", type: "registry:hook" },
    ],
    registryDependencies: ["paint"],
    tagline: "A texture you can trust the version of.",
    keywords: ["effects", "paint", "hook", "texture"],
  },
];
