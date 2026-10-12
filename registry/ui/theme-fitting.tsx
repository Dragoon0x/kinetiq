"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Check,
  Columns2,
  Monitor,
  Moon,
  RotateCcw,
  Search,
  Shirt,
  Sun,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThemeDensity = "compact" | "cozy" | "roomy";
export type ThemeContrast = "standard" | "high";
export type ThemeScheme = "light" | "dark" | "system";
export type ThemeScreen = "table" | "inbox" | "editor";
export type ThemeStatus = "ready" | "loading" | "error";

export type ThemeAccent = {
  id: string;
  label: string;
  /** Any CSS colour. An oklch() keeps its character on both the light and the dark mannequin. */
  color: string;
};

/** One appearance: everything the fitting room can change. */
export type ThemeDraft = {
  /** An accent's id. */
  accent: string;
  /** Corner radius in px, 0 to 16. */
  radius: number;
  density: ThemeDensity;
  contrast: ThemeContrast;
  scheme: ThemeScheme;
};

export type ThemePreset = { id: string; label: string; value: ThemeDraft };

export type ThemeField = keyof ThemeDraft;

export type ThemeChange = {
  /** The control that changed it; "preset" loaded a whole one, "undo" put the kept theme back. */
  source: ThemeField | "preset" | "undo";
  from: ThemeDraft;
  to: ThemeDraft;
  /** The preset's id when `source` is "preset". */
  preset?: string;
};

export type ThemeFittingProps = {
  /** Controlled draft: the theme being tried. */
  value?: ThemeDraft;
  /** Initial draft when uncontrolled; also the first kept theme. @default defaultThemeDraft */
  defaultValue?: ThemeDraft;
  /** Fires from the press, drag or key that changed the draft. */
  onChange?: (value: ThemeDraft, change: ThemeChange) => void;
  /** Keep was pressed: the draft is now the kept theme. */
  onCommit?: (value: ThemeDraft) => void;
  /** Undo was pressed, with the kept theme that came back. */
  onUndo?: (value: ThemeDraft) => void;
  /** Whole themes offered as chips above the controls. @default defaultThemePresets */
  presets?: ThemePreset[];
  /** The accent swatches, in row order. @default defaultThemeAccents */
  accents?: ThemeAccent[];
  /** Which miniature app the mannequin wears: an orders table, an inbox or a page editor. @default "table" */
  screen?: ThemeScreen;
  /** Controlled: the mannequin is split into the kept theme and the draft. */
  compare?: boolean;
  /** Initial split when uncontrolled. @default false */
  defaultCompare?: boolean;
  /** The Compare switch was pressed. */
  onCompareChange?: (compare: boolean) => void;
  /** Controlled: the draft is worn by the fitting room's own chrome. */
  tryOn?: boolean;
  /** Initial try-on when uncontrolled. @default false */
  defaultTryOn?: boolean;
  /** The Try it on switch was pressed. */
  onTryOnChange?: (tryOn: boolean) => void;
  /** Row height and spacing of the fitting room's own controls, until the draft is tried on. @default "cozy" */
  density?: ThemeDensity;
  /** Whether the presets and the kept theme have arrived. @default "ready" */
  status?: ThemeStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Appearance" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the controls scroll inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be changed, kept or undone. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultThemeAccents: ThemeAccent[] = [
  { id: "cobalt", label: "Cobalt", color: "oklch(0.52 0.2 262)" },
  { id: "teal", label: "Teal", color: "oklch(0.56 0.12 192)" },
  { id: "moss", label: "Moss", color: "oklch(0.56 0.13 148)" },
  { id: "ember", label: "Ember", color: "oklch(0.6 0.18 42)" },
  { id: "plum", label: "Plum", color: "oklch(0.52 0.18 322)" },
  { id: "graphite", label: "Graphite", color: "oklch(0.42 0.02 258)" },
];

/** Coldbrook as it ships: cobalt, 8 px corners, cozy, following the system. */
export const defaultThemeDraft: ThemeDraft = {
  accent: "cobalt",
  radius: 8,
  density: "cozy",
  contrast: "standard",
  scheme: "system",
};

export const defaultThemePresets: ThemePreset[] = [
  { id: "coldbrook", label: "Coldbrook", value: defaultThemeDraft },
  {
    id: "slate",
    label: "Slate",
    value: {
      accent: "graphite",
      radius: 3,
      density: "compact",
      contrast: "high",
      scheme: "light",
    },
  },
  {
    id: "ember",
    label: "Ember",
    value: {
      accent: "ember",
      radius: 12,
      density: "roomy",
      contrast: "standard",
      scheme: "light",
    },
  },
  {
    id: "night",
    label: "Night shift",
    value: {
      accent: "teal",
      radius: 6,
      density: "cozy",
      contrast: "high",
      scheme: "dark",
    },
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const RADIUS_MAX = 16;
const STAMP_MS = 1400;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

const DARK_QUERY = "(prefers-color-scheme: dark)";
const canMatch = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";
const subscribeDark = (onChange: () => void) => {
  if (!canMatch()) return () => {};
  const list = window.matchMedia(DARK_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};
const getDark = () => canMatch() && window.matchMedia(DARK_QUERY).matches;
const getDarkServer = () => false;

/** True when two drafts would dress the mannequin the same. */
export const sameThemeDraft = (a: ThemeDraft, b: ThemeDraft) =>
  a.accent === b.accent &&
  a.radius === b.radius &&
  a.density === b.density &&
  a.contrast === b.contrast &&
  a.scheme === b.scheme;

const DENSITY_WORD: Record<ThemeDensity, string> = {
  compact: "Compact",
  cozy: "Cozy",
  roomy: "Roomy",
};
const SCHEME_WORD: Record<ThemeScheme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** The mannequin's row height and padding, per density. */
const M_ROW: Record<ThemeDensity, number> = {
  compact: 18,
  cozy: 22,
  roomy: 27,
};
const M_PAD: Record<ThemeDensity, number> = { compact: 6, cozy: 8, roomy: 11 };
/** The fitting room's own control height and section gap, per density. */
const C_ROW: Record<ThemeDensity, number> = {
  compact: 26,
  cozy: 30,
  roomy: 34,
};
const C_GAP: Record<ThemeDensity, number> = {
  compact: 10,
  cozy: 14,
  roomy: 18,
};

type Skin = {
  dark: boolean;
  bg0: string;
  bg1: string;
  bg2: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentBright: string;
  accentWash: string;
  accentFg: string;
  radius: number;
  row: number;
  pad: number;
};

/**
 * Fixed oklch surfaces, so the mannequin wears its own light or dark whatever
 * the page is wearing. High contrast deepens the inks and the hairlines and
 * gives the accent a little more chroma.
 */
function resolveSkin(
  draft: ThemeDraft,
  accents: ThemeAccent[],
  osDark: boolean,
): Skin {
  const dark = draft.scheme === "dark" || (draft.scheme === "system" && osDark);
  const high = draft.contrast === "high";
  const base =
    accents.find((a) => a.id === draft.accent)?.color ??
    accents[0]?.color ??
    "oklch(0.52 0.2 262)";
  const lift = dark ? 0.1 : 0;
  const chroma = high ? 1.15 : 1;
  const accent = `oklch(from ${base} calc(l + ${lift}) calc(c * ${chroma}) h)`;
  const common = {
    accent,
    accentBright: `oklch(from ${base} calc(l + ${lift + 0.06}) calc(c * ${chroma}) h)`,
    accentWash: `oklch(from ${base} calc(l + ${lift}) c h / ${dark ? 0.18 : 0.12})`,
    accentFg: "oklch(0.985 0.005 258)",
    radius: clamp(Math.round(draft.radius), 0, RADIUS_MAX),
    row: M_ROW[draft.density],
    pad: M_PAD[draft.density],
  };
  if (dark) {
    return {
      dark,
      bg0: "oklch(0.15 0.02 258)",
      bg1: "oklch(0.185 0.022 258)",
      bg2: "oklch(0.225 0.024 258)",
      ink: high ? "oklch(0.99 0.004 258)" : "oklch(0.94 0.008 258)",
      ink2: high ? "oklch(0.86 0.01 258)" : "oklch(0.72 0.015 258)",
      ink3: high ? "oklch(0.72 0.015 258)" : "oklch(0.55 0.02 258)",
      line: high ? "oklch(0.92 0.02 258 / 0.28)" : "oklch(0.92 0.02 258 / 0.1)",
      lineStrong: high
        ? "oklch(0.92 0.02 258 / 0.5)"
        : "oklch(0.92 0.02 258 / 0.18)",
      ...common,
    };
  }
  return {
    dark,
    bg0: "oklch(0.975 0.004 258)",
    bg1: "oklch(1 0 0)",
    bg2: "oklch(0.955 0.006 258)",
    ink: high ? "oklch(0.1 0.02 258)" : "oklch(0.22 0.02 258)",
    ink2: high ? "oklch(0.3 0.02 258)" : "oklch(0.47 0.02 258)",
    ink3: high ? "oklch(0.42 0.02 258)" : "oklch(0.58 0.02 258)",
    line: high ? "oklch(0.25 0.03 258 / 0.3)" : "oklch(0.25 0.03 258 / 0.1)",
    lineStrong: high
      ? "oklch(0.25 0.03 258 / 0.5)"
      : "oklch(0.25 0.03 258 / 0.2)",
    ...common,
  };
}

/** Re-resolves the page's token set against a skin, so the chrome wears it. */
function chromeVars(skin: Skin): Record<string, string> {
  return {
    "--bg-0": skin.bg0,
    "--bg-1": skin.bg1,
    "--bg-2": skin.bg2,
    "--ink": skin.ink,
    "--ink-2": skin.ink2,
    "--ink-3": skin.ink3,
    "--hairline": skin.line,
    "--hairline-strong": skin.lineStrong,
    "--accent": skin.accent,
    "--accent-bright": skin.accentBright,
    "--accent-wash": skin.accentWash,
    "--background": skin.bg0,
    "--foreground": skin.ink,
    "--card": skin.bg1,
    "--card-foreground": skin.ink,
    "--popover": skin.bg2,
    "--popover-foreground": skin.ink,
    "--primary": skin.accent,
    "--primary-foreground": skin.accentFg,
    "--secondary": skin.bg2,
    "--secondary-foreground": skin.ink,
    "--muted": skin.bg1,
    "--muted-foreground": skin.ink2,
    "--border": skin.line,
    "--input": skin.lineStrong,
    "--ring": skin.accent,
  };
}

/** Arrow, Home and End movement inside a roving group; null for other keys. */
const stepIndex = (key: string, i: number, n: number): number | null => {
  if (n === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (i + 1) % n;
  if (key === "ArrowLeft" || key === "ArrowUp") return (i - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return null;
};

const describe = (draft: ThemeDraft, accents: ThemeAccent[]) => {
  const accent =
    accents.find((a) => a.id === draft.accent)?.label ?? draft.accent;
  return `${accent} accent, ${draft.radius} px corners, ${DENSITY_WORD[draft.density].toLowerCase()} density, ${draft.contrast} contrast, ${SCHEME_WORD[draft.scheme].toLowerCase()} theme`;
};

/* ----------------------------------------------------------------------- */
/*                                 Mannequin                                */
/* ----------------------------------------------------------------------- */

type ScreenCopy = {
  nav: string[];
  title: string;
  primary: string;
  cardTitle: string;
  cardText: string;
};

const SCREENS: Record<ThemeScreen, ScreenCopy> = {
  table: {
    nav: ["Orders", "Customers", "Stock", "Reports", "Settings"],
    title: "Orders",
    primary: "New order",
    cardTitle: "Low stock alerts",
    cardText: "Tell the floor when a line runs short",
  },
  inbox: {
    nav: ["Inbox", "Starred", "Sent", "Drafts", "Archive"],
    title: "Inbox",
    primary: "Compose",
    cardTitle: "Smart replies",
    cardText: "Suggest a reply under each message",
  },
  editor: {
    nav: ["Pages", "Assets", "Styles", "History", "Share"],
    title: "Spring menu",
    primary: "Publish",
    cardTitle: "Auto-save",
    cardText: "Keep a draft every thirty seconds",
  },
};

const TABLE_ROWS = [
  {
    ref: "SO-2041",
    name: "Fernmoor Grocers",
    status: "Paid",
    total: "1,240.00",
  },
  { ref: "SO-2042", name: "Basinworks Cafe", status: "Open", total: "386.50" },
  {
    ref: "SO-2043",
    name: "Harbour Lane Deli",
    status: "Draft",
    total: "92.00",
  },
] as const;

const INBOX_ROWS = [
  {
    from: "Mara Lind",
    initials: "ML",
    subject: "Spring menu proofs",
    time: "09:12",
    unread: true,
  },
  {
    from: "Tomas Reyes",
    initials: "TR",
    subject: "Invoice SO-2041 paid",
    time: "08:40",
    unread: false,
  },
  {
    from: "Priya Nair",
    initials: "PN",
    subject: "Shift swap on Friday",
    time: "Yesterday",
    unread: false,
  },
] as const;

const EDITOR_ROWS = [
  { head: 56, lines: [92, 74] },
  { head: 40, lines: [88, 61] },
  { head: 48, lines: [80, 52] },
] as const;

/** Cross-fades colour on the mannequin; `--m-fade` is 0 under reduced motion. */
const M_FADE = "transition-colors duration-(--m-fade)";

const sBg1 = { background: "var(--m-bg1)" };
const sBg2 = { background: "var(--m-bg2)" };
const sInk2 = { color: "var(--m-ink2)" };
const sInk3 = { color: "var(--m-ink3)" };
const sLine = { borderColor: "var(--m-line)" };

type Morph = typeof springs.glide | { duration: number };

/** The raised panel the rows sit in; its corners morph with the draft. */
function Panel({
  skin,
  morph,
  padded,
  children,
}: {
  skin: Skin;
  morph: Morph;
  padded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={cn("flex shrink-0 flex-col overflow-hidden border", M_FADE)}
      style={{ ...sBg1, ...sLine }}
      initial={false}
      animate={
        padded
          ? { borderRadius: skin.radius, padding: skin.pad }
          : { borderRadius: skin.radius }
      }
      transition={morph}
    >
      {children}
    </motion.div>
  );
}

function TableRows({ skin, morph }: { skin: Skin; morph: Morph }) {
  const rs = Math.min(skin.radius, 8);
  return (
    <Panel skin={skin} morph={morph}>
      <motion.div
        className={cn(
          "grid grid-cols-[2.4rem_minmax(0,1fr)_2.6rem_2.8rem] items-center gap-1 border-b px-2 font-mono text-[7px] tracking-[0.06em] uppercase",
          M_FADE,
        )}
        style={{ ...sInk3, ...sLine }}
        initial={false}
        animate={{ height: Math.max(14, skin.row - 6) }}
        transition={morph}
      >
        <span>Ref</span>
        <span>Order</span>
        <span>Status</span>
        <span className="text-right">Total</span>
      </motion.div>
      {TABLE_ROWS.map((row, i) => (
        <motion.div
          key={row.ref}
          className={cn(
            "grid grid-cols-[2.4rem_minmax(0,1fr)_2.6rem_2.8rem] items-center gap-1 px-2 text-[8px]",
            i < TABLE_ROWS.length - 1 && "border-b",
            M_FADE,
          )}
          style={sLine}
          initial={false}
          animate={{ height: skin.row }}
          transition={morph}
        >
          <span className="font-mono text-[7px]" style={sInk3}>
            {row.ref}
          </span>
          <span className="truncate">{row.name}</span>
          <motion.span
            className={cn(
              "inline-flex h-3 w-fit items-center px-1 text-[6.5px] font-semibold",
              row.status === "Draft" && "border",
              M_FADE,
            )}
            style={
              row.status === "Paid"
                ? {
                    background: "var(--m-accent-wash)",
                    color: "var(--m-accent)",
                  }
                : row.status === "Open"
                  ? { ...sBg2, ...sInk2 }
                  : { borderColor: "var(--m-line-strong)", ...sInk3 }
            }
            initial={false}
            animate={{ borderRadius: Math.min(rs, 6) }}
            transition={morph}
          >
            {row.status}
          </motion.span>
          <span className="text-right font-mono text-[7px] tabular-nums">
            {row.total}
          </span>
        </motion.div>
      ))}
    </Panel>
  );
}

function InboxRows({ skin, morph }: { skin: Skin; morph: Morph }) {
  return (
    <Panel skin={skin} morph={morph}>
      {INBOX_ROWS.map((row, i) => (
        <motion.div
          key={row.from}
          className={cn(
            "flex items-center gap-1.5 px-2 text-[8px]",
            i < INBOX_ROWS.length - 1 && "border-b",
            M_FADE,
          )}
          style={sLine}
          initial={false}
          animate={{ height: skin.row + 6 }}
          transition={morph}
        >
          <span
            aria-hidden
            className={cn("size-1 shrink-0 rounded-full", M_FADE)}
            style={{
              background: row.unread ? "var(--m-accent)" : "transparent",
            }}
          />
          <span
            className={cn(
              "flex size-3.5 shrink-0 items-center justify-center rounded-full text-[5.5px] font-semibold",
              M_FADE,
            )}
            style={{ ...sBg2, ...sInk2 }}
          >
            {row.initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-none">
            <span className={cn("truncate", row.unread && "font-semibold")}>
              {row.from}
            </span>
            <span className="truncate text-[7px]" style={sInk3}>
              {row.subject}
            </span>
          </span>
          <span className="font-mono text-[6.5px]" style={sInk3}>
            {row.time}
          </span>
        </motion.div>
      ))}
    </Panel>
  );
}

function EditorRows({ skin, morph }: { skin: Skin; morph: Morph }) {
  const rs = Math.min(skin.radius, 4);
  return (
    <Panel skin={skin} morph={morph} padded>
      {EDITOR_ROWS.map((block, i) => (
        <motion.div
          key={i}
          className="flex flex-col justify-center gap-[3px]"
          initial={false}
          animate={{ height: skin.row + 4 }}
          transition={morph}
        >
          <motion.span
            className={cn("h-[5px]", M_FADE)}
            style={{ width: `${block.head}%`, background: "var(--m-ink)" }}
            initial={false}
            animate={{ borderRadius: rs }}
            transition={morph}
          />
          {block.lines.map((w, j) => (
            <motion.span
              key={j}
              className={cn("h-[3px] opacity-60", M_FADE)}
              style={{ width: `${w}%`, background: "var(--m-ink3)" }}
              initial={false}
              animate={{ borderRadius: rs }}
              transition={morph}
            />
          ))}
        </motion.div>
      ))}
    </Panel>
  );
}

type MannequinProps = {
  draft: ThemeDraft;
  accents: ThemeAccent[];
  screen: ThemeScreen;
  osDark: boolean;
  motionSafe: boolean;
  /** The preview's accessible name, e.g. "Preview, after". */
  name: string;
};

/**
 * A miniature app screen that wears a draft: sidebar, toolbar, three rows,
 * a card with a toggle and a primary button. Colours cross-fade, corners and
 * row heights morph on springs.glide.
 */
function Mannequin({
  draft,
  accents,
  screen,
  osDark,
  motionSafe,
  name,
}: MannequinProps) {
  const skin = resolveSkin(draft, accents, osDark);
  const copy = SCREENS[screen];
  const morph = motionSafe ? springs.glide : { duration: 0 };
  const r = skin.radius;
  const rs = Math.min(r, 8);
  const frame = Math.min(r + 4, 18);
  const vars: Record<string, string> = {
    "--m-bg0": skin.bg0,
    "--m-bg1": skin.bg1,
    "--m-bg2": skin.bg2,
    "--m-ink": skin.ink,
    "--m-ink2": skin.ink2,
    "--m-ink3": skin.ink3,
    "--m-line": skin.line,
    "--m-line-strong": skin.lineStrong,
    "--m-accent": skin.accent,
    "--m-accent-wash": skin.accentWash,
    "--m-accent-fg": skin.accentFg,
    "--m-fade": motionSafe ? `${durations.base}s` : "0s",
  };

  return (
    <motion.div
      role="img"
      aria-label={`${name}: ${describe(draft, accents)}`}
      className={cn(
        "@container absolute inset-0 flex overflow-hidden border select-none",
        M_FADE,
      )}
      style={{
        ...vars,
        background: "var(--m-bg0)",
        color: "var(--m-ink)",
        borderColor: "var(--m-line-strong)",
        colorScheme: skin.dark ? "dark" : "light",
      }}
      initial={false}
      animate={{ borderRadius: frame }}
      transition={morph}
    >
      <div aria-hidden className="contents">
        {/* Sidebar: brand, five destinations, the first one active. */}
        <aside
          className={cn(
            "hidden w-[4.6rem] shrink-0 flex-col border-r @min-[20rem]:flex",
            M_FADE,
          )}
          style={{ ...sBg1, ...sLine }}
        >
          <div className="flex h-7 items-center gap-1.5 px-2">
            <motion.span
              className={cn("size-3 shrink-0", M_FADE)}
              style={{ background: "var(--m-accent)" }}
              initial={false}
              animate={{ borderRadius: Math.min(r, 6) }}
              transition={morph}
            />
            <span className="truncate text-[8.5px] font-semibold">
              Coldbrook
            </span>
          </div>
          <div className="flex flex-col gap-px px-1.5 pt-0.5">
            {copy.nav.map((item, i) => (
              <motion.span
                key={item}
                className={cn(
                  "flex items-center px-1.5 text-[7.5px]",
                  i === 0 && "font-semibold",
                  M_FADE,
                )}
                style={{
                  color: i === 0 ? "var(--m-accent)" : "var(--m-ink2)",
                  background: i === 0 ? "var(--m-accent-wash)" : "transparent",
                }}
                initial={false}
                animate={{ height: skin.row, borderRadius: rs }}
                transition={morph}
              >
                {item}
              </motion.span>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar: title, a search field, the primary button. */}
          <motion.div
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b",
              M_FADE,
            )}
            style={{ ...sBg1, ...sLine }}
            initial={false}
            animate={{
              height: skin.row + 10,
              paddingLeft: skin.pad,
              paddingRight: skin.pad,
            }}
            transition={morph}
          >
            <span className="truncate text-[9px] font-semibold">
              {copy.title}
            </span>
            <motion.span
              className={cn(
                "ml-auto hidden h-4 w-16 items-center gap-1 border px-1.5 text-[7px] @min-[17rem]:flex",
                M_FADE,
              )}
              style={{ ...sBg2, ...sInk3, ...sLine }}
              initial={false}
              animate={{ borderRadius: rs }}
              transition={morph}
            >
              <Search className="size-2" />
              Search
            </motion.span>
            <motion.span
              className={cn(
                "ml-auto flex h-4 shrink-0 items-center px-1.5 text-[7px] font-semibold whitespace-nowrap @min-[17rem]:ml-0",
                M_FADE,
              )}
              style={{
                background: "var(--m-accent)",
                color: "var(--m-accent-fg)",
              }}
              initial={false}
              animate={{ borderRadius: rs }}
              transition={morph}
            >
              {copy.primary}
            </motion.span>
          </motion.div>

          <motion.div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            initial={false}
            animate={{ padding: skin.pad, gap: skin.pad }}
            transition={morph}
          >
            {screen === "table" ? (
              <TableRows skin={skin} morph={morph} />
            ) : screen === "inbox" ? (
              <InboxRows skin={skin} morph={morph} />
            ) : (
              <EditorRows skin={skin} morph={morph} />
            )}

            {/* The card, with a toggle that is on. */}
            <motion.div
              className={cn(
                "flex shrink-0 items-center gap-2 border px-2",
                M_FADE,
              )}
              style={{ ...sBg1, ...sLine }}
              initial={false}
              animate={{
                borderRadius: r,
                height: skin.row + 14,
                paddingLeft: skin.pad,
                paddingRight: skin.pad,
              }}
              transition={morph}
            >
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[8px] font-semibold">
                  {copy.cardTitle}
                </span>
                <span className="truncate text-[7px]" style={sInk3}>
                  {copy.cardText}
                </span>
              </span>
              <span
                className={cn(
                  "relative h-3 w-[22px] shrink-0 rounded-full",
                  M_FADE,
                )}
                style={{ background: "var(--m-accent)" }}
              >
                <span
                  className="absolute top-0.5 right-0.5 size-2 rounded-full"
                  style={{ background: "var(--m-accent-fg)" }}
                />
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Controls                                 */
/* ----------------------------------------------------------------------- */

type SegmentOption<T extends string> = {
  id: T;
  label: string;
  icon?: React.ReactNode;
};

type SegmentedProps<T extends string> = {
  /** Namespaces the sliding indicator's layoutId. */
  name: string;
  uid: string;
  labelId: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  inert: boolean;
  motionSafe: boolean;
};

/** A radiogroup drawn as one bar; its indicator slides on springs.snap. */
function Segmented<T extends string>({
  name,
  uid,
  labelId,
  options,
  value,
  onChange,
  inert,
  motionSafe,
}: SegmentedProps<T>) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const stop = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  const select = (i: number) => {
    const option = options[i];
    if (!option) return;
    onChange(option.id);
    nodes.current.get(option.id)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={cn(
        "relative grid h-(--tf-row) rounded-(--tf-r) border border-hairline bg-surface-1 p-0.5",
        "transition-colors duration-(--tf-fade)",
      )}
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option, i) => {
        const checked = option.id === value;
        return (
          <button
            key={option.id}
            ref={(node) => {
              if (node) nodes.current.set(option.id, node);
              else nodes.current.delete(option.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === stop ? 0 : -1}
            aria-disabled={inert || undefined}
            onClick={() => {
              if (!inert) onChange(option.id);
            }}
            onKeyDown={(event) => {
              const to = stepIndex(event.key, i, options.length);
              if (to === null) return;
              event.preventDefault();
              if (!inert) select(to);
            }}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-1 rounded-[calc(var(--tf-r)_-_2px)] px-1 text-xs transition-colors duration-(--tf-fade)",
              checked ? "text-foreground" : "text-ink-2 hover:text-foreground",
              inert ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {checked ? (
              <motion.span
                aria-hidden
                layoutId={`${uid}-${name}-indicator`}
                initial={false}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className="absolute inset-0 rounded-[calc(var(--tf-r)_-_2px)] border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)]"
              />
            ) : null}
            <span className="relative z-10 flex min-w-0 items-center gap-1">
              {option.icon}
              <span className="truncate">{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

type SwatchesProps = {
  uid: string;
  labelId: string;
  accents: ThemeAccent[];
  value: string;
  onChange: (id: string) => void;
  inert: boolean;
  motionSafe: boolean;
};

/** The accent radiogroup; the chosen ring glides between swatches on springs.snap. */
function Swatches({
  uid,
  labelId,
  accents,
  value,
  onChange,
  inert,
  motionSafe,
}: SwatchesProps) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const stop = Math.max(
    0,
    accents.findIndex((a) => a.id === value),
  );
  const select = (i: number) => {
    const accent = accents[i];
    if (!accent) return;
    onChange(accent.id);
    nodes.current.get(accent.id)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="flex min-h-(--tf-row) flex-wrap items-center gap-x-3 gap-y-2.5 px-1 py-1"
    >
      {accents.map((accent, i) => {
        const checked = accent.id === value;
        return (
          <button
            key={accent.id}
            ref={(node) => {
              if (node) nodes.current.set(accent.id, node);
              else nodes.current.delete(accent.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={accent.label}
            title={accent.label}
            tabIndex={i === stop ? 0 : -1}
            aria-disabled={inert || undefined}
            onClick={() => {
              if (!inert) onChange(accent.id);
            }}
            onKeyDown={(event) => {
              const to = stepIndex(event.key, i, accents.length);
              if (to === null) return;
              event.preventDefault();
              if (!inert) select(to);
            }}
            className={cn(
              "relative flex size-6 shrink-0 items-center justify-center rounded-full",
              inert ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
            style={{ background: accent.color }}
          >
            {checked ? (
              <motion.span
                aria-hidden
                layoutId={`${uid}-accent-ring`}
                initial={false}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className="absolute -inset-[3px] rounded-full border-2"
                style={{ borderColor: accent.color }}
              />
            ) : null}
            {checked ? (
              <svg aria-hidden viewBox="0 0 14 14" className="relative size-3">
                <motion.path
                  d="M3 7.4 5.8 10 11 4.2"
                  fill="none"
                  stroke="oklch(0.985 0.005 258)"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
            ) : null}
          </button>
        );
      })}
      {accents.length === 0 ? (
        <span className="text-[11px] text-ink-3">
          No accents to choose from
        </span>
      ) : null}
    </div>
  );
}

type RadiusSliderProps = {
  labelId: string;
  value: number;
  onChange: (value: number) => void;
  inert: boolean;
  motionSafe: boolean;
};

/** The corner radius slider: drag the track or step it with the arrows. */
function RadiusSlider({
  labelId,
  value,
  onChange,
  inert,
  motionSafe,
}: RadiusSliderProps) {
  const dragId = React.useRef<number | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const pct = r3((clamp(value, 0, RADIUS_MAX) / RADIUS_MAX) * 100);

  const read = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const inner = rect.width - 16;
    if (inner <= 0) return;
    const p = clamp((event.clientX - rect.left - 8) / inner, 0, 1);
    onChange(Math.round(p * RADIUS_MAX));
  };

  return (
    <div className="flex items-center gap-3">
      <div
        role="slider"
        tabIndex={inert ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={RADIUS_MAX}
        aria-valuenow={value}
        aria-valuetext={`${value} px`}
        aria-disabled={inert || undefined}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 4 : 1;
          let next: number | null = null;
          if (event.key === "ArrowRight" || event.key === "ArrowUp")
            next = value + step;
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
            next = value - step;
          else if (event.key === "PageUp") next = value + 4;
          else if (event.key === "PageDown") next = value - 4;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = RADIUS_MAX;
          if (next === null) return;
          event.preventDefault();
          if (!inert) onChange(clamp(next, 0, RADIUS_MAX));
        }}
        onPointerDown={(event) => {
          if (inert || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragId.current = event.pointerId;
          setDragging(true);
          event.currentTarget.focus({ preventScroll: true });
          read(event);
        }}
        onPointerMove={(event) => {
          if (dragId.current !== event.pointerId) return;
          read(event);
        }}
        onPointerUp={(event) => {
          if (dragId.current !== event.pointerId) return;
          dragId.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          dragId.current = null;
          setDragging(false);
        }}
        className={cn(
          "relative h-(--tf-row) min-w-0 flex-1 touch-none rounded-2",
          inert ? "cursor-not-allowed" : "cursor-pointer",
          FOCUS_RING,
        )}
      >
        <div aria-hidden className="absolute inset-x-2 inset-y-0">
          <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2 transition-colors duration-(--tf-fade)" />
          <motion.span
            className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-cobalt transition-colors duration-(--tf-fade)"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={
              dragging || !motionSafe ? { duration: 0 } : springs.snap
            }
          />
          <motion.span
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline-strong bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_18%,transparent)] transition-colors duration-(--tf-fade)"
            initial={false}
            animate={{ left: `${pct}%`, scale: dragging ? 1.15 : 1 }}
            transition={
              dragging || !motionSafe
                ? { duration: 0, scale: springs.flick }
                : springs.snap
            }
          />
        </div>
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-ink-2 tabular-nums">
        {value} px
      </span>
      <motion.span
        aria-hidden
        className="size-5 shrink-0 border border-hairline-strong bg-surface-2 transition-colors duration-(--tf-fade)"
        initial={false}
        animate={{ borderRadius: Math.min(value, 10) }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      />
    </div>
  );
}

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  inert: boolean;
  motionSafe: boolean;
  id?: string;
};

function Switch({
  checked,
  onChange,
  label,
  inert,
  motionSafe,
  id,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={inert || undefined}
      onClick={() => {
        if (!inert) onChange(!checked);
      }}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-(--tf-fade)",
        checked
          ? "border-primary bg-primary"
          : "border-hairline-strong bg-surface-2",
        inert ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className={cn(
          "absolute top-0.5 left-0.5 size-3.5 rounded-full shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)] transition-colors duration-(--tf-fade)",
          checked ? "bg-primary-foreground" : "bg-ink-3",
        )}
        initial={false}
        animate={{ x: checked ? 16 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </button>
  );
}

type PresetsProps = {
  labelId: string;
  presets: ThemePreset[];
  current: ThemeDraft;
  onPick: (preset: ThemePreset) => void;
  inert: boolean;
};

/** Whole themes as chips; the one the draft matches is checked. */
function Presets({ labelId, presets, current, onPick, inert }: PresetsProps) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const stop = Math.max(
    0,
    presets.findIndex((p) => sameThemeDraft(p.value, current)),
  );
  const select = (i: number) => {
    const preset = presets[i];
    if (!preset) return;
    onPick(preset);
    nodes.current.get(preset.id)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="flex flex-wrap gap-1.5"
    >
      {presets.map((preset, i) => {
        const checked = sameThemeDraft(preset.value, current);
        return (
          <button
            key={preset.id}
            ref={(node) => {
              if (node) nodes.current.set(preset.id, node);
              else nodes.current.delete(preset.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === stop ? 0 : -1}
            aria-disabled={inert || undefined}
            onClick={() => {
              if (!inert) onPick(preset);
            }}
            onKeyDown={(event) => {
              const to = stepIndex(event.key, i, presets.length);
              if (to === null) return;
              event.preventDefault();
              if (!inert) select(to);
            }}
            className={cn(
              "inline-flex h-[calc(var(--tf-row)_-_4px)] items-center rounded-(--tf-r) border px-2.5 text-xs transition-colors duration-(--tf-fade)",
              checked
                ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright"
                : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
              inert ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {preset.label}
          </button>
        );
      })}
      {presets.length === 0 ? (
        <span className="text-[11px] text-ink-3">No presets</span>
      ) : null}
    </div>
  );
}

function FieldLabel({
  id,
  children,
  aside,
}: {
  id: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        id={id}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {children}
      </span>
      {aside}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * An appearance fitting room. On the left the controls: accent swatches
 * whose chosen ring glides between them on `springs.snap`, a corner-radius
 * slider, density and theme as segmented radiogroups with a sliding
 * indicator, and a high-contrast switch; above them, whole presets as chips.
 * On the right a mannequin: a miniature app screen (sidebar, toolbar, three
 * rows, a card with a toggle, a primary button) that re-skins as the draft
 * changes. Colours cross-fade, corner radii morph and rows re-space on
 * `springs.glide`, so a theme is seen moving into place rather than swapped.
 *
 * "Try it on" dresses the fitting room's own chrome in the draft, tokens and
 * all. "Keep" commits it (a tick draws on `springs.flick` and a Kept stamp
 * lands on `springs.recoil`); "Undo" puts the kept theme back and the
 * mannequin glides home. "Compare" splits the mannequin into the kept theme
 * and the draft behind a draggable divider.
 *
 * Every control is its native widget: radiogroups with arrows, sliders with
 * arrows, Home and End, switches with Space. Under reduced motion nothing
 * travels or morphs: colours, corners and rows swap in place and every
 * change is still announced.
 */
export function ThemeFitting({
  value,
  defaultValue = defaultThemeDraft,
  onChange,
  onCommit,
  onUndo,
  presets = defaultThemePresets,
  accents = defaultThemeAccents,
  screen = "table",
  compare,
  defaultCompare = false,
  onCompareChange,
  tryOn,
  defaultTryOn = false,
  onTryOnChange,
  density = "cozy",
  status = "ready",
  onRetry,
  title = "Appearance",
  label,
  height = 520,
  disabled = false,
  className,
}: ThemeFittingProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const ids = {
    presets: `${uid}-presets`,
    accent: `${uid}-accent`,
    radius: `${uid}-radius`,
    density: `${uid}-density`,
    contrast: `${uid}-contrast`,
    scheme: `${uid}-scheme`,
  };

  const osDark = React.useSyncExternalStore(
    subscribeDark,
    getDark,
    getDarkServer,
  );
  // False for the server render and hydration; true once the page is live,
  // so the unsaved badge never fades in on a page that loads already dirty.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [own, setOwn] = React.useState<ThemeDraft>(() => value ?? defaultValue);
  const current = value ?? own;
  const [kept, setKept] = React.useState<ThemeDraft>(
    () => value ?? defaultValue,
  );
  const [ownCompare, setOwnCompare] = React.useState(defaultCompare);
  const comparing = compare ?? ownCompare;
  const [ownTryOn, setOwnTryOn] = React.useState(defaultTryOn);
  const trying = tryOn ?? ownTryOn;
  const [split, setSplit] = React.useState(50);
  const [stamp, setStamp] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  const dividerId = React.useRef<number | null>(null);
  const [dividing, setDividing] = React.useState(false);
  const stampTimer = React.useRef<number | null>(null);

  const ready = status === "ready";
  const inert = disabled || !ready;
  const dirty = !sameThemeDraft(current, kept);

  React.useEffect(
    () => () => {
      if (stampTimer.current !== null) window.clearTimeout(stampTimer.current);
    },
    [],
  );

  /* ------------------------------- changes ----------------------------- */

  const update = (
    next: ThemeDraft,
    change: Omit<ThemeChange, "from" | "to">,
    words: string,
  ) => {
    if (inert) return;
    if (sameThemeDraft(next, current)) return;
    if (value === undefined) setOwn(next);
    onChange?.(next, { ...change, from: current, to: next });
    setAnnouncement(words);
  };

  const setField = <K extends ThemeField>(
    field: K,
    v: ThemeDraft[K],
    words: string,
  ) => update({ ...current, [field]: v }, { source: field }, words);

  const pickPreset = (preset: ThemePreset) =>
    update(
      preset.value,
      { source: "preset", preset: preset.id },
      `Preset ${preset.label}: ${describe(preset.value, accents)}.`,
    );

  const keep = () => {
    if (inert || !dirty) return;
    setKept(current);
    onCommit?.(current);
    setStamp((s) => s + 1);
    if (stampTimer.current !== null) window.clearTimeout(stampTimer.current);
    stampTimer.current = window.setTimeout(() => {
      stampTimer.current = null;
      setStamp(0);
    }, STAMP_MS);
    setAnnouncement("Theme kept.");
  };

  const undo = () => {
    if (inert || !dirty) return;
    update(kept, { source: "undo" }, "Changes undone; the kept theme is back.");
    onUndo?.(kept);
  };

  const setCompare = (next: boolean) => {
    if (inert) return;
    if (compare === undefined) setOwnCompare(next);
    onCompareChange?.(next);
    setAnnouncement(
      next
        ? "Comparing: kept theme on the left, draft on the right."
        : "Compare off.",
    );
  };

  const setTryOn = (next: boolean) => {
    if (inert) return;
    if (tryOn === undefined) setOwnTryOn(next);
    onTryOnChange?.(next);
    setAnnouncement(
      next ? "Trying it on: the controls wear the draft." : "Try-on off.",
    );
  };

  /* ------------------------------- divider ----------------------------- */

  const readSplit = (event: React.PointerEvent<HTMLElement>) => {
    const stage = event.currentTarget.parentElement;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0) return;
    setSplit(
      Math.round(
        clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      ),
    );
  };

  /* ------------------------------- styling ----------------------------- */

  const trying_ = trying && ready;
  const skin = resolveSkin(current, accents, osDark);
  const chromeDensity = trying_ ? current.density : density;
  const rootStyle: React.CSSProperties & Record<string, string | number> = {
    height,
    "--tf-fade": motionSafe ? `${durations.base}s` : "0s",
    "--tf-r": trying_ ? `${Math.min(current.radius, 10)}px` : "6px",
    "--tf-row": `${C_ROW[chromeDensity]}px`,
    "--tf-gap": `${C_GAP[chromeDensity]}px`,
    ...(trying_ ? chromeVars(skin) : {}),
  };
  if (trying_) rootStyle.colorScheme = skin.dark ? "dark" : "light";

  const accentLabel =
    accents.find((a) => a.id === current.accent)?.label ?? current.accent;
  const enterY = motionSafe ? distances.nudge : 0;
  const stageTransition = {
    duration: durations.base,
    ease: easings.enter,
  } as const;

  /* -------------------------------- render ----------------------------- */

  const header = (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 transition-colors duration-(--tf-fade)">
      <div className="flex min-w-0 items-center gap-2">
        <Shirt aria-hidden className="size-4 shrink-0 text-ink-3" />
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        <AnimatePresence initial={!live}>
          {ready && dirty ? (
            <motion.span
              key="dirty"
              initial={{ opacity: 0, y: -enterY }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-warn" />
              <span className="hidden @min-[30rem]:inline">
                Unsaved changes
              </span>
              <span className="sr-only @min-[30rem]:hidden">
                Unsaved changes
              </span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <Shirt aria-hidden className="size-3.5 @min-[30rem]:hidden" />
          <span className="hidden @min-[30rem]:inline">Try it on</span>
          <Switch
            checked={trying}
            onChange={setTryOn}
            label="Try it on"
            inert={inert}
            motionSafe={motionSafe}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <Columns2 aria-hidden className="size-3.5 @min-[30rem]:hidden" />
          <span className="hidden @min-[30rem]:inline">Compare</span>
          <Switch
            checked={comparing}
            onChange={setCompare}
            label="Compare kept theme and draft"
            inert={inert}
            motionSafe={motionSafe}
          />
        </label>
      </div>
    </header>
  );

  const controls = (
    <LayoutGroup id={uid}>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3"
        style={{ gap: "var(--tf-gap)" }}
      >
        <div className="flex flex-col gap-1.5">
          <FieldLabel id={ids.presets}>Presets</FieldLabel>
          <Presets
            labelId={ids.presets}
            presets={presets}
            current={current}
            onPick={pickPreset}
            inert={inert}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel
            id={ids.accent}
            aside={
              <span className="truncate text-[11px] text-ink-2">
                {accentLabel}
              </span>
            }
          >
            Accent
          </FieldLabel>
          <Swatches
            uid={uid}
            labelId={ids.accent}
            accents={accents}
            value={current.accent}
            onChange={(id) =>
              setField(
                "accent",
                id,
                `Accent ${accents.find((a) => a.id === id)?.label ?? id}.`,
              )
            }
            inert={inert}
            motionSafe={motionSafe}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel id={ids.radius}>Corner radius</FieldLabel>
          <RadiusSlider
            labelId={ids.radius}
            value={current.radius}
            onChange={(v) => setField("radius", v, `Corner radius ${v} px.`)}
            inert={inert}
            motionSafe={motionSafe}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel id={ids.density}>Density</FieldLabel>
          <Segmented<ThemeDensity>
            name="density"
            uid={uid}
            labelId={ids.density}
            options={[
              { id: "compact", label: "Compact" },
              { id: "cozy", label: "Cozy" },
              { id: "roomy", label: "Roomy" },
            ]}
            value={current.density}
            onChange={(v) =>
              setField(
                "density",
                v,
                `Density ${DENSITY_WORD[v].toLowerCase()}.`,
              )
            }
            inert={inert}
            motionSafe={motionSafe}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <FieldLabel id={ids.contrast}>High contrast</FieldLabel>
          <Switch
            id={`${uid}-contrast-switch`}
            checked={current.contrast === "high"}
            onChange={(on) =>
              setField(
                "contrast",
                on ? "high" : "standard",
                on ? "High contrast on." : "High contrast off.",
              )
            }
            label="High contrast"
            inert={inert}
            motionSafe={motionSafe}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel
            id={ids.scheme}
            aside={
              current.scheme === "system" ? (
                <span className="text-[11px] text-ink-2">
                  now {osDark ? "dark" : "light"}
                </span>
              ) : null
            }
          >
            Theme
          </FieldLabel>
          <Segmented<ThemeScheme>
            name="scheme"
            uid={uid}
            labelId={ids.scheme}
            options={[
              {
                id: "light",
                label: "Light",
                icon: <Sun aria-hidden className="size-3.5" />,
              },
              {
                id: "dark",
                label: "Dark",
                icon: <Moon aria-hidden className="size-3.5" />,
              },
              {
                id: "system",
                label: "System",
                icon: <Monitor aria-hidden className="size-3.5" />,
              },
            ]}
            value={current.scheme}
            onChange={(v) =>
              setField("scheme", v, `Theme ${SCHEME_WORD[v].toLowerCase()}.`)
            }
            inert={inert}
            motionSafe={motionSafe}
          />
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-4 py-2.5 transition-colors duration-(--tf-fade)">
        <p className="min-w-0 truncate text-[11px] text-ink-3">
          {dirty
            ? "Kept: " + describe(kept, accents).split(",")[0]
            : "Nothing to keep"}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={undo}
            aria-disabled={inert || !dirty || undefined}
            className={cn(
              "inline-flex h-(--tf-row) items-center gap-1.5 rounded-(--tf-r) border border-hairline px-2.5 text-xs transition-colors duration-(--tf-fade)",
              !inert && dirty
                ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <Undo2 aria-hidden className="size-3.5" />
            Undo
          </button>
          <button
            type="button"
            onClick={keep}
            aria-disabled={inert || !dirty || undefined}
            className={cn(
              "inline-flex h-(--tf-row) items-center gap-1.5 rounded-(--tf-r) px-3 text-xs font-medium transition-colors duration-(--tf-fade)",
              !inert && dirty
                ? "bg-primary text-primary-foreground hover:bg-cobalt-bright"
                : "cursor-default bg-surface-2 text-ink-3",
              FOCUS_RING,
            )}
          >
            {/* Re-keyed on each Keep, so the tick draws again on flick. */}
            <svg
              key={`tick-${stamp}`}
              aria-hidden
              viewBox="0 0 14 14"
              className="size-3.5"
            >
              <motion.path
                d="M3 7.4 5.8 10 11 4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={stamp > 0 && motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
            Keep
          </button>
        </div>
      </footer>
    </LayoutGroup>
  );

  const stage = (
    <div className="absolute inset-3 @min-[40rem]:inset-4">
      <Mannequin
        draft={current}
        accents={accents}
        screen={screen}
        osDark={osDark}
        motionSafe={motionSafe}
        name={comparing ? "Preview, after" : "Preview"}
      />
      <AnimatePresence>
        {comparing ? (
          <motion.div
            key="before"
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={stageTransition}
          >
            <Mannequin
              draft={kept}
              accents={accents}
              screen={screen}
              osDark={osDark}
              motionSafe={motionSafe}
              name="Preview, before"
            />
          </motion.div>
        ) : null}
        {comparing ? (
          <motion.div
            key="labels"
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-1.5 font-mono text-[9px] tracking-[0.08em] uppercase"
            initial={{ opacity: 0, y: -enterY }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={stageTransition}
          >
            <span className="rounded-1 bg-ink/80 px-1.5 py-0.5 text-card">
              Before
            </span>
            <span className="rounded-1 bg-ink/80 px-1.5 py-0.5 text-card">
              After
            </span>
          </motion.div>
        ) : null}
        {comparing ? (
          <motion.div
            key="divider"
            role="slider"
            tabIndex={inert ? -1 : 0}
            aria-label="Compare divider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={split}
            aria-valuetext={`Before fills ${split} percent`}
            aria-disabled={inert || undefined}
            aria-orientation="horizontal"
            onKeyDown={(event) => {
              const step = event.shiftKey ? 10 : 2;
              let next: number | null = null;
              if (event.key === "ArrowRight" || event.key === "ArrowUp")
                next = split + step;
              else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
                next = split - step;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = 100;
              if (next === null) return;
              event.preventDefault();
              if (!inert) setSplit(clamp(next, 0, 100));
            }}
            onPointerDown={(event) => {
              if (inert || event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              dividerId.current = event.pointerId;
              setDividing(true);
              event.currentTarget.focus({ preventScroll: true });
              readSplit(event);
            }}
            onPointerMove={(event) => {
              if (dividerId.current !== event.pointerId) return;
              readSplit(event);
            }}
            onPointerUp={(event) => {
              if (dividerId.current !== event.pointerId) return;
              dividerId.current = null;
              setDividing(false);
            }}
            onPointerCancel={() => {
              dividerId.current = null;
              setDividing(false);
            }}
            style={{ left: `${split}%` }}
            className={cn(
              "absolute inset-y-0 z-10 w-6 -translate-x-1/2 touch-none rounded-2",
              inert ? "cursor-not-allowed" : "cursor-col-resize",
              FOCUS_RING,
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={stageTransition}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink/70"
            />
            <motion.span
              aria-hidden
              className="absolute top-1/2 left-1/2 flex h-7 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-card bg-ink text-card shadow-[0_2px_6px_color-mix(in_oklab,black_30%,transparent)]"
              initial={false}
              animate={{ scale: dividing ? 1.12 : 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            >
              <span className="block h-3 w-px bg-current opacity-60" />
              <span className="ml-px block h-3 w-px bg-current opacity-60" />
            </motion.span>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {stamp > 0 ? (
          <motion.div
            key={`stamp-${stamp}`}
            aria-hidden
            className="pointer-events-none absolute right-2 bottom-2 z-10 flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-primary-foreground uppercase shadow-[0_6px_18px_-6px_color-mix(in_oklab,black_45%,transparent)]"
            initial={{ opacity: 0, scale: motionSafe ? 0.7 : 1, y: enterY }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            <Check aria-hidden className="size-3" />
            Kept
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const skeleton = (
    <div
      aria-hidden
      className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row"
    >
      <div className="relative h-52 shrink-0 border-b border-hairline bg-surface-0 p-3 @min-[40rem]:order-2 @min-[40rem]:h-auto @min-[40rem]:flex-1 @min-[40rem]:border-b-0 @min-[40rem]:border-l @min-[40rem]:p-4">
        <span className="block h-full w-full rounded-3 bg-surface-2 motion-safe:animate-pulse" />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 py-3 @min-[40rem]:order-1 @min-[40rem]:w-[19rem] @min-[40rem]:flex-none">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="flex flex-col gap-1.5">
            <span className="h-2.5 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            <span
              className="h-7 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          </span>
        ))}
      </div>
    </div>
  );

  const failed = (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <TriangleAlert aria-hidden className="size-5 text-danger" />
      <p className="text-sm text-foreground">
        The appearance settings didn&apos;t load.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      ) : null}
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground transition-colors duration-(--tf-fade)",
        disabled && "opacity-70",
        className,
      )}
      style={rootStyle}
    >
      {header}

      {status === "loading" ? (
        skeleton
      ) : status === "error" ? (
        failed
      ) : (
        <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row">
          <div className="relative h-52 shrink-0 border-b border-hairline bg-surface-0 transition-colors duration-(--tf-fade) @min-[40rem]:order-2 @min-[40rem]:h-auto @min-[40rem]:flex-1 @min-[40rem]:border-b-0 @min-[40rem]:border-l">
            {stage}
          </div>
          <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:order-1 @min-[40rem]:w-[19rem] @min-[40rem]:flex-none">
            {controls}
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
