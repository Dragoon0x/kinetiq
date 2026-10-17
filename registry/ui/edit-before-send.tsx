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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Pencil,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type EditTrackStyle = "inline" | "clean" | "bars";
export type EditEnvelopeStyle = "plain" | "airmail" | "window";
export type EditAccentName = "cobalt" | "plum" | "mint" | "ink";
export type EditStatus = "ready" | "loading" | "empty" | "error";

export type EditRecipient = {
  id: string;
  name: string;
  email: string;
  /** @default "to" */
  kind?: "to" | "cc";
};

export type EditAttachment = {
  id: string;
  name: string;
  /** In bytes. */
  size: number;
};

export type EditFlag = {
  id: string;
  /** A block holds the message until its words are gone; a warn only asks. */
  severity: "block" | "warn";
  /** The words in the message the policy found. */
  match: string;
  /** Why, as one sentence. */
  message: string;
};

export type EditDraft = {
  id: string;
  /** Who wrote it: "Fernworks procurement agent". */
  agent: string;
  /** The model behind the agent. */
  model: string;
  /** The sending name. */
  from: string;
  subject: string;
  /** The agent's words. Paragraphs are separated by a blank line. */
  body: string;
  /** When it was held for review, in ms. */
  heldAt: number;
};

/** One change against the draft, as the reviewer made it. */
export type EditChange = { from: string; to: string };

type Async = void | Promise<unknown>;

export type EditBeforeSendProps = {
  /** The held message. @default defaultEditDraft (a Fernworks supplier email) */
  draft?: EditDraft;
  /** Who it goes to. @default defaultEditRecipients */
  recipients?: EditRecipient[];
  /** Files it carries. @default defaultEditAttachments */
  attachments?: EditAttachment[];
  /** What the sending policy found in it. @default defaultEditFlags */
  flags?: EditFlag[];
  /** Controlled text of the message. */
  value?: string;
  /** Initial text when uncontrolled. @default draft.body */
  defaultValue?: string;
  /** Fires with the text as it is typed, reverted or undone. */
  onValueChange?: (text: string) => void;
  /** Fires when an edit settles (leaving the editor, a revert, an undo) with the text and every change against the draft. */
  onEdit?: (text: string, changes: EditChange[]) => void;
  /** Approve and send was pressed. Return a promise: the envelope waits sealed until it resolves, and a rejection unfolds it with the reason. */
  onApprove?: (text: string) => Async;
  /** Sent back to the agent with the reviewer's note and the text as it stands. */
  onRequestChanges?: (note: string, text: string) => void;
  /** The draft was discarded. */
  onDiscard?: () => void;
  /** Whether a draft is here to review. @default "ready" */
  status?: EditStatus;
  /** Try again was pressed after the draft failed to load. */
  onRetry?: () => void;
  /** The moment the hold is timed from, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** How changes are marked: struck and underlined, clean with carets, or margin bars. @default "inline" */
  trackStyle?: EditTrackStyle;
  /** The envelope the message folds into. @default "plain" */
  envelope?: EditEnvelopeStyle;
  /** Insertions, Approve and the seal: a named pigment or any CSS colour. @default "cobalt" */
  accent?: EditAccentName | (string & {});
  /** Tallest the frame grows before its body scrolls, in px. @default 560 */
  height?: number;
  /** Read only: the message can be read, not changed or sent. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14, 0);

export const defaultEditDraft: EditDraft = {
  id: "po-2026-114",
  agent: "Fernworks procurement agent",
  model: "Fernworks Model 3",
  from: "Fernworks Procurement",
  subject: "Order confirmation: 240 brass gauge fittings",
  body: [
    "Hi Ines,",
    "Thanks for the revised quote. We would like to confirm the order for 240 brass gauge fittings at $14.20 per unit, delivered to our Fieldline depot by October 30.",
    "Payment terms will be net 15 from delivery, as discussed. Please send the signed purchase order back by Friday so we can lock in the slot.",
    "Best regards,\nFernworks Procurement",
  ].join("\n\n"),
  heldAt: DEFAULT_NOW - 6 * MIN,
};

export const defaultEditRecipients: EditRecipient[] = [
  {
    id: "ines",
    name: "Ines Moreau",
    email: "ines.moreau@gaugeworks.example",
  },
  { id: "oskar", name: "Oskar Lind", email: "oskar.lind@gaugeworks.example" },
  {
    id: "finance",
    name: "Fernworks Finance",
    email: "finance@fernworks.example",
    kind: "cc",
  },
];

export const defaultEditAttachments: EditAttachment[] = [
  { id: "po", name: "PO-2026-114.pdf", size: 84_200 },
  { id: "spec", name: "Fitting spec rev C.pdf", size: 1_240_000 },
];

export const defaultEditFlags: EditFlag[] = [
  {
    id: "terms",
    severity: "block",
    match: "net 15",
    message: "The supplier contract says net 30. Change the terms first.",
  },
  {
    id: "price",
    severity: "warn",
    match: "$14.20 per unit",
    message: "The approved quote says $13.80 per unit.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                   Diff                                   */
/* ----------------------------------------------------------------------- */

type SegKind = "eq" | "del" | "ins";
type Seg = { kind: SegKind; text: string; hunk: number };
type Hunk = { id: number; from: string; to: string };

const tokenize = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
const isSpace = (s: string) => /^\s+$/.test(s);

/**
 * A word-level diff of the draft against the reviewer's text: the longest
 * common run of tokens after trimming the shared ends, then every run of
 * changes (bridging single spaces) gathered into one hunk with its deleted
 * words first and its inserted words second.
 */
function diffWords(a: string, b: string): { segs: Seg[]; hunks: Hunk[] } {
  const A = tokenize(a);
  const B = tokenize(b);
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre += 1;
  let suf = 0;
  while (
    suf < A.length - pre &&
    suf < B.length - pre &&
    A[A.length - 1 - suf] === B[B.length - 1 - suf]
  ) {
    suf += 1;
  }
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);
  const n = a2.length;
  const m = b2.length;
  const raw: { kind: SegKind; text: string }[] = [];
  for (let i = 0; i < pre; i += 1) raw.push({ kind: "eq", text: A[i] ?? "" });
  if (n * m > 250_000) {
    // Past this size the reviewer rewrote it: one replacement says so.
    if (n) raw.push({ kind: "del", text: a2.join("") });
    if (m) raw.push({ kind: "ins", text: b2.join("") });
  } else {
    const w = m + 1;
    const dp = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i * w + j] =
          a2[i] === b2[j]
            ? (dp[(i + 1) * w + j + 1] ?? 0) + 1
            : Math.max(dp[(i + 1) * w + j] ?? 0, dp[i * w + j + 1] ?? 0);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a2[i] === b2[j]) {
        raw.push({ kind: "eq", text: a2[i] ?? "" });
        i += 1;
        j += 1;
      } else if ((dp[(i + 1) * w + j] ?? 0) >= (dp[i * w + j + 1] ?? 0)) {
        raw.push({ kind: "del", text: a2[i] ?? "" });
        i += 1;
      } else {
        raw.push({ kind: "ins", text: b2[j] ?? "" });
        j += 1;
      }
    }
    for (; i < n; i += 1) raw.push({ kind: "del", text: a2[i] ?? "" });
    for (; j < m; j += 1) raw.push({ kind: "ins", text: b2[j] ?? "" });
  }
  for (let i = A.length - suf; i < A.length; i += 1) {
    raw.push({ kind: "eq", text: A[i] ?? "" });
  }

  const segs: Seg[] = [];
  const hunks: Hunk[] = [];
  let k = 0;
  while (k < raw.length) {
    const r = raw[k];
    if (!r) break;
    if (r.kind === "eq") {
      const last = segs[segs.length - 1];
      if (last && last.kind === "eq") last.text += r.text;
      else segs.push({ kind: "eq", text: r.text, hunk: -1 });
      k += 1;
      continue;
    }
    let from = "";
    let to = "";
    while (k < raw.length) {
      const x = raw[k];
      if (!x) break;
      if (x.kind === "eq") {
        const next = raw[k + 1];
        if (isSpace(x.text) && next && next.kind !== "eq") {
          from += x.text;
          to += x.text;
          k += 1;
          continue;
        }
        break;
      }
      if (x.kind === "del") from += x.text;
      else to += x.text;
      k += 1;
    }
    const id = hunks.length;
    hunks.push({ id, from, to });
    if (from) segs.push({ kind: "del", text: from, hunk: id });
    if (to) segs.push({ kind: "ins", text: to, hunk: id });
  }
  return { segs, hunks };
}

/** The text with one hunk put back the way the draft had it. */
function revertHunk(segs: Seg[], hunk: number) {
  let out = "";
  for (const s of segs) {
    if (s.kind === "eq") out += s.text;
    else if (s.kind === "del" && s.hunk === hunk) out += s.text;
    else if (s.kind === "ins" && s.hunk !== hunk) out += s.text;
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const quote = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t ? `“${t}”` : "nothing";
};
const bytes = (n: number) =>
  n >= 1_000_000
    ? `${(Math.round(n / 100_000) / 10).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1000))} KB`;
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
function held(at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 60) return `${m} min`;
  return `${Math.round(m / 60)} h`;
}
const changeWords = (h: Hunk) =>
  h.from && h.to
    ? `changed ${quote(h.from)} to ${quote(h.to)}`
    : h.to
      ? `added ${quote(h.to)}`
      : `removed ${quote(h.from)}`;

const ACCENTS: Record<EditAccentName, Record<string, string>> = {
  cobalt: {
    "--eb-accent": "var(--accent-bright)",
    "--eb-pigment": "oklch(from var(--accent-bright) 0.62 c h)",
    "--eb-button": "var(--primary)",
    "--eb-on": "var(--primary-foreground)",
  },
  plum: {
    "--eb-accent": "oklch(from var(--accent-bright) l c 320)",
    "--eb-pigment": "oklch(from var(--accent-bright) 0.6 c 320)",
    "--eb-button": "oklch(from var(--accent-bright) 0.54 c 320)",
    "--eb-on": "var(--primary-foreground)",
  },
  mint: {
    "--eb-accent": "var(--success)",
    "--eb-pigment": "oklch(from var(--success) 0.7 c h)",
    "--eb-button": "oklch(from var(--success) 0.68 c h)",
    "--eb-on": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--eb-accent": "var(--ink-2)",
    "--eb-pigment": "oklch(from var(--ink-2) 0.5 0.02 h)",
    "--eb-button": "var(--foreground)",
    "--eb-on": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    ...(ACCENTS[accent as EditAccentName] ?? {
      "--eb-accent": accent,
      "--eb-pigment": accent,
      "--eb-button": accent,
      "--eb-on": "var(--primary-foreground)",
    }),
    "--eb-wash": "color-mix(in oklab, var(--eb-accent) 14%, transparent)",
    "--eb-del": "color-mix(in oklab, var(--danger) 9%, transparent)",
    "--eb-paper": "color-mix(in oklab, var(--card) 97%, var(--foreground))",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** A tick drawn on flick: the check a resolved flag and the sent receipt carry. */
function DrawnCheck({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className} fill="none">
      <motion.path
        d="M 3.5 8.4 L 6.6 11.4 L 12.5 4.8"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

type EnvelopeArtProps = {
  style: EditEnvelopeStyle;
  width: number;
  height: number;
  patternId: string;
  address: string;
  layer: "back" | "front";
};

/**
 * The envelope in two layers, so the letter can sit between them: the back
 * (and its lining), and the front pocket that covers the letter's lower part.
 */
function EnvelopeArt({
  style,
  width: w,
  height: h,
  patternId,
  address,
  layer,
}: EnvelopeArtProps) {
  const r = 6;
  if (layer === "back") {
    return (
      <svg
        aria-hidden
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="block overflow-visible"
      >
        <rect
          x={0.5}
          y={0.5}
          width={w - 1}
          height={h - 1}
          rx={r}
          className="fill-[color-mix(in_oklab,var(--card)_88%,var(--foreground))] stroke-hairline-strong"
        />
      </svg>
    );
  }
  // The flap side of an envelope: an opaque body with its side and bottom
  // flaps drawn as folds, so a letter that has gone in is hidden by it.
  const folds = [
    `M 1 ${r3(h - 1)} L ${r3(w / 2)} ${r3(h * 0.46)} L ${r3(w - 1)} ${r3(h - 1)}`,
    `M 1 1 L ${r3(w * 0.4)} ${r3(h * 0.56)}`,
    `M ${r3(w - 1)} 1 L ${r3(w * 0.6)} ${r3(h * 0.56)}`,
  ].join(" ");
  return (
    <svg
      aria-hidden
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="block overflow-visible"
    >
      {style === "airmail" ? (
        <defs>
          <pattern
            id={patternId}
            width={14}
            height={14}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={4} height={14} style={{ fill: "var(--eb-pigment)" }} />
            <rect
              x={7}
              width={4}
              height={14}
              style={{ fill: "oklch(from var(--danger) 0.66 0.17 h)" }}
            />
          </pattern>
        </defs>
      ) : null}
      <rect
        x={0.5}
        y={0.5}
        width={w - 1}
        height={h - 1}
        rx={r}
        className="fill-card stroke-hairline-strong"
      />
      {style === "window" ? null : (
        <path
          d={folds}
          fill="none"
          className="stroke-hairline-strong"
          strokeLinejoin="round"
        />
      )}
      {style === "airmail" ? (
        <rect
          x={3}
          y={3}
          width={w - 6}
          height={h - 6}
          rx={r - 2}
          fill="none"
          stroke={`url(#${patternId})`}
          strokeWidth={4}
        />
      ) : null}
      {style === "window" ? (
        <>
          <rect
            x={r3(w * 0.08)}
            y={r3(h * 0.62)}
            width={r3(w * 0.5)}
            height={r3(h * 0.24)}
            rx={4}
            className="fill-[color-mix(in_oklab,var(--card)_70%,var(--foreground))] stroke-hairline-strong"
            opacity={0.55}
          />
          <text
            x={r3(w * 0.12)}
            y={r3(h * 0.62 + h * 0.155)}
            className="fill-ink-2 font-mono"
            fontSize={Math.max(8, Math.round(h * 0.075))}
          >
            {address}
          </text>
        </>
      ) : null}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The frame                                  */
/* ----------------------------------------------------------------------- */

type Phase =
  "review" | "sending" | "sent" | "returning" | "returned" | "discarded";
type Stage = "folding" | "waiting" | "leaving" | "unfolding";
type Scene = { w: number; h: number; n: number };

/**
 * A review frame for a message an agent wants to send. The draft reads as
 * tracked changes against your edits — struck and underlined, clean with
 * carets, or with bars in the margin — and Edit swaps it for a real textarea
 * sized to its text; leaving the field folds it back with the new marks.
 * Every change is a stop you can walk to and revert, and Cmd or Ctrl+Z
 * reverts the focused change (or the last edit). Policy flags name what they
 * found; a blocking one holds the send until its words are gone, and its
 * check draws on flick when they are.
 *
 * The signature is fold and send. The message becomes a sheet that shrinks
 * into the envelope's pocket on `springs.glide`, the flap folds shut on
 * `springs.snap` and a seal lands on flick; the envelope waits sealed until
 * the host's promise resolves, then slides out of the frame on glide. A
 * failed send opens the flap and unfolds the sheet with the reason. Request
 * changes shrinks the message toward the agent and returns it with your note.
 *
 * Cmd or Ctrl+Enter approves from anywhere in the frame. At narrow widths the
 * recipients collapse into a count. Under reduced motion nothing folds or
 * travels: the sealed envelope fades in and out, and every count and check
 * still changes.
 */
export function EditBeforeSend({
  draft = defaultEditDraft,
  recipients = defaultEditRecipients,
  attachments = defaultEditAttachments,
  flags = defaultEditFlags,
  value: valueProp,
  defaultValue,
  onValueChange,
  onEdit,
  onApprove,
  onRequestChanges,
  onDiscard,
  status = "ready",
  onRetry,
  now = DEFAULT_NOW,
  trackStyle = "inline",
  envelope = "plain",
  accent = "cobalt",
  height = 560,
  disabled = false,
  className,
}: EditBeforeSendProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const editorId = `${uid}-editor`;
  const noteId = `${uid}-note`;
  const whyId = `${uid}-why`;
  const track: EditTrackStyle =
    trackStyle === "clean" || trackStyle === "bars" ? trackStyle : "inline";

  /* -------------------------------- state -------------------------------- */

  const [own, setOwn] = React.useState(() => defaultValue ?? draft.body);
  const text = valueProp ?? own;
  const [phase, setPhase] = React.useState<Phase>("review");
  const [stage, setStage] = React.useState<Stage>("folding");
  const [scene, setScene] = React.useState<Scene | null>(null);
  const [answer, setAnswer] = React.useState<{
    n: number;
    ok: boolean;
    why: string;
  } | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sentAt, setSentAt] = React.useState(now);
  const [editing, setEditing] = React.useState(false);
  const [history, setHistory] = React.useState<string[]>([]);
  const [activeHunk, setActiveHunk] = React.useState(0);
  const [peopleOpen, setPeopleOpen] = React.useState(false);
  const [panel, setPanel] = React.useState<"none" | "note" | "discard">("none");
  const [note, setNote] = React.useState("");
  const [sentNote, setSentNote] = React.useState("");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));

  // A new draft starts a new review.
  const [seenDraft, setSeenDraft] = React.useState(draft.id);
  if (seenDraft !== draft.id) {
    setSeenDraft(draft.id);
    setPhase("review");
    setScene(null);
    setAnswer(null);
    setSendError(null);
    setHistory([]);
    setEditing(false);
    setPanel("none");
    if (valueProp === undefined) setOwn(draft.body);
  }

  const ready = status === "ready";
  const reviewing = ready && phase === "review";
  const locked = disabled || !reviewing;

  const { segs, hunks } = React.useMemo(
    () => diffWords(draft.body, text),
    [draft.body, text],
  );
  const hunkAt = clamp(activeHunk, 0, Math.max(0, hunks.length - 1));
  const current = hunks[hunkAt];

  const flagState = flags.map((f) => ({
    flag: f,
    live: f.match !== "" && text.includes(f.match),
  }));
  const blocking = flagState.filter(
    (f) => f.live && f.flag.severity === "block",
  );
  const heldWhy = !text.trim()
    ? "The message is empty."
    : blocking[0]
      ? `Change ${quote(blocking[0].flag.match)} first. ${blocking[0].flag.message}`
      : null;

  const to = recipients.filter((r) => (r.kind ?? "to") === "to");
  const cc = recipients.filter((r) => r.kind === "cc");
  const first = to[0] ?? recipients[0];
  const audience = first
    ? recipients.length > 1
      ? `${first.name} and ${plural(recipients.length - 1, "other")}`
      : first.name
    : "nobody";

  /* -------------------------------- edits -------------------------------- */

  const write = (next: string) => {
    if (valueProp === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const editStart = React.useRef(text);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const hunkRefs = React.useRef(new Map<number, HTMLSpanElement>());
  const selectReq = React.useRef<string | null>(null);
  const focusHunkReq = React.useRef<number | null>(null);

  const settle = (next: string, words: string) => {
    const d = diffWords(draft.body, next);
    onEdit?.(
      next,
      d.hunks.map((h) => ({ from: h.from, to: h.to })),
    );
    say(`${words} ${plural(d.hunks.length, "change")} from the draft.`);
  };

  const startEditing = (select?: string) => {
    if (locked) return;
    editStart.current = text;
    selectReq.current = select ?? null;
    setEditing(true);
  };

  const stopEditing = (refocus = true) => {
    if (!editing) return;
    selectReq.current = null;
    setEditing(false);
    if (text !== editStart.current) {
      setHistory((h) => [...h, editStart.current].slice(-20));
      settle(text, "Edited.");
    }
    if (refocus) {
      // The redline comes back in place of the field; focus waits for it.
      focusHunkReq.current = -1;
    }
  };

  const revert = (id: number) => {
    if (locked || !hunks[id]) return;
    const next = revertHunk(segs, id);
    setHistory((h) => [...h, text].slice(-20));
    write(next);
    setActiveHunk(Math.max(0, id - 1));
    focusHunkReq.current = Math.max(0, id - 1);
    settle(next, "Change reverted.");
  };

  const undo = () => {
    if (locked) return;
    const prev = history[history.length - 1];
    if (prev === undefined) {
      say("Nothing to undo.");
      return;
    }
    setHistory((h) => h.slice(0, -1));
    write(prev);
    focusHunkReq.current = -1;
    settle(prev, "Undone.");
  };

  // Focus lands where the render that made its target put it.
  React.useEffect(() => {
    const want = focusHunkReq.current;
    if (want === null || editing) return;
    focusHunkReq.current = null;
    const node =
      want >= 0
        ? (hunkRefs.current.get(want) ??
          hunkRefs.current.get(0) ??
          editButtonRef.current)
        : editButtonRef.current;
    node?.focus({ preventScroll: true });
  });

  // The field takes focus as it arrives, with a flag's words selected.
  const bindTextarea = React.useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    if (!node) return;
    node.focus({ preventScroll: true });
    // Read, not cleared: StrictMode attaches a ref twice, and the second
    // attach must select the same words. Leaving the editor clears it.
    const want = selectReq.current;
    const at = want ? node.value.indexOf(want) : -1;
    if (want && at >= 0) node.setSelectionRange(at, at + want.length);
    else node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  // The envelope leaves only once the host has sent it; a refusal unfolds
  // it. Decided in render, from the answer that belongs to this send.
  if (
    phase === "sending" &&
    stage === "waiting" &&
    answer &&
    scene &&
    answer.n === scene.n
  ) {
    if (answer.ok) {
      setSentAt(now);
      setStage("leaving");
      say(`Sent to ${audience}.`);
    } else {
      setSendError(answer.why);
      setStage("unfolding");
      say(`Didn't send. ${answer.why}`);
    }
    setAnswer(null);
  }

  /* ------------------------------- the scene ----------------------------- */

  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // A decision removes the button that made it; focus waits on the region
  // rather than falling to the page.
  const parkFocus = () => {
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };
  const run = React.useRef(0);
  const letterX = useMotionValue(0);
  const letterY = useMotionValue(0);
  const letterSX = useMotionValue(1);
  const letterSY = useMotionValue(1);
  const ink = useMotionValue(1);
  const crease = useMotionValue(0);
  const shell = useMotionValue(0);
  const flap = useMotionValue(-1);
  const seal = useMotionValue(0);
  const groupX = useMotionValue(0);
  const groupFade = useMotionValue(1);
  const flapZ = useTransform(flap, (s) => (s > 0 ? 5 : 2));
  // The letter rides over the envelope until it is nearly in, then drops
  // behind the front panel: that swap is the moment it goes into the pocket.
  const inside = useMotionValue(0);
  const letterZ = useTransform(inside, (i) => (i > 0 ? 3 : 5));

  const geometry = (s: Scene) => {
    const ew = Math.round(clamp(s.w * 0.56, 150, 280));
    const eh = Math.round(ew * 0.62);
    const ex = Math.round((s.w - ew) / 2);
    const ey = Math.round((s.h - eh) / 2 + 6);
    const pad = 12;
    const lw = Math.max(1, s.w - pad * 2);
    const lh = Math.max(1, s.h - pad * 2);
    const tw = ew * 0.84;
    const th = eh * 0.74;
    return {
      ew,
      eh,
      ex,
      ey,
      pad,
      lw,
      lh,
      x: r3((s.w - tw) / 2 - pad),
      y: r3(ey + eh * 0.08 - pad),
      sx: r3(tw / lw),
      sy: r3(th / lh),
    };
  };

  const send = () => {
    if (disabled || !reviewing) return;
    if (editing) stopEditing(false);
    if (heldWhy) {
      say(heldWhy);
      return;
    }
    const area = areaRef.current;
    const rect = area?.getBoundingClientRect();
    const n = ++run.current;
    setPanel("none");
    setSendError(null);
    setAnswer(null);
    setScene({
      w: Math.max(240, Math.round(rect?.width ?? 480)),
      h: Math.max(220, Math.round(rect?.height ?? 320)),
      n,
    });
    setStage("folding");
    setPhase("sending");
    say("Sending.");
    const result = onApprove?.(text);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(
        () => {
          if (run.current === n) setAnswer({ n, ok: true, why: "" });
        },
        (why: unknown) => {
          if (run.current !== n) return;
          setAnswer({
            n,
            ok: false,
            why:
              why instanceof Error && why.message
                ? why.message
                : "The mail relay did not take it.",
          });
        },
      );
    } else {
      setAnswer({ n, ok: true, why: "" });
    }
  };

  // Each beat runs from an effect once its elements exist, and starts from
  // its own first frame, so a second run (StrictMode) replays it rather than
  // freezing it half way.
  React.useEffect(() => {
    if (!scene || phase !== "sending") return;
    const g = geometry(scene);
    const running: AnimationPlaybackControls[] = [];
    const n = scene.n;
    const tween = (d: number) => ({ duration: d, ease: easings.enter });
    if (stage === "folding") {
      letterX.jump(0);
      letterY.jump(0);
      letterSX.jump(1);
      letterSY.jump(1);
      ink.jump(1);
      crease.jump(0);
      shell.jump(0);
      flap.jump(-1);
      seal.jump(0);
      inside.jump(0);
      groupX.jump(0);
      groupFade.jump(1);
      if (!motionSafe) {
        letterX.jump(g.x);
        letterY.jump(g.y);
        letterSX.jump(g.sx);
        letterSY.jump(g.sy);
        inside.jump(1);
        ink.jump(0.35);
        crease.jump(1);
        flap.jump(1);
        seal.jump(1);
        running.push(
          animate(shell, 1, {
            ...tween(durations.base),
            onComplete: () => {
              if (run.current === n) setStage("waiting");
            },
          }),
        );
      } else {
        running.push(
          animate(letterX, g.x, springs.glide),
          animate(letterY, g.y, springs.glide),
          animate(letterSX, g.sx, springs.glide),
          animate(letterSY, g.sy, {
            ...springs.glide,
            onUpdate: (v) => {
              const near = v <= g.sy + (1 - g.sy) * 0.12;
              if (near && inside.get() === 0) inside.set(1);
            },
            onComplete: () => {
              if (run.current !== n) return;
              running.push(
                animate(flap, 1, {
                  ...springs.snap,
                  onComplete: () => {
                    if (run.current !== n) return;
                    running.push(
                      animate(seal, 1, {
                        ...springs.flick,
                        onComplete: () => {
                          if (run.current === n) setStage("waiting");
                        },
                      }),
                    );
                  },
                }),
              );
            },
          }),
          animate(ink, 0.35, tween(durations.slow)),
          animate(crease, 1, tween(durations.slow)),
          animate(shell, 1, tween(durations.base)),
        );
      }
    } else if (stage === "leaving") {
      groupX.jump(0);
      groupFade.jump(1);
      const done = () => {
        if (run.current !== n) return;
        parkFocus();
        setPhase("sent");
        setScene(null);
      };
      if (!motionSafe) {
        running.push(
          animate(groupFade, 0, { ...tween(durations.base), onComplete: done }),
        );
      } else {
        running.push(
          animate(groupX, scene.w * 0.75, {
            ...springs.glide,
            onComplete: done,
          }),
          animate(groupFade, 0, {
            duration: durations.slow,
            ease: easings.exit,
            delay: 0.12,
          }),
        );
      }
    } else if (stage === "unfolding") {
      const done = () => {
        if (run.current !== n) return;
        setPhase("review");
        setScene(null);
      };
      if (!motionSafe) {
        running.push(
          animate(shell, 0, tween(durations.base)),
          animate(groupFade, 0, { ...tween(durations.base), onComplete: done }),
        );
      } else {
        running.push(
          animate(seal, 0, springs.flick),
          animate(flap, -1, {
            ...springs.snap,
            onComplete: () => {
              if (run.current !== n) return;
              // Out of the pocket first, then back to full size.
              inside.set(0);
              running.push(
                animate(letterX, 0, springs.glide),
                animate(letterY, 0, springs.glide),
                animate(letterSX, 1, springs.glide),
                animate(letterSY, 1, { ...springs.glide, onComplete: done }),
                animate(ink, 1, tween(durations.base)),
                animate(crease, 0, tween(durations.base)),
                animate(shell, 0, tween(durations.base)),
              );
            },
          }),
        );
      }
    }
    return () => {
      for (const c of running) c.stop();
    };
    // The motion values are stable; the beat is chosen by stage and scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, scene, phase, motionSafe]);

  /* ------------------------------ decisions ------------------------------ */

  const returnToAgent = () => {
    if (locked) return;
    if (editing) stopEditing(false);
    const t = note.trim();
    setSentNote(t);
    setNote("");
    setPanel("none");
    parkFocus();
    setPhase("returning");
    onRequestChanges?.(t, text);
    say(`Returned to the agent${t ? " with your note" : ""}.`);
  };

  const discard = () => {
    if (locked) return;
    setPanel("none");
    parkFocus();
    setPhase("discarded");
    onDiscard?.();
    say("Draft discarded.");
  };

  const panelButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const closePanel = () => {
    setPanel("none");
    const t = panelButtonRef.current;
    if (t?.isConnected) t.focus({ preventScroll: true });
  };
  const focusOnArrive = React.useCallback((node: HTMLElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);

  const onRootKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    if (event.key === "Enter") {
      event.preventDefault();
      send();
      return;
    }
    if ((event.key === "z" || event.key === "Z") && !event.shiftKey) {
      const target = event.target as HTMLElement;
      // Inside a field the browser's own undo is the right one.
      if (target.closest("textarea, input")) return;
      event.preventDefault();
      const h = target.dataset.ebHunk;
      if (h !== undefined) revert(Number(h));
      else undo();
    }
  };

  const onHunkKey = (
    event: React.KeyboardEvent<HTMLSpanElement>,
    id: number,
  ) => {
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = id + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = id - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = hunks.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startEditing(hunks[id]?.to || undefined);
      return;
    }
    if (next < 0 && event.key !== "ArrowLeft" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const to = clamp(next, 0, hunks.length - 1);
    setActiveHunk(to);
    hunkRefs.current.get(to)?.focus();
  };

  /* -------------------------------- render ------------------------------- */

  const button = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity]",
    FOCUS,
  );
  const quiet = cn(
    button,
    "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );

  // Flag ranges in the current text, for the wavy marks.
  const marks: {
    start: number;
    end: number;
    severity: EditFlag["severity"];
  }[] = [];
  for (const { flag, live } of flagState) {
    if (!live) continue;
    let at = text.indexOf(flag.match);
    while (at >= 0) {
      marks.push({
        start: at,
        end: at + flag.match.length,
        severity: flag.severity,
      });
      at = text.indexOf(flag.match, at + flag.match.length);
    }
  }

  /** Splits current-text words at flag boundaries. */
  const flagged = (t: string, offset: number, key: string) => {
    const cuts = new Set<number>([0, t.length]);
    for (const m of marks) {
      if (m.end <= offset || m.start >= offset + t.length) continue;
      cuts.add(clamp(m.start - offset, 0, t.length));
      cuts.add(clamp(m.end - offset, 0, t.length));
    }
    const points = [...cuts].sort((a, b) => a - b);
    const out: React.ReactNode[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i] ?? 0;
      const b = points[i + 1] ?? 0;
      const piece = t.slice(a, b);
      const hit = marks.find(
        (m) => m.start <= offset + a && m.end >= offset + b,
      );
      out.push(
        hit ? (
          <span
            key={`${key}-${a}`}
            className={cn(
              "underline decoration-wavy decoration-[1.5px] underline-offset-[3px]",
              hit.severity === "block"
                ? "decoration-danger"
                : "decoration-warn",
            )}
          >
            {piece}
          </span>
        ) : (
          piece
        ),
      );
    }
    return out;
  };

  type Piece = { seg: Seg; text: string; at: number };
  const paragraphs: Piece[][] = [[]];
  {
    let cur = 0;
    for (const seg of segs) {
      if (seg.kind === "del") {
        paragraphs[paragraphs.length - 1]?.push({
          seg,
          text: seg.text,
          at: cur,
        });
        continue;
      }
      const parts = seg.kind === "eq" ? seg.text.split(/(\n{2,})/) : [seg.text];
      parts.forEach((part, i) => {
        if (i % 2 === 1) {
          paragraphs.push([]);
        } else if (part) {
          paragraphs[paragraphs.length - 1]?.push({ seg, text: part, at: cur });
        }
        cur += part.length;
      });
    }
  }

  const renderPiece = (p: Piece, k: string) => {
    if (p.seg.kind === "eq") return flagged(p.text, p.at, k);
    if (p.seg.kind === "del") {
      if (track === "inline") {
        return (
          <del
            key={k}
            className="mr-0.5 rounded-[2px] bg-(--eb-del) text-danger decoration-[1.5px]"
          >
            {p.text}
          </del>
        );
      }
      return (
        <span
          key={k}
          aria-hidden
          className={cn(
            "mx-px inline-block h-[1.05em] w-[3px] translate-y-[0.15em] rounded-full bg-[color-mix(in_oklab,var(--danger)_70%,transparent)]",
            track === "bars" && "hidden",
          )}
        />
      );
    }
    return (
      <ins
        key={k}
        className={cn(
          "no-underline",
          track === "inline" &&
            "rounded-[2px] bg-(--eb-wash) underline decoration-(--eb-accent) decoration-[1.5px] underline-offset-[3px]",
          track === "clean" && "rounded-[2px] bg-(--eb-wash)",
          track === "bars" &&
            "underline decoration-(--eb-accent) decoration-dotted decoration-[1.5px] underline-offset-[3px]",
        )}
      >
        {flagged(p.text, p.at, k)}
      </ins>
    );
  };

  const placed = new Set<number>();
  const redline = (
    <div
      role="group"
      aria-label="Message, with your changes marked"
      className={cn(
        "flex flex-col gap-3 text-[13px] leading-[1.6] text-foreground",
        track === "bars" && "pl-7",
      )}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-eb-hunk]")) return;
        startEditing();
      }}
    >
      {paragraphs.map((pieces, pi) => {
        const ids = [
          ...new Set(pieces.map((p) => p.seg.hunk).filter((h) => h >= 0)),
        ];
        const nodes: React.ReactNode[] = [];
        let i = 0;
        while (i < pieces.length) {
          const p = pieces[i];
          if (!p) break;
          if (p.seg.hunk < 0) {
            nodes.push(
              <React.Fragment key={`${pi}-${i}`}>
                {renderPiece(p, `${pi}-${i}`)}
              </React.Fragment>,
            );
            i += 1;
            continue;
          }
          const id = p.seg.hunk;
          const group: Piece[] = [];
          while (pieces[i] && pieces[i]?.seg.hunk === id) {
            group.push(pieces[i] as Piece);
            i += 1;
          }
          const h = hunks[id];
          // A change that spans a paragraph break is one stop: its first part.
          const lead = !placed.has(id);
          placed.add(id);
          nodes.push(
            <span
              key={`${pi}-h${id}-${i}`}
              ref={
                lead
                  ? (node) => {
                      if (node) hunkRefs.current.set(id, node);
                      else hunkRefs.current.delete(id);
                    }
                  : undefined
              }
              role="button"
              data-eb-hunk={id}
              tabIndex={lead && !locked && id === hunkAt ? 0 : -1}
              aria-label={`Change ${id + 1} of ${hunks.length}: ${h ? changeWords(h) : ""}.`}
              aria-keyshortcuts="Meta+Z Control+Z"
              onFocus={() => setActiveHunk(id)}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setActiveHunk(id);
              }}
              onClick={() => setActiveHunk(id)}
              onKeyDown={(event) => onHunkKey(event, id)}
              className={cn(
                "cursor-pointer rounded-[3px] transition-[box-shadow] duration-150 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                id === hunkAt &&
                  hunks.length > 1 &&
                  "shadow-[0_0_0_1px_color-mix(in_oklab,var(--eb-accent)_45%,transparent)]",
              )}
            >
              {group.map((g, gi) => renderPiece(g, `${pi}-${id}-${gi}`))}
            </span>,
          );
        }
        return (
          <p key={pi} className="relative whitespace-pre-wrap">
            {track === "bars" && ids.length > 0 ? (
              <span aria-hidden>
                <span className="absolute top-0.5 bottom-0.5 -left-3 w-[3px] rounded-full bg-(--eb-pigment)" />
                <span className="absolute top-[3px] -left-7 w-3 text-right font-mono text-[10px] leading-4 text-(--eb-accent) tabular-nums">
                  {ids.length}
                </span>
              </span>
            ) : null}
            {nodes}
          </p>
        );
      })}
    </div>
  );

  const editor = (
    <div className="grid">
      <textarea
        id={editorId}
        ref={bindTextarea}
        aria-label="Message text"
        value={text}
        spellCheck
        onChange={(event) => {
          const next = event.currentTarget.value;
          write(next);
        }}
        onBlur={(event) => {
          const to = event.relatedTarget as HTMLElement | null;
          if (to?.closest("[data-eb-keep-editing]")) return;
          stopEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            stopEditing();
          }
        }}
        className={cn(
          "resize-none overflow-hidden rounded-2 border border-(--eb-accent) bg-background px-2.5 py-2 text-[13px] leading-[1.6] text-foreground [grid-area:1/1]",
          FOCUS,
          "focus-visible:outline-offset-1",
        )}
      />
      <span
        aria-hidden
        className="invisible px-2.5 py-2 text-[13px] leading-[1.6] break-words whitespace-pre-wrap [grid-area:1/1]"
      >
        {`${text} `}
      </span>
    </div>
  );

  const chip = (r: EditRecipient) => (
    <span
      key={r.id}
      title={r.email}
      className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 pr-2 pl-0.5 text-[12px] text-foreground"
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--eb-wash) text-[10px] font-semibold text-(--eb-accent)"
      >
        {r.name.charAt(0)}
      </span>
      <span className="truncate">{r.name}</span>
    </span>
  );

  const fieldsList = (
    <dl className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-[12px]">
      <dt className="pt-1 text-ink-3">To</dt>
      <dd className="min-w-0">
        <div className="hidden flex-wrap items-center gap-1.5 @min-[28rem]:flex">
          {to.map(chip)}
          {cc.length > 0 ? (
            <>
              <span className="ml-1 text-[11px] text-ink-3">Cc</span>
              {cc.map(chip)}
            </>
          ) : null}
        </div>
        <div className="@min-[28rem]:hidden">
          <button
            type="button"
            aria-expanded={peopleOpen}
            onClick={() => setPeopleOpen((v) => !v)}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 text-[12px] text-foreground",
              FOCUS,
            )}
          >
            {plural(recipients.length, "recipient")}
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3.5 shrink-0 text-ink-3 transition-transform",
                peopleOpen && "rotate-180",
              )}
            />
          </button>
          <AnimatePresence initial={false}>
            {peopleOpen ? (
              <motion.div
                key="people"
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0, transition: exitFor() }}
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        opacity: { duration: durations.base },
                      }
                    : { duration: 0 }
                }
              >
                <ul className="flex flex-col gap-1.5 pt-2">
                  {recipients.map((r) => (
                    <li key={r.id} className="flex min-w-0 items-center gap-2">
                      {chip(r)}
                      {r.kind === "cc" ? (
                        <span className="text-[10px] text-ink-3 uppercase">
                          cc
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </dd>
      <dt className="text-ink-3">Subject</dt>
      <dd id={titleId} className="min-w-0 font-medium text-foreground">
        {draft.subject}
      </dd>
      {attachments.length > 0 ? (
        <>
          <dt className="pt-1 text-ink-3">Files</dt>
          <dd className="flex min-w-0 flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-2 border border-hairline px-2 text-[12px] text-ink-2"
              >
                <Paperclip aria-hidden className="size-3 shrink-0 text-ink-3" />
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-3">
                  {bytes(a.size)}
                </span>
              </span>
            ))}
          </dd>
        </>
      ) : null}
    </dl>
  );

  const flagList =
    flags.length > 0 ? (
      <ul aria-label="Sending policy" className="flex flex-col gap-1.5">
        {flagState.map(({ flag, live }) => {
          const block = flag.severity === "block";
          return (
            <li key={flag.id} className={cn(!live && "@max-[28rem]:hidden")}>
              <button
                type="button"
                aria-disabled={locked || undefined}
                onClick={() => {
                  if (live) startEditing(flag.match);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-2 border px-2.5 py-1.5 text-left transition-colors",
                  FOCUS,
                  !live
                    ? "border-hairline bg-transparent"
                    : block
                      ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,transparent)] hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]"
                      : "border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[color-mix(in_oklab,var(--warn)_6%,transparent)] hover:bg-[color-mix(in_oklab,var(--warn)_10%,transparent)]",
                )}
              >
                <span
                  className={cn(
                    "mt-px flex size-4 shrink-0 items-center justify-center",
                    !live
                      ? "text-success"
                      : block
                        ? "text-danger"
                        : "text-warn",
                  )}
                >
                  {!live ? (
                    <DrawnCheck motionSafe={motionSafe} className="size-4" />
                  ) : block ? (
                    <ShieldAlert aria-hidden className="size-3.5" />
                  ) : (
                    <TriangleAlert aria-hidden className="size-3.5" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    className={cn(
                      "min-w-0 text-[12px] leading-4",
                      live ? "text-foreground" : "text-ink-3 line-through",
                    )}
                  >
                    {flag.message}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] leading-4 text-ink-3">
                    {live
                      ? `${block ? "Holds sending" : "Check"} · ${quote(flag.match)}`
                      : "Resolved by your edit"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    ) : null;

  const navigator =
    hunks.length > 0 && !editing && reviewing ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2 bg-surface-2 py-1 pr-1 pl-1">
        <span className="flex items-center">
          <button
            type="button"
            aria-label="Previous change"
            onClick={() => {
              const t = clamp(hunkAt - 1, 0, hunks.length - 1);
              setActiveHunk(t);
            }}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 hover:bg-card hover:text-foreground",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-3.5" />
          </button>
          <span className="min-w-12 text-center font-mono text-[11px] text-ink-2 tabular-nums">
            {hunkAt + 1} of {hunks.length}
          </span>
          <button
            type="button"
            aria-label="Next change"
            onClick={() => {
              const t = clamp(hunkAt + 1, 0, hunks.length - 1);
              setActiveHunk(t);
            }}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 hover:bg-card hover:text-foreground",
              FOCUS,
            )}
          >
            <ChevronRight aria-hidden className="size-3.5" />
          </button>
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
          {current
            ? current.from
              ? `Draft said ${quote(current.from)}`
              : "Not in the draft"
            : ""}
        </span>
        <button
          type="button"
          onClick={() => revert(hunkAt)}
          aria-keyshortcuts="Meta+Z Control+Z"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[11px] text-ink-2 hover:bg-card hover:text-foreground",
            FOCUS,
          )}
        >
          <Undo2 aria-hidden className="size-3.5" />
          Revert
        </button>
      </div>
    ) : null;

  const bodyBlock = (
    <section aria-labelledby={`${uid}-body`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id={`${uid}-body`}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Message
        </h3>
        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
          {hunks.length === 0
            ? "as drafted"
            : `${plural(hunks.length, "change")}`}
        </span>
        <span className="flex-1" />
        {history.length > 0 && !editing ? (
          <button
            type="button"
            onClick={undo}
            aria-disabled={locked || undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[11px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3" />
            Undo
          </button>
        ) : null}
        <button
          ref={editButtonRef}
          type="button"
          data-eb-keep-editing=""
          aria-controls={editing ? editorId : undefined}
          aria-disabled={locked || undefined}
          onClick={() => {
            if (editing) stopEditing();
            else startEditing();
          }}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-2 border px-2 text-[11px] transition-colors",
            editing
              ? "border-(--eb-accent) bg-(--eb-wash) text-foreground"
              : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <Pencil aria-hidden className="size-3" />
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={editing ? "editor" : "redline"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {editing ? editor : redline}
        </motion.div>
      </AnimatePresence>
      {navigator}
    </section>
  );

  const g = scene ? geometry(scene) : null;
  const sceneView =
    scene && g ? (
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden bg-card [perspective:900px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: durations.fast }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ x: groupX, opacity: groupFade }}
        >
          <motion.div
            className="absolute"
            style={{
              left: g.ex,
              top: g.ey,
              width: g.ew,
              height: g.eh,
              opacity: shell,
              zIndex: 1,
            }}
          >
            <EnvelopeArt
              style={envelope}
              width={g.ew}
              height={g.eh}
              patternId={`${safeId}-air`}
              address={first?.name ?? ""}
              layer="back"
            />
          </motion.div>
          <motion.div
            className="absolute"
            style={{
              left: g.ex,
              top: g.ey,
              width: g.ew,
              height: g.eh,
              opacity: shell,
              zIndex: flapZ,
            }}
          >
            <motion.svg
              width={g.ew}
              height={Math.round(g.eh * 0.58)}
              viewBox={`0 0 ${g.ew} ${Math.round(g.eh * 0.58)}`}
              className="block overflow-visible"
              style={{ scaleY: flap, originY: 0, originX: 0.5 }}
            >
              <path
                d={`M 0.5 0.5 L ${r3(g.ew / 2)} ${r3(g.eh * 0.56)} L ${r3(g.ew - 0.5)} 0.5 Z`}
                className="fill-[color-mix(in_oklab,var(--card)_94%,var(--foreground))] stroke-hairline-strong"
                strokeLinejoin="round"
              />
            </motion.svg>
          </motion.div>
          <motion.div
            className="absolute overflow-hidden rounded-3 border border-hairline-strong bg-(--eb-paper) shadow-[0_10px_30px_color-mix(in_oklab,black_14%,transparent)]"
            style={{
              left: g.pad,
              top: g.pad,
              width: g.lw,
              height: g.lh,
              x: letterX,
              y: letterY,
              scaleX: letterSX,
              scaleY: letterSY,
              originX: 0,
              originY: 0,
              zIndex: letterZ,
            }}
          >
            <motion.div
              className="flex flex-col gap-2 p-4 text-[12px] leading-[1.6] text-foreground"
              style={{ opacity: ink }}
            >
              <span className="text-[13px] font-semibold">{draft.subject}</span>
              <span className="text-ink-3">To {audience}</span>
              <span className="whitespace-pre-wrap text-ink-2">{text}</span>
            </motion.div>
            <motion.span
              className="absolute inset-x-0 top-1/3 h-px bg-hairline-strong"
              style={{ opacity: crease }}
            />
            <motion.span
              className="absolute inset-x-0 top-2/3 h-px bg-hairline-strong"
              style={{ opacity: crease }}
            />
          </motion.div>
          <motion.div
            className="absolute"
            style={{
              left: g.ex,
              top: g.ey,
              width: g.ew,
              height: g.eh,
              opacity: shell,
              zIndex: 4,
            }}
          >
            <EnvelopeArt
              style={envelope}
              width={g.ew}
              height={g.eh}
              patternId={`${safeId}-air`}
              address={first?.name ?? ""}
              layer="front"
            />
          </motion.div>
          <motion.span
            className="absolute flex size-6 items-center justify-center rounded-full bg-(--eb-pigment) text-[10px] font-semibold text-(--eb-on) shadow-[0_2px_6px_color-mix(in_oklab,black_20%,transparent)]"
            style={{
              left: Math.round(g.ex + g.ew / 2 - 12),
              top: Math.round(g.ey + g.eh * 0.56 - 12),
              scale: seal,
              opacity: seal,
              zIndex: 6,
            }}
          >
            {draft.agent.charAt(0)}
          </motion.span>
          <span
            className="absolute inset-x-0 text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            style={{ top: g.ey + g.eh + 18, zIndex: 6 }}
          >
            {stage === "unfolding" ? "Not sent" : "Sending"}
          </span>
        </motion.div>
      </motion.div>
    ) : null;

  const message = (
    <motion.div
      className="flex flex-col gap-4 px-4 py-4"
      initial={false}
      animate={
        phase === "returning"
          ? motionSafe
            ? { opacity: 0, scale: 0.25, x: -12, y: -24 }
            : { opacity: 0 }
          : { opacity: 1, scale: 1, x: 0, y: 0 }
      }
      transition={
        phase === "returning"
          ? motionSafe
            ? { ...springs.glide, opacity: { duration: durations.slow } }
            : { duration: durations.base }
          : { duration: 0 }
      }
      style={{ originX: 0, originY: 0 }}
      onAnimationComplete={() => {
        if (phase === "returning") setPhase("returned");
      }}
    >
      {fieldsList}
      {flagList}
      {bodyBlock}
    </motion.div>
  );

  const after =
    phase === "sent" ? (
      <motion.div
        key="sent"
        className="flex flex-col gap-4 px-4 py-6"
        initial={{ opacity: 0, y: motionSafe ? 8 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.base }
        }
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success">
            <DrawnCheck motionSafe={motionSafe} className="size-4.5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[14px] leading-5 font-medium">
              Sent to {audience}
            </p>
            <p className="text-[12px] text-ink-3">
              {clock(sentAt)} UTC ·{" "}
              {hunks.length === 0
                ? "as the agent drafted it"
                : `${plural(hunks.length, "change")} from the draft kept`}
            </p>
          </div>
        </div>
        <p className="line-clamp-3 rounded-2 border border-hairline bg-surface-2 px-3 py-2 text-[12px] leading-[1.6] whitespace-pre-wrap text-ink-2">
          {text}
        </p>
      </motion.div>
    ) : phase === "returned" ? (
      <motion.div
        key="returned"
        className="flex flex-col gap-3 px-4 py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: durations.base }}
      >
        <p className="text-[14px] leading-5 font-medium">
          Returned to the {draft.agent}
        </p>
        <p className="text-[12px] text-ink-3">
          The draft is back with the agent. Nothing was sent.
        </p>
        {sentNote ? (
          <blockquote className="relative rounded-2 bg-[color-mix(in_oklab,var(--warn)_12%,var(--card))] px-3 py-2.5 text-[12px] leading-5 text-foreground shadow-[0_1px_0_color-mix(in_oklab,black_8%,transparent)]">
            <span className="sr-only">Your note: </span>
            {sentNote}
          </blockquote>
        ) : null}
      </motion.div>
    ) : phase === "discarded" ? (
      <motion.div
        key="discarded"
        className="flex flex-col gap-1 px-4 py-10 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: durations.base }}
      >
        <p className="text-[13px] text-ink-2">Draft discarded.</p>
        <p className="text-[12px] text-ink-3">The agent will not send it.</p>
      </motion.div>
    ) : null;

  const stateView =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-3 px-4 py-4">
        <p className="sr-only">Loading the draft.</p>
        {[44, 70, 58, 92, 86, 64].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className="h-3 rounded-full bg-surface-2 motion-safe:animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px]">The draft did not load.</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={quiet}>
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
        <p className="text-[13px] text-ink-2">Nothing is waiting for review.</p>
        <p className="text-[12px] text-ink-3">
          Messages the agent holds back appear here.
        </p>
      </div>
    );

  const pill = !ready
    ? null
    : phase === "sent"
      ? { text: "Sent", dot: "bg-success" }
      : phase === "sending"
        ? { text: "Sending", dot: "bg-(--eb-accent)" }
        : phase === "returned" || phase === "returning"
          ? { text: "Returned", dot: "bg-ink-3" }
          : phase === "discarded"
            ? { text: "Discarded", dot: "bg-ink-3" }
            : { text: "Held for review", dot: "bg-warn" };

  const footer =
    ready && (phase === "review" || phase === "sending") ? (
      <footer className="flex shrink-0 flex-col border-t border-hairline">
        <AnimatePresence initial={false}>
          {panel !== "none" && phase === "review" ? (
            <motion.div
              key={panel}
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: 0 }
              }
            >
              {panel === "note" ? (
                <form
                  className="flex flex-col gap-2 px-4 pt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    returnToAgent();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      closePanel();
                    }
                  }}
                >
                  <label htmlFor={noteId} className="text-[11px] text-ink-2">
                    What should the agent change?
                  </label>
                  <textarea
                    id={noteId}
                    ref={focusOnArrive}
                    rows={2}
                    value={note}
                    onChange={(event) => {
                      const t = event.currentTarget.value;
                      setNote(t);
                    }}
                    placeholder="Use the contract terms and the quoted price."
                    className={cn(
                      "w-full resize-none rounded-2 border border-input bg-background px-2.5 py-1.5 text-[12px] leading-4 text-foreground placeholder:text-ink-3",
                      FOCUS,
                    )}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={cn(
                        button,
                        "bg-foreground text-background hover:opacity-90",
                      )}
                    >
                      Send back to agent
                    </button>
                    <button
                      type="button"
                      onClick={closePanel}
                      className={quiet}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  role="group"
                  aria-label="Discard the draft"
                  className="flex flex-wrap items-center gap-2 px-4 pt-3"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      closePanel();
                    }
                  }}
                >
                  <p className="min-w-0 flex-1 basis-48 text-[12px] text-foreground">
                    Discard this draft? The agent won’t send it.
                  </p>
                  <button
                    type="button"
                    onClick={discard}
                    className={cn(
                      button,
                      "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger hover:bg-[color-mix(in_oklab,var(--danger)_20%,transparent)]",
                    )}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    ref={focusOnArrive}
                    onClick={closePanel}
                    className={quiet}
                  >
                    Keep
                  </button>
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
        {sendError && phase === "review" ? (
          <p
            role="alert"
            className="flex items-start gap-2 px-4 pt-3 text-[12px] leading-4 text-danger"
          >
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            Didn’t send. {sendError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <button
            type="button"
            ref={panel === "discard" ? panelButtonRef : undefined}
            aria-expanded={panel === "discard"}
            aria-disabled={locked || undefined}
            onClick={() => {
              if (locked) return;
              setPanel(panel === "discard" ? "none" : "discard");
            }}
            className={cn(
              quiet,
              "border-transparent text-ink-3 hover:text-danger",
            )}
          >
            Discard
          </button>
          <button
            type="button"
            ref={panel === "note" ? panelButtonRef : undefined}
            aria-expanded={panel === "note"}
            aria-disabled={locked || undefined}
            onClick={() => {
              if (locked) return;
              setPanel(panel === "note" ? "none" : "note");
            }}
            className={quiet}
          >
            Request changes
          </button>
          <span className="ml-auto flex items-center gap-3">
            {heldWhy && phase === "review" ? (
              <span
                aria-hidden
                className="hidden text-[11px] text-ink-3 @min-[30rem]:inline"
              >
                {blocking.length > 0
                  ? `Held by ${plural(blocking.length, "policy flag")}`
                  : heldWhy}
              </span>
            ) : null}
            <button
              type="button"
              onClick={send}
              aria-keyshortcuts="Meta+Enter Control+Enter"
              title="Cmd or Ctrl + Enter"
              aria-disabled={locked || !!heldWhy || undefined}
              aria-busy={phase === "sending" || undefined}
              aria-describedby={heldWhy ? whyId : undefined}
              className={cn(
                button,
                "bg-(--eb-button) text-(--eb-on)",
                locked || heldWhy
                  ? "cursor-not-allowed opacity-50"
                  : "hover:opacity-90",
              )}
            >
              {phase === "sending" ? "Sending…" : "Approve and send"}
            </button>
          </span>
          {heldWhy ? (
            <span id={whyId} className="sr-only">
              {heldWhy}
            </span>
          ) : null}
        </div>
      </footer>
    ) : null;

  return (
    <div
      ref={rootRef}
      role="region"
      tabIndex={-1}
      aria-labelledby={titleId}
      onKeyDown={onRootKey}
      className={cn(
        "@container flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground outline-none",
        disabled && "opacity-80",
        className,
      )}
      style={{ maxHeight: height, ...accentVars(accent) }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--eb-wash) text-[12px] font-semibold text-(--eb-accent)"
        >
          {draft.agent.charAt(0)}
        </span>
        <span className="flex min-w-0 flex-1 basis-40 flex-col">
          <span className="truncate text-[13px] font-medium">
            {draft.agent}
          </span>
          <span className="truncate text-[11px] text-ink-3">
            {draft.model}
            {ready ? ` · held ${held(draft.heldAt, now)}` : ""}
            <span className="hidden @min-[28rem]:inline">
              {` · sends as ${draft.from}`}
            </span>
          </span>
        </span>
        {pill ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 text-[11px] text-ink-2">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", pill.dot)}
            />
            {pill.text}
          </span>
        ) : null}
      </header>

      <div
        ref={areaRef}
        className="relative flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          {!ready ? (
            stateView
          ) : phase === "review" ||
            phase === "sending" ||
            phase === "returning" ? (
            message
          ) : (
            <AnimatePresence mode="popLayout">{after}</AnimatePresence>
          )}
        </div>
        {sceneView}
      </div>

      {footer}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
