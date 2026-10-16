"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  ChevronDown,
  CircleX,
  FileCode,
  Info,
  Lightbulb,
  RotateCcw,
  TriangleAlert,
  Wand,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ------------------------------------------------------------------------- */
/*                                   Types                                    */
/* ------------------------------------------------------------------------- */

export type QuickFixSeverity = "error" | "warning" | "info";
export type QuickFixSquiggle = "wave" | "dots" | "line";
export type QuickFixTheme = "paper" | "slate" | "mono";
export type QuickFixStatus = "ready" | "loading" | "error";

export type QuickFixFix = {
  id: string;
  /** What the menu says: "Change to litres". */
  title: string;
  /** The text that replaces the problem's range. */
  text: string;
};

export type QuickFixDiagnostic = {
  id: string;
  /** Character offset into `code` where the problem starts. */
  from: number;
  /** Character offset where it ends (exclusive). */
  to: number;
  severity: QuickFixSeverity;
  message: string;
  /** The rule that raised it, shown small: "no-such-field". */
  rule?: string;
  /** Corrections for the range. A problem without fixes can only be ignored. */
  fixes?: QuickFixFix[];
};

export type QuickFixProps = {
  /** How a problem is underlined: a sine wave, a row of dots, or a straight rule. @default "wave" */
  squiggleStyle?: QuickFixSquiggle;
  /** The editor's surface and syntax colour: the card with quiet hues, a sunk slate panel with stronger ones, or no syntax colour at all. @default "paper" */
  editorTheme?: QuickFixTheme;
  /** Code size as a multiple of 13px; line height follows. @default 1 */
  fontScale?: number;
  /** Controlled source text. */
  code?: string;
  /** Initial text when uncontrolled. @default defaultQuickFixCode */
  defaultCode?: string;
  /** Fires with the new text after typing or a fix. */
  onChange?: (code: string) => void;
  /** Controlled problems. Offsets shift as the text changes; a problem whose range is edited is dropped. */
  diagnostics?: QuickFixDiagnostic[];
  /** Initial problems when uncontrolled. @default defaultQuickFixDiagnostics */
  defaultDiagnostics?: QuickFixDiagnostic[];
  /** Fires with the problems after a fix, an ignore or an edit moved them. */
  onDiagnosticsChange?: (diagnostics: QuickFixDiagnostic[]) => void;
  /** A fix was applied: the problem, the fix and the new text. */
  onApplyFix?: (
    diagnostic: QuickFixDiagnostic,
    fix: QuickFixFix,
    code: string,
  ) => void;
  /** A problem was ignored. */
  onIgnore?: (diagnostic: QuickFixDiagnostic) => void;
  /** The file's path, shown on its tab. @default "gaugeworks/readings.ts" */
  fileName?: string;
  /** Whether the file has opened. @default "ready" */
  status?: QuickFixStatus;
  /** "Try again" was pressed after the file failed to open. */
  onRetry?: () => void;
  /** Controlled problems panel. */
  problemsOpen?: boolean;
  /** Initial panel state when uncontrolled. @default true */
  defaultProblemsOpen?: boolean;
  /** Fires from the button that showed or hid the panel. */
  onProblemsOpenChange?: (open: boolean) => void;
  /** The text can be read and navigated, not typed into or fixed. @default false */
  readOnly?: boolean;
  /** The panel's height, px; the code scrolls inside it. @default 540 */
  height?: number;
  /** The editor's accessible name. @default the file name */
  label?: string;
  /** Nothing can be typed, fixed or ignored. @default false */
  disabled?: boolean;
  /** Classes for the editor's outer box. */
  className?: string;
};

/* ------------------------------------------------------------------------- */
/*                               Seeded defaults                              */
/* ------------------------------------------------------------------------- */

/** A Gaugeworks module that totals reservoir readings — with five problems. */
export const defaultQuickFixCode = [
  'import { formatLitres } from "./units";',
  "",
  "type Reading = { site: string; litres: number; at: Date };",
  "",
  "export function dailyTotal(readings: Reading[]): number {",
  "  let total = 0;",
  "  for (const r of readings) {",
  "    total += r.liters;",
  "  }",
  "  retrun total;",
  "}",
  "",
  "export function busiestSite(readings: Reading[]) {",
  "  const ranked = readings.sort((a, b) => b.litres - a.litres);",
  '  return ranked[0]?.site ?? "none";',
  "}",
  "",
  "export function isBasin(r: Reading) {",
  '  return r.site == "Basin";',
  "}",
  "",
  "export const label = (r: Reading) =>",
  "  `${r.site}: ${formatLitres(r.litres)}`;",
  "",
].join("\n");

/** The offset of `needle` after `after` in the default file. */
const offsetOf = (needle: string, after: string) => {
  const base = defaultQuickFixCode.indexOf(after);
  return defaultQuickFixCode.indexOf(needle, base < 0 ? 0 : base);
};
const span = (needle: string, after: string) => {
  const from = offsetOf(needle, after);
  return { from, to: from + needle.length };
};

export const defaultQuickFixDiagnostics: QuickFixDiagnostic[] = [
  {
    id: "unread-at",
    ...span("at", "litres: number; "),
    severity: "info",
    message: "The field 'at' is never read.",
    rule: "unread-field",
  },
  {
    id: "liters",
    ...span("liters", "total += r."),
    severity: "error",
    message: "Reading has no field 'liters'. Did you mean 'litres'?",
    rule: "no-such-field",
    fixes: [{ id: "litres", title: "Change to litres", text: "litres" }],
  },
  {
    id: "retrun",
    ...span("retrun", "  }\n  retrun"),
    severity: "error",
    message: "Cannot find the name 'retrun'.",
    rule: "unknown-name",
    fixes: [{ id: "return", title: "Change to return", text: "return" }],
  },
  {
    id: "sort",
    ...span("sort", "readings.sort"),
    severity: "warning",
    message: "sort() reorders the caller's array in place.",
    rule: "in-place-sort",
    fixes: [{ id: "to-sorted", title: "Use toSorted()", text: "toSorted" }],
  },
  {
    id: "loose",
    ...span("==", "r.site =="),
    severity: "warning",
    message: "Use === so a number never equals a string.",
    rule: "loose-equals",
    fixes: [{ id: "strict", title: "Use ===", text: "===" }],
  },
];

/* ------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* ------------------------------------------------------------------------- */

const PAD_X = 12;
const PAD_Y = 10;
/** Hover a squiggle this long and its peek opens. */
const HOVER_MS = 320;
const RANK: Record<QuickFixSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Severity colours: tokens for text and strokes (they carry contrast). */
const TONE: Record<QuickFixSeverity, { text: string; stroke: string }> = {
  error: { text: "text-danger", stroke: "var(--danger)" },
  warning: { text: "text-warn", stroke: "var(--warn)" },
  info: { text: "text-cobalt-bright", stroke: "var(--accent-bright)" },
};

const SEVERITY_WORD: Record<QuickFixSeverity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Note",
};

function SeverityIcon({
  severity,
  className,
}: {
  severity: QuickFixSeverity;
  className?: string;
}) {
  const Icon =
    severity === "error"
      ? CircleX
      : severity === "warning"
        ? TriangleAlert
        : Info;
  return (
    <Icon
      aria-hidden
      className={cn("shrink-0", TONE[severity].text, className)}
    />
  );
}

/** Line starts, so offsets turn into (line, column) and back. */
function lineStarts(code: string): number[] {
  const out = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code.charCodeAt(i) === 10) out.push(i + 1);
  }
  return out;
}

function position(starts: number[], offset: number) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, col: offset - (starts[lo] ?? 0) };
}

/** Problems ordered by where they sit in the file. */
const inOrder = (list: QuickFixDiagnostic[]) =>
  [...list].sort(
    (a, b) => a.from - b.from || RANK[a.severity] - RANK[b.severity],
  );

/**
 * Maps the problems across an edit: everything before the change stays,
 * everything after it shifts, and a problem the change touched is dropped —
 * the host re-checks the file and says what is wrong now.
 */
function remap(
  before: string,
  after: string,
  list: QuickFixDiagnostic[],
): QuickFixDiagnostic[] {
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p += 1;
  let s = 0;
  while (
    s < max - p &&
    before.charCodeAt(before.length - 1 - s) ===
      after.charCodeAt(after.length - 1 - s)
  ) {
    s += 1;
  }
  const end = before.length - s;
  const delta = after.length - before.length;
  const out: QuickFixDiagnostic[] = [];
  for (const d of list) {
    if (d.to <= p) out.push(d);
    else if (d.from >= end)
      out.push({ ...d, from: d.from + delta, to: d.to + delta });
  }
  return out;
}

/* ------------------------------ syntax colour ----------------------------- */

type TokenKind =
  "kw" | "str" | "num" | "com" | "type" | "fn" | "punct" | "id" | "ws";

const KEYWORDS = new Set(
  "import from export function const let var return for of in if else type new true false null undefined as async await while".split(
    " ",
  ),
);

const TOKEN =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d"'`]+)/g;

function tokenize(line: string): { text: string; kind: TokenKind }[] {
  const out: { text: string; kind: TokenKind }[] = [];
  for (const m of line.matchAll(TOKEN)) {
    const text = m[0];
    const at = (m.index ?? 0) + text.length;
    let kind: TokenKind = "punct";
    if (m[1]) kind = "com";
    else if (m[2]) kind = "str";
    else if (m[3]) kind = "num";
    else if (m[4]) {
      if (KEYWORDS.has(text)) kind = "kw";
      else if (/^[A-Z]/.test(text)) kind = "type";
      else if (line[at] === "(") kind = "fn";
      else kind = "id";
    } else if (m[5]) kind = "ws";
    out.push({ text, kind });
  }
  return out;
}

const THEME: Record<
  QuickFixTheme,
  {
    surface: string;
    gutter: string;
    active: string;
    tokens: Record<TokenKind, string>;
  }
> = {
  paper: {
    surface: "bg-card",
    gutter: "bg-card text-ink-3",
    active: "bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]",
    tokens: {
      kw: "text-cobalt-bright",
      str: "text-signal",
      num: "text-warn",
      com: "text-ink-3 italic",
      type: "text-[oklch(from_var(--accent-bright)_l_c_310)]",
      fn: "text-foreground",
      punct: "text-ink-3",
      id: "text-ink",
      ws: "",
    },
  },
  slate: {
    surface: "bg-surface-2",
    gutter:
      "bg-[color-mix(in_oklab,var(--bg-2)_88%,var(--foreground))] text-ink-3",
    active: "bg-[color-mix(in_oklab,var(--accent-bright)_8%,transparent)]",
    tokens: {
      kw: "font-medium text-cobalt-bright",
      str: "text-success",
      num: "text-danger",
      com: "text-ink-3 italic",
      type: "text-[oklch(from_var(--accent-bright)_l_c_310)] font-medium",
      fn: "text-warn",
      punct: "text-ink-2",
      id: "text-foreground",
      ws: "",
    },
  },
  mono: {
    surface: "bg-card",
    gutter: "bg-card text-ink-3",
    active: "bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]",
    tokens: {
      kw: "font-semibold text-foreground",
      str: "text-ink-2",
      num: "text-ink-2",
      com: "text-ink-3 italic",
      type: "text-foreground",
      fn: "text-foreground",
      punct: "text-ink-3",
      id: "text-ink-2",
      ws: "",
    },
  },
};

/* ------------------------------------------------------------------------- */
/*                                Small parts                                 */
/* ------------------------------------------------------------------------- */

/** A count whose digits roll the way it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [shown, setShown] = React.useState({ value, dir: 1 });
  if (shown.value !== value) {
    setShown({ value, dir: value > shown.value ? 1 : -1 });
  }
  const text = String(value);
  return (
    <span
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={shown.dir}>
        <motion.span
          key={text}
          custom={shown.dir}
          className="inline-block"
          style={{ lineHeight: "16px" }}
          variants={{
            enter: (d: number) => ({ opacity: 0, y: motionSafe ? d * 8 : 0 }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 8 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type SquigglePhase = "rest" | "unwind" | "fade";

/**
 * The underline. Its shape comes from two numbers: `amp`, how coiled it is
 * (1 a full wave, 0 a straight rule), and `reach`, how much of the token it
 * still covers, retracting into the middle. A fix runs amp to 0 on glide —
 * the coil straightens — and then reach to 0 on the exit ease.
 */
function Squiggle({
  x,
  y,
  width,
  severity,
  look,
  scale,
  phase,
  motionSafe,
}: {
  x: number;
  y: number;
  width: number;
  severity: QuickFixSeverity;
  look: QuickFixSquiggle;
  scale: number;
  phase: SquigglePhase;
  motionSafe: boolean;
}) {
  const amp = useMotionValue(1);
  const reach = useMotionValue(1);
  const fade = useMotionValue(1);

  React.useEffect(() => {
    const running: AnimationPlaybackControls[] = [];
    if (phase === "rest") {
      amp.jump(1);
      reach.jump(1);
      fade.jump(1);
      return;
    }
    // Every run starts from a whole underline, so a StrictMode rehearsal
    // (run, complete, run again) still shows the whole unwind.
    amp.jump(1);
    reach.jump(1);
    fade.jump(1);
    if (phase === "fade" || !motionSafe) {
      running.push(
        animate(fade, 0, { duration: durations.base, ease: easings.exit }),
      );
    } else {
      running.push(animate(amp, 0, springs.glide));
      running.push(
        animate(reach, 0, {
          duration: durations.base,
          ease: easings.exit,
          delay: 0.2,
        }),
      );
    }
    return () => {
      for (const c of running) c.complete();
    };
  }, [phase, motionSafe, amp, reach, fade]);

  const w = Math.max(width, 6 * scale);
  const d = useTransform(
    [amp, reach] as MotionValue<number>[],
    ([a = 1, k = 1]: number[]) => {
      const visible = w * k;
      if (visible < 0.5) return "";
      const x0 = x + (w - visible) / 2;
      const x1 = x0 + visible;
      if (look === "line") return `M${r2(x0)} ${r2(y)}H${r2(x1)}`;
      if (look === "dots") {
        // Dots close up into a rule as the coil goes out of them.
        const gap = (1.2 + 2 * a) * scale;
        let path = "";
        for (let px = x0; px <= x1 + 0.01; px += gap) {
          path += `M${r2(px)} ${r2(y)}h0.01`;
        }
        return path;
      }
      const lambda = 4 * scale;
      const amplitude = 1.5 * scale * a;
      let path = `M${r2(x0)} ${r2(y)}Q${r2(x0 + lambda / 4)} ${r2(y - amplitude * 2)} ${r2(x0 + lambda / 2)} ${r2(y)}`;
      for (let px = x0 + lambda; px <= x1 + 0.01; px += lambda / 2) {
        path += `T${r2(Math.min(px, x1))} ${r2(y)}`;
      }
      return path;
    },
  );

  return (
    <motion.path
      d={d}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={r2(
        look === "dots"
          ? 1.9 * scale
          : look === "line"
            ? 1.6 * scale
            : 1.25 * scale,
      )}
      style={{ stroke: TONE[severity].stroke, opacity: fade }}
    />
  );
}

type Morph = {
  n: number;
  from: number;
  oldText: string;
  newText: string;
};

/**
 * The faulty token turning into its correction. The common start and end
 * stay; each changed slot rolls — the old character lifts and fades while
 * the new one rises from below on snap — left to right in a cascade, and
 * slots that appear or vanish grow or shrink by a character width on glide,
 * so the rest of the line moves smoothly.
 */
function MorphToken({
  morph,
  className,
  motionSafe,
  lineHeight,
}: {
  morph: Morph;
  className: string;
  motionSafe: boolean;
  lineHeight: number;
}) {
  const { oldText, newText } = morph;
  if (!motionSafe) {
    return (
      <motion.span
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: durations.fast }}
      >
        {newText}
      </motion.span>
    );
  }
  let p = 0;
  while (
    p < oldText.length &&
    p < newText.length &&
    oldText[p] === newText[p]
  ) {
    p += 1;
  }
  let s = 0;
  while (
    s < oldText.length - p &&
    s < newText.length - p &&
    oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]
  ) {
    s += 1;
  }
  const oldMid = oldText.slice(p, oldText.length - s);
  const newMid = newText.slice(p, newText.length - s);
  const slots = Math.max(oldMid.length, newMid.length);
  const step = cascade(slots);
  return (
    <span className={cn("relative whitespace-pre", className)}>
      {newText.slice(0, p)}
      {Array.from({ length: slots }, (_, i) => {
        const o = oldMid[i] ?? "";
        const n = newMid[i] ?? "";
        const delay = i * step;
        if (o === n) return <span key={i}>{n}</span>;
        return (
          <motion.span
            key={i}
            className="relative inline-block overflow-hidden align-top"
            style={{ height: lineHeight }}
            initial={{ width: o ? "1ch" : "0ch" }}
            animate={{ width: n ? "1ch" : "0ch" }}
            transition={{ ...springs.glide, delay }}
          >
            {o ? (
              <motion.span
                className="absolute top-0 left-0"
                initial={{ y: 0, opacity: 1 }}
                animate={{ y: -distances.nudge, opacity: 0 }}
                transition={{
                  duration: durations.fast,
                  ease: easings.exit,
                  delay,
                }}
              >
                {o}
              </motion.span>
            ) : null}
            {n ? (
              <motion.span
                className="absolute top-0 left-0"
                initial={{ y: distances.nudge, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  y: { ...springs.snap, delay: delay + 0.04 },
                  opacity: {
                    duration: durations.fast,
                    ease: easings.enter,
                    delay: delay + 0.04,
                  },
                }}
              >
                {n}
              </motion.span>
            ) : null}
          </motion.span>
        );
      })}
      {newText.slice(newText.length - s)}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/*                                 The editor                                 */
/* ------------------------------------------------------------------------- */

type Leaving = {
  key: string;
  diag: QuickFixDiagnostic;
  line: number;
  col: number;
  length: number;
  phase: SquigglePhase;
};

type Peek = { id: string; why: "key" | "hover" } | null;
type Menu = { id: string; above: boolean; x: number; y: number } | null;

/**
 * A code editor panel whose problems are one keystroke from fixed. Each
 * problem is underlined under its exact columns — a wave, dots or a rule in
 * its severity's colour — with a mark in the gutter and a count in the
 * header. F8 walks to the next problem (Shift+F8 back), gliding the code into
 * view and opening a peek under the line; Command or Control with period
 * opens the fixes menu at the token.
 *
 * Applying a fix is the signature: the faulty token morphs into its
 * correction character by character — the common start and end stay, each
 * changed slot rolls on snap in a left-to-right cascade, and slots that
 * appear or vanish grow or shrink on glide — while the squiggle unwinds, its
 * coil straightening on glide before it retracts into its middle, and the
 * count ticks down on snap.
 *
 * The text is a real textarea over a painted layer, so the caret, selection
 * and typing are native; edits shift the problems after them and drop the
 * ones they touch. A clean file shows a quiet zero, loading shows ruled
 * lines, and a narrow editor hides the gutter marks. Under reduced motion
 * the token cross-fades, the squiggle fades and the code jumps into view;
 * every count and mark still changes.
 */
export function QuickFix({
  squiggleStyle = "wave",
  editorTheme = "paper",
  fontScale = 1,
  code,
  defaultCode,
  onChange,
  diagnostics,
  defaultDiagnostics,
  onDiagnosticsChange,
  onApplyFix,
  onIgnore,
  fileName = "gaugeworks/readings.ts",
  status = "ready",
  onRetry,
  problemsOpen,
  defaultProblemsOpen = true,
  onProblemsOpenChange,
  readOnly = false,
  height = 540,
  label,
  disabled = false,
  className,
}: QuickFixProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const panelId = `${uid}-panel`;
  const menuId = `${uid}-menu`;
  const ready = status === "ready";
  const frozen = disabled || readOnly || !ready;
  const theme = THEME[editorTheme] ?? THEME.paper;
  const scale = clamp(fontScale, 0.7, 1.6);
  const fontSize = r2(13 * scale);
  const lineHeight = Math.round(fontSize * 1.62);
  const shortName = fileName.split("/").pop() ?? fileName;

  /* --------------------------------- state -------------------------------- */

  const [ownCode, setOwnCode] = React.useState(
    () => defaultCode ?? defaultQuickFixCode,
  );
  const text = code ?? ownCode;
  const [ownDiags, setOwnDiags] = React.useState<QuickFixDiagnostic[]>(
    () => defaultDiagnostics ?? defaultQuickFixDiagnostics,
  );
  const diags = React.useMemo(
    () =>
      inOrder(diagnostics ?? ownDiags).filter(
        (d) => d.from >= 0 && d.to >= d.from && d.to <= text.length,
      ),
    [diagnostics, ownDiags, text.length],
  );
  const [ownOpen, setOwnOpen] = React.useState(defaultProblemsOpen);
  /** The text as it opened, for the tab's edited dot. */
  const [opened] = React.useState(text);
  const panelOpen = problemsOpen ?? ownOpen;

  const [caret, setCaret] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const [peek, setPeek] = React.useState<Peek>(null);
  const [menu, setMenu] = React.useState<Menu>(null);
  const [menuIndex, setMenuIndex] = React.useState(0);
  const [morph, setMorph] = React.useState<Morph | null>(null);
  const [leaving, setLeaving] = React.useState<Leaving[]>([]);
  const [chW, setChW] = React.useState(() => r2(fontSize * 0.6));
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));

  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const paintRef = React.useRef<HTMLDivElement | null>(null);
  const overRef = React.useRef<HTMLDivElement | null>(null);
  const gutterRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const pendingCaret = React.useRef<[number, number] | null>(null);
  const scrollRun = React.useRef<AnimationPlaybackControls | null>(null);
  const timers = React.useRef(new Set<number>());
  const hoverTimer = React.useRef(0);
  const counter = React.useRef(0);

  const starts = React.useMemo(() => lineStarts(text), [text]);
  const lines = React.useMemo(() => text.split("\n"), [text]);
  const caretPos = position(starts, Math.min(caret, text.length));
  const counts = {
    error: diags.filter((d) => d.severity === "error").length,
    warning: diags.filter((d) => d.severity === "warning").length,
    info: diags.filter((d) => d.severity === "info").length,
  };
  const total = diags.length;
  const worstOn = new Map<number, QuickFixSeverity>();
  for (const d of diags) {
    const { line } = position(starts, d.from);
    const had = worstOn.get(line);
    if (!had || RANK[d.severity] < RANK[had]) worstOn.set(line, d.severity);
  }
  const atCaret =
    diags.find((d) => caret >= d.from && caret <= d.to) ??
    diags.find((d) => position(starts, d.from).line === caretPos.line) ??
    null;
  const fixableOnLine =
    focused && atCaret && (atCaret.fixes?.length ?? 0) > 0 ? atCaret : null;
  const peekDiag = peek ? (diags.find((d) => d.id === peek.id) ?? null) : null;
  const menuDiag = menu ? (diags.find((d) => d.id === menu.id) ?? null) : null;
  const digits = String(Math.max(lines.length, 9)).length;

  /* -------------------------------- writes -------------------------------- */

  const writeCode = (next: string) => {
    if (code === undefined) setOwnCode(next);
    onChange?.(next);
  };
  const writeDiags = (next: QuickFixDiagnostic[]) => {
    if (diagnostics === undefined) setOwnDiags(next);
    onDiagnosticsChange?.(next);
  };
  const setPanel = (open: boolean) => {
    if (problemsOpen === undefined) setOwnOpen(open);
    onProblemsOpenChange?.(open);
  };

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  /* -------------------------------- effects ------------------------------- */

  // One character's width, measured on a probe in the code's own font.
  React.useEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const read = () => {
      const w = probe.getBoundingClientRect().width / 20;
      if (w > 0) setChW(r2(w));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(probe);
    return () => ro.disconnect();
  }, [fontSize]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      window.clearTimeout(hoverTimer.current);
      scrollRun.current?.stop();
    };
  }, []);

  // A caret asked for by a fix or a jump lands once the new text is in.
  React.useLayoutEffect(() => {
    const want = pendingCaret.current;
    const area = areaRef.current;
    if (!want || !area) return;
    pendingCaret.current = null;
    try {
      area.setSelectionRange(want[0], want[1]);
    } catch {
      // The field may have been swapped out; the caret is not essential.
    }
  });

  // Focus follows the menu's active item.
  React.useEffect(() => {
    if (!menu) return;
    const item =
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[
        menuIndex
      ];
    item?.focus({ preventScroll: true });
  }, [menu, menuIndex]);

  /* -------------------------------- scroll -------------------------------- */

  const sync = () => {
    const area = areaRef.current;
    if (!area) return;
    const t = `translate3d(${-area.scrollLeft}px, ${-area.scrollTop}px, 0)`;
    if (paintRef.current) paintRef.current.style.transform = t;
    if (overRef.current) overRef.current.style.transform = t;
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translate3d(0, ${-area.scrollTop}px, 0)`;
    }
  };

  /** Glides the code until the problem's line (and the peek under it) is in view. */
  const reveal = (offset: number) => {
    const area = areaRef.current;
    if (!area) return;
    const { line, col } = position(starts, offset);
    const top = PAD_Y + line * lineHeight;
    const viewH = area.clientHeight;
    const wantTop =
      top - lineHeight < area.scrollTop
        ? top - lineHeight * 2
        : top + lineHeight * 5 > area.scrollTop + viewH
          ? top + lineHeight * 5 - viewH
          : area.scrollTop;
    const x = PAD_X + col * chW;
    const viewW = area.clientWidth;
    const wantLeft =
      x - 24 < area.scrollLeft
        ? Math.max(0, x - 48)
        : x + 120 > area.scrollLeft + viewW
          ? x + 120 - viewW
          : area.scrollLeft;
    const fromTop = area.scrollTop;
    const fromLeft = area.scrollLeft;
    const toTop = Math.max(0, Math.round(wantTop));
    const toLeft = Math.max(0, Math.round(wantLeft));
    scrollRun.current?.stop();
    if (!motionSafe || (toTop === fromTop && toLeft === fromLeft)) {
      area.scrollTop = toTop;
      area.scrollLeft = toLeft;
      sync();
      return;
    }
    scrollRun.current = animate(0, 1, {
      ...springs.glide,
      onUpdate: (k) => {
        area.scrollTop = Math.round(fromTop + (toTop - fromTop) * k);
        area.scrollLeft = Math.round(fromLeft + (toLeft - fromLeft) * k);
        sync();
      },
    });
  };

  /* -------------------------------- actions ------------------------------- */

  const describe = (d: QuickFixDiagnostic) => {
    const { line, col } = position(starts, d.from);
    const n = d.fixes?.length ?? 0;
    return `${SEVERITY_WORD[d.severity]}, line ${line + 1}, column ${col + 1}: ${d.message} ${n > 0 ? `${plural(n, "fix", "fixes")}.` : "No fix; it can be ignored."}`;
  };

  const goTo = (d: QuickFixDiagnostic, why: "key" | "hover" = "key") => {
    const area = areaRef.current;
    if (!area) return;
    area.focus({ preventScroll: true });
    pendingCaret.current = [d.from, d.to];
    try {
      area.setSelectionRange(d.from, d.to);
    } catch {
      // Not focusable yet; the layout effect retries.
    }
    setCaret(d.from);
    setPeek({ id: d.id, why });
    setMenu(null);
    reveal(d.from);
    say(describe(d));
  };

  const step = (dir: 1 | -1) => {
    if (diags.length === 0) {
      say("No problems in this file.");
      return;
    }
    const at = caret;
    const next =
      dir === 1
        ? (diags.find((d) => d.from > at) ?? diags[0])
        : ([...diags].reverse().find((d) => d.from < at) ??
          diags[diags.length - 1]);
    if (next) goTo(next);
  };

  const fixesFor = (d: QuickFixDiagnostic) => d.fixes ?? [];

  const openMenu = (d: QuickFixDiagnostic) => {
    const view = viewRef.current;
    const area = areaRef.current;
    if (!view || !area) return;
    const { line, col } = position(starts, d.from);
    const x = clamp(
      PAD_X + col * chW - area.scrollLeft,
      4,
      Math.max(4, area.clientWidth - 236),
    );
    const below = PAD_Y + (line + 1) * lineHeight - area.scrollTop + 2;
    const items = fixesFor(d).length + 1;
    const menuH = items * 32 + 16;
    const above =
      below + menuH > area.clientHeight && below > menuH + lineHeight;
    setMenu({
      id: d.id,
      above,
      x: Math.round(x),
      y: Math.round(above ? below - lineHeight - 4 : below),
    });
    setMenuIndex(0);
    setPeek(null);
  };

  const closeMenu = (refocus = true) => {
    setMenu(null);
    if (refocus) areaRef.current?.focus({ preventScroll: true });
  };

  const apply = (d: QuickFixDiagnostic, fix: QuickFixFix) => {
    if (frozen) return;
    const oldText = text.slice(d.from, d.to);
    const next = text.slice(0, d.from) + fix.text + text.slice(d.to);
    const delta = fix.text.length - (d.to - d.from);
    const rest = diags
      .filter((x) => x.id !== d.id)
      .map((x) =>
        x.from >= d.to ? { ...x, from: x.from + delta, to: x.to + delta } : x,
      );
    const { line, col } = position(starts, d.from);
    counter.current += 1;
    const n = counter.current;
    setMorph({ n, from: d.from, oldText, newText: fix.text });
    later(() => setMorph((m) => (m?.n === n ? null : m)), 900);
    const key = `${d.id}-${n}`;
    setLeaving((l) => [
      ...l,
      {
        key,
        diag: d,
        line,
        col,
        length: Math.max(oldText.length, fix.text.length),
        phase: "unwind",
      },
    ]);
    later(() => setLeaving((l) => l.filter((x) => x.key !== key)), 900);
    pendingCaret.current = [d.from + fix.text.length, d.from + fix.text.length];
    setCaret(d.from + fix.text.length);
    setPeek(null);
    setMenu(null);
    writeCode(next);
    writeDiags(rest);
    onApplyFix?.(d, fix, next);
    say(
      `Changed ${oldText} to ${fix.text}. ${rest.length === 0 ? "No problems left." : `${plural(rest.length, "problem", "problems")} left.`}`,
    );
    areaRef.current?.focus({ preventScroll: true });
  };

  const ignore = (d: QuickFixDiagnostic) => {
    if (disabled || !ready) return;
    const rest = diags.filter((x) => x.id !== d.id);
    const { line, col } = position(starts, d.from);
    counter.current += 1;
    const key = `${d.id}-${counter.current}`;
    setLeaving((l) => [
      ...l,
      { key, diag: d, line, col, length: d.to - d.from, phase: "fade" },
    ]);
    later(() => setLeaving((l) => l.filter((x) => x.key !== key)), 600);
    setPeek(null);
    setMenu(null);
    writeDiags(rest);
    onIgnore?.(d);
    say(
      `Ignored: ${d.message} ${rest.length === 0 ? "No problems left." : `${plural(rest.length, "problem", "problems")} left.`}`,
    );
    areaRef.current?.focus({ preventScroll: true });
  };

  /* ------------------------------- keyboard ------------------------------- */

  const readCaret = () => {
    const area = areaRef.current;
    if (!area) return;
    const at = area.selectionStart;
    setCaret(at);
    if (peek && peekDiag && (at < peekDiag.from || at > peekDiag.to)) {
      const { line } = position(starts, at);
      if (line !== position(starts, peekDiag.from).line) setPeek(null);
    }
  };

  const onAreaKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "F8") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
      return;
    }
    if (mod && event.key === ".") {
      event.preventDefault();
      const target =
        diags.find((d) => caret >= d.from && caret <= d.to) ??
        (peekDiag ? peekDiag : null) ??
        diags.find((d) => position(starts, d.from).line === caretPos.line);
      if (!target) {
        say("No problem at the caret. F8 goes to the next one.");
        return;
      }
      openMenu(target);
      say(
        `${plural(fixesFor(target).length + 1, "action", "actions")} for: ${target.message}`,
      );
      return;
    }
    if (event.key === "Escape" && (peek || menu)) {
      event.preventDefault();
      setPeek(null);
      setMenu(null);
    }
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!menuDiag) return;
    const count = fixesFor(menuDiag).length + 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setMenuIndex((i) => (i + 1) % count);
        return;
      case "ArrowUp":
        event.preventDefault();
        setMenuIndex((i) => (i - 1 + count) % count);
        return;
      case "Home":
        event.preventDefault();
        setMenuIndex(0);
        return;
      case "End":
        event.preventDefault();
        setMenuIndex(count - 1);
        return;
      case "Escape":
        // Ours: the menu closes and focus goes back to the caret.
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        return;
      case "Tab":
        event.preventDefault();
        closeMenu();
        return;
      default:
        break;
    }
  };

  /* -------------------------------- pointer ------------------------------- */

  const hitTest = (clientX: number, clientY: number) => {
    const area = areaRef.current;
    if (!area) return null;
    const r = area.getBoundingClientRect();
    const line = Math.floor(
      (clientY - r.top + area.scrollTop - PAD_Y) / lineHeight,
    );
    const col = Math.floor((clientX - r.left + area.scrollLeft - PAD_X) / chW);
    if (line < 0 || line >= lines.length || col < 0) return null;
    const offset = (starts[line] ?? 0) + col;
    return (
      diags.find(
        (d) =>
          offset >= d.from &&
          offset < Math.max(d.to, d.from + 1) &&
          position(starts, d.from).line === line,
      ) ?? null
    );
  };

  const onAreaMove = (event: React.PointerEvent<HTMLTextAreaElement>) => {
    if (event.pointerType === "touch" || menu) return;
    const d = hitTest(event.clientX, event.clientY);
    window.clearTimeout(hoverTimer.current);
    if (d) {
      if (peek?.id === d.id) return;
      hoverTimer.current = window.setTimeout(
        () => setPeek({ id: d.id, why: "hover" }),
        HOVER_MS,
      );
    } else if (peek?.why === "hover") {
      hoverTimer.current = window.setTimeout(() => {
        setPeek((p) => (p?.why === "hover" ? null : p));
      }, 220);
    }
  };

  /* -------------------------------- render -------------------------------- */

  const morphLine = morph ? position(starts, morph.from).line : -1;

  const renderLine = (line: string, i: number) => {
    const tokens = tokenize(line);
    if (i !== morphLine || !morph) {
      return tokens.map((t, k) => (
        <span key={k} className={theme.tokens[t.kind]}>
          {t.text}
        </span>
      ));
    }
    // Split the line around the morphing token.
    const lineStart = starts[i] ?? 0;
    const a = morph.from - lineStart;
    const b = a + morph.newText.length;
    const out: React.ReactNode[] = [];
    let at = 0;
    tokens.forEach((t, k) => {
      const s0 = at;
      const s1 = at + t.text.length;
      at = s1;
      const cls = theme.tokens[t.kind];
      if (s1 <= a || s0 >= b) {
        out.push(
          <span key={k} className={cls}>
            {t.text}
          </span>,
        );
        return;
      }
      if (s0 < a) {
        out.push(
          <span key={`${k}a`} className={cls}>
            {t.text.slice(0, a - s0)}
          </span>,
        );
      }
      if (s0 <= a && s1 >= a) {
        out.push(
          <MorphToken
            key={`m${morph.n}`}
            morph={morph}
            className={cls}
            motionSafe={motionSafe}
            lineHeight={lineHeight}
          />,
        );
      }
      if (s1 > b) {
        out.push(
          <span key={`${k}b`} className={cls}>
            {t.text.slice(b - s0)}
          </span>,
        );
      }
    });
    return out;
  };

  const squiggleY = (line: number) =>
    r2(PAD_Y + line * lineHeight + lineHeight - Math.max(2.5, 3 * scale));

  const codeW = Math.ceil(
    Math.max(...lines.map((l) => l.length), 10) * chW + PAD_X * 2,
  );
  const codeH = lines.length * lineHeight + PAD_Y * 2;

  const peekBox = peekDiag
    ? (() => {
        const { line } = position(starts, peekDiag.from);
        return { top: PAD_Y + (line + 1) * lineHeight + 4 };
      })()
    : null;

  const countButton = (
    <button
      type="button"
      aria-expanded={panelOpen}
      aria-controls={panelId}
      aria-label={
        total === 0
          ? "No problems. Show the problems panel"
          : `${plural(counts.error, "error", "errors")}, ${plural(counts.warning, "warning", "warnings")}, ${plural(counts.info, "note", "notes")}. ${panelOpen ? "Hide" : "Show"} the problems panel`
      }
      disabled={!ready}
      onClick={() => setPanel(!panelOpen)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2.5 rounded-2 px-2.5 font-mono text-[11px] tabular-nums transition-colors enabled:hover:bg-surface-2 disabled:opacity-50",
        FOCUS_RING,
      )}
    >
      {total === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-ink-3">
          <Check aria-hidden className="size-3.5" />
          <Rolling value={0} motionSafe={motionSafe} />
        </span>
      ) : (
        <>
          <span className="hidden items-center gap-1 text-danger @min-[30rem]/quick-fix:inline-flex">
            <CircleX aria-hidden className="size-3.5" />
            <Rolling value={counts.error} motionSafe={motionSafe} />
          </span>
          <span className="hidden items-center gap-1 text-warn @min-[30rem]/quick-fix:inline-flex">
            <TriangleAlert aria-hidden className="size-3.5" />
            <Rolling value={counts.warning} motionSafe={motionSafe} />
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 @min-[30rem]/quick-fix:hidden",
              counts.error > 0 ? "text-danger" : "text-warn",
            )}
          >
            {counts.error > 0 ? (
              <CircleX aria-hidden className="size-3.5" />
            ) : (
              <TriangleAlert aria-hidden className="size-3.5" />
            )}
            <Rolling value={total} motionSafe={motionSafe} />
          </span>
        </>
      )}
      <ChevronDown
        aria-hidden
        className={cn(
          "size-3.5 text-ink-3 transition-transform duration-200",
          panelOpen ? "rotate-0" : "-rotate-90",
        )}
      />
    </button>
  );

  const loading = (
    <div aria-hidden className="relative flex-1 overflow-hidden">
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={i}
          className="flex items-center border-b border-hairline"
          style={{ height: lineHeight + 6 }}
        >
          <span
            className="shrink-0 pr-3 text-right font-mono text-ink-3/60 tabular-nums"
            style={{ width: `${digits + 3}ch`, fontSize }}
          >
            {i + 1}
          </span>
          <span
            className="h-2 rounded-full bg-surface-2 motion-safe:animate-pulse"
            style={{ width: `${12 + ((i * 37 + 11) % 58)}%` }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div
      role="region"
      aria-label={label ?? `${fileName} editor`}
      className={cn(
        "@container/quick-fix relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline text-foreground",
        theme.surface,
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-hairline bg-surface-1 pr-1.5 pl-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode aria-hidden className="size-4 shrink-0 text-ink-3" />
          <span
            title={fileName}
            className="min-w-0 truncate font-mono text-[12px] text-ink-2"
          >
            <span className="hidden text-ink-3 @min-[30rem]/quick-fix:inline">
              {fileName.slice(0, fileName.length - shortName.length)}
            </span>
            <span className="text-foreground">{shortName}</span>
          </span>
          {text !== opened ? (
            <span
              aria-label="Edited"
              className="size-1.5 shrink-0 rounded-full bg-ink-3"
            />
          ) : null}
        </div>
        {countButton}
      </header>

      <p id={hintId} className="sr-only">
        F8 goes to the next problem and Shift with F8 to the previous one.
        Command or Control with period opens the fixes for the problem at the
        caret. Escape closes a peek or the menu.
      </p>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">{shortName} did not open.</p>
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
      ) : status === "loading" ? (
        loading
      ) : (
        <div
          className="relative flex flex-1 overflow-hidden font-mono"
          style={{ fontSize, lineHeight: `${lineHeight}px` }}
        >
          {/* The probe that measures one character in this font and size. */}
          <span
            ref={probeRef}
            aria-hidden
            className="pointer-events-none invisible absolute top-0 left-0 whitespace-pre"
          >
            {"00000000000000000000"}
          </span>

          <div
            aria-hidden
            className={cn(
              "relative shrink-0 overflow-hidden border-r border-hairline select-none",
              theme.gutter,
            )}
          >
            <div
              ref={gutterRef}
              className="flex flex-col"
              style={{ paddingTop: PAD_Y, paddingBottom: PAD_Y }}
            >
              {lines.map((_, i) => {
                const mark = worstOn.get(i);
                const isCaret = focused && i === caretPos.line;
                return (
                  <div
                    key={i}
                    className="flex items-center"
                    style={{ height: lineHeight }}
                  >
                    <span className="hidden w-4 shrink-0 items-center justify-center @min-[30rem]/quick-fix:flex">
                      {isCaret && fixableOnLine ? (
                        <button
                          type="button"
                          tabIndex={-1}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => openMenu(fixableOnLine)}
                          className="pointer-events-auto flex size-4 items-center justify-center rounded-1 text-warn hover:bg-surface-2"
                        >
                          <Lightbulb className="size-3" />
                        </button>
                      ) : (
                        <AnimatePresence initial={false}>
                          {mark ? (
                            <motion.span
                              key={mark}
                              className="block size-1.5 rounded-full"
                              style={{ backgroundColor: TONE[mark].stroke }}
                              initial={{
                                scale: motionSafe ? 0 : 1,
                                opacity: 0,
                              }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{
                                scale: motionSafe ? 0 : 1,
                                opacity: 0,
                                transition: exitFor(durations.fast),
                              }}
                              transition={
                                motionSafe
                                  ? {
                                      scale: springs.flick,
                                      opacity: { duration: durations.fast },
                                    }
                                  : { duration: durations.fast }
                              }
                            />
                          ) : null}
                        </AnimatePresence>
                      )}
                    </span>
                    <span
                      className={cn(
                        "pr-2.5 pl-1 text-right tabular-nums @min-[30rem]/quick-fix:pl-0",
                        isCaret ? "text-foreground" : "text-ink-3/70",
                      )}
                      style={{ width: `${digits + 1.6}ch` }}
                    >
                      {i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div ref={viewRef} className="relative flex-1 overflow-hidden">
            <div
              ref={paintRef}
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 min-w-full whitespace-pre"
              style={{ width: codeW, height: codeH }}
            >
              {focused ? (
                <div
                  className={cn("absolute inset-x-0", theme.active)}
                  style={{
                    top: PAD_Y + caretPos.line * lineHeight,
                    height: lineHeight,
                  }}
                />
              ) : null}
              <div
                className="relative"
                style={{ padding: `${PAD_Y}px ${PAD_X}px` }}
              >
                {lines.map((line, i) => (
                  <div key={i} style={{ height: lineHeight }}>
                    {line.length ? renderLine(line, i) : "​"}
                  </div>
                ))}
              </div>
              <svg
                className="absolute top-0 left-0 overflow-visible"
                width={codeW}
                height={codeH}
              >
                {diags.map((d) => {
                  const { line, col } = position(starts, d.from);
                  return (
                    <Squiggle
                      key={d.id}
                      x={r2(PAD_X + col * chW)}
                      y={squiggleY(line)}
                      width={r2(Math.max(1, d.to - d.from) * chW)}
                      severity={d.severity}
                      look={squiggleStyle}
                      scale={scale}
                      phase="rest"
                      motionSafe={motionSafe}
                    />
                  );
                })}
                {leaving.map((l) => (
                  <Squiggle
                    key={l.key}
                    x={r2(PAD_X + l.col * chW)}
                    y={squiggleY(l.line)}
                    width={r2(Math.max(1, l.length) * chW)}
                    severity={l.diag.severity}
                    look={squiggleStyle}
                    scale={scale}
                    phase={l.phase}
                    motionSafe={motionSafe}
                  />
                ))}
              </svg>
            </div>

            <textarea
              ref={areaRef}
              aria-label={label ?? fileName}
              aria-describedby={hintId}
              aria-readonly={readOnly || undefined}
              readOnly={readOnly || disabled}
              disabled={disabled}
              value={text}
              wrap="off"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              onChange={(e) => {
                const next = e.currentTarget.value;
                const at = e.currentTarget.selectionStart;
                if (frozen) return;
                const moved = remap(text, next, diags);
                if (moved.length !== diags.length) {
                  say(
                    `${plural(diags.length - moved.length, "problem", "problems")} cleared by the edit.`,
                  );
                }
                writeCode(next);
                if (
                  moved.length !== diags.length ||
                  moved.some((d, k) => d.from !== diags[k]?.from)
                ) {
                  writeDiags(moved);
                }
                setCaret(at);
                setPeek(null);
              }}
              onScroll={sync}
              onSelect={readCaret}
              onKeyUp={readCaret}
              onClick={readCaret}
              onKeyDown={onAreaKey}
              onFocus={() => {
                setFocused(true);
                readCaret();
              }}
              onBlur={(e) => {
                const to = e.relatedTarget;
                if (to instanceof Node && viewRef.current?.contains(to)) return;
                setFocused(false);
              }}
              onPointerMove={onAreaMove}
              onPointerLeave={() => {
                window.clearTimeout(hoverTimer.current);
                if (peek?.why === "hover") {
                  hoverTimer.current = window.setTimeout(
                    () => setPeek((p) => (p?.why === "hover" ? null : p)),
                    220,
                  );
                }
              }}
              className={cn(
                "absolute inset-0 size-full resize-none [scrollbar-width:thin] overflow-auto overscroll-contain bg-transparent whitespace-pre text-transparent caret-foreground selection:bg-cobalt-wash selection:text-transparent",
                FOCUS_IN,
              )}
              style={{
                padding: `${PAD_Y}px ${PAD_X}px`,
                fontSize,
                lineHeight: `${lineHeight}px`,
                tabSize: 2,
              }}
            />

            {/* The peek sits in the code's own coordinates, so it scrolls with it. */}
            <div
              ref={overRef}
              className="pointer-events-none absolute top-0 left-0"
              style={{ width: codeW, height: codeH }}
            >
              <AnimatePresence>
                {peekDiag && peekBox ? (
                  <motion.div
                    key={peekDiag.id}
                    aria-hidden
                    onPointerEnter={() =>
                      window.clearTimeout(hoverTimer.current)
                    }
                    onPointerLeave={() => {
                      if (peek?.why === "hover") {
                        hoverTimer.current = window.setTimeout(
                          () => setPeek((p) => (p?.why === "hover" ? null : p)),
                          220,
                        );
                      }
                    }}
                    className="pointer-events-auto absolute flex max-w-[min(30rem,calc(100cqw-5rem))] flex-col gap-2 rounded-3 border border-hairline-strong bg-popover px-3 py-2.5 font-sans shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]"
                    style={{
                      top: peekBox.top,
                      left: Math.max(
                        PAD_X,
                        Math.round(
                          PAD_X +
                            position(starts, peekDiag.from).col * chW -
                            16,
                        ),
                      ),
                    }}
                    initial={{
                      opacity: 0,
                      y: motionSafe ? -distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      opacity: {
                        duration: durations.fast,
                        ease: easings.enter,
                      },
                      y: motionSafe ? springs.snap : { duration: 0 },
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <SeverityIcon
                        severity={peekDiag.severity}
                        className="mt-0.5 size-3.5"
                      />
                      <p className="text-[12px] leading-[18px] whitespace-normal text-foreground">
                        {peekDiag.message}
                        {peekDiag.rule ? (
                          <span className="mt-0.5 block font-mono text-[10px] leading-4 text-ink-3">
                            {peekDiag.rule}
                          </span>
                        ) : null}
                      </p>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label="Close"
                        onClick={() => setPeek(null)}
                        className="-mt-0.5 -mr-1 ml-auto flex size-5 shrink-0 items-center justify-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-5.5">
                      {fixesFor(peekDiag).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          tabIndex={-1}
                          disabled={frozen}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => apply(peekDiag, f)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-2 bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          <Wand className="size-3" />
                          {f.title}
                        </button>
                      ))}
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={disabled || !ready}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => ignore(peekDiag)}
                        className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                      >
                        Ignore
                      </button>
                      <span className="ml-auto hidden pl-2 font-mono text-[10px] text-ink-3 @min-[30rem]/quick-fix:inline">
                        F8 next
                      </span>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {menu && menuDiag ? (
                <motion.div
                  key="menu"
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  aria-label={`Fixes for: ${menuDiag.message}`}
                  onKeyDown={onMenuKey}
                  className="absolute z-20 flex w-56 flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1.5 font-sans shadow-[0_12px_32px_color-mix(in_oklab,black_20%,transparent)]"
                  style={{
                    left: menu.x,
                    top: menu.above ? undefined : menu.y,
                    bottom: menu.above ? `calc(100% - ${menu.y}px)` : undefined,
                  }}
                  initial={{
                    opacity: 0,
                    y: motionSafe
                      ? menu.above
                        ? distances.nudge
                        : -distances.nudge
                      : 0,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    opacity: { duration: durations.fast, ease: easings.enter },
                    y: motionSafe ? springs.snap : { duration: 0 },
                  }}
                >
                  {[...fixesFor(menuDiag), null].map((f, i) => (
                    <button
                      key={f?.id ?? "ignore"}
                      type="button"
                      role="menuitem"
                      tabIndex={i === menuIndex ? 0 : -1}
                      aria-disabled={
                        (f ? frozen : disabled || !ready) || undefined
                      }
                      onPointerMove={() => setMenuIndex(i)}
                      onClick={() => {
                        if (f) {
                          if (!frozen) apply(menuDiag, f);
                        } else if (!disabled && ready) ignore(menuDiag);
                      }}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-2 px-2 text-left text-[12px] transition-colors",
                        i === menuIndex
                          ? "bg-surface-2 text-foreground"
                          : "text-ink-2",
                        !f && "mt-0.5 border-t border-hairline",
                        FOCUS_IN,
                      )}
                    >
                      {f ? (
                        <Wand
                          aria-hidden
                          className="size-3.5 shrink-0 text-cobalt-bright"
                        />
                      ) : (
                        <X
                          aria-hidden
                          className="size-3.5 shrink-0 text-ink-3"
                        />
                      )}
                      <span className="truncate">
                        {f ? f.title : "Ignore this problem"}
                      </span>
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      )}

      {status === "ready" ? (
        <AnimatePresence initial={false}>
          {panelOpen ? (
            <motion.section
              key="panel"
              id={panelId}
              aria-label="Problems"
              className="shrink-0 overflow-hidden border-t border-hairline bg-surface-1 font-sans"
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0, transition: exitFor(durations.base) }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              <div className="flex h-8 items-center justify-between gap-2 px-3">
                <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Problems
                  <span className="ml-1.5 tabular-nums">{total}</span>
                </p>
                <button
                  type="button"
                  aria-label="Hide the problems panel"
                  onClick={() => setPanel(false)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
              <div className="max-h-[7.5rem] [scrollbar-width:thin] overflow-y-auto overscroll-contain px-1.5 pb-1.5 @min-[30rem]/quick-fix:max-h-[9.5rem]">
                {total === 0 ? (
                  <p className="flex items-center gap-2 px-1.5 py-2 text-[12px] text-ink-3">
                    <Check aria-hidden className="size-3.5" />
                    No problems in {shortName}.
                  </p>
                ) : (
                  <ul role="list" className="flex flex-col">
                    <AnimatePresence initial={false}>
                      {diags.map((d) => {
                        const { line, col } = position(starts, d.from);
                        return (
                          <motion.li
                            key={d.id}
                            className="overflow-hidden"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{
                              height: 0,
                              opacity: 0,
                              transition: exitFor(durations.base),
                            }}
                            transition={
                              motionSafe
                                ? {
                                    height: springs.glide,
                                    opacity: { duration: durations.fast },
                                  }
                                : { duration: 0 }
                            }
                          >
                            <button
                              type="button"
                              onClick={() => goTo(d)}
                              onKeyDown={(e) => {
                                if (
                                  e.key !== "ArrowDown" &&
                                  e.key !== "ArrowUp"
                                ) {
                                  return;
                                }
                                e.preventDefault();
                                const li = e.currentTarget.closest("li");
                                const sib =
                                  e.key === "ArrowDown"
                                    ? li?.nextElementSibling
                                    : li?.previousElementSibling;
                                sib
                                  ?.querySelector<HTMLButtonElement>("button")
                                  ?.focus();
                              }}
                              className={cn(
                                "flex h-8 w-full items-center gap-2 rounded-2 px-1.5 text-left text-[12px] transition-colors hover:bg-surface-2",
                                atCaret?.id === d.id &&
                                  focused &&
                                  "bg-surface-2",
                                FOCUS_IN,
                              )}
                            >
                              <SeverityIcon
                                severity={d.severity}
                                className="size-3.5"
                              />
                              <span className="min-w-0 flex-1 truncate text-ink">
                                {d.message}
                              </span>
                              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                                {line + 1}:{col + 1}
                              </span>
                            </button>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
