"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ThreadRole = "user" | "assistant";
export type ThreadReaction = "up" | "down";
export type ThreadDensity = "compact" | "cozy" | "roomy";
export type ThreadToolbar = "hover" | "always" | "off";
export type ThreadStatus = "ready" | "loading" | "error";

export type ThreadMessage = {
  /** Unique within the thread. */
  id: string;
  /** The message this one follows; null for the first turn. Messages that share a parent are versions of one turn. */
  parentId: string | null;
  role: ThreadRole;
  /** Who wrote it: a person's name, or the model's. */
  author: string;
  /** When it was sent, in ms since the epoch. */
  at: number;
  /** Paragraphs split by blank lines; "- " lines make a list, ``` fences a code block, `code` and **bold** work inline. */
  text: string;
  /** The reader's verdict on a reply. */
  reaction?: ThreadReaction | null;
  /** Still arriving (drawn with a caret), or failed (drawn with Retry). */
  status?: "streaming" | "error";
};

export type ThreadViewProps = {
  /** How tightly the thread is set: type size, padding, avatars and the gaps between runs. @default "cozy" */
  density?: ThreadDensity;
  /** Editing a sent message keeps every version, with arrows to move between them. Off: an edit reads as a replacement. @default true */
  branches?: boolean;
  /** Where each message's actions live: a pill on hover or focus, a row always shown, or nowhere (a read-only transcript). @default "hover" */
  toolbar?: ThreadToolbar;
  /** Controlled messages: every version of every turn, as one flat list. */
  messages?: ThreadMessage[];
  /** Initial messages when uncontrolled. @default defaultThreadMessages */
  defaultMessages?: ThreadMessage[];
  /** Fires from the send, edit or reaction that changed the list, with the whole new list. */
  onMessagesChange?: (messages: ThreadMessage[]) => void;
  /** Controlled branch: any message on it. The thread runs from the first turn through it, then on down the newest replies. */
  leaf?: string;
  /** Initial branch when uncontrolled. @default the newest version of every turn */
  defaultLeaf?: string;
  /** Fires when a version switch, a send or an edit moves the visible branch. */
  onLeafChange?: (leaf: string) => void;
  /** A message was sent from the composer. It is already in the list. */
  onSend?: (text: string, message: ThreadMessage) => void;
  /** A message was edited: `version` is the new sibling of `original`, and the branch now shows it. */
  onEdit?: (original: ThreadMessage, version: ThreadMessage) => void;
  /** A message or one of its code blocks was copied. */
  onCopy?: (text: string, messageId: string) => void;
  /** A reply was marked good or bad, or cleared (null). */
  onReact?: (messageId: string, reaction: ThreadReaction | null) => void;
  /** Retry was pressed on a reply that failed. */
  onRetry?: (messageId: string) => void;
  /** "Try again" was pressed after the thread failed to load. */
  onReload?: () => void;
  /** The moment relative times count from (Date or ms). @default the newest message's time */
  now?: number | Date;
  /** The name new messages are sent under. @default the newest user message's author, else "You" */
  author?: string;
  /** The thread's name, shown in the header. @default "Basin export retries" */
  title?: string;
  /** The model answering, shown in the header and the composer. @default "Fernworks Model 3" */
  model?: string;
  /** Whether the thread's data has arrived. @default "ready" */
  status?: ThreadStatus;
  /** Show the composer under the thread. @default true */
  composer?: boolean;
  /** The composer's placeholder. @default "Message <model>" */
  placeholder?: string;
  /** Prompts offered while the thread is empty; one fills the composer. */
  suggestions?: string[];
  /** The thread's accessible name. @default the title */
  label?: string;
  /** Play the thread's sounds. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be sent, edited or reacted to. */
  disabled?: boolean;
  className?: string;
};

const MIN = 60_000;
/** A fixed afternoon, so the default thread renders the same on every machine. */
export const defaultThreadNow = Date.UTC(2026, 8, 24, 14, 32);
const N = defaultThreadNow;
const RAE = "Rae Okafor";
const MODEL = "Fernworks Model 3";

/**
 * A Fieldline engineer debugging export retries. The first turn was asked
 * three ways, so it carries three versions, each with its own reply; the
 * newest one goes on to a two-message question and a two-message answer.
 */
export const defaultThreadMessages: ThreadMessage[] = [
  {
    id: "t1-v1",
    parentId: null,
    role: "user",
    author: RAE,
    at: N - 34 * MIN,
    text: "Our Basin export job retries failed uploads, but the retries pile up. How should I space them?",
  },
  {
    id: "t1-v1-a",
    parentId: "t1-v1",
    role: "assistant",
    author: MODEL,
    at: N - 33 * MIN,
    text: "Start with a short fixed delay and double it after each failure, up to a limit you can live with.",
  },
  {
    id: "t1-v2",
    parentId: null,
    role: "user",
    author: RAE,
    at: N - 23 * MIN,
    text: "Basin export retries pile up after an outage. What backoff should the uploader use?",
  },
  {
    id: "t1-v2-a",
    parentId: "t1-v2",
    role: "assistant",
    author: MODEL,
    at: N - 22 * MIN,
    text: "Use exponential backoff: wait 0.5 s, then 1 s, 2 s and 4 s, and stop doubling at about 30 s.",
  },
  {
    id: "t1-v3",
    parentId: null,
    role: "user",
    author: RAE,
    at: N - 13 * MIN,
    text: "Basin export retries pile up after an upload outage and swamp the bucket the moment it recovers. How should the uploader back off?",
  },
  {
    id: "t1-v3-a",
    parentId: "t1-v3",
    role: "assistant",
    author: MODEL,
    at: N - 12 * MIN,
    text: [
      "Back off exponentially, cap the wait, and add **full jitter**, so the retries from one outage do not all land in the same second.",
      "```ts\nconst base = 500; // ms\nconst cap = 30_000;\n\nfunction delay(attempt: number, rand: () => number) {\n  const ceiling = Math.min(cap, base * 2 ** attempt);\n  return Math.round(rand() * ceiling);\n}\n```",
      "With full jitter the herd spreads across the whole window instead of arriving in waves.",
    ].join("\n\n"),
  },
  {
    id: "t2",
    parentId: "t1-v3-a",
    role: "user",
    author: RAE,
    at: N - 7 * MIN,
    text: "Does the cap still matter if we also limit attempts?",
  },
  {
    id: "t2-b",
    parentId: "t2",
    role: "user",
    author: RAE,
    at: N - 7 * MIN + 20_000,
    text: "We give up after six tries today.",
  },
  {
    id: "t2-a",
    parentId: "t2-b",
    role: "assistant",
    author: MODEL,
    at: N - 6 * MIN,
    text: [
      "Yes. The attempt limit bounds how long you keep trying; the cap bounds the longest single wait. Without one, attempt 6 waits up to 32 s and attempt 8 over two minutes.",
      "- Keep the cap near your upload timeout.\n- Count attempts per file, not per job.",
    ].join("\n\n"),
  },
  {
    id: "t2-a2",
    parentId: "t2-a",
    role: "assistant",
    author: MODEL,
    at: N - 5 * MIN,
    text: [
      "If the bucket answers `429`, honour its retry hint before your own delay:",
      '```ts\nconst hint = Number(res.headers.get("retry-after") ?? 0) * 1000;\nawait sleep(Math.max(hint, delay(attempt, rand)));\n```',
    ].join("\n\n"),
  },
];

const DEFAULT_SUGGESTIONS = [
  "Why do my retries arrive in waves?",
  "Draft a backoff policy for the uploader",
  "What should a 429 do to the next attempt?",
];

type Density = {
  body: string;
  gap: string;
  run: string;
  within: string;
  bubble: string;
  avatar: string;
  indent: string;
};

/** Runs are 2px apart inside and open up between authors; density sets the rest. */
const DENSITY: Record<ThreadDensity, Density> = {
  compact: {
    body: "text-[13px] leading-5",
    gap: "gap-1.5",
    run: "mt-3",
    within: "mt-0.5",
    bubble: "px-3 py-1.5",
    avatar: "size-5 text-[10px]",
    indent: "@min-[30rem]:pl-7",
  },
  cozy: {
    body: "text-sm leading-6",
    gap: "gap-2",
    run: "mt-4",
    within: "mt-0.5",
    bubble: "px-3.5 py-2",
    avatar: "size-6 text-[11px]",
    indent: "@min-[30rem]:pl-8",
  },
  roomy: {
    body: "text-sm leading-7",
    gap: "gap-3",
    run: "mt-6",
    within: "mt-1",
    bubble: "px-4 py-2.5",
    avatar: "size-7 text-xs",
    indent: "@min-[30rem]:pl-9",
  },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** Consecutive messages from one author closer than this form one run. */
const RUN_WINDOW = 5 * MIN;
/** Further than this from the floor and the thread counts as scrolled up. */
const FLOOR = 48;
const ROOT = "\u0000root";

const keyOf = (parentId: string | null) => parentId ?? ROOT;
const toMs = (t: number | Date | undefined) =>
  t === undefined ? undefined : typeof t === "number" ? t : t.getTime();

/** Relative, from a `now` the host owns: the same text on the server and in the browser. */
function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

type Tree = {
  byId: Map<string, ThreadMessage>;
  kids: Map<string, ThreadMessage[]>;
};

function buildTree(list: ThreadMessage[]): Tree {
  const byId = new Map<string, ThreadMessage>();
  for (const m of list) byId.set(m.id, m);
  const kids = new Map<string, ThreadMessage[]>();
  for (const m of list) {
    // A message whose parent is missing starts a turn of its own at the top.
    const key = m.parentId !== null && byId.has(m.parentId) ? m.parentId : ROOT;
    const arr = kids.get(key);
    if (arr) arr.push(m);
    else kids.set(key, [m]);
  }
  for (const arr of kids.values()) arr.sort((a, b) => a.at - b.at);
  return { byId, kids };
}

/** Up from `leaf` to the first turn, then down the newest reply at every step. */
function visiblePath(tree: Tree, leaf?: string): ThreadMessage[] {
  const seen = new Set<string>();
  const up: ThreadMessage[] = [];
  let cur = leaf ? tree.byId.get(leaf) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    up.push(cur);
    cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined;
  }
  const path = up.reverse();
  let key = path.length > 0 ? (path[path.length - 1]?.id ?? ROOT) : ROOT;
  for (;;) {
    const next = tree.kids.get(key)?.at(-1);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    path.push(next);
    key = next.id;
  }
  return path;
}

const finishedOf = (path: ThreadMessage[]) =>
  path
    .filter((m) => m.role === "assistant" && m.status === undefined)
    .map((m) => m.id);

/* --------------------------------- text --------------------------------- */

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "code"; lang: string; code: string };

function prose(chunk: string, out: Block[]) {
  for (const part of chunk.split(/\n{2,}/)) {
    const t = part.replace(/^\n+|\n+$/g, "");
    if (!t.trim()) continue;
    const lines = t.split("\n");
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push({
        kind: "ul",
        items: lines.map((l) => l.replace(/^\s*[-*]\s+/, "")),
      });
    } else {
      out.push({ kind: "p", text: t });
    }
  }
}

/** Prose and fenced code. An unclosed fence (a reply still streaming) runs to the end. */
function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  const fence = /```([\w+-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (const m of text.matchAll(fence)) {
    const at = m.index ?? 0;
    prose(text.slice(last, at), out);
    out.push({
      kind: "code",
      lang: m[1] ?? "",
      code: (m[2] ?? "").replace(/\n$/, ""),
    });
    last = at + m[0].length;
  }
  prose(text.slice(last), out);
  return out;
}

function inline(text: string): React.ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((p, i) => {
    if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-1 bg-surface-2 px-1 py-px font-mono text-[0.86em]"
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return p;
  });
}

const KEYWORDS = new Set(
  "const let var function return if else await async import from export for while new true false null undefined def class throw try catch type".split(
    " ",
  ),
);

/** Enough colour to read code by: comments, strings, numbers, keywords. */
function tint(code: string, lang: string): React.ReactNode[] {
  const hashComments = /^(py|python|sh|bash|shell|zsh|ya?ml|toml|rb)$/i.test(
    lang,
  );
  const re = hashComments
    ? /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g
    : /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of code.matchAll(re)) {
    const at = m.index ?? 0;
    const whole = m[0];
    if (at > last) out.push(code.slice(last, at));
    if (m[1]) {
      out.push(
        <span key={k++} className="text-ink-3 italic">
          {whole}
        </span>,
      );
    } else if (m[2]) {
      out.push(
        <span key={k++} className="text-signal">
          {whole}
        </span>,
      );
    } else if (m[3]) {
      out.push(
        <span key={k++} className="text-warn">
          {whole}
        </span>,
      );
    } else if (m[4] && KEYWORDS.has(whole)) {
      out.push(
        <span key={k++} className="text-cobalt-bright">
          {whole}
        </span>,
      );
    } else {
      out.push(whole);
    }
    last = at + whole.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/* ------------------------------ small parts ------------------------------ */

/** An icon that trades places with another on flick: copy becomes a check. */
function IconSwap({
  on,
  from,
  to,
  motionSafe,
}: {
  on: boolean;
  from: React.ReactNode;
  to: React.ReactNode;
  motionSafe: boolean;
}) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={on ? "to" : "from"}
          className="inline-flex"
          initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{
            opacity: 0,
            scale: motionSafe ? 0.6 : 1,
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
        >
          {on ? to : from}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A number whose digits roll toward the direction it moved, on snap. */
function Rolling({
  value,
  dir,
  motionSafe,
}: {
  value: number;
  dir: number;
  motionSafe: boolean;
}) {
  const text = String(value);
  return (
    <span
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block leading-4"
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

/**
 * A box whose height follows its content on glide, measured, so a message
 * that changes version or turns into an editor never jumps the thread.
 */
function Measured({
  glide,
  children,
}: {
  glide: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: glide && height !== null ? height : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      // Clipped while it glides, with room for focus rings at the edges.
      style={{ overflow: "clip", overflowClipMargin: 8 }}
    >
      <div ref={setNode} className="relative">
        {children}
      </div>
    </motion.div>
  );
}

function CodeBlock({
  lang,
  code,
  copied,
  onCopy,
  caret,
  motionSafe,
}: {
  lang: string;
  code: string;
  copied: boolean;
  onCopy?: () => void;
  caret?: React.ReactNode;
  motionSafe: boolean;
}) {
  const [node, setNode] = React.useState<HTMLPreElement | null>(null);
  const [fade, setFade] = React.useState(false);
  const [scrolls, setScrolls] = React.useState(false);
  // The edge fade shows only while more code waits past the right edge.
  React.useEffect(() => {
    if (!node) return;
    const check = () => {
      setScrolls(node.scrollWidth > node.clientWidth + 1);
      setFade(node.scrollWidth - node.clientWidth - node.scrollLeft > 1);
    };
    const ro = new ResizeObserver(check);
    ro.observe(node);
    node.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      node.removeEventListener("scroll", check);
    };
  }, [node]);
  return (
    <div className="overflow-clip rounded-3 border border-hairline bg-surface-0">
      <div className="flex h-8 items-center justify-between gap-2 border-b border-hairline pr-1 pl-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {lang || "code"}
        </span>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? "Copied" : "Copy code"}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-2 px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING_IN,
            )}
          >
            <IconSwap
              on={copied}
              from={<Copy aria-hidden className="size-3.5" />}
              to={<Check aria-hidden className="size-3.5 text-success" />}
              motionSafe={motionSafe}
            />
            <span aria-hidden>{copied ? "Copied" : "Copy"}</span>
          </button>
        ) : null}
      </div>
      <pre
        ref={setNode}
        tabIndex={scrolls ? 0 : undefined}
        aria-label={
          scrolls ? `${lang || "Code"} block, scrolls sideways` : undefined
        }
        className={cn(
          "[scrollbar-width:thin] overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-5 text-ink",
          FOCUS_RING_IN,
        )}
        style={
          fade
            ? {
                maskImage:
                  "linear-gradient(to right, black calc(100% - 28px), transparent)",
              }
            : undefined
        }
      >
        <code>
          {tint(code, lang)}
          {caret}
        </code>
      </pre>
    </div>
  );
}

function Caret({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] rounded-full bg-cobalt-bright"
      animate={motionSafe ? { opacity: [1, 0, 1] } : { opacity: 1 }}
      transition={
        motionSafe
          ? { duration: 1, repeat: Infinity, ease: "linear" }
          : { duration: 0 }
      }
    />
  );
}

function Thinking({ motionSafe }: { motionSafe: boolean }) {
  return (
    <span className="inline-flex h-6 items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-ink-3"
          animate={motionSafe ? { opacity: [0.3, 1, 0.3] } : { opacity: 0.6 }}
          transition={
            motionSafe
              ? {
                  duration: 1,
                  repeat: Infinity,
                  ease: "linear",
                  delay: i * 0.16,
                }
              : { duration: 0 }
          }
        />
      ))}
    </span>
  );
}

function ToolButton({
  label,
  pressed,
  focusKey,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  focusKey?: string;
  disabled?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      data-focus-key={focusKey}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
        "hover:bg-surface-2 hover:text-foreground disabled:opacity-40 aria-pressed:text-cobalt-bright",
        FOCUS_RING_IN,
      )}
    >
      {children}
    </button>
  );
}

/* --------------------------------- thread -------------------------------- */

type Swap = { dir: 1 | -1; ids: ReadonlySet<string> };

/**
 * A complete assistant thread over a tree of messages. Consecutive messages
 * from one author run together under one avatar and time. Each message
 * carries a toolbar — copy, edit, good or bad reply, retry — that rises 4px
 * into place on snap when the pointer or the focus arrives; copy morphs into
 * a check on flick and a reaction lands on the reply on recoil.
 *
 * Editing a sent message turns its bubble into a textarea in place, its
 * measured height gliding; saving adds a new version of that turn and the
 * thread forks. The version switcher (‹ 2/3 ›) slides the message and every
 * reply under it: the old branch leaves on the exit ease toward the side it
 * came from while the new one arrives from the other side on glide, and the
 * counter's digit rolls on snap. Each version remembers where you were
 * reading under it.
 *
 * The log sticks to its floor while you are there. Scrolled up, a pill rises
 * on snap and counts the replies that land meanwhile; it (or End) glides the
 * log to the newest message on glide, every frame rounded. Under reduced
 * motion nothing travels — swaps, arrivals, the toolbar and the pill
 * cross-fade, and the jump is instant — while every count, check and
 * reaction still shows.
 */
export function ThreadView({
  density = "cozy",
  branches = true,
  toolbar = "hover",
  messages,
  defaultMessages,
  onMessagesChange,
  leaf,
  defaultLeaf,
  onLeafChange,
  onSend,
  onEdit,
  onCopy,
  onReact,
  onRetry,
  onReload,
  now,
  author,
  title = "Basin export retries",
  model = MODEL,
  status = "ready",
  composer = true,
  placeholder,
  suggestions = DEFAULT_SUGGESTIONS,
  label,
  sound = false,
  disabled = false,
  className,
}: ThreadViewProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const composerId = `${uid}-composer`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [own, setOwn] = React.useState<ThreadMessage[]>(
    () => defaultMessages ?? defaultThreadMessages,
  );
  const list = messages ?? own;
  const tree = React.useMemo(() => buildTree(list), [list]);

  const [ownLeaf, setOwnLeaf] = React.useState<string | undefined>(defaultLeaf);
  const wantedLeaf = leaf ?? ownLeaf;
  const visible = React.useMemo(
    () => visiblePath(tree, wantedLeaf),
    [tree, wantedLeaf],
  );
  const tail = visible[visible.length - 1];
  const newestAt = list.reduce((a, m) => Math.max(a, m.at), 0);
  const nowMs = toMs(now) ?? newestAt;
  const you =
    author ??
    [...list].reverse().find((m) => m.role === "user")?.author ??
    "You";
  const ready = status === "ready";
  const actionsOn = toolbar !== "off" && !disabled && ready;

  const [swap, setSwap] = React.useState<Swap>(() => ({
    dir: 1,
    ids: new Set(),
  }));
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [tapped, setTapped] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{
    id: string;
    draft: string;
  } | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [atBottom, setAtBottom] = React.useState(true);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const finished = finishedOf(visible);
  const finishedKey = finished.join("|");
  const [readKey, setReadKey] = React.useState(finishedKey);
  const read = React.useMemo(() => new Set(readKey.split("|")), [readKey]);
  const unread = atBottom ? 0 : finished.filter((id) => !read.has(id)).length;

  // A reply that stops streaming is announced once, from the render that
  // sees it finish — never per token.
  const streamingKey = list
    .filter((m) => m.status === "streaming")
    .map((m) => m.id)
    .join("|");
  const [lastStreaming, setLastStreaming] = React.useState(streamingKey);
  const [arrived, setArrived] = React.useState({ n: 0, text: "" });
  if (lastStreaming !== streamingKey) {
    setLastStreaming(streamingKey);
    const still = new Set(streamingKey.split("|"));
    const done = lastStreaming
      .split("|")
      .map((id) => tree.byId.get(id))
      .find((m) => m && !still.has(m.id) && m.status === undefined);
    if (done) {
      setArrived((s) => ({ n: s.n + 1, text: `Reply from ${done.author}.` }));
    }
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [listNode, setListNode] = React.useState<HTMLOListElement | null>(null);
  const pinned = React.useRef(true);
  const scrollAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const scrollReq = React.useRef<string | null>(null);
  const focusReq = React.useRef<string | null>(null);
  const remembered = React.useRef(new Map<string, string>());
  const copyTimer = React.useRef(0);
  const counter = React.useRef(0);
  const api = React.useRef<{ onScroll: () => void } | null>(null);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const commit = (next: ThreadMessage[]) => {
    if (messages === undefined) setOwn(next);
    onMessagesChange?.(next);
  };
  const moveLeaf = (id: string) => {
    if (leaf === undefined) setOwnLeaf(id);
    onLeafChange?.(id);
  };
  const newId = () => {
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-m${counter.current}`;
    } while (tree.byId.has(id));
    return id;
  };
  // New messages sort after everything already there, without the clock.
  const stamp = () => Math.max(nowMs, newestAt) + 1000;

  /* ------------------------------- scrolling ------------------------------ */

  const stopGlide = () => {
    scrollAnim.current?.stop();
    scrollAnim.current = null;
  };

  const glideTo = (top: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    stopGlide();
    const target = Math.round(
      Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight)),
    );
    if (!motionSafe || Math.abs(target - el.scrollTop) < 2) {
      el.scrollTop = target;
      return;
    }
    scrollAnim.current = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = Math.round(v);
      },
      onComplete: () => {
        scrollAnim.current = null;
      },
    });
  };

  const toFloor = () => {
    const el = scrollerRef.current;
    if (el) glideTo(el.scrollHeight);
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < FLOOR;
    pinned.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    // Everything there when you were last at the floor has been seen.
    if ((bottom || atBottom) && readKey !== finishedKey) {
      setReadKey(finishedKey);
    }
  };

  const jumpToLatest = (from?: HTMLElement | null) => {
    audio.play("tick", { pitch: 0.9, gain: 0.45 });
    // The pill leaves as it is used: focus stays in the thread.
    if (from && document.activeElement === from) {
      scrollerRef.current?.focus({ preventScroll: true });
    }
    toFloor();
  };

  const scrollToMessage = (id: string) => {
    const el = scrollerRef.current;
    const node = el?.querySelector<HTMLElement>(
      `[data-message="${CSS.escape(id)}"]`,
    );
    if (!el || !node) return;
    const top =
      node.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop -
      12;
    glideTo(top);
  };

  // The newest message is where a thread opens.
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinned.current = true;
  }, [status]);

  // While at the floor, growth (a streaming reply) keeps the floor in view.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!listNode || !el) return;
    const ro = new ResizeObserver(() => {
      if (pinned.current && !scrollAnim.current) {
        el.scrollTop = el.scrollHeight;
      }
      // A thread that changed size (a shorter branch) may have reached its
      // floor without a scroll event: read the floor again.
      api.current?.onScroll();
    });
    ro.observe(listNode);
    // A hand on the log takes over from a glide in progress.
    const cancel = () => {
      scrollAnim.current?.stop();
      scrollAnim.current = null;
    };
    el.addEventListener("wheel", cancel, { passive: true });
    el.addEventListener("touchstart", cancel, { passive: true });
    const onVisibility = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", cancel);
      el.removeEventListener("touchstart", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
      cancel();
    };
  }, [listNode]);

  // Each message remembers the branch you last read under it.
  const pathKey = visible.map((m) => m.id).join("|");
  const tailId = tail?.id;
  React.useEffect(() => {
    if (!tailId) return;
    for (const id of pathKey.split("|")) remembered.current.set(id, tailId);
  }, [pathKey, tailId]);

  React.useEffect(() => {
    api.current = { onScroll };
  });

  // Focus and scroll requests made by a handler are carried out once the
  // render that made their target has committed.
  React.useEffect(() => {
    const req = scrollReq.current;
    if (req) {
      scrollReq.current = null;
      if (req === "floor") toFloor();
      else scrollToMessage(req);
    }
    const want = focusReq.current;
    if (!want) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-focus-key="${CSS.escape(want)}"]`,
    );
    if (!node) return;
    focusReq.current = null;
    node.focus({ preventScroll: true });
    if (node instanceof HTMLTextAreaElement) {
      const end = node.value.length;
      node.setSelectionRange(end, end);
    }
  });

  React.useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /* -------------------------------- actions ------------------------------- */

  const copy = (text: string, key: string, messageId: string) => {
    try {
      void navigator.clipboard?.writeText(text).catch(() => {});
    } catch {
      // No clipboard here (an insecure frame): the check still confirms the press.
    }
    setCopied(key);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1400);
    audio.play("tick", { pitch: 1.3, gain: 0.45 });
    say("Copied.");
    onCopy?.(text, messageId);
  };

  const react = (m: ThreadMessage, r: ThreadReaction) => {
    if (!actionsOn) return;
    const next = m.reaction === r ? null : r;
    commit(list.map((x) => (x.id === m.id ? { ...x, reaction: next } : x)));
    if (next)
      audio.play("pop", { pitch: next === "up" ? 1.2 : 0.85, gain: 0.5 });
    else audio.play("tick", { pitch: 0.9, gain: 0.4 });
    say(
      next === "up"
        ? "Marked as a good reply."
        : next === "down"
          ? "Marked as a bad reply."
          : "Reaction cleared.",
    );
    onReact?.(m.id, next);
  };

  const switchVersion = (m: ThreadMessage, dir: 1 | -1) => {
    if (disabled) return;
    const sibs = tree.kids.get(keyOf(m.parentId)) ?? [];
    const i = sibs.findIndex((s) => s.id === m.id);
    const next = sibs[i + dir];
    if (i === -1 || !next) return;
    const kept = remembered.current.get(next.id);
    const target =
      kept && visiblePath(tree, kept).some((p) => p.id === next.id)
        ? kept
        : next.id;
    const path = visiblePath(tree, target);
    const from = path.findIndex((p) => p.id === next.id);
    setSwap({ dir, ids: new Set(path.slice(from).map((p) => p.id)) });
    setEditing(null);
    // The view stays on the message you switched, even if the branch under
    // it grows past the floor.
    pinned.current = false;
    // A branch you switch to is not news: its replies are already read.
    setReadKey(finishedOf(path).join("|"));
    moveLeaf(target);
    audio.play("tick", { pitch: dir > 0 ? 1.12 : 0.9, gain: 0.45 });
    say(`Version ${i + dir + 1} of ${sibs.length}.`);
  };

  const startEdit = (m: ThreadMessage) => {
    if (!actionsOn) return;
    setEditing({ id: m.id, draft: m.text });
    focusReq.current = `editor:${m.id}`;
  };

  const cancelEdit = () => {
    if (!editing) return;
    focusReq.current = `edit:${editing.id}`;
    setEditing(null);
  };

  const saveEdit = () => {
    if (!editing) return;
    const original = tree.byId.get(editing.id);
    const text = editing.draft.trim();
    if (!original || !text || text === original.text.trim()) {
      cancelEdit();
      return;
    }
    const version: ThreadMessage = {
      id: newId(),
      parentId: original.parentId,
      role: original.role,
      author: original.author,
      at: stamp(),
      text,
    };
    const count = (tree.kids.get(keyOf(original.parentId))?.length ?? 1) + 1;
    commit([...list, version]);
    setSwap({ dir: 1, ids: new Set([version.id]) });
    setEditing(null);
    moveLeaf(version.id);
    focusReq.current = `edit:${version.id}`;
    audio.play("pop", { pitch: 1.15, gain: 0.55 });
    say(branches ? `Edited. Version ${count} of ${count}.` : "Edited.");
    onEdit?.(original, version);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || disabled || !ready) return;
    const message: ThreadMessage = {
      id: newId(),
      parentId: tail?.id ?? null,
      role: "user",
      author: you,
      at: stamp(),
      text,
    };
    commit([...list, message]);
    setSwap((s) => ({ ...s, ids: new Set() }));
    moveLeaf(message.id);
    setDraft("");
    pinned.current = true;
    scrollReq.current = "floor";
    audio.play("pop", { pitch: 1, gain: 0.55 });
    say("Sent.");
    onSend?.(text, message);
  };

  /* -------------------------------- render -------------------------------- */

  const userTurns = visible.filter((m) => m.role === "user");

  const toolbarFor = (m: ThreadMessage) => {
    const copyKey = `msg:${m.id}`;
    const settled = m.status !== "streaming";
    return (
      <>
        <ToolButton
          label={copied === copyKey ? "Copied" : "Copy message"}
          onClick={() => copy(m.text, copyKey, m.id)}
        >
          <IconSwap
            on={copied === copyKey}
            from={<Copy aria-hidden className="size-3.5" />}
            to={<Check aria-hidden className="size-3.5 text-success" />}
            motionSafe={motionSafe}
          />
        </ToolButton>
        {m.role === "user" && settled ? (
          <ToolButton
            label="Edit message"
            focusKey={`edit:${m.id}`}
            onClick={() => startEdit(m)}
          >
            <Pencil aria-hidden className="size-3.5" />
          </ToolButton>
        ) : null}
        {m.role === "assistant" && m.status === undefined ? (
          <>
            <ToolButton
              label="Good reply"
              pressed={m.reaction === "up"}
              onClick={() => react(m, "up")}
            >
              <ThumbsUp aria-hidden className="size-3.5" />
            </ToolButton>
            <ToolButton
              label="Bad reply"
              pressed={m.reaction === "down"}
              onClick={() => react(m, "down")}
            >
              <ThumbsDown aria-hidden className="size-3.5" />
            </ToolButton>
          </>
        ) : null}
        {m.status === "error" ? (
          <ToolButton label="Retry reply" onClick={() => onRetry?.(m.id)}>
            <RotateCcw aria-hidden className="size-3.5" />
          </ToolButton>
        ) : null}
      </>
    );
  };

  const body = (m: ThreadMessage) => {
    if (editing?.id === m.id) {
      return (
        <div className="w-full rounded-3 border border-hairline-strong bg-surface-1 p-2">
          <div className="grid">
            <textarea
              data-focus-key={`editor:${m.id}`}
              aria-label="Edit message"
              rows={1}
              value={editing.draft}
              onChange={(e) =>
                setEditing({ id: m.id, draft: e.currentTarget.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // Handled here, where focus is; the stage must not close.
                  e.preventDefault();
                  e.stopPropagation();
                  cancelEdit();
                } else if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
              className={cn(
                "max-h-40 resize-none overflow-y-auto rounded-2 bg-transparent px-1.5 py-1 text-foreground [grid-area:1/1]",
                d.body,
                FOCUS_RING,
              )}
            />
            <span
              aria-hidden
              className={cn(
                "invisible max-h-40 overflow-hidden px-1.5 py-1 break-words whitespace-pre-wrap [grid-area:1/1]",
                d.body,
              )}
            >
              {`${editing.draft} `}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-ink-3">
              {branches ? "Saving keeps the old version" : "Saving replaces it"}
            </span>
            <button
              type="button"
              onClick={cancelEdit}
              className={cn(
                "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={!editing.draft.trim()}
              className={cn(
                "inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              {branches ? "Save as new version" : "Save"}
            </button>
          </div>
        </div>
      );
    }

    const streaming = m.status === "streaming";
    const caret = streaming ? <Caret motionSafe={motionSafe} /> : null;
    const blocks = parseBlocks(m.text);
    const content =
      streaming && blocks.length === 0 ? (
        <Thinking motionSafe={motionSafe} />
      ) : (
        <div className={cn("flex min-w-0 flex-col", d.gap)}>
          {blocks.map((b, i) => {
            const end = i === blocks.length - 1 ? caret : null;
            if (b.kind === "code") {
              const key = `code:${m.id}:${i}`;
              return (
                <CodeBlock
                  key={i}
                  lang={b.lang}
                  code={b.code}
                  copied={copied === key}
                  onCopy={streaming ? undefined : () => copy(b.code, key, m.id)}
                  caret={end}
                  motionSafe={motionSafe}
                />
              );
            }
            if (b.kind === "ul") {
              return (
                <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
                  {b.items.map((it, j) => (
                    <li key={j}>
                      {inline(it)}
                      {j === b.items.length - 1 ? end : null}
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i} className="break-words whitespace-pre-line">
                {inline(b.text)}
                {end}
              </p>
            );
          })}
        </div>
      );

    if (m.role === "user") {
      return (
        <div
          className={cn(
            "max-w-[88%] min-w-0 rounded-3 bg-cobalt-wash text-foreground @min-[30rem]:max-w-[78%]",
            d.bubble,
          )}
        >
          {content}
        </div>
      );
    }
    return (
      <div className={cn("w-full min-w-0 text-foreground", d.indent)}>
        {content}
        {m.status === "error" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-danger">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            <span>This reply did not finish.</span>
            {onRetry ? (
              <button
                type="button"
                onClick={() => onRetry(m.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderMessage = (m: ThreadMessage, i: number) => {
    const prev = visible[i - 1];
    const head =
      !prev ||
      prev.author !== m.author ||
      prev.role !== m.role ||
      m.at - prev.at > RUN_WINDOW;
    const turn = keyOf(m.parentId);
    const sibs = tree.kids.get(turn) ?? [m];
    const index = Math.max(
      0,
      sibs.findIndex((s) => s.id === m.id),
    );
    const versions = branches && sibs.length > 1;
    const user = m.role === "user";
    const when = ago(m.at, nowMs);
    const shown =
      actionsOn &&
      editing?.id !== m.id &&
      (toolbar === "always" ||
        hovered === turn ||
        focused === turn ||
        tapped === turn);
    const inlineBar = actionsOn && toolbar === "always" && editing?.id !== m.id;
    const meta = versions || (!user && !!m.reaction) || inlineBar;
    const fresh = swap.ids.has(m.id);

    return (
      <motion.li
        key={`turn-${turn}`}
        data-message={m.id}
        custom={swap.dir}
        initial={
          fresh
            ? { opacity: 0, x: motionSafe ? swap.dir * distances.shift : 0 }
            : { opacity: 0, y: motionSafe ? distances.step : 0 }
        }
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit="leave"
        variants={{
          leave: (dir: number) => ({
            opacity: 0,
            x: motionSafe ? -dir * distances.shift : 0,
            transition: exitFor(),
          }),
        }}
        transition={
          motionSafe
            ? {
                x: springs.glide,
                y: springs.snap,
                opacity: { duration: durations.base, ease: easings.enter },
              }
            : { duration: durations.fast }
        }
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHovered(turn);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") {
            setHovered((h) => (h === turn ? null : h));
          }
        }}
        onFocus={() => setFocused(turn)}
        onBlur={(e) => {
          const to = e.relatedTarget;
          if (!(to instanceof Node && e.currentTarget.contains(to))) {
            setFocused((f) => (f === turn ? null : f));
          }
        }}
        onPointerUp={(e) => {
          // No hover on a touch screen: a tap on the message shows its tools.
          if (e.pointerType === "mouse" || !actionsOn) return;
          const target = e.target instanceof Element ? e.target : null;
          if (target?.closest("button, textarea, a, pre")) return;
          setTapped((t) => (t === turn ? null : turn));
        }}
        className={cn(
          "relative",
          i === 0 ? "" : head ? d.run : d.within,
          shown && "z-10",
        )}
      >
        <span className="sr-only">{`${m.author}, ${when}: `}</span>
        {head ? (
          user ? (
            <div
              aria-hidden
              className="mb-1 flex items-center justify-end gap-1.5 text-[11px] text-ink-3"
            >
              <span className="truncate">{m.author}</span>
              <span>·</span>
              <span className="shrink-0">{when}</span>
            </div>
          ) : (
            <div aria-hidden className="mb-1 flex items-center gap-2">
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full bg-cobalt-wash leading-none font-semibold text-cobalt-bright",
                  d.avatar,
                )}
              >
                {m.author.charAt(0)}
              </span>
              <span className="truncate text-[13px] font-medium text-foreground">
                {m.author}
              </span>
              <span className="shrink-0 text-[11px] text-ink-3">{when}</span>
            </div>
          )
        ) : null}

        <Measured glide={motionSafe && m.status !== "streaming"}>
          <AnimatePresence mode="popLayout" initial={false} custom={swap.dir}>
            <motion.div
              key={m.id}
              custom={swap.dir}
              className={cn("flex", user ? "justify-end" : "justify-start")}
              variants={{
                enter: (dir: number) => ({
                  opacity: 0,
                  x: motionSafe ? dir * distances.shift : 0,
                }),
                shown: { opacity: 1, x: 0 },
                leave: (dir: number) => ({
                  opacity: 0,
                  x: motionSafe ? -dir * distances.shift : 0,
                  transition: exitFor(),
                }),
              }}
              initial={fresh ? "enter" : false}
              animate="shown"
              exit="leave"
              transition={
                motionSafe
                  ? {
                      x: springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              {body(m)}
            </motion.div>
          </AnimatePresence>

          {meta ? (
            <div
              className={cn(
                "mt-1.5 flex flex-wrap items-center gap-2",
                user ? "justify-end" : d.indent,
              )}
            >
              {inlineBar ? (
                <div
                  role="toolbar"
                  aria-label="Message actions"
                  className="flex items-center gap-0.5"
                >
                  {toolbarFor(m)}
                </div>
              ) : null}
              {!user ? (
                <AnimatePresence mode="popLayout" initial={false}>
                  {m.reaction ? (
                    <motion.span
                      key={m.reaction}
                      initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: motionSafe ? 0.8 : 1,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              scale: springs.recoil,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                      className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 text-[11px] text-ink-2"
                    >
                      {m.reaction === "up" ? (
                        <ThumbsUp
                          aria-hidden
                          className="size-3 text-cobalt-bright"
                        />
                      ) : (
                        <ThumbsDown
                          aria-hidden
                          className="size-3 text-danger"
                        />
                      )}
                      {m.reaction === "up" ? "Helpful" : "Not helpful"}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              ) : null}
              {versions ? (
                <div
                  role="group"
                  aria-label={`Version ${index + 1} of ${sibs.length}`}
                  className="inline-flex h-6 items-center gap-0.5 font-mono text-[11px] text-ink-3"
                >
                  <button
                    type="button"
                    aria-label="Previous version"
                    aria-disabled={index === 0 || disabled || undefined}
                    onClick={() => switchVersion(m, -1)}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
                      FOCUS_RING_IN,
                    )}
                  >
                    <ChevronLeft aria-hidden className="size-3.5" />
                  </button>
                  <span aria-hidden className="inline-flex items-center">
                    <Rolling
                      value={index + 1}
                      dir={swap.dir}
                      motionSafe={motionSafe}
                    />
                    <span>/{sibs.length}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Next version"
                    aria-disabled={
                      index === sibs.length - 1 || disabled || undefined
                    }
                    onClick={() => switchVersion(m, 1)}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
                      FOCUS_RING_IN,
                    )}
                  >
                    <ChevronRight aria-hidden className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </Measured>

        {actionsOn && toolbar === "hover" && editing?.id !== m.id ? (
          <motion.div
            key={`bar-${m.id}`}
            role="toolbar"
            aria-label="Message actions"
            initial={false}
            animate={
              shown
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: motionSafe ? distances.nudge : 0 }
            }
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className={cn(
              "absolute -bottom-3.5 z-10 flex items-center gap-0.5 rounded-3 border border-hairline-strong bg-popover p-0.5 shadow-[0_4px_14px_color-mix(in_oklab,black_14%,transparent)]",
              // Beside the version switcher, never over it.
              user ? (versions ? "right-[4.75rem]" : "right-1") : "right-0",
              !shown && "pointer-events-none",
            )}
          >
            {toolbarFor(m)}
          </motion.div>
        ) : null}
      </motion.li>
    );
  };

  const stateView =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-5 px-5 pt-6">
        <p className="sr-only">Loading the thread.</p>
        {[
          ["ml-auto w-3/5", "h-10"],
          ["w-4/5", "h-16"],
          ["ml-auto w-2/5", "h-8"],
          ["w-3/4", "h-20"],
        ].map(([w, h], i) => (
          <div key={i} className={cn("rounded-3 bg-surface-2", w, h)} />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">This thread did not load.</p>
        {onReload ? (
          <button
            type="button"
            onClick={onReload}
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
    ) : (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-4 overflow-y-auto p-6 text-center">
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full bg-cobalt-wash text-sm font-semibold text-cobalt-bright"
        >
          {model.charAt(0)}
        </span>
        <p className="text-sm text-ink-2">Ask {model} about your project.</p>
        <div className="flex max-w-md flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => {
                setDraft(s);
                focusReq.current = "composer";
                audio.play("tick", { pitch: 1.1, gain: 0.4 });
              }}
              className={cn(
                "inline-flex h-8 max-w-full items-center rounded-full border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      </div>
    );

  const showThread = ready && visible.length > 0;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container grid h-[560px] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <p
          id={titleId}
          className="min-w-0 flex-1 truncate text-sm font-semibold"
        >
          {title}
        </p>
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] text-ink-2">
          <span aria-hidden className="size-1.5 rounded-full bg-signal" />
          {model}
        </span>
      </header>

      <div className="grid grid-rows-[minmax(0,1fr)] @min-[60rem]:grid-cols-[13.75rem_minmax(0,1fr)]">
        {showThread ? (
          <nav
            aria-label="Turns in this thread"
            className="hidden overflow-y-auto overscroll-contain border-r border-hairline p-3 @min-[60rem]:block"
          >
            <p className="mb-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              In this thread
            </p>
            <ol className="flex flex-col gap-0.5">
              {userTurns.map((m) => {
                const count = tree.kids.get(keyOf(m.parentId))?.length ?? 1;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => scrollToMessage(m.id)}
                      className={cn(
                        "flex h-8 w-full items-center gap-2 rounded-2 px-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS_RING_IN,
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate" title={m.text}>
                        {m.text}
                      </span>
                      {branches && count > 1 ? (
                        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-ink-3">
                          <GitBranch aria-hidden className="size-3" />
                          {count}
                          <span className="sr-only"> versions</span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}

        <div
          className={cn(
            "relative grid grid-rows-[minmax(0,1fr)]",
            !showThread && "@min-[60rem]:col-span-2",
          )}
        >
          {showThread ? (
            <div
              ref={scrollerRef}
              role="log"
              aria-live="off"
              aria-label="Messages"
              tabIndex={0}
              onScroll={onScroll}
              onKeyDown={(e) => {
                if (e.key === "End" && e.target === e.currentTarget) {
                  e.preventDefault();
                  toFloor();
                }
              }}
              className={cn(
                "[scrollbar-width:thin] overflow-y-auto overscroll-contain",
                FOCUS_RING_IN,
              )}
            >
              <ol
                ref={setListNode}
                role="list"
                className={cn(
                  "relative mx-auto flex w-full max-w-[46rem] flex-col px-3 pt-4 pb-8 @min-[30rem]:px-5",
                  d.body,
                )}
              >
                <AnimatePresence
                  mode="popLayout"
                  initial={false}
                  custom={swap.dir}
                  // Leaving messages count toward the scroll height until
                  // they are removed: the floor is read again a frame later.
                  onExitComplete={() =>
                    requestAnimationFrame(() => api.current?.onScroll())
                  }
                >
                  {visible.map((m, i) => renderMessage(m, i))}
                </AnimatePresence>
              </ol>
            </div>
          ) : (
            stateView
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <AnimatePresence>
              {showThread && !atBottom ? (
                <motion.button
                  key="latest"
                  type="button"
                  aria-label={
                    unread > 0
                      ? `${unread} new ${unread === 1 ? "reply" : "replies"}, jump to the latest`
                      : "Jump to the latest message"
                  }
                  onClick={(e) => jumpToLatest(e.currentTarget)}
                  initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: motionSafe ? distances.step : 0,
                    transition: exitFor(),
                  }}
                  transition={
                    motionSafe
                      ? {
                          y: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className={cn(
                    "pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline-strong bg-popover px-3 text-xs font-medium text-foreground shadow-[0_6px_18px_color-mix(in_oklab,black_16%,transparent)] transition-colors hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  <ArrowDown aria-hidden className="size-3.5 shrink-0" />
                  {unread > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Rolling value={unread} dir={1} motionSafe={motionSafe} />
                      {unread === 1 ? "new reply" : "new replies"}
                    </span>
                  ) : (
                    "Latest"
                  )}
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {composer ? (
        <form
          className="flex items-end gap-2 border-t border-hairline p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="grid min-w-0 flex-1 rounded-3 border border-hairline-strong bg-surface-1">
            <textarea
              id={composerId}
              data-focus-key="composer"
              aria-label={`Message ${model}`}
              rows={1}
              value={draft}
              disabled={disabled || !ready}
              placeholder={placeholder ?? `Message ${model}`}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              className={cn(
                "max-h-29 resize-none overflow-y-auto rounded-3 bg-transparent px-3 py-[7px] text-sm leading-5 text-foreground [grid-area:1/1] placeholder:text-ink-3 disabled:cursor-not-allowed",
                FOCUS_RING,
              )}
            />
            <span
              aria-hidden
              className="invisible max-h-29 overflow-hidden px-3 py-[7px] text-sm leading-5 break-words whitespace-pre-wrap [grid-area:1/1]"
            >
              {`${draft} `}
            </span>
          </div>
          <button
            type="submit"
            aria-label="Send"
            disabled={disabled || !ready || !draft.trim()}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-3 bg-primary text-primary-foreground transition-opacity disabled:opacity-40",
              FOCUS_RING,
            )}
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
        </form>
      ) : null}

      <p role="status" className="sr-only">
        <span key={`s${said.n}`}>{said.text}</span>{" "}
        <span key={`a${arrived.n}`}>{arrived.text}</span>{" "}
        <span key={`u${unread}`}>
          {unread > 0
            ? `${unread} new ${unread === 1 ? "reply" : "replies"} below.`
            : ""}
        </span>
      </p>
    </div>
  );
}
