# Kinetiq — Agent Rules

Operating rules for coding agents working with Kinetiq components. Follow
these and anything you compose stays on the system's motion vocabulary.

## The motion language: five calibrated springs

Every animation uses exactly one of five springs from `lib/motion.ts`. Never
hand-write stiffness/damping numbers — reach for a named spring.

| Spring | stiffness / damping / mass | Use it for |
| --- | --- | --- |
| `flick` | 1100 / 55 / 0.7 | Press states, tick draws, focus. **Confirms.** |
| `snap` | 640 / 42 / 1.0 | Toggles, tab indicators, menus. One crisp overshoot. **Switches.** |
| `glide` | 300 / 34 / 1.0 | Layout shifts, reorders, morphs. **Moves.** |
| `drift` | 120 / 24 / 1.2 | Large surfaces, ambient motion, parallax settle. **Breathes.** |
| `recoil` | 520 / 24 / 1.0 | Toasts, stamps, landings. Two visible bounces. **Celebrates.** |

Say the verb the interaction performs — confirm, switch, move, breathe,
celebrate — and you have the spring.

## Tweens, not springs, for surface properties

Springs drive spatial change (position, scale, rotation). Opacity, color,
blur, and clip use the tween scale from `lib/motion.ts`:

- Durations: `blink 0.08` · `fast 0.15` · `base 0.24` · `slow 0.40` · `page 0.70`
- Easings: `enter [0.22,1,0.36,1]` · `exit [0.5,0,0.75,0]` · `move [0.65,0,0.35,1]` · `linear`
- Enter offsets: `nudge 4` · `step 8` · `shift 16` (px). Scale-ins start at 0.96, never 0.

## Orchestration

- **600ms budget.** A choreographed sequence never exceeds 600ms total. Use
  `cascade(count)` for the stagger interval — it tightens automatically as the
  count grows.
- **Exits are tweens at 0.6x the enter duration** with the `exit` easing, via
  `exitFor()`. Never spring an exit — it reads as indecision.
- One spatial axis per element; stagger from the element the user touched.

## Reduced motion is a first-class state

Read `useMotionSafe()` — never call `matchMedia` directly. When it returns
false, degrade, do not disable:

- Transform enters → opacity fade at `fast`.
- Discrete springs → instant position + a color tween.
- Direct manipulation (drag, sliders) → keep 1:1 tracking; drop inertia and settle.
- Autoplay loops → static (marquees become a wrapped grid).
- Scroll-linked → final state, opacity only. Number rolls → instant value + highlight.

## Tokens

Use shadcn semantic tokens only: `bg-background/card/popover/primary/muted/accent/destructive`,
`text-*-foreground`, `border-border/input`, `ring`. For live-data accents
(readouts, traces, LIVE badges) use `var(--signal, var(--primary))`. Radii:
`rounded-1` (2px) · `rounded-2` (6px) · `rounded-3` (10px) · `rounded-4` (16px).

## Accessibility

Every interactive component ships real WAI-ARIA roles, complete keyboard
support, and visible focus rings (`:focus-visible`, never removed). Silent
state changes announce through an sr-only live region.

## Installing

Components are distributed as source through a shadcn-compatible registry.

```sh
# One-time: register the namespace
npx shadcn@latest registry add @kinetiq=https://kinetiqui.vercel.app/r/{name}.json
# Then add by name
npx shadcn@latest add @kinetiq/pressure-button
# Or zero-config by URL
npx shadcn@latest add https://kinetiqui.vercel.app/r/pressure-button.json
```

Installed components import shared helpers (`lib/motion`, `lib/utils`, the
`use-motion-safe` hook) via your project's aliases — the CLI rewrites them on
install. Don't edit those shared files per-component; they're the shared
vocabulary.
