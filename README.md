# Kinetiq

**Motion, calibrated.**

Kinetiq is a React component library where every animation shares five
calibrated springs — `flick`, `snap`, `glide`, `drift`, `recoil` — so every
interaction speaks the same physics. Components are distributed as source
through a shadcn-compatible registry: one command, and the code lands in your
repo, not ours.

## Development

```bash
pnpm install
pnpm generate   # build registry JSON, extract sources, build search index
pnpm dev
```

## Quality gates

```bash
pnpm check      # generate + typecheck + lint + registry validation
pnpm test:e2e   # Playwright suite
```

## Structure

- `registry/` — the single source of truth for every distributable component,
  block, hook, and lib. The site's live previews import these files directly;
  the registry build inlines the same bytes into `public/r/*.json`.
- `content/manifest/` — one typed record per item; drives docs pages, the
  registry, search, OG images, and `llms.txt`.
- `app/` — the documentation site.
- `scripts/` — registry/source/search build pipeline.
