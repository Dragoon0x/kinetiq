"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  ChevronLeft,
  Copy,
  FileCode2,
  FileText,
  PanelLeft,
  RotateCcw,
  Search,
  SquarePen,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import { PinPress } from "@/registry/ui/pin-press";
import {
  defaultModels,
  PromptDock,
  type DockMessage,
  type DockModel,
} from "@/registry/ui/prompt-dock";
import {
  ThreadView,
  type ThreadDensity,
  type ThreadMessage,
} from "@/registry/ui/thread-view";

export type AiWorkspacePane = "split" | "overlay" | "canvas";
export type AiWorkspaceTheme = "page" | "light" | "dark";
export type AiWorkspaceStatus = "ready" | "loading" | "error";
export type AiArtifactKind = "document" | "code";

export type AiArtifact = {
  id: string;
  /** What the pane and the strip call it. */
  title: string;
  /** The name it is copied and saved under. */
  filename: string;
  /** A document renders its Markdown with a Source tab; code shows numbered lines. */
  kind: AiArtifactKind;
  /** Shown beside the title: "Markdown", "TypeScript". */
  language?: string;
  /** The whole text: Markdown for a document, source for code. */
  source: string;
};

export type AiConversation = {
  id: string;
  title: string;
  /** Pinned conversations sit above the dated groups. */
  pinned?: boolean;
  /** When it was started, ms since the epoch: used while it has no messages. */
  at?: number;
  /** Every version of every turn, as thread-view takes them. */
  messages: ThreadMessage[];
  /** The latest thing the assistant made here. */
  artifact?: AiArtifact;
};

/** What the assistant says back, and anything it makes alongside. */
export type AiReply = { text: string; artifact?: AiArtifact };

export type AiUser = { name: string; plan?: string };

export type AiWorkspaceProps = {
  /** How tightly the thread and the sidebar are set: passed to the thread, and the sidebar's rows follow. @default "cozy" */
  density?: ThreadDensity;
  /** How the artifact arrives: a column sharing the stage with the thread, a sheet over the thread's edge, or a canvas that takes the stage. @default "split" */
  pane?: AiWorkspacePane;
  /** Wear the page's theme, or force light or dark inside the workspace. @default "page" */
  theme?: AiWorkspaceTheme;
  /** Controlled conversations. */
  conversations?: AiConversation[];
  /** Initial conversations when uncontrolled. @default defaultAiConversations */
  defaultConversations?: AiConversation[];
  /** Fires from the send, stream, pin, edit or reaction that changed them, with all of them. */
  onConversationsChange?: (conversations: AiConversation[]) => void;
  /** Controlled open conversation id. */
  conversation?: string;
  /** Initial open conversation when uncontrolled. @default the first one */
  defaultConversation?: string;
  /** Fires from the row, New chat or key that opened another conversation. */
  onConversationChange?: (id: string) => void;
  /** Controlled: the artifact pane is open. */
  artifactOpen?: boolean;
  /** Initial pane state when uncontrolled. @default false */
  defaultArtifactOpen?: boolean;
  /** Fires from the strip, the Artifact button, Close, Escape or a reply that started writing one. */
  onArtifactOpenChange?: (open: boolean) => void;
  /** Answers a prompt: a reply, or a promise of one. A rejection shows the reply as failed, with Retry. @default defaultAiRespond */
  respond?: (
    prompt: string,
    conversation: AiConversation,
  ) => AiReply | Promise<AiReply>;
  /** A prompt was sent, from the dock or by editing a sent turn. */
  onSend?: (text: string, conversationId: string) => void;
  /** Stop (or Escape) cut a reply short. */
  onStop?: (conversationId: string) => void;
  /** The artifact was copied. */
  onCopy?: (text: string, artifact: AiArtifact) => void;
  /** The models the dock's pill offers. @default prompt-dock's defaultModels */
  models?: DockModel[];
  /** The selected model's id. @default the first model */
  model?: string;
  onModelChange?: (id: string) => void;
  /** Who is signed in, at the foot of the sidebar, and the name prompts are sent under. @default Rae Okafor */
  user?: AiUser;
  /** The workspace's name, at the head of the sidebar. @default "Fieldline" */
  workspace?: string;
  /** The moment the sidebar's groups and times count from (Date or ms). @default defaultAiNow */
  now?: Date | number;
  /** How fast a reply streams in, in characters a second. @default 240 */
  stream?: number;
  /** Whether the conversations have arrived. @default "ready" */
  status?: AiWorkspaceStatus;
  /** Try again was pressed after the conversations failed to load. */
  onRetry?: () => void;
  /** The screen's accessible name. @default "Assistant" */
  label?: string;
  /** Play the ticks and the pane's swish. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be sent, pinned or opened. */
  disabled?: boolean;
  /** Classes for the root. It is 560px tall by default; pass a height class to change it. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Defaults: Fieldline, Friday 2 October 2026                            */
/* ------------------------------------------------------------------ */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Friday 2 October 2026, 10:15 UTC: the moment the default workspace is read at. */
export const defaultAiNow = Date.UTC(2026, 9, 2, 10, 15);
const N = defaultAiNow;
const RAE = "Rae Okafor";
const MODEL = "Fernworks Model 3";

const POLICY = `# Payout cut-off policy

Waylight Pay settles payout batches once each working day. This policy sets which batches make that day's run.

## The cut-off
- Batches approved by **16:00** settle the same working day.
- Batches approved after 16:00 roll to the next working day.
- Weekends and bank holidays roll to the next working day.

## Overrides
A finance lead can push one late batch a day through, with a note on the batch saying why.

## Telling payees
- When a batch rolls, every payee gets an email with the new date.
- The batch page shows the rolled date and the reason.`;

const BACKOFF = `// Full-jitter backoff for Basin export retries.
const BASE_MS = 500;
const CAP_MS = 30_000;
const MAX_ATTEMPTS = 6;

export function retryDelay(attempt: number, rand: () => number) {
  const ceiling = Math.min(CAP_MS, BASE_MS * 2 ** attempt);
  return Math.round(rand() * ceiling);
}

export async function withRetries<T>(
  run: () => Promise<T>,
  rand: () => number,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt + 1 >= MAX_ATTEMPTS) throw error;
      await sleep(retryDelay(attempt, rand));
    }
  }
}`;

/**
 * A conversation's turns from alternating prompts and replies: each reply a
 * minute after its prompt, each new prompt `gap` after the last.
 */
const turns = (
  id: string,
  start: number,
  texts: string[],
  gap = 2 * MIN,
): ThreadMessage[] =>
  texts.map((text, i) => ({
    id: `${id}-${i + 1}`,
    parentId: i === 0 ? null : `${id}-${i}`,
    role: i % 2 === 0 ? "user" : "assistant",
    author: i % 2 === 0 ? RAE : MODEL,
    at: start + Math.floor(i / 2) * gap + (i % 2) * MIN,
    text,
  }));

/**
 * Rae Okafor's Fieldline assistant: a pinned payout policy drafted as a
 * document, a retry helper written as code, and the week's other threads.
 */
export const defaultAiConversations: AiConversation[] = [
  {
    id: "cutoff",
    title: "Payout cut-off policy",
    pinned: true,
    messages: turns(
      "cutoff",
      N - 52 * MIN,
      [
        "Draft a cut-off policy for Waylight Pay payouts. Batches approved after 16:00 should roll to the next working day.",
        "Here is a first version beside this thread. It sets the **16:00** cut-off, says what happens on weekends and bank holidays, and who can push a late batch through.",
        "Add how payees hear about a rolled batch.",
        "Added a section on telling payees:\n\n- an email the moment their batch rolls, with the new date\n- the rolled date and the reason on the batch page",
      ],
      31 * MIN,
    ),
    artifact: {
      id: "cutoff-doc",
      title: "Payout cut-off policy",
      filename: "payout-cutoff.md",
      kind: "document",
      language: "Markdown",
      source: POLICY,
    },
  },
  {
    id: "backoff",
    title: "Retry backoff for Basin exports",
    messages: turns("backoff", N - 2 * HOUR, [
      "Write a retry helper for the Basin export job: exponential backoff, capped, with jitter, and give up after six tries.",
      "Here it is as `retry-backoff.ts`. Full jitter spreads the retries from one outage across the whole window, so they do not land on the bucket in waves.",
    ]),
    artifact: {
      id: "backoff-ts",
      title: "Retry backoff",
      filename: "retry-backoff.ts",
      kind: "code",
      language: "TypeScript",
      source: BACKOFF,
    },
  },
  {
    id: "manifest",
    title: "Rotterdam manifest is two pallets short",
    messages: turns("manifest", N - 3 * HOUR, [
      "The Q4 manifest for the Rotterdam run lists 42 pallets but the dock counted 40. What should I check first?",
      "Check whether PO 8817 was split across two trucks: a split load is the usual reason a count comes up short at one dock.\n\n- Compare the bill of lading against the manifest line by line.\n- Ask Basinworks for the second truck's seal number.",
    ]),
  },
  {
    id: "recon",
    title: "Coldbrook Bank reconciliation",
    messages: turns("recon", N - DAY - 2 * HOUR, [
      "September's Coldbrook Bank statement is £1,284.50 off our ledger. Where do mismatches like that usually come from?",
      "Most often from timing: a payout batch the ledger booked on the 30th that the bank settled on 1 October. Match the difference against batches approved after 16:00 on the last working day.",
    ]),
  },
  {
    id: "late",
    title: "Summarise yesterday's late batches",
    messages: turns("late", N - DAY - 5 * HOUR, [
      "Summarise yesterday's late payout batches for the finance channel.",
      "Three batches missed the cut-off yesterday:\n\n- WAY-20411, approved 16:12, rolled to today\n- WAY-20414, approved 16:40, rolled to today\n- WAY-20417, pushed through by Priya with a note",
    ]),
  },
  {
    id: "route",
    title: "Route 14 delay note for drivers",
    messages: turns("route", N - 3 * DAY, [
      "Write a two-line note telling drivers Route 14 is running 40 minutes late.",
      "Route 14 is running about 40 minutes late after the closure on the ring road. Dispatch will message each stop with a new time.",
    ]),
  },
  {
    id: "onboard",
    title: "Onboarding checklist for Amara",
    messages: turns("onboard", N - 9 * DAY, [
      "Amara joins ops on Monday. What should her first week cover?",
      "Day one: accounts and a dock walk. Then a day each shadowing dispatch, payouts and the Basinworks freight desk, and a review with you on Friday.",
    ]),
  },
];

const SUGGESTIONS = [
  "Draft a note for drivers about Route 14",
  "Write a helper that formats payout IDs",
  "What rolled past the 16:00 cut-off this week?",
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const clip = (text: string, n: number) =>
  text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text;

/** A prompt's subject, for a title: its first words, capitalised. */
const titleFrom = (prompt: string) => {
  const t = prompt
    .trim()
    .replace(
      /^(please\s+)?(draft|write|make|create|give me)\s+(an?\s+|the\s+)?/i,
      "",
    )
    .replace(/[.?!]+$/, "");
  return clip(t.charAt(0).toUpperCase() + t.slice(1), 40);
};

/**
 * The default assistant: a seeded script, so the same prompt always gets the
 * same answer. Asked to draft or write something, it makes a document; asked
 * for code, a TypeScript file; anything else gets a short plan.
 */
export const defaultAiRespond = (prompt: string): AiReply => {
  const p = prompt.trim();
  const slug = (hash(p) % 900) + 100;
  if (/\b(code|helper|function|script|regex|typescript|query)\b/i.test(p)) {
    const name = `helper-${slug}.ts`;
    return {
      text: `Here it is as \`${name}\`, beside this thread. It keeps the IDs in one format, so search and the bank file agree.`,
      artifact: {
        id: `code-${slug}`,
        title: titleFrom(p),
        filename: name,
        kind: "code",
        language: "TypeScript",
        source: `// ${titleFrom(p)}\nconst PREFIX = "WAY";\n\nexport function formatPayoutId(n: number): string {\n  const digits = String(Math.max(0, Math.trunc(n))).padStart(5, "0");\n  return \`\${PREFIX}-\${digits}\`;\n}\n\nexport function parsePayoutId(id: string): number | null {\n  const match = /^WAY-(\\d{5})$/.exec(id.trim().toUpperCase());\n  return match ? Number(match[1]) : null;\n}`,
      },
    };
  }
  if (/\b(draft|write|note|policy|email|letter|doc|memo|plan)\b/i.test(p)) {
    const title = titleFrom(p);
    return {
      text: "Here is a draft beside this thread. It says what changed, who it affects and what to do next. Tell me what to tighten.",
      artifact: {
        id: `doc-${slug}`,
        title,
        filename: `${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}.md`,
        kind: "document",
        language: "Markdown",
        source: `# ${title}\n\nFrom Fieldline Operations, for everyone it affects.\n\n## What changed\nRoute 14 is running about 40 minutes late after the closure on the ring road.\n\n## What to do\n- Keep to your loading order; dispatch has moved the slots.\n- Message dispatch before you leave the depot if you are carrying chilled stock.\n- Expect a new time for each stop by 11:00.\n\n## Who to ask\nDispatch is on the usual number until 18:00.`,
      },
    };
  }
  return {
    text: `Here is how I would approach “${clip(p, 60)}”:\n\n- Pull the last 30 days from the Fieldline export, so we work from real numbers.\n- Flag every batch that crossed the 16:00 cut-off or retried more than twice.\n- Write a short note for the owners once the pattern is clear.\n\nSay **draft it** and I will write the note as a document beside this thread.`,
  };
};

/* ------------------------------------------------------------------ */
/* Time, without the machine's clock or locale                          */
/* ------------------------------------------------------------------ */

const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const pad2 = (n: number) => String(n).padStart(2, "0");
const toMs = (v: Date | number) => (typeof v === "number" ? v : v.getTime());
const dayOf = (ms: number) => Math.floor(ms / DAY);

function whenOf(ms: number, now: number): string {
  const days = dayOf(now) - dayOf(ms);
  const d = new Date(ms);
  if (days <= 0) return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[d.getUTCDay()] ?? "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
}

type Group = "pinned" | "today" | "yesterday" | "week" | "older";
const GROUPS: { id: Group; label: string }[] = [
  { id: "pinned", label: "Pinned" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Previous 7 days" },
  { id: "older", label: "Older" },
];

/** A conversation the search words find, in its title or any message. */
const matchOf = (c: AiConversation, q: string) =>
  !q ||
  c.title.toLowerCase().includes(q) ||
  c.messages.some((m) => m.text.toLowerCase().includes(q));

/** The first `n` lines of a text: what of an artifact has been written. */
const linesOf = (text: string, n: number) =>
  text.split("\n").slice(0, n).join("\n");

const lastAt = (c: AiConversation) =>
  c.messages.reduce((a, m) => Math.max(a, m.at), c.at ?? 0);

function groupOf(c: AiConversation, now: number): Group {
  if (c.pinned) return "pinned";
  const days = dayOf(now) - dayOf(lastAt(c));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "older";
}

/* ------------------------------------------------------------------ */
/* The thread's visible path, as thread-view walks it                    */
/* ------------------------------------------------------------------ */

const ROOT = "\u0000root";

function pathOf(list: ThreadMessage[], leaf?: string): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>();
  for (const m of list) byId.set(m.id, m);
  const kids = new Map<string, ThreadMessage[]>();
  for (const m of list) {
    const key = m.parentId !== null && byId.has(m.parentId) ? m.parentId : ROOT;
    const arr = kids.get(key);
    if (arr) arr.push(m);
    else kids.set(key, [m]);
  }
  for (const arr of kids.values()) arr.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const up: ThreadMessage[] = [];
  let cur = leaf ? byId.get(leaf) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    up.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  const path = up.reverse();
  let key = path.length > 0 ? (path[path.length - 1]?.id ?? ROOT) : ROOT;
  for (;;) {
    const next = kids.get(key)?.at(-1);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    path.push(next);
    key = next.id;
  }
  return path;
}

/* ------------------------------------------------------------------ */
/* The artifact's text                                                  */
/* ------------------------------------------------------------------ */

function KindIcon({
  kind,
  className,
}: {
  kind: AiArtifactKind | undefined;
  className?: string;
}) {
  const Icon = kind === "code" ? FileCode2 : FileText;
  return <Icon aria-hidden className={cn("shrink-0", className)} />;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code
            key={i}
            className="rounded-1 bg-surface-2 px-1 font-mono text-[0.92em]"
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

type DocBlock =
  | { kind: "h1" | "h2" | "p"; text: string; line: number; end: number }
  | { kind: "ul"; items: { text: string; line: number }[]; line: number };

function docBlocks(lines: string[]): DocBlock[] {
  const out: DocBlock[] = [];
  lines.forEach((raw, line) => {
    const t = raw.trim();
    if (!t) return;
    if (t.startsWith("# "))
      out.push({ kind: "h1", text: t.slice(2), line, end: line });
    else if (t.startsWith("## "))
      out.push({ kind: "h2", text: t.slice(3), line, end: line });
    else if (/^[-*]\s+/.test(t)) {
      const item = { text: t.replace(/^[-*]\s+/, ""), line };
      const last = out[out.length - 1];
      if (last?.kind === "ul" && last.items.at(-1)?.line === line - 1) {
        last.items.push(item);
      } else out.push({ kind: "ul", items: [item], line });
    } else {
      const last = out[out.length - 1];
      if (last?.kind === "p" && last.end === line - 1) {
        out[out.length - 1] = { ...last, text: `${last.text} ${t}`, end: line };
      } else out.push({ kind: "p", text: t, line, end: line });
    }
  });
  return out;
}

const KEYWORDS =
  /\b(const|let|function|return|export|async|await|for|if|throw|try|catch|new|type|null|import|from)\b/;

/** Enough colour to read code by: comments, strings, numbers and keywords. */
function CodeLine({ text }: { text: string }) {
  const comment = text.indexOf("//");
  const body = comment >= 0 ? text.slice(0, comment) : text;
  const tail = comment >= 0 ? text.slice(comment) : "";
  const parts = body.split(/("[^"]*"|'[^']*'|`[^`]*`|\b\d[\d_]*\b)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^["'`]/.test(part))
          return (
            <span key={i} className="text-success">
              {part}
            </span>
          );
        if (/^\d/.test(part))
          return (
            <span key={i} className="text-warn">
              {part}
            </span>
          );
        return part.split(KEYWORDS).map((w, j) =>
          KEYWORDS.test(w) ? (
            <span key={`${i}-${j}`} className="text-cobalt-bright">
              {w}
            </span>
          ) : (
            <React.Fragment key={`${i}-${j}`}>{w}</React.Fragment>
          ),
        );
      })}
      {tail ? <span className="text-ink-3">{tail}</span> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

type Mode = "phone" | "tablet" | "desktop";
type ArtifactTab = "preview" | "source";

type Stream = {
  /** New for every stream, so a late promise can tell it was superseded. */
  key: number;
  convId: string;
  msgId: string;
  text: string;
  /** Characters revealed. */
  shown: number;
  /** Ticks so far: seeds the next chunk's width. */
  n: number;
  phase: "wait" | "text" | "artifact";
  /** The reply has arrived (false while a promise is pending). */
  ready: boolean;
  artifact?: AiArtifact;
  /** Lines of the artifact written. */
  lines: number;
};

type Said = { n: number; text: string };

const PHONE_MAX = 640;
const DESKTOP_MIN = 1040;
const MIN_THREAD = 340;
const MIN_PANE = 320;
const TICK_MS = 48;
const LINE_MS = 85;
const THINK_MS = 520;

const PANES: readonly AiWorkspacePane[] = ["split", "overlay", "canvas"];

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const ROW: Record<ThreadDensity, string> = {
  compact: "h-8 text-[13px]",
  cozy: "h-9 text-[13px]",
  roomy: "h-10 text-sm",
};

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Starts an animation under a key, stopping whatever ran there. */
const runIn = (
  map: Map<string, AnimationPlaybackControls>,
  key: string,
  controls: AnimationPlaybackControls,
) => {
  map.get(key)?.stop();
  map.set(key, controls);
};
const clampN = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
/** Where an element sits in the stereo field. */
const panOf = (el: Element | null | undefined) => {
  const rect = el?.getBoundingClientRect();
  return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
};

const iconButton = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
  FOCUS,
);

/**
 * A whole assistant in one screen: the conversations, the thread, the prompt
 * and whatever the assistant makes. The thread is thread-view and the prompt
 * is prompt-dock; this screen owns the frame around them, the stream and the
 * artifact pane.
 *
 * A sent prompt is answered by `respond` and the reply streams in word by
 * word, the caret riding its end, while Send becomes Stop. A reply that
 * makes something then writes it line by line in the artifact pane, which
 * slides in beside the thread on the glide spring as the writing starts:
 * its column width is one motion value, the panel anchored to its leading
 * edge, so the pane arrives from the right while the thread narrows under
 * the same edge. Each new line rises 4px into place. `pane` chooses a
 * column that shares the stage (with a divider you can drag, the sidebar
 * folding away when the three cannot fit), a sheet that slides over the
 * thread's edge, or a canvas that gives the artifact the stage.
 *
 * Below 640px the screen is a stack — conversations, thread, artifact —
 * pushed and popped on glide with the screen beneath shifting and dimming.
 * The sidebar's rows are a roving list (arrows, Home, End), pinned
 * conversations glide to the top, the divider is a separator the arrow keys
 * move, and Escape closes the pane or goes back. Under reduced motion
 * nothing slides: columns and screens swap with a cross-fade, while the
 * stream, the writing and every count still show.
 */
export function AiWorkspace({
  density = "cozy",
  pane = "split",
  theme = "page",
  conversations,
  defaultConversations,
  onConversationsChange,
  conversation,
  defaultConversation,
  onConversationChange,
  artifactOpen,
  defaultArtifactOpen = false,
  onArtifactOpenChange,
  respond = defaultAiRespond,
  onSend,
  onStop,
  onCopy,
  models = defaultModels,
  model,
  onModelChange,
  user = { name: RAE, plan: "Team plan" },
  workspace = "Fieldline",
  now = defaultAiNow,
  stream = 240,
  status = "ready",
  onRetry,
  label = "Assistant",
  sound = false,
  disabled = false,
  className,
}: AiWorkspaceProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const nowMs = toMs(now);
  const paneMode: AiWorkspacePane = PANES.includes(pane) ? pane : "split";
  const rowClass = ROW[density] ?? ROW.cozy;
  const searchId = `${uid}-search`;
  const paneId = `${uid}-pane`;
  const paneTitleId = `${uid}-pane-title`;

  /* ------------------------------ the data ------------------------------ */

  const [ownList, setOwnList] = React.useState<AiConversation[]>(
    () => defaultConversations ?? defaultAiConversations,
  );
  const list = conversations ?? ownList;
  const listRef = React.useRef(list);
  React.useEffect(() => {
    listRef.current = list;
  }, [list]);

  const [ownActive, setOwnActive] = React.useState<string | undefined>(
    () => defaultConversation ?? list[0]?.id,
  );
  const wantedId = conversation ?? ownActive;
  const active = list.find((c) => c.id === wantedId) ?? list[0];

  const [ownOpen, setOwnOpen] = React.useState(defaultArtifactOpen);
  const openWanted = artifactOpen ?? ownOpen;

  const [ownModel, setOwnModel] = React.useState(
    () => model ?? models[0]?.id ?? "",
  );
  const modelId = model ?? ownModel;
  const modelName = models.find((m) => m.id === modelId)?.name ?? MODEL;

  const [live, setLive] = React.useState<Stream | null>(null);
  const liveRef = React.useRef<Stream | null>(null);
  const [leaves, setLeaves] = React.useState<Record<string, string>>({});
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [unread, setUnread] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [sidebarWanted, setSidebarWanted] = React.useState(true);
  const [phoneThread, setPhoneThread] = React.useState(false);
  const [tab, setTab] = React.useState<ArtifactTab>("preview");
  const [copied, setCopied] = React.useState(false);
  const [ratio, setRatio] = React.useState(0.5);
  const [focusRow, setFocusRow] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState(false);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const counter = React.useRef(0);
  const streamSeq = React.useRef(0);
  const rows = React.useRef(new Map<string, HTMLButtonElement>());
  const opener = React.useRef<HTMLElement | null>(null);
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const copyTimer = React.useRef(0);
  const focusNext = React.useRef<(() => HTMLElement | null | undefined) | null>(
    null,
  );
  const focusPrompt = React.useRef(false);
  const toFloor = React.useRef(false);
  const threadRef = React.useRef<HTMLDivElement | null>(null);
  const api = React.useRef<{ advance: () => void } | null>(null);

  /* ------------------------------ the frame ----------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!root) return;
    const read = () => setWidth(Math.round(root.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);

  const W = width ?? 760;
  const mode: Mode =
    W < PHONE_MAX ? "phone" : W >= DESKTOP_MIN ? "desktop" : "tablet";
  const sideFull = mode === "desktop" ? 256 : 232;
  const canvasThread = mode === "desktop" ? 340 : 300;

  const streamingHere = !!live && !!active && live.convId === active.id;
  const writingHere = streamingHere && live.phase === "artifact";
  const shownArtifact: AiArtifact | undefined =
    writingHere && live.artifact
      ? { ...live.artifact, source: linesOf(live.artifact.source, live.lines) }
      : active?.artifact;
  const hasArtifact = !!shownArtifact;
  const paneOpen = openWanted && hasArtifact && status === "ready";

  const sideFolds =
    paneOpen &&
    (paneMode === "canvas" ||
      (paneMode === "split" && W - sideFull - MIN_THREAD - MIN_PANE < 0));
  const sideShown = mode !== "phone" && sidebarWanted && !sideFolds;
  const stage = W - (sideShown ? sideFull : 0);
  const splitPane = Math.round(
    clampN(stage * ratio, MIN_PANE, Math.max(MIN_PANE, stage - MIN_THREAD)),
  );
  const paneTarget =
    paneMode === "canvas"
      ? Math.max(MIN_PANE, stage - canvasThread)
      : paneMode === "overlay"
        ? Math.min(mode === "desktop" ? 480 : 420, W - 40)
        : splitPane;
  const columnTarget = paneOpen && paneMode !== "overlay" ? paneTarget : 0;
  const sideTarget = sideShown ? sideFull : 0;

  const sideW = useMotionValue(sideFull);
  const paneW = useMotionValue(0);
  const innerW = useMotionValue(paneTarget);
  const sheetX = useMotionValue(paneTarget + 24);
  const depth = useMotionValue(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const measured = React.useRef(false);
  const wasOpen = React.useRef(false);
  const wasMode = React.useRef<Mode | null>(null);
  const resizing = React.useRef<{ from: number; max: number } | null>(null);

  // Columns follow their targets on glide; the first measurement places
  // them, and a re-run that interrupted a glide carries it on to rest.
  React.useLayoutEffect(() => {
    if (width === null) return;
    const jump = !measured.current || !motionSafe;
    measured.current = true;
    const to = (key: string, mv: MotionValue<number>, target: number) => {
      if (resizing.current && key === "pane") return;
      if (jump) {
        anims.current.get(key)?.stop();
        mv.jump(target);
      } else if (Math.abs(mv.get() - target) > 0.5) {
        runIn(anims.current, key, animate(mv, target, springs.glide));
      }
    };
    // The panel keeps its open width while its column opens or closes, so
    // it travels; a column resized while open takes the panel with it.
    const toggled = wasOpen.current !== paneOpen;
    wasOpen.current = paneOpen;
    if (paneOpen && !resizing.current) {
      if (toggled || jump) innerW.jump(paneTarget);
      else to("inner", innerW, paneTarget);
    }
    to("side", sideW, sideTarget);
    to("pane", paneW, columnTarget);
    to(
      "sheet",
      sheetX,
      paneOpen && paneMode === "overlay" ? 0 : paneTarget + 24,
    );
  }, [
    width,
    motionSafe,
    sideTarget,
    columnTarget,
    paneTarget,
    paneOpen,
    paneMode,
    sideW,
    paneW,
    innerW,
    sheetX,
  ]);

  const level = !active ? 0 : paneOpen ? 2 : phoneThread ? 1 : 0;
  React.useLayoutEffect(() => {
    const arrived = wasMode.current !== mode;
    wasMode.current = mode;
    if (mode !== "phone") return;
    if (arrived || !motionSafe) {
      anims.current.get("depth")?.stop();
      depth.jump(level);
      return;
    }
    if (Math.abs(depth.get() - level) > 0.001) {
      runIn(anims.current, "depth", animate(depth, level, springs.glide));
    }
  }, [level, mode, motionSafe, depth]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      window.clearTimeout(copyTimer.current);
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* ----------------------------- committing ----------------------------- */

  const commit = (next: AiConversation[]) => {
    listRef.current = next;
    if (conversations === undefined) setOwnList(next);
    onConversationsChange?.(next);
  };

  const patch = (id: string, fn: (c: AiConversation) => AiConversation) =>
    commit(listRef.current.map((c) => (c.id === id ? fn(c) : c)));

  const setPane = (open: boolean, by?: Element | null) => {
    if (open === openWanted) return;
    if (by) {
      audio.play("swish", {
        pitch: open ? 1.15 : 0.85,
        gain: 0.45,
        pan: panOf(by),
      });
    }
    if (open && by) {
      const at = document.activeElement;
      opener.current = at instanceof HTMLElement ? at : null;
      focusNext.current = () => document.getElementById(paneTitleId);
    }
    if (!open && by) {
      const back = opener.current;
      opener.current = null;
      focusNext.current = () =>
        back?.isConnected
          ? back
          : root?.querySelector<HTMLElement>(`[aria-controls="${paneId}"]`);
    }
    if (artifactOpen === undefined) setOwnOpen(open);
    onArtifactOpenChange?.(open);
    say(open ? "Artifact opened." : "Artifact closed.");
  };

  const choose = (id: string, by?: Element | null) => {
    const target = listRef.current.find((c) => c.id === id);
    if (!target || disabled) return;
    if (by) audio.play("tick", { pitch: 1.1, gain: 0.4, pan: panOf(by) });
    if (unread.includes(id)) setUnread((u) => u.filter((x) => x !== id));
    if (mode === "phone" && !phoneThread) {
      setPhoneThread(true);
      audio.play("swish", { pitch: 1.1, gain: 0.35 });
      focusNext.current = () =>
        root?.querySelector<HTMLElement>("[data-ai-back]");
    }
    if (id !== active?.id) {
      if (conversation === undefined) setOwnActive(id);
      onConversationChange?.(id);
      setTab("preview");
      if (!target.artifact && openWanted) {
        if (artifactOpen === undefined) setOwnOpen(false);
        onArtifactOpenChange?.(false);
      }
    }
    say(`Opened ${target.title}.`);
  };

  const newChat = (by?: Element | null) => {
    if (disabled || status !== "ready") return;
    counter.current += 1;
    const id = `${idBase}-c${counter.current}`;
    const at = Math.max(nowMs, ...listRef.current.map(lastAt)) + 1000;
    commit([{ id, title: "New chat", at, messages: [] }, ...listRef.current]);
    if (by) audio.play("tick", { pitch: 1.3, gain: 0.45 });
    if (conversation === undefined) setOwnActive(id);
    onConversationChange?.(id);
    if (openWanted) {
      if (artifactOpen === undefined) setOwnOpen(false);
      onArtifactOpenChange?.(false);
    }
    if (mode === "phone") setPhoneThread(true);
    setQuery("");
    focusPrompt.current = true;
    say("New chat.");
  };

  const togglePin = (pinned: boolean) => {
    if (!active) return;
    patch(active.id, (c) => ({ ...c, pinned }));
    say(pinned ? `${active.title} pinned.` : `${active.title} unpinned.`);
  };

  /* ------------------------------ the stream ---------------------------- */

  const stamp = () =>
    Math.max(
      nowMs,
      ...listRef.current.flatMap((c) => c.messages.map((m) => m.at)),
    ) + 1000;

  const finish = (s: Stream, cut: boolean) => {
    liveRef.current = null;
    setLive(null);
    const conv = listRef.current.find((c) => c.id === s.convId);
    if (!conv) return;
    const text = cut ? s.text.slice(0, s.shown).trimEnd() : s.text;
    const written =
      s.artifact && (!cut || (s.phase === "artifact" && s.lines > 0))
        ? cut
          ? { ...s.artifact, source: linesOf(s.artifact.source, s.lines) }
          : s.artifact
        : undefined;
    patch(s.convId, (c) => ({
      ...c,
      artifact: written ?? c.artifact,
      messages: c.messages.map((m) => {
        if (m.id !== s.msgId) return m;
        const next: ThreadMessage = { ...m, text: text || "Stopped." };
        delete next.status;
        return next;
      }),
    }));
    if (written) say(`${written.title} written.`);
    if (s.convId !== active?.id) {
      setUnread((u) => (u.includes(s.convId) ? u : [...u, s.convId]));
    }
  };

  const startStream = (
    conv: AiConversation,
    prompt: string,
    msgId: string,
    messages: ThreadMessage[],
  ) => {
    const prev = liveRef.current;
    if (prev) finish(prev, true);
    streamSeq.current += 1;
    const key = streamSeq.current;
    const base: Stream = {
      key,
      convId: conv.id,
      msgId,
      text: "",
      shown: 0,
      n: 0,
      phase: "wait",
      ready: false,
      lines: 0,
    };
    const land = (reply: AiReply) => {
      const s = liveRef.current;
      if (!s || s.key !== key) return;
      const text = reply.text.trim() || "Done.";
      patch(conv.id, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msgId ? { ...m, text } : m)),
      }));
      const next: Stream = {
        ...s,
        text,
        ready: true,
        artifact: reply.artifact,
      };
      liveRef.current = next;
      setLive(next);
    };
    const fail = () => {
      const s = liveRef.current;
      if (!s || s.key !== key) return;
      liveRef.current = null;
      setLive(null);
      patch(conv.id, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === msgId
            ? { ...m, text: "This reply did not arrive.", status: "error" }
            : m,
        ),
      }));
      say("The reply failed. Retry is on the message.");
    };
    liveRef.current = base;
    setLive(base);
    let answer: AiReply | Promise<AiReply>;
    try {
      answer = respond(prompt, { ...conv, messages });
    } catch {
      fail();
      return;
    }
    if (answer instanceof Promise) answer.then(land, fail);
    else land(answer);
  };

  const send = (text: string, convId: string) => {
    const conv = listRef.current.find((c) => c.id === convId);
    const prompt = text.trim();
    if (!conv || !prompt || disabled) return;
    const tail = pathOf(conv.messages, leaves[convId]).at(-1);
    const at = stamp();
    counter.current += 1;
    const userMsg: ThreadMessage = {
      id: `${idBase}-u${counter.current}`,
      parentId: tail?.id ?? null,
      role: "user",
      author: user.name,
      at,
      text: prompt,
    };
    const reply: ThreadMessage = {
      id: `${idBase}-a${counter.current}`,
      parentId: userMsg.id,
      role: "assistant",
      author: modelName,
      at: at + 1000,
      text: "",
      status: "streaming",
    };
    const messages = [...conv.messages, userMsg, reply];
    const title =
      conv.messages.length === 0 && conv.title === "New chat"
        ? clip(prompt, 48)
        : conv.title;
    patch(convId, (c) => ({ ...c, title, messages }));
    setLeaves((l) => ({ ...l, [convId]: reply.id }));
    toFloor.current = true;
    onSend?.(prompt, convId);
    startStream({ ...conv, title }, prompt, reply.id, messages);
  };

  const stop = () => {
    const s = liveRef.current;
    if (!s) return;
    finish(s, true);
    onStop?.(s.convId);
    say("Stopped.");
  };

  const advance = () => {
    const s = liveRef.current;
    if (!s || !s.ready) return;
    let next: Stream | null = null;
    if (s.phase === "wait") next = { ...s, phase: "text" };
    else if (s.phase === "text" && s.shown < s.text.length) {
      const k = 0.6 + (hash(`${s.text.length}:${s.n}`) % 80) / 100;
      let shown = Math.min(
        s.text.length,
        s.shown + Math.max(2, Math.round(((stream * TICK_MS) / 1000) * k)),
      );
      while (shown < s.text.length && !/\s/.test(s.text[shown] ?? " ")) {
        shown += 1;
      }
      next = { ...s, shown, n: s.n + 1 };
    } else if (s.phase === "text" && s.artifact) {
      next = { ...s, phase: "artifact", lines: 0 };
      // The reply the visitor asked for starts writing: the pane comes to
      // meet it, unless a phone would lose its place in the thread.
      if (
        s.convId === wantedId &&
        mode !== "phone" &&
        !openWanted &&
        status === "ready"
      ) {
        if (artifactOpen === undefined) setOwnOpen(true);
        onArtifactOpenChange?.(true);
      }
      say(`Writing ${s.artifact.title}.`);
    } else if (
      s.phase === "artifact" &&
      s.artifact &&
      s.lines < s.artifact.source.split("\n").length
    ) {
      next = { ...s, lines: s.lines + 1 };
    }
    if (next) {
      liveRef.current = next;
      setLive(next);
    } else finish(s, false);
  };

  React.useEffect(() => {
    api.current = { advance };
  });

  // One tick scheduled per state of the stream: idempotent under StrictMode,
  // and nothing runs while the page is hidden.
  React.useEffect(() => {
    if (!live || !live.ready || hidden) return;
    const nextLine =
      live.phase === "artifact"
        ? (live.artifact?.source.split("\n")[live.lines] ?? "")
        : "";
    const delay =
      live.phase === "wait"
        ? THINK_MS
        : live.phase === "artifact"
          ? nextLine.trim()
            ? LINE_MS
            : 24
          : TICK_MS;
    const t = window.setTimeout(() => api.current?.advance(), delay);
    return () => window.clearTimeout(t);
  }, [live, hidden]);

  /* ---------------------------- thread events --------------------------- */

  const shownMessages = React.useMemo(() => {
    if (!active) return [];
    if (!live || live.convId !== active.id) return active.messages;
    return active.messages.map((m) =>
      m.id === live.msgId
        ? {
            ...m,
            text:
              live.phase === "text"
                ? live.text.slice(0, live.shown)
                : live.phase === "artifact"
                  ? live.text
                  : "",
            status: "streaming" as const,
          }
        : m,
    );
  }, [active, live]);

  const onThreadChange = (next: ThreadMessage[]) => {
    if (!active) return;
    const s = liveRef.current;
    const stored = new Map(active.messages.map((m) => [m.id, m]));
    // The thread saw the streaming reply cut to its revealed words; the data
    // keeps the whole reply.
    const merged = next.map((m) =>
      s && s.convId === active.id && m.id === s.msgId
        ? (stored.get(m.id) ?? m)
        : m,
    );
    patch(active.id, (c) => ({ ...c, messages: merged }));
  };

  const onEdit = (_original: ThreadMessage, version: ThreadMessage) => {
    if (!active || version.role !== "user") return;
    const conv = listRef.current.find((c) => c.id === active.id);
    if (!conv) return;
    counter.current += 1;
    const reply: ThreadMessage = {
      id: `${idBase}-a${counter.current}`,
      parentId: version.id,
      role: "assistant",
      author: modelName,
      at: version.at + 1000,
      text: "",
      status: "streaming",
    };
    const messages = [...conv.messages, reply];
    patch(active.id, (c) => ({ ...c, messages }));
    setLeaves((l) => ({ ...l, [active.id]: reply.id }));
    toFloor.current = true;
    onSend?.(version.text, active.id);
    startStream(conv, version.text, reply.id, messages);
  };

  const onRetryReply = (messageId: string) => {
    if (!active) return;
    const conv = listRef.current.find((c) => c.id === active.id);
    const failed = conv?.messages.find((m) => m.id === messageId);
    const asked = conv?.messages.find((m) => m.id === failed?.parentId);
    if (!conv || !failed || !asked) return;
    const messages = conv.messages.map((m) =>
      m.id === messageId ? { ...m, text: "", status: "streaming" as const } : m,
    );
    patch(active.id, (c) => ({ ...c, messages }));
    startStream(conv, asked.text, messageId, messages);
  };

  /* --------------------------- focus on arrival ------------------------- */

  // A prompt the visitor sent takes the thread to its floor, as the thread
  // does for its own composer; it then follows the reply down from there.
  React.useLayoutEffect(() => {
    if (!toFloor.current) return;
    toFloor.current = false;
    const log = threadRef.current?.querySelector<HTMLElement>("[role=log]");
    if (log) log.scrollTop = log.scrollHeight;
  });

  // Focus that follows a navigation is placed once the render that moved
  // it has landed, when the screen it goes to is no longer inert.
  React.useEffect(() => {
    const next = focusNext.current;
    if (next) {
      focusNext.current = null;
      const node = next();
      if (node?.isConnected && !node.closest("[inert]")) {
        node.focus({ preventScroll: true });
      }
    }
    if (!focusPrompt.current) return;
    const area = dockRef.current?.querySelector("textarea");
    if (!area || area.closest("[inert]")) return;
    focusPrompt.current = false;
    area.focus({ preventScroll: true });
  });

  /* ------------------------------- sidebar ------------------------------ */

  const q = query.trim().toLowerCase();
  const matches = list.filter((c) => matchOf(c, q));
  const ordered = GROUPS.flatMap((g) =>
    matches
      .filter((c) => groupOf(c, nowMs) === g.id)
      .sort((a, b) => lastAt(b) - lastAt(a))
      .map((c) => ({ c, g })),
  );
  const rovingId =
    (focusRow && ordered.some((o) => o.c.id === focusRow) && focusRow) ||
    (active && ordered.some((o) => o.c.id === active.id) && active.id) ||
    ordered[0]?.c.id;

  const onRowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const to = {
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      Home: 0,
      End: ordered.length - 1,
    }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const target = ordered[clampN(to, 0, ordered.length - 1)];
    if (!target) return;
    setFocusRow(target.c.id);
    rows.current.get(target.c.id)?.focus();
  };

  const sidebar = (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-2 bg-cobalt-wash text-[11px] font-semibold text-cobalt-bright"
        >
          {workspace.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {workspace}
        </span>
        <button
          type="button"
          aria-label="New chat"
          title="New chat"
          disabled={disabled || status !== "ready"}
          onClick={(event) => newChat(event.currentTarget)}
          className={iconButton}
        >
          <SquarePen aria-hidden className="size-4" />
        </button>
      </div>
      <div className="shrink-0 px-3 pt-3 pb-2">
        <label htmlFor={searchId} className="relative flex h-8 items-center">
          <span className="sr-only">Search conversations</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3"
          />
          <input
            id={searchId}
            type="search"
            placeholder="Search"
            autoComplete="off"
            value={query}
            disabled={status !== "ready"}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setQuery(text);
              const t = text.trim().toLowerCase();
              if (t) {
                const n = list.filter((c) => matchOf(c, t)).length;
                say(
                  `${plural(n, "conversation")} ${n === 1 ? "matches" : "match"}.`,
                );
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            className={cn(
              "h-8 w-full rounded-2 border border-hairline bg-card pr-2 pl-8 text-[13px] text-foreground placeholder:text-ink-3 disabled:opacity-50",
              FOCUS_IN,
            )}
          />
        </label>
      </div>
      <motion.nav
        aria-label="Conversations"
        layoutScroll
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 pb-3"
      >
        {status === "loading" ? (
          <div aria-busy="true" className="flex flex-col gap-2 px-1 pt-2">
            <p className="sr-only">Loading conversations.</p>
            {[72, 56, 64, 48, 60].map((w, i) => (
              <span
                key={i}
                className="block h-7 rounded-2 bg-surface-2"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-start gap-2 px-2 pt-3">
            <p className="text-[13px] text-foreground">
              Conversations did not load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : ordered.length === 0 ? (
          <p className="px-2 pt-3 text-[13px] text-ink-3">
            {q ? "No conversations match." : "No conversations yet."}
          </p>
        ) : (
          <ul role="list" className="flex flex-col">
            {ordered.map(({ c, g }, i) => {
              const head = i === 0 || ordered[i - 1]?.g.id !== g.id;
              const on = c.id === active?.id;
              const writing = live?.convId === c.id;
              const fresh = unread.includes(c.id);
              return (
                <motion.li
                  key={c.id}
                  layout={motionSafe ? "position" : false}
                  transition={springs.glide}
                  className="flex flex-col"
                >
                  {head ? (
                    <h3 className="px-2 pt-3 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      {g.label}
                    </h3>
                  ) : null}
                  <button
                    ref={(node) => {
                      if (node) rows.current.set(c.id, node);
                      else rows.current.delete(c.id);
                    }}
                    type="button"
                    tabIndex={c.id === rovingId ? 0 : -1}
                    aria-current={on ? "page" : undefined}
                    aria-label={`${c.title}${c.artifact ? ", has an artifact" : ""}${writing ? ", writing a reply" : ""}${fresh ? ", new reply" : ""}`}
                    disabled={disabled}
                    onFocus={() => setFocusRow(c.id)}
                    onKeyDown={(event) => onRowKey(event, i)}
                    onClick={(event) => choose(c.id, event.currentTarget)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-2 px-2 text-left transition-colors",
                      rowClass,
                      on
                        ? "bg-cobalt-wash text-foreground"
                        : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      FOCUS_IN,
                    )}
                  >
                    {c.artifact ? (
                      <KindIcon
                        kind={c.artifact.kind}
                        className="size-3.5 text-ink-3"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        (on || fresh) && "font-medium",
                      )}
                      title={c.title}
                    >
                      {c.title}
                    </span>
                    {writing ? (
                      <span
                        aria-hidden
                        className="flex shrink-0 items-center gap-0.5"
                      >
                        {[0, 1, 2].map((k) => (
                          <motion.span
                            key={k}
                            className="size-1 rounded-full bg-cobalt-bright"
                            animate={
                              motionSafe && !hidden
                                ? { opacity: [0.3, 1, 0.3] }
                                : { opacity: 0.8 }
                            }
                            transition={
                              motionSafe && !hidden
                                ? {
                                    duration: 0.9,
                                    repeat: Infinity,
                                    delay: k * 0.15,
                                    ease: "easeInOut",
                                  }
                                : { duration: 0 }
                            }
                          />
                        ))}
                      </span>
                    ) : fresh ? (
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
                      />
                    ) : (
                      <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                        {whenOf(lastAt(c), nowMs)}
                      </span>
                    )}
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.nav>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-t border-hairline px-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2"
        >
          {user.name
            .split(/\s+/)
            .map((w) => w.charAt(0))
            .slice(0, 2)
            .join("")}
        </span>
        <span className="min-w-0">
          <span
            className="block truncate text-[13px] font-medium"
            title={user.name}
          >
            {user.name}
          </span>
          {user.plan ? (
            <span className="block truncate text-[11px] text-ink-3">
              {workspace} · {user.plan}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );

  /* ------------------------------- the pane ----------------------------- */

  const copy = async (by: Element | null) => {
    if (!shownArtifact) return;
    const text = shownArtifact.source;
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // The clipboard can refuse; the check still says what was meant.
    }
    if (by) audio.play("tick", { pitch: 1.4, gain: 0.4 });
    onCopy?.(text, shownArtifact);
    setCopied(true);
    say(`${shownArtifact.filename} copied.`);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const tabs: ArtifactTab[] = ["preview", "source"];
  const isDoc = shownArtifact?.kind === "document";
  const shownTab: ArtifactTab = isDoc ? tab : "source";
  const lines = shownArtifact ? shownArtifact.source.split("\n") : [];
  const lineIn = (i: number) =>
    writingHere && motionSafe && i >= live.lines - 1
      ? { opacity: 0, y: distances.nudge }
      : false;
  const lineMotion = {
    animate: { opacity: 1, y: 0 },
    transition: {
      y: springs.glide,
      opacity: { duration: durations.base, ease: easings.enter },
    },
  };

  const paneBody = shownArtifact ? (
    <div
      className="relative flex h-full w-full flex-col bg-card"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        setPane(false, event.currentTarget);
      }}
    >
      {writingHere ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-clip"
        >
          <motion.span
            className="absolute inset-y-0 left-0 w-1/3 bg-cobalt-bright"
            initial={{ x: "-100%" }}
            animate={motionSafe && !hidden ? { x: "300%" } : { x: "100%" }}
            transition={
              motionSafe && !hidden
                ? { duration: 1.1, repeat: Infinity, ease: easings.move }
                : { duration: 0 }
            }
          />
        </span>
      ) : null}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline pr-2 pl-3">
        {mode === "phone" ? (
          <button
            type="button"
            aria-label="Back to the thread"
            onClick={(event) => setPane(false, event.currentTarget)}
            className={cn(iconButton, "-ml-1")}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
        ) : null}
        <KindIcon
          kind={shownArtifact.kind}
          className="size-4 text-cobalt-bright"
        />
        <h2
          id={paneTitleId}
          tabIndex={-1}
          className="min-w-0 flex-1 truncate rounded-1 text-[13px] font-medium outline-none"
          title={shownArtifact.title}
        >
          {shownArtifact.title}
        </h2>
        {shownArtifact.language ? (
          <span className="hidden h-5 shrink-0 items-center rounded-full bg-surface-2 px-2 font-mono text-[10px] text-ink-2 @min-[22rem]:inline-flex">
            {shownArtifact.language}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={copied ? "Copied" : `Copy ${shownArtifact.filename}`}
          title="Copy"
          onClick={(event) => void copy(event.currentTarget)}
          className={iconButton}
        >
          <span aria-hidden className="inline-grid size-4">
            <motion.span
              className="[grid-area:1/1]"
              animate={{
                opacity: copied ? 0 : 1,
                scale: copied && motionSafe ? 0.6 : 1,
              }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
            >
              <Copy className="size-4" />
            </motion.span>
            <motion.span
              className="text-success [grid-area:1/1]"
              initial={false}
              animate={{
                opacity: copied ? 1 : 0,
                scale: copied || !motionSafe ? 1 : 0.6,
              }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
            >
              <Check className="size-4" />
            </motion.span>
          </span>
        </button>
        {mode !== "phone" ? (
          <button
            type="button"
            aria-label="Close the artifact"
            title="Close"
            onClick={(event) => setPane(false, event.currentTarget)}
            className={iconButton}
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      {isDoc ? (
        <div
          role="tablist"
          aria-label="View"
          className="relative flex h-9 shrink-0 items-stretch gap-4 border-b border-hairline px-3"
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const next = tab === "preview" ? "source" : "preview";
            setTab(next);
            audio.play("tick", {
              pitch: next === "source" ? 1.2 : 1,
              gain: 0.35,
            });
            event.currentTarget
              .querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)
              ?.focus();
          }}
        >
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              data-tab={t}
              id={`${paneId}-tab-${t}`}
              aria-selected={shownTab === t}
              aria-controls={`${paneId}-panel`}
              tabIndex={shownTab === t ? 0 : -1}
              onClick={() => {
                if (t === tab) return;
                setTab(t);
                audio.play("tick", {
                  pitch: t === "source" ? 1.2 : 1,
                  gain: 0.35,
                });
              }}
              className={cn(
                "relative inline-flex items-center rounded-1 text-[12px] transition-colors",
                shownTab === t
                  ? "text-foreground"
                  : "text-ink-3 hover:text-ink-2",
                FOCUS_IN,
              )}
            >
              {t === "preview" ? "Preview" : "Source"}
              {shownTab === t ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${idBase}-tab-line` : undefined}
                  transition={springs.snap}
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-cobalt-bright"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <div
        id={`${paneId}-panel`}
        role={isDoc ? "tabpanel" : undefined}
        aria-labelledby={isDoc ? `${paneId}-tab-${shownTab}` : paneTitleId}
        tabIndex={0}
        className={cn(
          "flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain",
          FOCUS_IN,
        )}
      >
        {shownTab === "preview" ? (
          <div className="flex flex-col gap-2 px-5 py-4 text-[13px] leading-6 text-ink-2">
            {docBlocks(lines).map((b) =>
              b.kind === "ul" ? (
                <ul
                  key={`ul-${b.items[0]?.line ?? b.line}`}
                  className="flex flex-col gap-1 pl-4"
                >
                  {b.items.map((item) => (
                    <motion.li
                      key={item.line}
                      initial={lineIn(item.line)}
                      {...lineMotion}
                      className="list-disc marker:text-ink-3"
                    >
                      <Inline text={item.text} />
                    </motion.li>
                  ))}
                </ul>
              ) : b.kind === "h1" ? (
                <motion.h3
                  key={b.line}
                  initial={lineIn(b.line)}
                  {...lineMotion}
                  className="text-base leading-7 font-semibold text-foreground"
                >
                  <Inline text={b.text} />
                </motion.h3>
              ) : b.kind === "h2" ? (
                <motion.h4
                  key={b.line}
                  initial={lineIn(b.line)}
                  {...lineMotion}
                  className="pt-2 text-[13px] font-semibold text-foreground"
                >
                  <Inline text={b.text} />
                </motion.h4>
              ) : (
                <motion.p key={b.line} initial={lineIn(b.line)} {...lineMotion}>
                  <Inline text={b.text} />
                </motion.p>
              ),
            )}
          </div>
        ) : (
          <ol
            aria-label={shownArtifact.filename}
            className="py-3 font-mono text-[11.5px] leading-5"
          >
            {lines.map((text, i) => (
              <motion.li
                key={i}
                initial={lineIn(i)}
                {...lineMotion}
                className="flex gap-3 pr-4"
              >
                <span
                  aria-hidden
                  className="w-8 shrink-0 text-right text-ink-3 tabular-nums select-none"
                >
                  {i + 1}
                </span>
                <code className="min-w-0 flex-1 [overflow-wrap:anywhere] whitespace-pre-wrap text-foreground">
                  {shownArtifact.kind === "code" ? (
                    <CodeLine text={text} />
                  ) : (
                    text
                  )}
                  {text ? null : " "}
                </code>
              </motion.li>
            ))}
          </ol>
        )}
      </div>
    </div>
  ) : null;

  /* ------------------------------ the thread ---------------------------- */

  const generating = streamingHere;
  const draft = active ? (drafts[active.id] ?? "") : "";
  const empty = !!active && active.messages.length === 0 && status === "ready";

  const strip =
    active && hasArtifact && !paneOpen && status === "ready" ? (
      <motion.div
        key={shownArtifact?.id}
        className="px-3 pt-2"
        initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          y: motionSafe ? springs.snap : { duration: 0 },
          opacity: { duration: durations.fast },
        }}
      >
        <button
          type="button"
          aria-expanded={false}
          aria-controls={paneId}
          disabled={disabled}
          onClick={(event) => setPane(true, event.currentTarget)}
          className={cn(
            "mx-auto flex h-9 w-full max-w-[46rem] items-center gap-2 rounded-3 border border-hairline bg-surface-1 px-3 text-left text-[13px] transition-colors hover:border-hairline-strong hover:bg-surface-2",
            FOCUS,
          )}
        >
          <KindIcon
            kind={shownArtifact?.kind}
            className="size-4 text-cobalt-bright"
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">
              {shownArtifact?.title}
            </span>
            <span className="text-ink-3">
              {" · "}
              {writingHere ? "writing" : (shownArtifact?.language ?? "File")}
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-cobalt-bright">
            Open
          </span>
        </button>
      </motion.div>
    ) : null;

  const suggestions = empty ? (
    <div className="flex flex-wrap justify-center gap-1.5 px-3 pt-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!active) return;
            setDrafts((d) => ({ ...d, [active.id]: s }));
            focusPrompt.current = true;
            audio.play("tick", { pitch: 1.15, gain: 0.35 });
          }}
          className={cn(
            "inline-flex h-7 max-w-full items-center rounded-full border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <span className="truncate">{s}</span>
        </button>
      ))}
    </div>
  ) : null;

  const thread = active ? (
    <motion.div
      key={active.id}
      className="h-full"
      initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        opacity: { duration: durations.base, ease: easings.enter },
        y: motionSafe ? springs.glide : { duration: 0 },
      }}
    >
      <ThreadView
        density={density}
        messages={shownMessages}
        onMessagesChange={onThreadChange}
        leaf={leaves[active.id]}
        onLeafChange={(id) => setLeaves((l) => ({ ...l, [active.id]: id }))}
        onEdit={onEdit}
        onRetry={onRetryReply}
        onReload={onRetry}
        now={nowMs}
        author={user.name}
        title={active.title}
        model={modelName}
        status={status}
        composer={false}
        suggestions={[]}
        sound={sound}
        disabled={disabled}
        className="h-full rounded-none border-0 bg-transparent"
      />
    </motion.div>
  ) : (
    <div className="flex h-full items-center justify-center p-6 text-sm text-ink-3">
      No conversation open.
    </div>
  );

  const dock = (
    <div ref={dockRef} className="shrink-0 px-3 pt-2 pb-3">
      <PromptDock
        value={draft}
        onValueChange={(text) => {
          if (active) setDrafts((d) => ({ ...d, [active.id]: text }));
        }}
        generating={generating}
        onSend={(message: DockMessage) => {
          if (active) send(message.text, active.id);
        }}
        onStop={stop}
        models={models}
        model={modelId}
        onModelChange={(id) => {
          if (model === undefined) setOwnModel(id);
          onModelChange?.(id);
        }}
        tray="count"
        placeholder={`Message ${modelName}`}
        sound={sound}
        disabled={disabled || status !== "ready" || !active}
        className="mx-auto max-w-[46rem]"
      />
    </div>
  );

  const pin = active ? (
    <PinPress
      compact
      size="sm"
      name="Pin conversation"
      pressed={!!active.pinned}
      onPressedChange={togglePin}
      sound={sound}
      disabled={disabled || status !== "ready"}
    />
  ) : null;

  const artifactButton = (
    <button
      type="button"
      aria-expanded={paneOpen}
      aria-controls={paneId}
      disabled={disabled || !hasArtifact || status !== "ready"}
      onClick={(event) => setPane(!paneOpen, event.currentTarget)}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2 border px-2.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-40",
        paneOpen
          ? "border-transparent bg-cobalt-wash text-foreground"
          : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
        FOCUS,
      )}
    >
      <KindIcon kind={shownArtifact?.kind} className="size-3.5" />
      Artifact
    </button>
  );

  const threadColumn = (
    <div className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto_auto_auto] bg-card">
      <div className="flex h-11 items-center gap-1.5 border-b border-hairline px-2">
        {mode === "phone" ? (
          <button
            type="button"
            data-ai-back=""
            onClick={() => {
              setPhoneThread(false);
              audio.play("swish", { pitch: 0.85, gain: 0.35 });
              const id = active?.id ?? "";
              focusNext.current = () => rows.current.get(id);
            }}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-0.5 rounded-2 pr-2 pl-1 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-4" />
            Chats
          </button>
        ) : (
          <button
            type="button"
            aria-label={sideShown ? "Hide conversations" : "Show conversations"}
            aria-expanded={sideShown}
            title={sideShown ? "Hide conversations" : "Show conversations"}
            disabled={sideFolds}
            onClick={() => {
              setSidebarWanted(!sidebarWanted);
              audio.play("tick", {
                pitch: sidebarWanted ? 0.9 : 1.1,
                gain: 0.35,
              });
            }}
            className={cn(iconButton, "size-9")}
          >
            <PanelLeft aria-hidden className="size-4" />
          </button>
        )}
        {mode !== "phone" && !sideShown ? (
          <button
            type="button"
            aria-label="New chat"
            title="New chat"
            disabled={disabled || status !== "ready"}
            onClick={(event) => newChat(event.currentTarget)}
            className={cn(iconButton, "size-9")}
          >
            <SquarePen aria-hidden className="size-4" />
          </button>
        ) : null}
        <span className="flex-1" />
        {pin}
        {artifactButton}
      </div>
      <div ref={threadRef} className="relative overflow-hidden">
        {thread}
      </div>
      {strip ?? <span />}
      {suggestions ?? <span />}
      {dock}
    </div>
  );

  /* ------------------------------- layouts ------------------------------ */

  const separator =
    mode !== "phone" && paneMode === "split" && paneOpen ? (
      <Divider
        paneW={paneW}
        innerW={innerW}
        stage={stage}
        ratio={ratio}
        motionSafe={motionSafe}
        controls={paneId}
        disabled={disabled}
        onTick={(up) =>
          audio.play("tick", { pitch: up ? 1.15 : 0.9, gain: 0.3 })
        }
        onStart={() => {
          resizing.current = { from: paneW.get(), max: stage - MIN_THREAD };
          anims.current.get("pane")?.stop();
        }}
        onCommit={(w) => {
          resizing.current = null;
          setRatio(Number((w / Math.max(1, stage)).toFixed(4)));
        }}
      />
    ) : null;

  const content =
    mode === "phone" ? (
      <PhoneStack depth={depth} level={level} motionSafe={motionSafe}>
        {[
          <div key="list" className="h-full">
            {sidebar}
          </div>,
          <div key="thread" className="h-full">
            {threadColumn}
          </div>,
          <div key="pane" id={paneId} className="h-full">
            {paneBody}
          </div>,
        ]}
      </PhoneStack>
    ) : (
      <div className="relative flex h-full w-full">
        <motion.div
          aria-hidden={!sideShown || undefined}
          inert={!sideShown}
          className="relative h-full shrink-0 overflow-hidden border-r border-hairline"
          style={{ width: sideW }}
        >
          <div
            className="absolute inset-y-0 right-0"
            style={{ width: sideFull }}
          >
            {sidebar}
          </div>
        </motion.div>
        <div className="relative h-full min-w-0 flex-1">{threadColumn}</div>
        {paneMode !== "overlay" ? (
          <motion.aside
            id={paneId}
            aria-labelledby={paneOpen ? paneTitleId : undefined}
            aria-hidden={!paneOpen || undefined}
            inert={!paneOpen}
            className="@container relative h-full shrink-0 overflow-hidden border-l border-hairline"
            style={{ width: paneW }}
          >
            <motion.div
              className="absolute inset-y-0 left-0"
              style={{ width: innerW }}
              initial={false}
              animate={
                motionSafe ? { opacity: 1 } : { opacity: paneOpen ? 1 : 0 }
              }
              transition={{ duration: durations.fast }}
            >
              {paneBody}
            </motion.div>
          </motion.aside>
        ) : (
          <motion.aside
            id={paneId}
            aria-labelledby={paneOpen ? paneTitleId : undefined}
            aria-hidden={!paneOpen || undefined}
            inert={!paneOpen}
            className="@container absolute top-[52px] right-2 bottom-2 z-20 overflow-hidden rounded-3 border border-hairline-strong shadow-[0_12px_32px_color-mix(in_oklab,black_22%,transparent)]"
            style={{ width: paneTarget, x: sheetX }}
            initial={false}
            animate={
              motionSafe ? { opacity: 1 } : { opacity: paneOpen ? 1 : 0 }
            }
            transition={{ duration: durations.fast }}
          >
            {paneBody}
          </motion.aside>
        )}
        {separator}
      </div>
    );

  return (
    <div
      ref={setRoot}
      role="region"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (mode === "phone" && level === 1) {
          event.preventDefault();
          setPhoneThread(false);
          const id = active?.id ?? "";
          focusNext.current = () => rows.current.get(id);
        }
      }}
      className={cn(
        "@container relative isolate h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-background text-foreground",
        theme === "light" && "light",
        theme === "dark" && "dark",
        disabled && "opacity-70",
        className,
      )}
    >
      {content}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The divider between the thread and a split pane                       */
/* ------------------------------------------------------------------ */

function Divider({
  paneW,
  innerW,
  stage,
  ratio,
  motionSafe,
  controls,
  disabled,
  onTick,
  onStart,
  onCommit,
}: {
  paneW: MotionValue<number>;
  innerW: MotionValue<number>;
  stage: number;
  ratio: number;
  motionSafe: boolean;
  controls: string;
  disabled: boolean;
  onTick: (up: boolean) => void;
  onStart: () => void;
  onCommit: (width: number) => void;
}) {
  const max = Math.max(MIN_PANE, stage - MIN_THREAD);
  const from = React.useRef(0);
  const goal = React.useRef(0);
  const lastStep = React.useRef(0);
  const right = useTransform(paneW, (w) => r2(w - 8));
  const [held, setHeld] = React.useState(false);
  const pct = Math.round(ratio * 100);

  const settle = (target: number, velocity = 0) => {
    const to = Math.round(clampN(target, MIN_PANE, max));
    goal.current = to;
    if (motionSafe) {
      animate(paneW, to, { ...springs.glide, velocity });
      animate(innerW, to, { ...springs.glide, velocity });
    } else {
      paneW.jump(to);
      innerW.jump(to);
    }
    onCommit(to);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 2,
    disabled,
    onStart: () => {
      from.current = paneW.get();
      lastStep.current = Math.round(from.current / 40);
      setHeld(true);
      onStart();
    },
    onMove: ({ offset }) => {
      const w = r2(rubberClamp(from.current - offset.x, MIN_PANE, max, 120));
      paneW.set(w);
      innerW.set(w);
      const step = Math.round(w / 40);
      if (step !== lastStep.current) {
        onTick(step > lastStep.current);
        lastStep.current = step;
      }
    },
    onEnd: ({ velocity }) => {
      setHeld(false);
      settle(paneW.get(), -velocity.x);
    },
    onCancel: () => {
      setHeld(false);
      settle(from.current);
    },
  });

  return (
    <motion.div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the artifact"
      aria-controls={controls}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`Artifact ${pct}% of the stage`}
      tabIndex={disabled ? -1 : 0}
      {...drag}
      onDoubleClick={() => {
        onStart();
        settle(stage * 0.5);
      }}
      onKeyDown={(event) => {
        // Steps count from where the last one is going, so quick presses
        // add up rather than restarting from a divider still in flight.
        const w = paneW.isAnimating() ? goal.current : paneW.get();
        const to =
          event.key === "ArrowLeft"
            ? w + 32
            : event.key === "ArrowRight"
              ? w - 32
              : event.key === "Home"
                ? max
                : event.key === "End"
                  ? MIN_PANE
                  : null;
        if (to === null) return;
        event.preventDefault();
        onStart();
        onTick(to > w);
        settle(to);
      }}
      className={cn(
        "group/ai-workspace-divider absolute inset-y-0 z-30 flex w-4 cursor-col-resize touch-pan-y justify-center select-none",
        FOCUS_IN,
      )}
      style={{ right }}
    >
      <span
        aria-hidden
        className={cn(
          "h-full w-px transition-colors",
          held
            ? "bg-cobalt-bright"
            : "bg-transparent group-hover/ai-workspace-divider:bg-cobalt-bright/60",
        )}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* The phone stack                                                      */
/* ------------------------------------------------------------------ */

function StackScreen({
  index,
  depth,
  level,
  motionSafe,
  children,
}: {
  index: number;
  depth: MotionValue<number>;
  level: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  // Screens above slide in from the right edge; the ones beneath shift a
  // quarter of the way left and dim, so the push reads as depth.
  const x = useTransform(depth, (d) =>
    motionSafe ? `${r2((index - d) * (index > d ? 100 : 25))}%` : "0%",
  );
  const dim = useTransform(depth, (d) =>
    r2(Math.min(1, Math.max(0, d - index)) * 0.35),
  );
  const on = index === level;
  return (
    <motion.div
      aria-hidden={!on || undefined}
      inert={!on}
      className="absolute inset-0 overflow-hidden"
      style={{ x, zIndex: index }}
      animate={motionSafe ? undefined : { opacity: on ? 1 : 0 }}
      transition={{ duration: durations.fast }}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,black_100%,transparent)]"
        style={{ opacity: dim }}
      />
    </motion.div>
  );
}

function PhoneStack({
  depth,
  level,
  motionSafe,
  children,
}: {
  depth: MotionValue<number>;
  level: number;
  motionSafe: boolean;
  children: React.ReactNode[];
}) {
  return (
    <div className="relative h-full w-full">
      {children.map((child, i) => (
        <StackScreen
          key={i}
          index={i}
          depth={depth}
          level={level}
          motionSafe={motionSafe}
        >
          {child}
        </StackScreen>
      ))}
    </div>
  );
}
