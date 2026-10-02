"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Maximize2,
  PanelRightClose,
  RotateCcw,
  Sparkles,
  TriangleAlert,
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
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ArtifactKind = "document" | "code";
export type ArtifactVersions = "pills" | "stepper" | "timeline";
export type ArtifactDiff = "flash" | "hold" | "off";
export type ArtifactDock = "inline" | "pinned";
export type ArtifactTab = "preview" | "code";
export type ArtifactStatus = "ready" | "writing" | "error";

export type ArtifactPaneProps = {
  /** How the version history is offered: a segmented control, Previous and Next around a readout, or a strip of dots under the header. @default "pills" */
  versions?: ArtifactVersions;
  /** What a version switch shows: marks that flash and fold away, marks that stay until cleared, or a plain swap. @default "flash" */
  diff?: ArtifactDiff;
  /** Where the docked pane lands: inside the message that made the shown version, or on a bar pinned to the foot of the conversation. @default "inline" */
  dock?: ArtifactDock;
  /** The file and every version of it. @default defaultArtifact */
  artifact?: Artifact;
  /** The turns beside it. A turn with `version` carries a chip that opens that version. @default defaultArtifactConversation */
  conversation?: ArtifactTurn[];
  /** Controlled version id. */
  version?: string;
  /** Initial version when uncontrolled. @default the newest version */
  defaultVersion?: string;
  /** Fires from the control, chip or key that chose another version. */
  onVersionChange?: (id: string) => void;
  /** Controlled tab. */
  tab?: ArtifactTab;
  /** Initial tab when uncontrolled. @default "preview" */
  defaultTab?: ArtifactTab;
  /** Fires from the tab or arrow key that switched the view. */
  onTabChange?: (tab: ArtifactTab) => void;
  /** Controlled: the pane is open beside the conversation (true) or docked into it as a chip (false). */
  open?: boolean;
  /** Initial state when uncontrolled. @default true */
  defaultOpen?: boolean;
  /** Fires from the Dock button, the chip or Escape, with the new state. */
  onOpenChange?: (open: boolean) => void;
  /** A new version is being written, or the last revision failed. @default "ready" */
  status?: ArtifactStatus;
  /** Retry was pressed after a failed revision. */
  onRetry?: () => void;
  /** The shown version was copied to the clipboard. */
  onCopy?: (text: string, version: ArtifactVersion) => void;
  /** The shown version is being saved. Return `false` to save it yourself; otherwise the pane saves it through the browser. */
  onDownload?: (file: ArtifactFile) => void | false;
  /** The moment relative times count from (Date or ms). @default the newest version's time */
  now?: number | Date;
  /** The surface's accessible name. @default the artifact's title and "conversation" */
  label?: string;
  /** Play the dock, the copy and the clicks. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: versions, tabs, copy, download and dock do nothing. */
  disabled?: boolean;
  /** Classes for the root. It is 540px tall by default; pass a height class to change it. */
  className?: string;
};

export type ArtifactVersion = {
  /** Unique within the artifact. */
  id: string;
  /** What this version changed, in a few words. */
  summary: string;
  /** When it was written, in ms since the epoch. */
  at: number;
  /** The full text: Markdown for a document, source for code. */
  source: string;
  /** What the Preview tab shows for a code artifact. A document renders its own Markdown. */
  preview?: React.ReactNode;
};

export type Artifact = {
  id: string;
  title: string;
  /** The name it is saved under. */
  filename: string;
  kind: ArtifactKind;
  /** Shown beside the title: "Markdown", "TypeScript". */
  language?: string;
  /** Oldest first. */
  versions: ArtifactVersion[];
};

export type ArtifactTurn = {
  id: string;
  role: "user" | "assistant";
  /** Who said it. @default "You", or "Assistant" */
  author?: string;
  text: string;
  /** The version this turn produced: its message carries a chip that opens it. */
  version?: string;
  /** When it was said, in ms since the epoch. Shown on wide layouts. */
  at?: number;
};

/** What Download hands over: a name, the text and its media type. */
export type ArtifactFile = { name: string; text: string; type: string };

const MIN = 60_000;
/** A fixed afternoon, so the default session renders the same everywhere. */
const T = Date.UTC(2026, 8, 30, 15, 40);

const V1 = `# Your refund is on its way

Hi {first_name},

We have received your refund request for order {order_id}. Refunds can take a little longer than payments, and yours is still with our payments team.

We understand this is frustrating. If you have any questions, reply to this email and someone from our team will get back to you.

Thanks for your patience,
The Waylight Pay team`;

const V2 = `# Your refund is on its way

Hi {first_name},

Your refund for order {order_id} is approved and on its way back to you.

It should reach your account by {refund_date}. Banks can take up to five working days to show it.

Thanks for your patience,
The Waylight Pay team`;

const V3 = `# Your refund is on its way

Hi {first_name},

Your refund for order {order_id} is approved and on its way back to you.

It should reach your account by {refund_date}. Banks can take up to five working days to show it.

## While you wait

- Find the refund in the Waylight app under Activity.
- If it has not arrived by {refund_date}, reply to this email.
- You do not need to cancel the card you paid with.

Thanks for your patience,
The Waylight Pay team`;

/** Waylight Pay's refund-delay email, as drafted over three turns. */
export const defaultArtifact: Artifact = {
  id: "refund-delay",
  title: "Refund delay email",
  filename: "refund-delay.md",
  kind: "document",
  language: "Markdown",
  versions: [
    { id: "v1", summary: "First draft", at: T - 14 * MIN, source: V1 },
    { id: "v2", summary: "Shorter, with a date", at: T - 8 * MIN, source: V2 },
    {
      id: "v3",
      summary: "Adds what to do meanwhile",
      at: T - 2 * MIN,
      source: V3,
    },
  ],
};

export const defaultArtifactConversation: ArtifactTurn[] = [
  {
    id: "u1",
    role: "user",
    text: "Draft the email we send when a refund is delayed.",
    at: T - 15 * MIN,
  },
  {
    id: "a1",
    role: "assistant",
    author: "Fernworks Model 3",
    text: "Here is a first draft. It explains the delay and points them to support.",
    version: "v1",
    at: T - 14 * MIN,
  },
  {
    id: "u2",
    role: "user",
    text: "Shorter, and tell them when it will arrive.",
    at: T - 9 * MIN,
  },
  {
    id: "a2",
    role: "assistant",
    author: "Fernworks Model 3",
    text: "Cut it to the essentials and added the expected date.",
    version: "v2",
    at: T - 8 * MIN,
  },
  {
    id: "u3",
    role: "user",
    text: "Add what they can do while they wait.",
    at: T - 3 * MIN,
  },
  {
    id: "a3",
    role: "assistant",
    author: "Fernworks Model 3",
    text: "Added a short list: where to look, when to reply, and that their card is fine.",
    version: "v3",
    at: T - 2 * MIN,
  },
];

type Stage = "open" | "closing" | "docked" | "opening";
type Kind = "same" | "add" | "del";
type Row = { key: string; text: string; kind: Kind };

/** What the panels show: the version's lines, keyed so shared lines keep their element. */
type View = {
  id: string;
  source: string;
  lines: string[];
  keys: string[];
  rows: Row[];
  stamp: number;
  added: number;
  removed: number;
  /** No wash on added lines: the view was not reached by a switch. */
  settled: boolean;
};

type Box = { x: number; y: number; w: number; h: number };

type Flight = {
  from: Box;
  fromR: number;
  toR: number;
  target: () => Element | null;
};

type Api = {
  startClose: () => void;
  startOpen: () => void;
  landClose: () => void;
  landOpen: () => void;
  onFly: (p: number) => void;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const linesOf = (source: string) =>
  source.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");

type Op =
  | { op: "same"; a: number; b: number }
  | { op: "del"; a: number }
  | { op: "add"; b: number };

/**
 * A line diff by longest common subsequence. Removals are emitted before the
 * additions that replace them, so a struck line sits above its successor the
 * way a reviewer reads a change.
 */
function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const t = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      t[i * w + j] =
        a[i] === b[j]
          ? (t[(i + 1) * w + j + 1] ?? 0) + 1
          : Math.max(t[(i + 1) * w + j] ?? 0, t[i * w + j + 1] ?? 0);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ op: "same", a: i, b: j });
      i += 1;
      j += 1;
    } else if (
      i < n &&
      (j >= m || (t[(i + 1) * w + j] ?? 0) >= (t[i * w + j + 1] ?? 0))
    ) {
      ops.push({ op: "del", a: i });
      i += 1;
    } else {
      ops.push({ op: "add", b: j });
      j += 1;
    }
  }
  return ops;
}

function freshView(v: ArtifactVersion | undefined): View {
  const lines = v ? linesOf(v.source) : [];
  const keys = lines.map((_, i) => `0.${i}`);
  return {
    id: v?.id ?? "",
    source: v?.source ?? "",
    lines,
    keys,
    rows: lines.map((text, i) => ({ key: keys[i] ?? "", text, kind: "same" })),
    stamp: 0,
    added: 0,
    removed: 0,
    settled: true,
  };
}

/**
 * The next view, keyed from the last one: a line both versions share keeps
 * its key (and so its element, which never moves), a dropped line keeps its
 * key to be struck and folded away, and a new line gets a key no element has
 * held before.
 */
function applyDiff(prev: View, v: ArtifactVersion): View {
  const lines = linesOf(v.source);
  const stamp = prev.stamp + 1;
  const keys: string[] = [];
  const rows: Row[] = [];
  let added = 0;
  let removed = 0;
  for (const op of diffLines(prev.lines, lines)) {
    if (op.op === "same") {
      const key = prev.keys[op.a] ?? `${stamp}.s${op.b}`;
      keys[op.b] = key;
      rows.push({ key, text: lines[op.b] ?? "", kind: "same" });
    } else if (op.op === "del") {
      const text = prev.lines[op.a] ?? "";
      rows.push({
        key: prev.keys[op.a] ?? `${stamp}.d${op.a}`,
        text,
        kind: "del",
      });
      if (text.trim()) removed += 1;
    } else {
      const key = `${stamp}.${op.b}`;
      const text = lines[op.b] ?? "";
      keys[op.b] = key;
      rows.push({ key, text, kind: "add" });
      if (text.trim()) added += 1;
    }
  }
  return {
    id: v.id,
    source: v.source,
    lines,
    keys,
    rows,
    stamp,
    added,
    removed,
    settled: false,
  };
}

const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());

/** A relative time from `now`, never the clock, so it renders the same everywhere. */
function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

type Tok = { t: string; c?: string };

const MD_INLINE = /(\{[a-z_]+\}|\*\*[^*]+\*\*|`[^`]+`)/g;
const KEYWORDS =
  "const|let|var|function|return|if|else|for|while|import|export|from|type|interface|async|await|new|class|extends|true|false|null|undefined|def|in";
const CODE_TOKENS = new RegExp(
  `(\\/\\/.*$|#.*$|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`[^\`]*\`|\\b(?:${KEYWORDS})\\b|\\b\\d+(?:\\.\\d+)?\\b)`,
);
const KEYWORD = new RegExp(`^(?:${KEYWORDS})$`);

function inlineTokens(text: string): Tok[] {
  return text
    .split(MD_INLINE)
    .filter(Boolean)
    .map((t): Tok => {
      if (/^\{[a-z_]+\}$/.test(t)) return { t, c: "text-signal" };
      if (t.startsWith("**")) return { t, c: "font-semibold text-foreground" };
      if (t.startsWith("`")) return { t, c: "text-warn" };
      return { t };
    });
}

/** Just enough colour to read the source by: markers, variables, strings, keywords. */
function sourceTokens(line: string, kind: ArtifactKind): Tok[] {
  if (kind === "document") {
    const heading = /^(#{1,6} )(.*)$/.exec(line);
    if (heading) {
      return [
        { t: heading[1] ?? "", c: "text-ink-3" },
        { t: heading[2] ?? "", c: "font-semibold text-cobalt-bright" },
      ];
    }
    const item = /^(\s*[-*] )(.*)$/.exec(line);
    if (item) {
      return [
        { t: item[1] ?? "", c: "text-ink-3" },
        ...inlineTokens(item[2] ?? ""),
      ];
    }
    return inlineTokens(line);
  }
  return line
    .split(CODE_TOKENS)
    .filter(Boolean)
    .map((t): Tok => {
      if (t.startsWith("//") || t.startsWith("#"))
        return { t, c: "text-ink-3" };
      if (/^["'`]/.test(t)) return { t, c: "text-success" };
      if (/^\d/.test(t)) return { t, c: "text-warn" };
      if (KEYWORD.test(t)) return { t, c: "text-cobalt-bright" };
      return { t };
    });
}

/** Markdown inline: template variables as chips, bold and code spans. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineTokens(text).map((tok, i) => {
        if (tok.c === "text-signal") {
          return (
            <span
              key={i}
              className="rounded-1 bg-surface-2 px-1 py-px font-mono text-[11.5px] text-ink-2"
            >
              {tok.t.slice(1, -1)}
            </span>
          );
        }
        if (tok.t.startsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {tok.t.slice(2, -2)}
            </strong>
          );
        }
        if (tok.t.startsWith("`")) {
          return (
            <code key={i} className="font-mono text-[12px]">
              {tok.t.slice(1, -1)}
            </code>
          );
        }
        return <React.Fragment key={i}>{tok.t}</React.Fragment>;
      })}
    </>
  );
}

/** One Markdown line as the reader sees it. */
function PreviewLine({ text }: { text: string }) {
  if (text.startsWith("# ")) {
    return (
      <h4 className="pb-1 text-[17px] leading-6 font-semibold text-foreground">
        <Inline text={text.slice(2)} />
      </h4>
    );
  }
  if (text.startsWith("## ")) {
    return (
      <h5 className="pt-1 text-[13px] leading-6 font-semibold text-foreground">
        <Inline text={text.slice(3)} />
      </h5>
    );
  }
  const item = /^\s*[-*] (.*)$/.exec(text);
  if (item) {
    return (
      <p className="relative pl-4 text-[13px] leading-6 text-foreground">
        <span
          aria-hidden
          className="absolute top-[11px] left-1 size-1 rounded-full bg-ink-3"
        />
        <Inline text={item[1] ?? ""} />
      </p>
    );
  }
  if (!text.trim()) return <div aria-hidden className="h-3" />;
  return (
    <p className="text-[13px] leading-6 text-foreground">
      <Inline text={text} />
    </p>
  );
}

/**
 * A number that rolls: the old value leaves one way as the new one arrives
 * from the other, both stacked in one cell so the width never jumps.
 */
function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number | string;
  motionSafe: boolean;
  className?: string;
}) {
  const [prev, setPrev] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (prev !== value) {
    setDir(Number(value) >= Number(prev) ? 1 : -1);
    setPrev(value);
  }
  return (
    <span
      className={cn(
        "relative inline-grid overflow-clip tabular-nums",
        className,
      )}
    >
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={String(value)}
          custom={dir}
          className="[grid-area:1/1]"
          variants={{
            from: (d: number) => ({
              y: motionSafe ? d * distances.step : 0,
              opacity: 0,
            }),
            at: { y: 0, opacity: 1 },
            gone: (d: number) => ({
              y: motionSafe ? -d * distances.step : 0,
              opacity: 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="from"
          animate="at"
          exit="gone"
          transition={{
            y: motionSafe ? springs.snap : { duration: 0 },
            opacity: { duration: durations.fast, ease: easings.enter },
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * An indicator under the chosen item of a row (a tab, a version pill): it
 * moves on snap, and it re-measures without moving whenever the row is laid
 * out again (shown after being docked, resized).
 */
function useIndicator(active: string, motionSafe: boolean) {
  const x = useMotionValue(0);
  const w = useMotionValue(0);
  // Held in state, not refs: the hook hands out `bind`, and what it closes
  // over must be safe to reach from a render.
  const [nodes] = React.useState(() => new Map<string, HTMLElement>());
  const [running] = React.useState(() => new Set<AnimationPlaybackControls>());
  const [group, setGroup] = React.useState<HTMLElement | null>(null);

  const place = React.useCallback(
    (animated: boolean) => {
      const node = nodes.get(active);
      if (!node) return;
      const nx = node.offsetLeft;
      const nw = node.offsetWidth;
      for (const c of running) c.stop();
      running.clear();
      if (!animated || nw === 0 || w.get() === 0) {
        x.jump(nx);
        w.jump(nw);
        return;
      }
      running.add(animate(x, nx, springs.snap));
      running.add(animate(w, nw, springs.snap));
    },
    [active, nodes, running, x, w],
  );

  React.useLayoutEffect(() => {
    place(motionSafe);
  }, [place, motionSafe]);

  React.useEffect(() => {
    if (!group) return;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(group);
    return () => ro.disconnect();
  }, [group, place]);

  React.useEffect(
    () => () => {
      for (const c of running) c.stop();
      running.clear();
    },
    [running],
  );

  const bind = React.useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) nodes.set(key, node);
      else nodes.delete(key);
    },
    [nodes],
  );
  return { x, w, bind, setGroup };
}

/** Rows of one panel, with the diff drawn on them. */
function DiffRows({
  rows,
  marks,
  wash,
  diff,
  motionSafe,
  render,
}: {
  rows: Row[];
  marks: boolean;
  wash: boolean;
  diff: ArtifactDiff;
  motionSafe: boolean;
  render: (row: Row, n: number | null, kind: Kind) => React.ReactNode;
}) {
  const adds = rows.filter((r) => r.kind === "add").length;
  const step = cascade(Math.max(1, adds));
  const fold = motionSafe && diff !== "off";
  // Line numbers count what the version has; a struck line has none.
  const items: { row: Row; number: number | null; order: number }[] = [];
  let n = 0;
  let a = 0;
  for (const row of rows) {
    if (row.kind === "del" && !marks) continue;
    if (row.kind !== "del") n += 1;
    items.push({
      row,
      number: row.kind === "del" ? null : n,
      order: row.kind === "add" ? a : 0,
    });
    if (row.kind === "add") a += 1;
  }
  return (
    <AnimatePresence initial={false}>
      {items.map(({ row, number, order }) => {
        const kind: Kind = marks ? row.kind : "same";
        return (
          <motion.div
            key={row.key}
            className="relative overflow-clip"
            initial={fold ? { height: 0, opacity: 0 } : { opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={
              fold
                ? {
                    height: 0,
                    opacity: 0,
                    transition: exitFor(durations.base),
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={{
              height: fold ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
          >
            {row.kind === "add" && wash && diff !== "off" ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 border-l-2 border-success bg-success/10"
                initial={
                  motionSafe
                    ? { clipPath: "inset(0 100% 0 0)", opacity: 1 }
                    : { opacity: 1 }
                }
                animate={{
                  clipPath: "inset(0 0% 0 0)",
                  opacity: marks ? 1 : 0,
                }}
                transition={{
                  clipPath: {
                    duration: durations.slow,
                    ease: easings.enter,
                    delay: order * step,
                  },
                  opacity: { duration: marks ? durations.fast : 1.2 },
                }}
              />
            ) : null}
            {kind === "del" ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 border-l-2 border-danger bg-danger/10"
              />
            ) : null}
            {render(row, number, kind)}
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

/**
 * The thing an assistant made, beside the conversation that made it. A
 * version switch applies the diff in place: lines both versions share keep
 * their element, dropped lines are struck and fold away on the exit ease,
 * and new lines open on glide under a wash that sweeps across them in a
 * cascade — on the Code tab line by line, on the Preview block by block. The
 * stat beside the tabs rolls its digits on snap. Preview and Code are a real
 * tablist whose panels slide 16px on glide and keep their scroll.
 *
 * Dock folds the pane into a chip in the conversation: its content fades,
 * and a ghost of its frame flies into the chip, homing on the chip's live
 * box every frame while the pane's column closes on glide and the thread
 * widens beneath it; the chip lands on recoil exactly where the ghost ends.
 * The chip opens it again the same way back. Escape anywhere in the pane
 * docks it, and focus follows the flight.
 *
 * Under reduced motion the marks still show (they are information) but lines
 * appear and leave at once, panels cross-fade, and docking cross-fades the
 * pane and the chip with no flight.
 */
export function ArtifactPane({
  versions = "pills",
  diff = "flash",
  dock = "inline",
  artifact = defaultArtifact,
  conversation = defaultArtifactConversation,
  version,
  defaultVersion,
  onVersionChange,
  tab,
  defaultTab = "preview",
  onTabChange,
  open,
  defaultOpen = true,
  onOpenChange,
  status = "ready",
  onRetry,
  onCopy,
  onDownload,
  now,
  label,
  sound = false,
  disabled = false,
  className,
}: ArtifactPaneProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const paneId = `${uid}-pane`;
  const tabId = (t: ArtifactTab) => `${uid}-tab-${t}`;
  const panelId = (t: ArtifactTab) => `${uid}-panel-${t}`;

  const list = artifact.versions;
  const latest = list[list.length - 1];
  const at = (id: string | undefined) => list.findIndex((v) => v.id === id);

  /* ------------------------------ version ------------------------------ */

  const [ownVersion, setOwnVersion] = React.useState<string | undefined>(
    () => defaultVersion ?? latest?.id,
  );
  // A host that appends a version is followed when the reader was on the
  // newest one; the host made that change, so it is not reported back.
  const [seenLatest, setSeenLatest] = React.useState(latest?.id);
  if (seenLatest !== latest?.id) {
    setSeenLatest(latest?.id);
    if (version === undefined && ownVersion === seenLatest) {
      setOwnVersion(latest?.id);
    }
  }
  const wanted = version ?? ownVersion;
  const index = at(wanted) === -1 ? list.length - 1 : at(wanted);
  const shown = list[index];

  /* -------------------------------- view ------------------------------- */

  // The first view is already a diff against the version before it, so the
  // stat (and, in hold, the marks) say what the shown version changed.
  const [view, setView] = React.useState<View>(() => {
    const before = list[index - 1];
    if (!before || !shown) return freshView(shown);
    const first = applyDiff(freshView(before), shown);
    return { ...first, settled: diff !== "hold" };
  });
  const [marks, setMarks] = React.useState(
    () => diff === "hold" && view.added + view.removed > 0,
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // The shown version changed (a choice, a host, an edit in place): the next
  // view is derived here, in the render that sees the change, and so is the
  // sentence that reports it.
  if (shown && (shown.id !== view.id || shown.source !== view.source)) {
    const next = view.id ? applyDiff(view, shown) : freshView(shown);
    setView(next);
    setMarks(diff !== "off" && next.added + next.removed > 0);
    setSaid((s) => ({
      n: s.n + 1,
      text: `Version ${index + 1} of ${list.length}, ${shown.summary.replace(/[.\s]+$/, "")}: ${plural(next.added, "line")} added, ${next.removed} removed.`,
    }));
  }
  const showMarks = marks && diff !== "off";

  // Flash: the marks fold away after a beat; hold keeps them until cleared.
  React.useEffect(() => {
    if (diff !== "flash" || !marks) return;
    const id = window.setTimeout(() => setMarks(false), 550);
    return () => window.clearTimeout(id);
  }, [diff, marks, view.stamp]);

  const choose = (i: number) => {
    const v = list[i];
    if (disabled || !v || i === index) return;
    audio.play("click", { pitch: i > index ? 1.15 : 0.9, gain: 0.45 });
    if (version === undefined) setOwnVersion(v.id);
    onVersionChange?.(v.id);
  };

  /* --------------------------------- tab -------------------------------- */

  const hasPreview =
    artifact.kind === "document" || shown?.preview !== undefined;
  const [ownTab, setOwnTab] = React.useState<ArtifactTab>(defaultTab);
  const activeTab: ArtifactTab = hasPreview ? (tab ?? ownTab) : "code";
  const tabs: ArtifactTab[] = hasPreview ? ["preview", "code"] : ["code"];
  const tabNodes = React.useRef(new Map<ArtifactTab, HTMLButtonElement>());

  const chooseTab = (t: ArtifactTab, focus = false) => {
    if (focus) tabNodes.current.get(t)?.focus();
    if (disabled || t === activeTab) return;
    audio.play("click", { pitch: t === "code" ? 1.1 : 0.95, gain: 0.4 });
    if (tab === undefined) setOwnTab(t);
    onTabChange?.(t);
  };

  /* -------------------------------- dock -------------------------------- */

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [stage, setStage] = React.useState<Stage>(isOpen ? "open" : "docked");
  const [seenOpen, setSeenOpen] = React.useState(isOpen);
  if (seenOpen !== isOpen) {
    setSeenOpen(isOpen);
    setStage(isOpen ? "opening" : "closing");
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const threadRef = React.useRef<HTMLOListElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const paneRef = React.useRef<HTMLElement | null>(null);
  const chipRef = React.useRef<HTMLButtonElement | null>(null);
  const dockRef = React.useRef<HTMLButtonElement | null>(null);
  const focusAfter = React.useRef<"chip" | "pane" | null>(null);
  const flight = React.useRef<Flight | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);

  const share = useMotionValue(isOpen ? 1 : 0);
  const paneFade = useMotionValue(isOpen ? 1 : 0);
  const chipVis = useMotionValue(1);
  const chipScale = useMotionValue(1);
  const fly = useMotionValue(0);
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gw = useMotionValue(0);
  const gh = useMotionValue(0);
  const gr = useMotionValue(10);
  const go = useMotionValue(0);
  const lift = useMotionValue(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const requestOpen = (next: boolean) => {
    if (disabled || next === isOpen) return;
    const active = document.activeElement;
    const from = next ? chipRef.current : paneRef.current;
    focusAfter.current =
      active && from?.contains(active) ? (next ? "pane" : "chip") : null;
    audio.play("swish", { pitch: next ? 1.12 : 0.85, gain: 0.5 });
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  /** A box inside the root's padding box, where the ghost is positioned. */
  const boxOf = (el: Element | null): Box | null => {
    const root = rootRef.current;
    if (!root || !el) return null;
    const a = root.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return {
      x: r2(b.left - a.left - root.clientLeft),
      y: r2(b.top - a.top - root.clientTop),
      w: r2(b.width),
      h: r2(b.height),
    };
  };

  const ghostBox = (): Box => ({
    x: gx.get(),
    y: gy.get(),
    w: gw.get(),
    h: gh.get(),
  });

  const placeGhost = (b: Box) => {
    gx.set(b.x);
    gy.set(b.y);
    gw.set(b.w);
    gh.set(b.h);
  };

  /** Scrolls the thread, and only the thread, so the chip is in view. */
  const revealInThread = (node: HTMLElement) => {
    const thread = threadRef.current;
    if (!thread || !thread.contains(node)) return;
    const a = thread.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    if (b.top < a.top) thread.scrollTop -= a.top - b.top + 8;
    else if (b.bottom > a.bottom) thread.scrollTop += b.bottom - a.bottom + 8;
  };

  const startClose = () => {
    const chip = chipRef.current;
    if (chip) revealInThread(chip);
    const from = go.get() > 0.5 ? ghostBox() : boxOf(paneRef.current);
    chipVis.set(0);
    if (!motionSafe || !from || !chip) {
      run(
        "fade",
        animate(paneFade, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => api.current?.landClose(),
        }),
      );
      return;
    }
    flight.current = {
      from,
      fromR: go.get() > 0.5 ? gr.get() : 0,
      toR: 10,
      target: () => chipRef.current,
    };
    placeGhost(from);
    gr.set(flight.current.fromR);
    anims.current.get("go")?.stop();
    go.set(1);
    run("fade", animate(paneFade, 0, { duration: durations.blink }));
    run("share", animate(share, 0, springs.glide));
    fly.set(0);
    run(
      "fly",
      animate(fly, 1, {
        ...springs.glide,
        onComplete: () => api.current?.landClose(),
      }),
    );
  };

  const landClose = () => {
    flight.current = null;
    anims.current.get("go")?.stop();
    go.set(0);
    share.set(0);
    paneFade.set(0);
    lift.set(0);
    setStage("docked");
    if (motionSafe) {
      chipVis.set(1);
      chipScale.set(0.96);
      run("chip", animate(chipScale, 1, springs.recoil));
    } else {
      run(
        "chip",
        animate(chipVis, 1, { duration: durations.fast, ease: easings.enter }),
      );
    }
    say("Docked to the conversation.");
  };

  const startOpen = () => {
    const from = go.get() > 0.5 ? ghostBox() : boxOf(chipRef.current);
    if (!motionSafe || !from) {
      share.set(1);
      chipVis.set(1);
      api.current?.landOpen();
      return;
    }
    chipVis.set(0);
    flight.current = {
      from,
      fromR: go.get() > 0.5 ? gr.get() : 10,
      toR: 0,
      target: () => wrapRef.current,
    };
    placeGhost(from);
    gr.set(flight.current.fromR);
    anims.current.get("go")?.stop();
    go.set(1);
    paneFade.set(0);
    run("share", animate(share, 1, springs.glide));
    fly.set(0);
    run(
      "fly",
      animate(fly, 1, {
        ...springs.glide,
        onComplete: () => api.current?.landOpen(),
      }),
    );
  };

  const landOpen = () => {
    flight.current = null;
    share.set(1);
    chipVis.set(1);
    lift.set(0);
    setStage("open");
    // The ghost and the pane cross-fade, so the frame never blinks.
    run(
      "go",
      animate(go, 0, { duration: durations.base, ease: easings.enter }),
    );
    run(
      "fade",
      animate(paneFade, 1, {
        duration: motionSafe ? durations.base : durations.fast,
        ease: easings.enter,
      }),
    );
    say(`Opened ${artifact.title.replace(/[.\s]+$/, "")}.`);
  };

  const onFly = (p: number) => {
    const f = flight.current;
    if (!f) return;
    const to = boxOf(f.target());
    if (!to) return;
    gx.set(r2(lerp(f.from.x, to.x, p)));
    gy.set(r2(lerp(f.from.y, to.y, p)));
    gw.set(r2(Math.max(0, lerp(f.from.w, to.w, p))));
    gh.set(r2(Math.max(0, lerp(f.from.h, to.h, p))));
    gr.set(r2(Math.max(0, lerp(f.fromR, f.toR, Math.min(1, p)))));
    lift.set(r2(Math.sin(Math.PI * Math.min(1, Math.max(0, p)))));
  };

  // A layout effect, declared before the one that starts flights, so a flight
  // starting in this commit runs this render's functions.
  React.useLayoutEffect(() => {
    api.current = { startClose, startOpen, landClose, landOpen, onFly };
  });

  React.useEffect(() => fly.on("change", (p) => api.current?.onFly(p)), [fly]);

  // A flight starts once the chip it lands in (or leaves from) is on the
  // page; a re-run (StrictMode, a quick reversal) starts again from wherever
  // the ghost has got to.
  React.useLayoutEffect(() => {
    if (stage === "closing") api.current?.startClose();
    else if (stage === "opening") api.current?.startOpen();
  }, [stage]);

  // Focus follows a flight the keyboard (or a press inside) started, once the
  // commit that lands it has taken `inert` off its new home.
  React.useEffect(() => {
    const want = focusAfter.current;
    if (want === "pane" && stage === "open") {
      focusAfter.current = null;
      dockRef.current?.focus({ preventScroll: true });
    } else if (want === "chip" && stage === "docked") {
      focusAfter.current = null;
      chipRef.current?.focus({ preventScroll: true });
    }
  }, [stage]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // The phone layout covers the thread with the pane; while it does, the
  // thread is out of reach so focus stays in the sheet. The writing pulse
  // only runs while the surface is on screen.
  const [narrow, setNarrow] = React.useState(false);
  const [inView, setInView] = React.useState(true);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < 640);
    });
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setInView(entry.isIntersecting);
    });
    ro.observe(root);
    io.observe(root);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);
  const pulse = motionSafe && inView;

  // A new turn scrolls the thread to it while the reader is near the end.
  const threadLength = conversation.length;
  const stuck = React.useRef(true);
  React.useEffect(() => {
    const thread = threadRef.current;
    if (thread && stuck.current) thread.scrollTop = thread.scrollHeight;
  }, [threadLength, status]);

  /* ------------------------------ copy, save ----------------------------- */

  const [copied, setCopied] = React.useState(0);
  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(0), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = () => {
    if (disabled || !shown) return;
    audio.play("click", { pitch: 1.25, gain: 0.5 });
    void navigator.clipboard?.writeText(shown.source)?.catch(() => {});
    setCopied((c) => c + 1);
    say(`Copied version ${index + 1}.`);
    onCopy?.(shown.source, shown);
  };

  const save = () => {
    if (disabled || !shown) return;
    audio.play("click", { pitch: 0.85, gain: 0.5 });
    const file: ArtifactFile = {
      name: artifact.filename,
      text: shown.source,
      type: artifact.kind === "document" ? "text/markdown" : "text/plain",
    };
    say(`Downloaded ${file.name}.`);
    if (onDownload?.(file) === false) return;
    const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ------------------------------- indicators ---------------------------- */

  const {
    x: tabX,
    w: tabW,
    bind: bindTab,
    setGroup: setTabGroup,
  } = useIndicator(activeTab, motionSafe);
  const {
    x: pillX,
    w: pillW,
    bind: bindPill,
    setGroup: setPillGroup,
  } = useIndicator(shown?.id ?? "", motionSafe);
  const rail = useMotionValue(list.length > 1 ? index / (list.length - 1) : 1);
  React.useEffect(() => {
    const to = list.length > 1 ? index / (list.length - 1) : 1;
    if (!motionSafe) {
      rail.set(to);
      return;
    }
    const c = animate(rail, to, springs.glide);
    return () => c.stop();
  }, [index, list.length, motionSafe, rail]);
  const railWidth = useTransform(rail, (r) => `${r2(r * 100)}%`);

  /* ------------------------------ derived bits --------------------------- */

  const nowMs = now !== undefined ? toMs(now) : (latest?.at ?? 0);
  const wrapWidth = useTransform(
    share,
    (s) => `calc((100% - var(--artifact-conv)) * ${r2(Math.max(0, s))})`,
  );
  const ghostShadow = useTransform(lift, (l) =>
    l < 0.01
      ? "none"
      : `0 ${r2(10 * l)}px ${r2(28 * l)}px color-mix(in oklab, black ${Math.round(18 * l)}%, transparent)`,
  );
  const dockTurn =
    [...conversation]
      .reverse()
      .find((t) => t.role === "assistant" && t.version === shown?.id) ??
    [...conversation].reverse().find((t) => t.version !== undefined);
  const chipOn = stage !== "open";
  const writingLabel = `Writing v${list.length + 1}`;

  const onPaneKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || stage !== "open") return;
    // Handled here, where focus is: the stage around it must not also close.
    event.preventDefault();
    requestOpen(false);
  };

  const onRadioKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    const last = list.length - 1;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? Math.min(last, index + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (to === -1) return;
    event.preventDefault();
    const node = event.currentTarget.parentElement?.querySelector<HTMLElement>(
      `[data-version="${list[to]?.id ?? ""}"]`,
    );
    node?.focus();
    choose(to);
  };

  const chip = (where: "inline" | "pinned") => (
    <motion.button
      ref={chipRef}
      type="button"
      disabled={disabled}
      aria-expanded={isOpen}
      aria-controls={paneId}
      aria-label={
        isOpen
          ? `Dock ${artifact.title}`
          : `Open ${artifact.title}, version ${index + 1}`
      }
      onClick={() => requestOpen(!isOpen)}
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-3 border px-3 text-left transition-colors",
        "enabled:hover:border-cobalt-bright/50 disabled:cursor-not-allowed",
        isOpen
          ? "border-cobalt-bright/40 bg-cobalt-wash"
          : "border-hairline-strong bg-surface-2",
        where === "inline" && "mt-2 max-w-[18rem]",
        FOCUS,
      )}
      style={{ opacity: chipVis, scale: chipScale }}
    >
      <FileText aria-hidden className="size-4 shrink-0 text-cobalt-bright" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {artifact.title}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-ink-3">
        v{index + 1}
      </span>
      {isOpen ? (
        <PanelRightClose aria-hidden className="size-3.5 shrink-0 text-ink-3" />
      ) : (
        <Maximize2 aria-hidden className="size-3.5 shrink-0 text-ink-3" />
      )}
    </motion.button>
  );

  const tool = cn(
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-1.5 text-[12px] text-ink-2 transition-colors",
    "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
    FOCUS,
  );

  const versionControl =
    versions === "stepper" ? (
      <div
        role="group"
        aria-label={`Version ${index + 1} of ${list.length}`}
        className="inline-flex h-7 shrink-0 items-center rounded-full border border-hairline"
      >
        <button
          type="button"
          aria-label="Previous version"
          aria-disabled={index === 0 || undefined}
          disabled={disabled}
          onClick={() => choose(index - 1)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full text-ink-2 transition-colors",
            "not-aria-disabled:enabled:hover:text-foreground aria-disabled:opacity-40",
            FOCUS,
          )}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <span className="flex items-center gap-0.5 font-mono text-[11px] text-foreground">
          v<Roll value={index + 1} motionSafe={motionSafe} />
          <span className="text-ink-3">/{list.length}</span>
        </span>
        <button
          type="button"
          aria-label="Next version"
          aria-disabled={index === list.length - 1 || undefined}
          disabled={disabled}
          onClick={() => choose(index + 1)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full text-ink-2 transition-colors",
            "not-aria-disabled:enabled:hover:text-foreground aria-disabled:opacity-40",
            FOCUS,
          )}
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    ) : versions === "pills" ? (
      <div
        ref={setPillGroup}
        role="radiogroup"
        aria-label="Version"
        className="relative inline-flex h-7 min-w-0 [scrollbar-width:none] items-center overflow-x-auto rounded-full bg-surface-2 p-0.5"
      >
        <motion.span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0 rounded-full border border-hairline-strong bg-card"
          style={{ x: pillX, width: pillW }}
        />
        {list.map((v, i) => (
          <button
            key={v.id}
            ref={bindPill(v.id)}
            type="button"
            role="radio"
            data-version={v.id}
            aria-checked={i === index}
            aria-label={`Version ${i + 1}, ${v.summary}`}
            tabIndex={i === index ? 0 : -1}
            disabled={disabled}
            onClick={() => choose(i)}
            onKeyDown={onRadioKeys}
            className={cn(
              "relative inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[11px] transition-colors @min-[30rem]:min-w-7",
              i === index
                ? "text-foreground"
                : "text-ink-3 enabled:hover:text-ink-2",
              FOCUS_IN,
            )}
          >
            v{i + 1}
          </button>
        ))}
      </div>
    ) : null;

  const stat =
    view.added + view.removed > 0 ? (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
        <span
          className={cn(
            "inline-flex",
            view.added ? "text-success" : "text-ink-3",
          )}
        >
          +<Roll value={view.added} motionSafe={motionSafe} />
        </span>
        <span
          className={cn(
            "inline-flex",
            view.removed ? "text-danger" : "text-ink-3",
          )}
        >
          −<Roll value={view.removed} motionSafe={motionSafe} />
        </span>
      </span>
    ) : null;

  const panel = (t: ArtifactTab) => {
    const on = t === activeTab;
    const side = t === "preview" ? -1 : 1;
    return (
      <motion.div
        key={t}
        id={panelId(t)}
        role="tabpanel"
        aria-labelledby={tabId(t)}
        tabIndex={on ? 0 : -1}
        inert={!on}
        className={cn(
          "absolute inset-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain",
          FOCUS_IN,
        )}
        initial={false}
        animate={
          on
            ? { x: 0, opacity: 1, visibility: "visible" }
            : {
                x: motionSafe ? side * distances.shift : 0,
                opacity: 0,
                transitionEnd: { visibility: "hidden" },
              }
        }
        transition={
          on
            ? {
                x: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }
            : exitFor(durations.base)
        }
      >
        {t === "preview" ? (
          artifact.kind === "document" ? (
            <div className="mx-auto max-w-[38rem] px-4 py-4 @min-[40rem]:px-6 @min-[40rem]:py-5">
              <DiffRows
                rows={view.rows}
                marks={showMarks}
                wash={!view.settled}
                diff={diff}
                motionSafe={motionSafe}
                render={(row, _n, kind) => {
                  const body = <PreviewLine text={row.text} />;
                  if (kind === "add") {
                    return (
                      <ins className="relative block px-2 no-underline">
                        {body}
                      </ins>
                    );
                  }
                  if (kind === "del") {
                    return (
                      <del className="relative block px-2 text-ink-3 decoration-danger/70">
                        {body}
                      </del>
                    );
                  }
                  return <div className="relative px-2">{body}</div>;
                }}
              />
            </div>
          ) : (
            <motion.div
              key={shown?.id}
              className="p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {shown?.preview}
            </motion.div>
          )
        ) : (
          <div className="py-3 font-mono text-[12px] leading-5">
            <DiffRows
              rows={view.rows}
              marks={showMarks}
              wash={!view.settled}
              diff={diff}
              motionSafe={motionSafe}
              render={(row, n, kind) => {
                const code = (
                  <code className="min-w-0 flex-1 pr-4 [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {sourceTokens(row.text, artifact.kind).map((tok, i) => (
                      <span key={i} className={tok.c}>
                        {tok.t}
                      </span>
                    ))}
                    {row.text ? null : " "}
                  </code>
                );
                return (
                  <div className="relative flex gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        "w-9 shrink-0 text-right tabular-nums select-none",
                        kind === "add"
                          ? "text-success"
                          : kind === "del"
                            ? "text-danger"
                            : "text-ink-3",
                      )}
                    >
                      {kind === "del" ? "−" : kind === "add" ? `+${n}` : n}
                    </span>
                    {kind === "add" ? (
                      <ins className="flex min-w-0 flex-1 no-underline">
                        {code}
                      </ins>
                    ) : kind === "del" ? (
                      <del className="flex min-w-0 flex-1 text-ink-3 decoration-danger/70">
                        {code}
                      </del>
                    ) : (
                      code
                    )}
                  </div>
                );
              }}
            />
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label ?? `${artifact.title} and the conversation`}
      className={cn(
        "@container relative isolate flex h-[540px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* The conversation. */}
      <div
        inert={narrow && stage === "open"}
        className="flex min-w-0 flex-1 flex-col"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
          <span
            aria-hidden
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright"
          >
            <Sparkles className="size-3" />
          </span>
          <span className="min-w-0 truncate text-[13px] font-medium">
            Conversation
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
            {plural(list.length, "version")}
          </span>
        </div>
        <ol
          ref={threadRef}
          role="list"
          aria-label="Conversation"
          onScroll={(event) => {
            const t = event.currentTarget;
            stuck.current = t.scrollHeight - t.scrollTop - t.clientHeight < 24;
          }}
          className="flex flex-1 [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3"
        >
          {conversation.map((turn) => {
            if (turn.role === "user") {
              return (
                <li key={turn.id} className="flex flex-col items-end gap-1">
                  {turn.at !== undefined ? (
                    <span className="hidden text-[11px] text-ink-3 @min-[60rem]:block">
                      {ago(turn.at, nowMs)}
                    </span>
                  ) : null}
                  <p className="max-w-[88%] rounded-3 bg-cobalt-wash px-3 py-2 text-[13px] leading-5 text-foreground">
                    {turn.text}
                  </p>
                </li>
              );
            }
            const vi = at(turn.version);
            const v = list[vi];
            const isDock = dock === "inline" && chipOn && turn === dockTurn;
            return (
              <li key={turn.id} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright"
                >
                  <Sparkles className="size-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2 text-[11px] text-ink-3">
                    <span className="truncate">
                      {turn.author ?? "Assistant"}
                    </span>
                    {turn.at !== undefined ? (
                      <span className="hidden shrink-0 @min-[60rem]:inline">
                        {ago(turn.at, nowMs)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[13px] leading-5 text-foreground">
                    {turn.text}
                  </p>
                  {isDock ? (
                    chip("inline")
                  ) : v ? (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-current={isOpen && vi === index ? "true" : undefined}
                      aria-label={`Open version ${vi + 1}, ${v.summary}`}
                      onClick={() => {
                        choose(vi);
                        if (!isOpen) requestOpen(true);
                      }}
                      className={cn(
                        "mt-2 inline-flex h-7 max-w-full items-center gap-1.5 rounded-2 border px-2 text-[11px] transition-colors",
                        isOpen && vi === index
                          ? "border-cobalt-bright/40 bg-cobalt-wash text-foreground"
                          : "border-hairline text-ink-2 enabled:hover:border-hairline-strong enabled:hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      <FileText
                        aria-hidden
                        className="size-3.5 shrink-0 text-cobalt-bright"
                      />
                      <span className="shrink-0 font-mono">v{vi + 1}</span>
                      <span className="min-w-0 truncate">{v.summary}</span>
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {status === "writing" ? (
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright"
              >
                <Sparkles className="size-3" />
              </span>
              <span className="text-[12px] text-ink-3">{writingLabel}</span>
              <Dots motionSafe={pulse} />
            </li>
          ) : null}
          {dock === "inline" && chipOn && !dockTurn ? (
            <li>{chip("inline")}</li>
          ) : null}
        </ol>
        {dock === "pinned" ? (
          <div className="shrink-0 border-t border-hairline p-2">
            {chip("pinned")}
          </div>
        ) : null}
      </div>

      {/* The pane's column: it closes as the pane docks. */}
      <motion.div
        ref={wrapRef}
        className={cn(
          "relative shrink-0 overflow-clip [--artifact-conv:15rem] @min-[60rem]:[--artifact-conv:19rem]",
          "@max-[40rem]:absolute @max-[40rem]:inset-0 @max-[40rem]:z-10 @max-[40rem]:w-full!",
          stage === "docked" && "hidden",
        )}
        style={{ width: wrapWidth }}
      >
        <motion.section
          ref={paneRef}
          id={paneId}
          aria-labelledby={titleId}
          inert={stage !== "open"}
          onKeyDown={onPaneKeyDown}
          className="absolute inset-y-0 right-0 flex w-[calc(100cqw-var(--artifact-conv))] flex-col border-l border-hairline bg-card @max-[40rem]:w-full @max-[40rem]:border-l-0"
          style={{ opacity: paneFade }}
        >
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline pr-2 pl-3">
            <FileText
              aria-hidden
              className="size-4 shrink-0 text-cobalt-bright"
            />
            <h3
              id={titleId}
              title={artifact.title}
              className="min-w-0 truncate text-[13px] font-medium"
            >
              {artifact.title}
            </h3>
            {artifact.language ? (
              <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[48rem]:inline">
                {artifact.language}
              </span>
            ) : null}
            {status === "writing" ? (
              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-cobalt-wash px-2 text-[11px] text-cobalt-bright">
                <span className="hidden @min-[30rem]:inline">
                  {writingLabel}
                </span>
                <Dots motionSafe={pulse} />
              </span>
            ) : null}
            <span className="flex-1" />
            {shown ? (
              <span
                title={shown.summary}
                className="hidden max-w-[16rem] truncate text-[11px] text-ink-3 @min-[60rem]:block"
              >
                {shown.summary} · {ago(shown.at, nowMs)}
              </span>
            ) : null}
            <button
              type="button"
              aria-label={copied ? "Copied" : "Copy"}
              disabled={disabled || !shown}
              onClick={copy}
              className={tool}
            >
              <span aria-hidden className="inline-grid size-4">
                <motion.span
                  className="[grid-area:1/1]"
                  initial={false}
                  animate={
                    copied
                      ? { opacity: 0, scale: motionSafe ? 0.6 : 1 }
                      : { opacity: 1, scale: 1 }
                  }
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                >
                  <Copy className="size-4" />
                </motion.span>
                <motion.span
                  className="text-success [grid-area:1/1]"
                  initial={false}
                  animate={
                    copied
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: motionSafe ? 0.6 : 1 }
                  }
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                >
                  <Check className="size-4" />
                </motion.span>
              </span>
              <span
                aria-hidden
                className="hidden grid-cols-1 @min-[60rem]:inline-grid"
              >
                <span className={cn("[grid-area:1/1]", copied && "invisible")}>
                  Copy
                </span>
                <span className={cn("[grid-area:1/1]", !copied && "invisible")}>
                  Copied
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label={`Download ${artifact.filename}`}
              disabled={disabled || !shown}
              onClick={save}
              className={tool}
            >
              <Download aria-hidden className="size-4" />
              <span aria-hidden className="hidden @min-[60rem]:inline">
                Download
              </span>
            </button>
            <button
              ref={dockRef}
              type="button"
              aria-label="Dock to the conversation"
              aria-expanded={isOpen}
              aria-controls={paneId}
              disabled={disabled}
              onClick={() => requestOpen(false)}
              className={tool}
            >
              <PanelRightClose
                aria-hidden
                className="size-4 @max-[40rem]:hidden"
              />
              <ChevronDown
                aria-hidden
                className="hidden size-4 @max-[40rem]:block"
              />
            </button>
          </div>

          <div className="relative flex h-10 shrink-0 items-center gap-2 border-b border-hairline px-3 @min-[30rem]:gap-3">
            {tabs.length > 1 ? (
              <div
                ref={setTabGroup}
                role="tablist"
                aria-label="View"
                className="relative flex h-full shrink-0 items-stretch"
              >
                {tabs.map((t) => (
                  <button
                    key={t}
                    ref={(node) => {
                      bindTab(t)(node);
                      if (node) tabNodes.current.set(t, node);
                      else tabNodes.current.delete(t);
                    }}
                    type="button"
                    role="tab"
                    id={tabId(t)}
                    aria-selected={t === activeTab}
                    aria-controls={panelId(t)}
                    tabIndex={t === activeTab ? 0 : -1}
                    disabled={disabled}
                    onClick={() => chooseTab(t)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowRight" ||
                        event.key === "ArrowLeft" ||
                        event.key === "Home" ||
                        event.key === "End"
                      ) {
                        event.preventDefault();
                        const i = tabs.indexOf(t);
                        const to =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? tabs.length - 1
                              : (i +
                                  (event.key === "ArrowRight" ? 1 : -1) +
                                  tabs.length) %
                                tabs.length;
                        const next = tabs[to];
                        if (next) chooseTab(next, true);
                      }
                    }}
                    className={cn(
                      "relative inline-flex items-center px-2 text-[12px] transition-colors",
                      t === activeTab
                        ? "text-foreground"
                        : "text-ink-3 enabled:hover:text-ink-2",
                      FOCUS_IN,
                    )}
                  >
                    {t === "preview" ? "Preview" : "Code"}
                  </button>
                ))}
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-cobalt-bright"
                  style={{ x: tabX, width: tabW }}
                />
              </div>
            ) : (
              <span className="text-[12px] text-foreground">Code</span>
            )}
            <span className="flex-1" />
            {diff === "hold" && stat ? (
              <button
                type="button"
                aria-pressed={showMarks}
                aria-label={`Changes: ${view.added} added, ${view.removed} removed`}
                disabled={disabled}
                onClick={() => {
                  audio.play("click", {
                    pitch: showMarks ? 0.9 : 1.1,
                    gain: 0.4,
                  });
                  setView((v) => (v.settled ? { ...v, settled: false } : v));
                  setMarks((m) => !m);
                }}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 transition-colors",
                  showMarks
                    ? "border-hairline-strong bg-surface-2"
                    : "border-hairline opacity-70 enabled:hover:opacity-100",
                  FOCUS,
                )}
              >
                {stat}
              </button>
            ) : stat ? (
              <span
                className="inline-flex h-7 shrink-0 items-center"
                title={`${view.added} added, ${view.removed} removed`}
              >
                {stat}
              </span>
            ) : null}
            {versionControl}
            {status === "writing" ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-clip"
              >
                <motion.span
                  className="absolute inset-y-0 left-0 w-1/3 bg-cobalt-bright"
                  initial={{ x: "-100%" }}
                  animate={pulse ? { x: "300%" } : { x: "100%" }}
                  transition={
                    pulse
                      ? {
                          duration: 1.2,
                          ease: easings.move,
                          repeat: Infinity,
                        }
                      : { duration: 0 }
                  }
                />
              </span>
            ) : null}
          </div>

          {versions === "timeline" && list.length > 0 ? (
            <div className="flex h-10 shrink-0 items-center gap-3 border-b border-hairline px-3">
              <div
                role="radiogroup"
                aria-label="Version"
                className="relative flex h-6 shrink-0 items-center"
                style={{ width: list.length * 24 }}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-hairline-strong"
                />
                <span
                  aria-hidden
                  className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2"
                >
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-cobalt-bright"
                    style={{ width: railWidth }}
                  />
                </span>
                {list.map((v, i) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    data-version={v.id}
                    aria-checked={i === index}
                    aria-label={`Version ${i + 1}, ${v.summary}`}
                    tabIndex={i === index ? 0 : -1}
                    disabled={disabled}
                    onClick={() => choose(i)}
                    onKeyDown={onRadioKeys}
                    className={cn(
                      "relative flex size-6 shrink-0 items-center justify-center rounded-full",
                      FOCUS,
                    )}
                  >
                    <span
                      className={cn(
                        "size-2.5 rounded-full border transition-colors",
                        i <= index
                          ? "border-cobalt-bright bg-cobalt-bright"
                          : "border-hairline-strong bg-card",
                        i === index && "ring-2 ring-cobalt-bright/25",
                      )}
                    />
                  </button>
                ))}
              </div>
              {shown ? (
                <p className="min-w-0 truncate text-[12px] text-ink-2">
                  <span className="font-mono text-foreground">
                    v{index + 1}
                  </span>{" "}
                  · {shown.summary}
                  <span className="hidden text-ink-3 @min-[30rem]:inline">
                    {" "}
                    · {ago(shown.at, nowMs)}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-danger/5 px-3 py-2 text-[12px] text-danger">
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                The revision did not finish.
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={onRetry}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-danger/30 px-2 text-[12px] text-danger transition-colors enabled:hover:bg-danger/10",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Retry
              </button>
            </div>
          ) : null}

          <div className="relative flex-1 overflow-hidden">
            {shown ? (
              tabs.map((t) => panel(t))
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="text-[13px] font-medium">Nothing here yet</p>
                <p className="text-[12px] text-ink-3">
                  The first version appears when it is written.
                </p>
              </div>
            )}
          </div>
        </motion.section>
      </motion.div>

      {/* The pane's frame in flight, between the column and the chip. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-30 overflow-clip border border-hairline-strong bg-surface-2"
        style={{
          x: gx,
          y: gy,
          width: gw,
          height: gh,
          borderRadius: gr,
          opacity: go,
          boxShadow: ghostShadow,
        }}
      >
        <span className="flex h-10 items-center gap-2 px-3 whitespace-nowrap">
          <FileText className="size-4 shrink-0 text-cobalt-bright" />
          <span className="truncate text-[13px] font-medium text-foreground">
            {artifact.title}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3">
            v{index + 1}
          </span>
        </span>
      </motion.div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** Three dots that pulse while something is being written. */
function Dots({ motionSafe }: { motionSafe: boolean }) {
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1 rounded-full bg-current"
          initial={{ opacity: 0.35 }}
          animate={motionSafe ? { opacity: 1 } : { opacity: 0.7 }}
          transition={
            motionSafe
              ? {
                  duration: 0.5,
                  ease: easings.move,
                  repeat: Infinity,
                  repeatType: "reverse",
                  delay: i * 0.16,
                }
              : { duration: 0 }
          }
        />
      ))}
    </span>
  );
}
