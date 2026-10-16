"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { RotateCcw } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThemeFittingPalette = {
  /** The app's background. */
  canvas: string;
  /** Sidebar, title bar and cards. */
  panel: string;
  /** Tiles and quiet fills. */
  raised: string;
  ink: string;
  muted: string;
  line: string;
};

export type ThemeFittingTheme = {
  id: string;
  name: string;
  palette: ThemeFittingPalette;
};

export type ThemeFittingDensity = {
  id: string;
  name: string;
  /** Row height in the miniature, in em. */
  row: number;
  /** Tile padding in the miniature, in em. */
  pad: number;
};

export type ThemeFittingAccent = { id: string; name: string; color: string };

export type ThemeFittingValue = {
  /** A theme id, or "auto" to follow the system. */
  theme: string;
  density: string;
  accent: string;
};

export type ThemeFittingSwatchShape = "circle" | "square" | "chip";

export type ThemeFittingProps = {
  /** The app's themes. Their palettes are the app's own fixed colours, so the preview is true on any page. @default defaultThemeFittingThemes */
  themes?: ThemeFittingTheme[];
  /** Row spacing choices. @default defaultThemeFittingDensities */
  densities?: ThemeFittingDensity[];
  /** Accent choices. @default defaultThemeFittingAccents */
  accents?: ThemeFittingAccent[];
  /** Controlled appearance being tried on. */
  value?: ThemeFittingValue;
  /** Initial appearance when uncontrolled; also what Revert returns to until a save. @default defaultThemeFittingValue */
  defaultValue?: ThemeFittingValue;
  /** Fires with the whole appearance from the choice that changed it. */
  onValueChange?: (value: ThemeFittingValue) => void;
  /** What is saved, which Revert returns to. @default the last successful save */
  savedValue?: ThemeFittingValue;
  onThemeChange?: (themeId: string) => void;
  onDensityChange?: (densityId: string) => void;
  onAccentChange?: (accentId: string) => void;
  /** Save was pressed. Return a promise to show it saving; a rejection keeps the choice and says so. */
  onSave?: (value: ThemeFittingValue) => void | Promise<unknown>;
  /** Revert was pressed, with the saved appearance it returns to. */
  onRevert?: (value: ThemeFittingValue) => void;
  /** Offer Auto, which follows the system's light or dark setting. @default true */
  allowAuto?: boolean;
  /** The app in the miniature. @default "Coldbrook" */
  appName?: string;
  /** The miniature's zoom, 0.8 to 1.2: larger shows less of the app, bigger. @default 1 */
  previewScale?: number;
  /** Theme and accent swatches as circles, rounded squares, or labelled chips. @default "circle" */
  swatchShape?: ThemeFittingSwatchShape;
  /** How long the circular sweep takes, ms. @default 640 */
  revealSpeed?: number;
  /** Tallest the surface grows before its body scrolls, px. @default 552 */
  maxHeight?: number;
  /** Nothing can be chosen, reverted or saved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Coldbrook's own themes. Fixed colours: the miniature must look like the app, whatever the page around it. */
export const defaultThemeFittingThemes: ThemeFittingTheme[] = [
  {
    id: "light",
    name: "Light",
    palette: {
      canvas: "oklch(0.975 0.004 80)",
      panel: "oklch(0.995 0.002 80)",
      raised: "oklch(0.95 0.006 80)",
      ink: "oklch(0.26 0.02 60)",
      muted: "oklch(0.54 0.015 60)",
      line: "oklch(0.9 0.008 70)",
    },
  },
  {
    id: "dark",
    name: "Dark",
    palette: {
      canvas: "oklch(0.18 0.012 260)",
      panel: "oklch(0.215 0.014 260)",
      raised: "oklch(0.25 0.016 260)",
      ink: "oklch(0.94 0.008 260)",
      muted: "oklch(0.68 0.015 260)",
      line: "oklch(0.31 0.016 260)",
    },
  },
  {
    id: "paper",
    name: "Paper",
    palette: {
      canvas: "oklch(0.94 0.028 85)",
      panel: "oklch(0.965 0.022 88)",
      raised: "oklch(0.91 0.032 84)",
      ink: "oklch(0.31 0.04 60)",
      muted: "oklch(0.5 0.04 65)",
      line: "oklch(0.85 0.035 80)",
    },
  },
  {
    id: "night",
    name: "Night",
    palette: {
      canvas: "oklch(0.15 0.03 272)",
      panel: "oklch(0.185 0.035 274)",
      raised: "oklch(0.225 0.04 274)",
      ink: "oklch(0.91 0.03 85)",
      muted: "oklch(0.67 0.03 272)",
      line: "oklch(0.28 0.035 274)",
    },
  },
];

export const defaultThemeFittingDensities: ThemeFittingDensity[] = [
  { id: "compact", name: "Compact", row: 2.3, pad: 0.55 },
  { id: "default", name: "Default", row: 2.9, pad: 0.85 },
  { id: "roomy", name: "Roomy", row: 3.6, pad: 1.15 },
];

/** Coldbrook's brand accents, fixed like the themes. */
export const defaultThemeFittingAccents: ThemeFittingAccent[] = [
  { id: "cobalt", name: "Cobalt", color: "oklch(0.58 0.17 262)" },
  { id: "moss", name: "Moss", color: "oklch(0.6 0.12 150)" },
  { id: "amber", name: "Amber", color: "oklch(0.7 0.14 70)" },
  { id: "plum", name: "Plum", color: "oklch(0.56 0.15 330)" },
  { id: "graphite", name: "Graphite", color: "oklch(0.47 0.02 260)" },
];

const FALLBACK_THEME: ThemeFittingTheme = defaultThemeFittingThemes[0] ?? {
  id: "light",
  name: "Light",
  palette: {
    canvas: "oklch(0.975 0.004 80)",
    panel: "oklch(0.995 0.002 80)",
    raised: "oklch(0.95 0.006 80)",
    ink: "oklch(0.26 0.02 60)",
    muted: "oklch(0.54 0.015 60)",
    line: "oklch(0.9 0.008 70)",
  },
};
const FALLBACK_DENSITY: ThemeFittingDensity =
  defaultThemeFittingDensities[1] ?? {
    id: "default",
    name: "Default",
    row: 2.9,
    pad: 0.85,
  };
const FALLBACK_ACCENT: ThemeFittingAccent = defaultThemeFittingAccents[0] ?? {
  id: "cobalt",
  name: "Cobalt",
  color: "oklch(0.58 0.17 262)",
};

export const defaultThemeFittingValue: ThemeFittingValue = {
  theme: "light",
  density: "default",
  accent: "cobalt",
};

const ORDERS = [
  {
    who: "Ines Okafor",
    what: "Oat flat white ×2",
    state: "Ready",
    price: "$9.40",
  },
  {
    who: "Tomas Ferrer",
    what: "Cold brew, large",
    state: "Brewing",
    price: "$5.20",
  },
  {
    who: "Priya Nair",
    what: "Filter, Fernworks blend",
    state: "Ready",
    price: "$4.60",
  },
  { who: "Kenji Arai", what: "Cortado", state: "Queued", price: "$4.10" },
  {
    who: "Mara Lind",
    what: "Beans 250 g, Basin roast",
    state: "Packed",
    price: "$16.00",
  },
  { who: "Joel Varga", what: "Espresso ×3", state: "Brewing", price: "$8.70" },
  { who: "Sade Bello", what: "Chai, oat", state: "Queued", price: "$4.80" },
];
const NAV = ["Today", "Orders", "Menu", "Roastery", "Settings"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const same = (a: ThemeFittingValue, b: ThemeFittingValue) =>
  a.theme === b.theme && a.density === b.density && a.accent === b.accent;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const subscribeScheme = (cb: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(DARK_QUERY);
  list.addEventListener("change", cb);
  return () => list.removeEventListener("change", cb);
};
const schemeSnapshot = () =>
  typeof window !== "undefined" && !!window.matchMedia?.(DARK_QUERY).matches;
/** The server cannot see the system setting, so it, and hydration, assume light. */
const schemeServer = () => false;

/* ----------------------------------------------------------------------- */
/*                               The miniature                              */
/* ----------------------------------------------------------------------- */

function Miniature({
  palette,
  appName,
  density,
  motionSafe,
}: {
  palette: ThemeFittingPalette;
  appName: string;
  density: ThemeFittingDensity;
  motionSafe: boolean;
}) {
  const glide = motionSafe ? springs.glide : { duration: 0 };
  const colour =
    "transition-[background-color,color,border-color,stroke] duration-[240ms]";
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-clip text-[calc(clamp(6.5px,2.55cqw,11px)*var(--tf-scale))]"
      style={{ backgroundColor: palette.canvas, color: palette.ink }}
    >
      <div
        className="flex h-[2.4em] shrink-0 items-center gap-[0.45em] border-b px-[0.9em]"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-[0.55em] rounded-full"
            style={{ backgroundColor: palette.line }}
          />
        ))}
        <span
          className="mx-auto truncate text-[0.95em]"
          style={{ color: palette.muted }}
        >
          {appName} · Orders
        </span>
        <span className="w-[2.2em]" />
      </div>
      <div className="flex min-w-0 flex-1">
        <div
          className="flex w-[9.4em] shrink-0 flex-col gap-[0.3em] border-r p-[0.8em]"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <div className="mb-[0.5em] flex items-center gap-[0.5em]">
            <span
              className={cn(
                "size-[1.4em] rounded-[0.35em] bg-(--tf-accent)",
                colour,
              )}
            />
            <span className="truncate text-[1.05em] font-semibold">
              {appName}
            </span>
          </div>
          {NAV.map((n, i) => (
            <span
              key={n}
              className={cn(
                "flex h-[2.1em] items-center gap-[0.55em] rounded-[0.4em] px-[0.5em] text-[0.95em]",
                colour,
                i === 0 &&
                  "bg-[color-mix(in_oklab,var(--tf-accent)_16%,transparent)] text-(--tf-accent)",
              )}
            >
              <span
                className={cn(
                  "size-[0.85em] rounded-[0.25em]",
                  i === 0 ? "bg-(--tf-accent)" : "",
                  colour,
                )}
                style={i === 0 ? undefined : { backgroundColor: palette.line }}
              />
              <span className="truncate">{n}</span>
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[0.9em] p-[1.1em]">
          <div className="flex items-center justify-between gap-[0.6em]">
            <span className="truncate text-[1.35em] font-semibold">
              Today&apos;s orders
            </span>
            <span
              className={cn(
                "flex h-[2.1em] shrink-0 items-center rounded-[0.4em] bg-(--tf-accent) px-[0.8em] text-[0.9em] font-medium whitespace-nowrap text-primary-foreground",
                colour,
              )}
            >
              New order
            </span>
          </div>
          <div className="grid grid-cols-3 gap-[0.6em]">
            {[
              { k: "Orders", v: "128" },
              { k: "Revenue", v: "$4,210" },
              { k: "Avg wait", v: "3m 20s" },
            ].map((t, i) => (
              <motion.div
                key={t.k}
                className="flex min-w-0 flex-col rounded-[0.55em] px-[0.7em]"
                style={{ backgroundColor: palette.raised }}
                initial={false}
                animate={{
                  paddingTop: `${density.pad}em`,
                  paddingBottom: `${density.pad}em`,
                }}
                transition={glide}
              >
                <span
                  className="truncate text-[0.82em]"
                  style={{ color: palette.muted }}
                >
                  {t.k}
                </span>
                <span className="truncate text-[1.3em] font-semibold tabular-nums">
                  {t.v}
                </span>
                {i === 1 ? (
                  <svg
                    viewBox="0 0 60 14"
                    preserveAspectRatio="none"
                    className="mt-[0.3em] h-[1.1em] w-full"
                  >
                    <path
                      d="M0 11 L10 9 L20 10 L30 6 L40 7 L50 3 L60 4"
                      fill="none"
                      strokeWidth={1.6}
                      vectorEffect="non-scaling-stroke"
                      className={cn("stroke-(--tf-accent)", colour)}
                    />
                  </svg>
                ) : null}
              </motion.div>
            ))}
          </div>
          <div
            className="flex flex-col overflow-clip rounded-[0.55em] border"
            style={{
              backgroundColor: palette.panel,
              borderColor: palette.line,
            }}
          >
            {ORDERS.map((o, i) => (
              <motion.div
                key={o.who}
                className={cn(
                  "flex shrink-0 items-center gap-[0.7em] px-[0.8em]",
                  i > 0 && "border-t",
                )}
                style={{ borderColor: palette.line }}
                initial={false}
                animate={{ height: `${density.row}em` }}
                transition={glide}
              >
                <span
                  className="size-[1.5em] shrink-0 rounded-full"
                  style={{ backgroundColor: palette.raised }}
                />
                <span className="w-[7.5em] shrink-0 truncate text-[0.95em] font-medium">
                  {o.who}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[0.9em]"
                  style={{ color: palette.muted }}
                >
                  {o.what}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-[0.6em] py-[0.15em] text-[0.8em]",
                    colour,
                    o.state === "Ready"
                      ? "bg-[color-mix(in_oklab,var(--tf-accent)_18%,transparent)] text-(--tf-accent)"
                      : o.state === "Packed"
                        ? "border border-(--tf-accent) text-(--tf-accent)"
                        : "",
                  )}
                  style={
                    o.state === "Brewing"
                      ? {
                          backgroundColor: palette.raised,
                          color: palette.muted,
                        }
                      : o.state === "Queued"
                        ? { color: palette.muted }
                        : undefined
                  }
                >
                  {o.state}
                </span>
                <span className="w-[3.6em] shrink-0 text-right text-[0.9em] tabular-nums">
                  {o.price}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Where a sweep starts and how far it must reach, in percent of the
 * miniature (x of its width, y of its height, the radius of its diagonal
 * reference), so it needs no measuring once the handler has set it.
 */
type Sweep = { x: number; y: number; reach: number };
type Layer = {
  id: number;
  theme: string;
  /** Null for the base, which is never clipped. */
  from: Sweep | null;
};

/** A sweep from the middle, for changes no swatch started (the host's). */
const CENTRE: Sweep = { x: 50, y: 50, reach: 72 };

/**
 * One theme laid over the ones below it, clipped by a circle that grows from
 * the swatch that chose it. The clip is a tween — a clip has no mass — and
 * when it covers the box the layer becomes the base and the ones under it go.
 */
function RevealLayer({
  layer,
  speed,
  motionSafe,
  onDone,
  children,
}: {
  layer: Layer;
  speed: number;
  motionSafe: boolean;
  onDone: (id: number) => void;
  children: React.ReactNode;
}) {
  const r = useMotionValue(0);
  const fade = useMotionValue(motionSafe ? 1 : 0);
  const from = layer.from;
  const clipPath = useTransform(r, (v) =>
    from ? `circle(${r1(v)}% at ${r1(from.x)}% ${r1(from.y)}%)` : "none",
  );
  const done = React.useRef(onDone);
  React.useEffect(() => {
    done.current = onDone;
  });

  React.useEffect(() => {
    if (!from) {
      fade.jump(1);
      return;
    }
    let alive = true;
    if (!motionSafe) {
      r.jump(from.reach);
      fade.jump(0);
    } else {
      fade.jump(1);
    }
    const c = motionSafe
      ? animate(r, from.reach, { duration: speed / 1000, ease: easings.move })
      : animate(fade, 1, { duration: durations.fast, ease: easings.enter });
    void c.then(() => {
      if (alive) done.current(layer.id);
    });
    return () => {
      alive = false;
      c.stop();
    };
  }, [from, layer.id, motionSafe, speed, r, fade]);

  return (
    <motion.div
      aria-hidden
      className="absolute inset-0"
      style={{ clipPath, opacity: fade }}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Controls                                 */
/* ----------------------------------------------------------------------- */

type Option = { id: string; name: string };

/**
 * A radiogroup's keyboard: arrows move and select, wrapping; Home and End
 * jump. Focus follows the choice because the checked radio is the one tab stop.
 */
function useRadioKeys(
  options: Option[],
  current: string,
  choose: (id: string, node: HTMLElement | null) => void,
  nodes: React.RefObject<Map<string, HTMLButtonElement>>,
) {
  return (event: React.KeyboardEvent) => {
    const i = Math.max(
      0,
      options.findIndex((o) => o.id === current),
    );
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = options.length - 1;
    else return;
    event.preventDefault();
    const next = options[(to + options.length) % options.length];
    if (!next) return;
    const node = nodes.current.get(next.id) ?? null;
    node?.focus();
    choose(next.id, node);
  };
}

/* ----------------------------------------------------------------------- */
/*                                 The panel                                */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };
type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * An Appearance panel beside a miniature of the app it dresses. Choosing a
 * theme sweeps it across the miniature as a circle growing from the chosen
 * swatch — a clip on a tween of `revealSpeed` — so the new look arrives from
 * the hand that asked for it; density reflows the miniature's rows and tiles
 * on `springs.glide`; an accent recolours its accent parts on a short colour
 * tween. Revert sweeps everything back from the Revert button. Auto follows
 * the system setting and sweeps from its own swatch when the system flips.
 *
 * Theme, Density and Accent are radiogroups whose arrows move and select;
 * Save reports through `onSave` and a failed save keeps the choice on and
 * says so. Under reduced motion the new theme cross-fades, rows settle at
 * once, and the thumbs and ticks appear without travel.
 */
export function ThemeFitting({
  themes = defaultThemeFittingThemes,
  densities = defaultThemeFittingDensities,
  accents = defaultThemeFittingAccents,
  value,
  defaultValue = defaultThemeFittingValue,
  onValueChange,
  savedValue,
  onThemeChange,
  onDensityChange,
  onAccentChange,
  onSave,
  onRevert,
  allowAuto = true,
  appName = "Coldbrook",
  previewScale = 1,
  swatchShape = "circle",
  revealSpeed = 640,
  maxHeight = 552,
  disabled = false,
  className,
}: ThemeFittingProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const themeLabel = `${uid}-theme`;
  const densityLabel = `${uid}-density`;
  const accentLabel = `${uid}-accent`;
  const systemDark = React.useSyncExternalStore(
    subscribeScheme,
    schemeSnapshot,
    schemeServer,
  );

  /* ------------------------------- state -------------------------------- */

  const [own, setOwn] = React.useState<ThemeFittingValue>(defaultValue);
  const current = value ?? own;
  const [ownSaved, setOwnSaved] = React.useState<ThemeFittingValue>(
    () => value ?? defaultValue,
  );
  const saved = savedValue ?? ownSaved;
  const dirty = !same(current, saved);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const themeOf = (id: string) =>
    themes.find((t) => t.id === id) ?? themes[0] ?? FALLBACK_THEME;
  const autoTheme = systemDark
    ? (themes.find((t) => t.id === "dark") ?? themeOf(""))
    : (themes.find((t) => t.id === "light") ?? themeOf(""));
  const resolveTheme = (id: string) =>
    id === "auto" && allowAuto ? autoTheme : themeOf(id);
  const shownTheme = resolveTheme(current.theme);
  const density =
    densities.find((d) => d.id === current.density) ??
    densities[0] ??
    FALLBACK_DENSITY;
  const accent =
    accents.find((a) => a.id === current.accent) ??
    accents[0] ??
    FALLBACK_ACCENT;

  /* ------------------------------ layers -------------------------------- */

  const miniRef = React.useRef<HTMLDivElement | null>(null);
  const [layers, setLayers] = React.useState<Layer[]>(() => [
    { id: 0, theme: shownTheme.id, from: null },
  ]);
  const [pending, setPending] = React.useState<{
    theme: string;
    from: Sweep;
  } | null>(null);
  const topTheme = layers[layers.length - 1]?.theme;

  // A change of the theme on show — a choice, a revert, the system flipping
  // under Auto, or the host — adds a layer. Its origin was measured by the
  // handler that caused it; a change no handler caused sweeps from the middle.
  if (topTheme !== shownTheme.id) {
    const from = pending?.theme === shownTheme.id ? pending.from : CENTRE;
    const id = (layers[layers.length - 1]?.id ?? 0) + 1;
    const next: Layer = { id, theme: shownTheme.id, from };
    // At most three sweeps stacked; the oldest under way gives up its place.
    const kept =
      layers.length >= 3 ? [...layers.slice(0, 1), ...layers.slice(2)] : layers;
    setLayers([...kept, next]);
    setPending(null);
  }

  /** Measures a sweep from `node` (a swatch, Revert) across the miniature. */
  const measure = (node: HTMLElement | null): Sweep => {
    const box = miniRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return CENTRE;
    const src = node?.getBoundingClientRect();
    const x = src ? src.left + src.width / 2 - box.left : box.width / 2;
    const y = src ? src.top + src.height / 2 - box.top : box.height / 2;
    const reach = Math.max(
      Math.hypot(x, y),
      Math.hypot(box.width - x, y),
      Math.hypot(x, box.height - y),
      Math.hypot(box.width - x, box.height - y),
    );
    const basis = Math.sqrt((box.width ** 2 + box.height ** 2) / 2);
    return {
      x: r1((x / box.width) * 100),
      y: r1((y / box.height) * 100),
      reach: r1(((reach + 2) / basis) * 100),
    };
  };

  // The system flipping under Auto sweeps from the Auto swatch.
  const latest = React.useRef({ theme: current.theme, themes, allowAuto });
  React.useEffect(() => {
    latest.current = { theme: current.theme, themes, allowAuto };
  });
  const themeNodes = React.useRef(new Map<string, HTMLButtonElement>());
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const list = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      const now = latest.current;
      if (now.theme !== "auto" || !now.allowAuto) return;
      const target =
        now.themes.find((t) => t.id === (event.matches ? "dark" : "light")) ??
        now.themes[0];
      if (!target) return;
      setPending({
        theme: target.id,
        from: measure(themeNodes.current.get("auto") ?? null),
      });
    };
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);

  const settleLayer = React.useCallback((id: number) => {
    setLayers((list) => {
      const at = list.findIndex((l) => l.id === id);
      if (at < 0) return list;
      const top = list[at];
      if (!top) return list;
      return [{ ...top, from: null }, ...list.slice(at + 1)];
    });
  }, []);

  /* ------------------------------ actions ------------------------------- */

  const commit = (
    next: ThemeFittingValue,
    origin: HTMLElement | null,
    announce: string,
  ) => {
    if (disabled) return;
    if (same(next, current)) return;
    const shownNext = resolveTheme(next.theme);
    if (shownNext.id !== shownTheme.id) {
      setPending({ theme: shownNext.id, from: measure(origin) });
    }
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    if (next.theme !== current.theme) onThemeChange?.(next.theme);
    if (next.density !== current.density) onDensityChange?.(next.density);
    if (next.accent !== current.accent) onAccentChange?.(next.accent);
    if (saveState !== "saving") setSaveState("idle");
    say(announce);
  };

  const themeOptions: Option[] = [
    ...themes.map((t) => ({ id: t.id, name: t.name })),
    ...(allowAuto ? [{ id: "auto", name: "Auto" }] : []),
  ];
  const nameOfTheme = (id: string) =>
    id === "auto"
      ? `Auto, now ${autoTheme.name.toLowerCase()}`
      : themeOf(id).name;

  const chooseTheme = (id: string, node: HTMLElement | null) =>
    commit({ ...current, theme: id }, node, `Trying on ${nameOfTheme(id)}.`);
  const chooseDensity = (id: string, node: HTMLElement | null) =>
    commit(
      { ...current, density: id },
      node,
      `${densities.find((d) => d.id === id)?.name ?? id} rows.`,
    );
  const chooseAccent = (id: string, node: HTMLElement | null) =>
    commit(
      { ...current, accent: id },
      node,
      `${accents.find((a) => a.id === id)?.name ?? id} accent.`,
    );

  const revertRef = React.useRef<HTMLButtonElement | null>(null);
  const revert = () => {
    if (disabled || !dirty) return;
    commit(saved, revertRef.current, "Back to the saved appearance.");
    onRevert?.(saved);
  };

  const alive = React.useRef(true);
  const latestSaved = React.useRef(savedValue);
  React.useEffect(() => {
    latestSaved.current = savedValue;
  });
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const save = () => {
    if (disabled || !dirty || saveState === "saving") return;
    const snapshot = current;
    const ok = () => {
      if (!alive.current) return;
      if (latestSaved.current === undefined) setOwnSaved(snapshot);
      setSaveState("saved");
      say("Appearance saved.");
    };
    let result: void | Promise<unknown>;
    try {
      result = onSave?.(snapshot);
    } catch (e) {
      result = Promise.reject(e);
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaveState("saving");
      (result as Promise<unknown>).then(ok, () => {
        if (!alive.current) return;
        setSaveState("failed");
        say("Couldn't save. Your choice is still on; try again.");
      });
    } else {
      ok();
    }
  };

  const densityNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const accentNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const onThemeKeys = useRadioKeys(
    themeOptions,
    current.theme,
    chooseTheme,
    themeNodes,
  );
  const onDensityKeys = useRadioKeys(
    densities,
    current.density,
    chooseDensity,
    densityNodes,
  );
  const onAccentKeys = useRadioKeys(
    accents,
    current.accent,
    chooseAccent,
    accentNodes,
  );

  /* ------------------------------- render ------------------------------- */

  const scale = clamp(previewScale, 0.6, 1.5);
  const shape =
    swatchShape === "square"
      ? "rounded-2"
      : swatchShape === "chip"
        ? "rounded-full"
        : "rounded-full";
  const chip = swatchShape === "chip";
  const snap = motionSafe ? springs.snap : { duration: 0 };
  const miniLabel = `Preview of ${appName} in ${shownTheme.name}${
    current.theme === "auto" ? " (following the system)" : ""
  }, ${density.name.toLowerCase()} rows, ${accent.name.toLowerCase()} accent.`;

  const status =
    saveState === "saving"
      ? "Saving…"
      : saveState === "failed"
        ? "Couldn't save. Your choice is still on; try again."
        : dirty
          ? `Trying on ${nameOfTheme(current.theme)} · not saved`
          : saveState === "saved"
            ? "Saved"
            : "This is what you have saved";

  const swatchFill = (t: ThemeFittingTheme) =>
    `linear-gradient(135deg, ${t.palette.canvas} 0 52%, ${t.palette.panel} 52% 100%)`;
  const autoFill = `linear-gradient(135deg, ${themeOf("light").palette.canvas} 0 50%, ${themeOf("dark").palette.canvas} 50% 100%)`;

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container/theme-fitting flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ maxHeight }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            Appearance
          </p>
          <p className="truncate text-[11px] text-ink-3">
            How {appName} looks on this device
          </p>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto overscroll-contain p-4 @min-[36rem]/theme-fitting:grid-cols-[1.3fr_1fr] @min-[36rem]/theme-fitting:gap-6">
        <div className="relative">
          <div
            ref={miniRef}
            role="img"
            aria-label={miniLabel}
            className="@container relative aspect-[16/10] w-full overflow-clip rounded-3 border border-hairline-strong shadow-[0_10px_30px_-12px_color-mix(in_oklab,black_35%,transparent)] @min-[36rem]/theme-fitting:aspect-[4/3.2]"
            style={
              {
                "--tf-accent": accent.color,
                "--tf-scale": scale,
              } as React.CSSProperties
            }
          >
            {layers.map((layer) => (
              <RevealLayer
                key={layer.id}
                layer={layer}
                speed={clamp(revealSpeed, 100, 3000)}
                motionSafe={motionSafe}
                onDone={settleLayer}
              >
                <Miniature
                  palette={themeOf(layer.theme).palette}
                  appName={appName}
                  density={density}
                  motionSafe={motionSafe}
                />
              </RevealLayer>
            ))}
          </div>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-2 right-2 inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-popover px-2.5 text-[11px] font-medium text-foreground shadow-sm"
            initial={false}
            animate={{
              opacity: dirty ? 1 : 0,
              y: dirty || !motionSafe ? 0 : -4,
            }}
            transition={{
              opacity: { duration: durations.fast, ease: easings.enter },
              y: snap,
            }}
          >
            <span className="size-1.5 rounded-full bg-cobalt-bright" />
            Trying on
          </motion.span>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p id={themeLabel} className="text-[12px] font-medium text-ink-2">
              Theme
            </p>
            <div
              role="radiogroup"
              aria-labelledby={themeLabel}
              onKeyDown={onThemeKeys}
              className={cn(
                "flex flex-wrap",
                chip ? "gap-1.5" : "gap-x-3 gap-y-2",
              )}
            >
              {themeOptions.map((o) => {
                const on = current.theme === o.id;
                const fill =
                  o.id === "auto" ? autoFill : swatchFill(themeOf(o.id));
                return (
                  <button
                    key={o.id}
                    ref={(node) => {
                      if (node) themeNodes.current.set(o.id, node);
                      else themeNodes.current.delete(o.id);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={
                      o.id === "auto"
                        ? `Auto, follows the system (now ${autoTheme.name.toLowerCase()})`
                        : `${o.name} theme`
                    }
                    aria-disabled={disabled || undefined}
                    tabIndex={on ? 0 : -1}
                    onClick={(e) => chooseTheme(o.id, e.currentTarget)}
                    className={cn(
                      "group/theme-fitting-swatch relative flex shrink-0 items-center",
                      chip
                        ? "h-8 gap-2 rounded-full border border-hairline pr-3 pl-1.5 text-[12px]"
                        : "flex-col gap-1.5 rounded-2",
                      chip && on && "border-transparent",
                      FOCUS_RING,
                    )}
                  >
                    <span
                      className={cn(
                        "relative block shrink-0 border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)]",
                        chip ? "size-5 rounded-full" : `size-9 ${shape}`,
                      )}
                      style={{ backgroundImage: fill }}
                    >
                      {on ? (
                        <motion.span
                          layoutId={`${uid}-theme-ring`}
                          className={cn(
                            "absolute border-2 border-cobalt-bright",
                            chip
                              ? "hidden"
                              : `-inset-[4px] ${swatchShape === "square" ? "rounded-[9px]" : "rounded-full"}`,
                          )}
                          transition={snap}
                        />
                      ) : null}
                    </span>
                    {chip && on ? (
                      <motion.span
                        layoutId={`${uid}-theme-chip`}
                        className="absolute inset-0 rounded-full border-2 border-cobalt-bright"
                        transition={snap}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative text-[11px] leading-none transition-colors",
                        chip && "text-[12px]",
                        on
                          ? "text-foreground"
                          : "text-ink-3 group-hover/theme-fitting-swatch:text-ink-2",
                      )}
                    >
                      {o.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p id={densityLabel} className="text-[12px] font-medium text-ink-2">
              Density
            </p>
            <div
              role="radiogroup"
              aria-labelledby={densityLabel}
              onKeyDown={onDensityKeys}
              className="grid grid-cols-3 rounded-2 border border-hairline bg-surface-2 p-0.5"
            >
              {densities.map((d) => {
                const on = current.density === d.id;
                return (
                  <button
                    key={d.id}
                    ref={(node) => {
                      if (node) densityNodes.current.set(d.id, node);
                      else densityNodes.current.delete(d.id);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-disabled={disabled || undefined}
                    tabIndex={on ? 0 : -1}
                    onClick={(e) => chooseDensity(d.id, e.currentTarget)}
                    className={cn(
                      "relative h-7 min-w-0 rounded-[5px] px-2 text-[12px] transition-colors",
                      on ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                      FOCUS_RING,
                    )}
                  >
                    {on ? (
                      <motion.span
                        layoutId={`${uid}-density`}
                        className="absolute inset-0 rounded-[5px] border border-hairline bg-card shadow-sm"
                        transition={snap}
                      />
                    ) : null}
                    <span className="relative block truncate">{d.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p id={accentLabel} className="text-[12px] font-medium text-ink-2">
              Accent
            </p>
            <div
              role="radiogroup"
              aria-labelledby={accentLabel}
              onKeyDown={onAccentKeys}
              className={cn("flex flex-wrap", chip ? "gap-1.5" : "gap-2.5")}
            >
              {accents.map((a) => {
                const on = current.accent === a.id;
                return (
                  <button
                    key={a.id}
                    ref={(node) => {
                      if (node) accentNodes.current.set(a.id, node);
                      else accentNodes.current.delete(a.id);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${a.name} accent`}
                    aria-disabled={disabled || undefined}
                    tabIndex={on ? 0 : -1}
                    onClick={(e) => chooseAccent(a.id, e.currentTarget)}
                    className={cn(
                      "relative flex shrink-0 items-center",
                      chip
                        ? cn(
                            "h-7 gap-1.5 rounded-full border pr-2.5 pl-1 text-[12px] transition-colors",
                            on
                              ? "border-transparent text-foreground"
                              : "border-hairline text-ink-3 hover:text-ink-2",
                          )
                        : cn("size-7 justify-center", shape),
                      FOCUS_RING,
                    )}
                  >
                    {on ? (
                      <motion.span
                        layoutId={`${uid}-accent-ring`}
                        className={cn(
                          "absolute border-2",
                          chip
                            ? "inset-0 rounded-full"
                            : `-inset-[3px] ${swatchShape === "square" ? "rounded-[9px]" : "rounded-full"}`,
                        )}
                        style={{ borderColor: a.color }}
                        transition={snap}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative flex shrink-0 items-center justify-center",
                        chip ? "size-5 rounded-full" : `size-7 ${shape}`,
                      )}
                      style={{ backgroundColor: a.color }}
                    >
                      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
                        <motion.path
                          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                          fill="none"
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="stroke-primary-foreground"
                          initial={false}
                          animate={{
                            pathLength: on ? 1 : 0,
                            opacity: on ? 1 : 0,
                          }}
                          transition={
                            motionSafe ? springs.flick : { duration: 0 }
                          }
                        />
                      </svg>
                    </span>
                    {chip ? <span className="relative">{a.name}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
        <p
          className={cn(
            "min-w-0 flex-1 basis-40 text-[12px] leading-snug",
            saveState === "failed" ? "text-danger" : "text-ink-3",
          )}
        >
          {status}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            ref={revertRef}
            type="button"
            onClick={revert}
            aria-disabled={disabled || !dirty || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs transition-colors",
              disabled || !dirty
                ? "cursor-default text-ink-3"
                : "text-foreground hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Revert
          </button>
          <button
            type="button"
            onClick={save}
            aria-disabled={
              disabled || !dirty || saveState === "saving" || undefined
            }
            aria-busy={saveState === "saving" || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3.5 text-xs font-medium transition-colors",
              disabled || !dirty
                ? "cursor-default border border-hairline text-ink-3"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
              FOCUS_RING,
            )}
          >
            {saveState === "saving"
              ? "Saving…"
              : !dirty && saveState === "saved"
                ? "Saved"
                : "Save"}
          </button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
