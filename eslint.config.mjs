import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".generated/**",
      "public/r/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Distribution purity: registry code ships to user repos and may only
    // depend on itself (the CLI rewrites @/registry/* aliases on install).
    files: ["registry/**/*.ts", "registry/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/components/*", "@/content/*", "@/lib/*"],
              message:
                "registry/ code must only import from @/registry/* so it stays installable in user projects.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
