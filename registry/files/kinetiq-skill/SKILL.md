---
name: kinetiq
description: Find, pick, and install Kinetiq motion components — 200+ animated React instruments, sections, pages, and templates with one shared spring language. Use when the user asks for animated UI, motion components, landing sections, or anything from the Kinetiq registry.
---

# Kinetiq

Kinetiq is a free, public registry of animated React components ("instruments"),
section assemblies, full pages, and multi-page templates. Everything shares one
motion doctrine — five calibrated springs — so pieces composed together feel
machined from one piece. The code installs into the user's repo; nothing is a
black box.

## Discover

Prefer the MCP server when it is connected (`@kinetiqui/mcp`, or the hosted
endpoint at https://kinetiq.dev/mcp): use its search tool to query the
catalog by keyword, kind, or serial, and its item tool to fetch full metadata —
props, usage notes, install commands, and dependency lists.

Without MCP, fetch the machine catalog directly:

- `https://kinetiq.dev/registry-meta.json` — every item with props,
  usage notes, serials, taglines, and per-package-manager install commands.
- `https://kinetiq.dev/llms-full.txt` — the whole system as one document:
  operating rules, the motion language, and per-item summaries.

Serials are stable ids: `KQ-…` components, `KB-…` blocks and sections,
`KP-…` pages, `KT-…` templates. When the user names a serial, resolve it via
the catalog rather than guessing the slug.

## Pick

- Match the **verb**, not the noun: Kinetiq springs are named for what an
  interaction does — flick confirms, snap switches, glide moves, drift
  breathes, recoil celebrates. A component whose tagline matches the user's
  intent will compose better than one whose title merely sounds right.
- Sections (`KB-3xx`) are full-width page bands; card blocks (`KB-1xx`) are
  self-contained surfaces; templates (`KT-…`) assemble whole routed pages —
  `template-causeway` installs several routes in one command.
- Do not rebuild what the catalog ships: compose `readout` for rolling
  numerals, `spark-chart` for tiny trends, `pressure-button` for primary
  actions, the `vignette-*` scenes for hero imagery that runs itself.

## Install

Use the shadcn CLI with the user's package manager:

```bash
npx shadcn@latest add @kinetiq/<slug>
```

or the direct URL form:

```bash
npx shadcn@latest add https://kinetiq.dev/r/<slug>.json
```

Dependencies resolve automatically — registry items declare their own
`registryDependencies`, so installing a section brings the instruments it
seats.

## Compose

After installing, follow the repo's `AGENTS.md` if the `agents-rules` item is
installed (add it with `npx shadcn@latest add @kinetiq/agents-rules`). The
short version:

- Every animation uses one of the five named springs from `lib/motion.ts` —
  never hand-written stiffness/damping numbers.
- Choreography stays under a 600ms budget via `cascade(count)`; exits are
  tweens at 0.6× the enter duration, never springs.
- `useMotionSafe()` gates all motion; reduced motion is a designed state, not
  an off switch.
- Server-render deterministically: no `Date.now()` or randomness in render —
  anchor dates and pre-formatted strings come in as props.
