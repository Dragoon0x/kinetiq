"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  AtSign,
  CalendarDays,
  Check,
  CircleUser,
  Hash,
  Inbox,
  LoaderCircle,
  Plus,
  Tag,
  TriangleAlert,
  X,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type QuickCaptureProject = { id: string; name: string; count: number };
export type QuickCapturePerson = { id: string; name: string; handle: string };
export type QuickCaptureLabel = { id: string; name: string };

export type QuickCaptureTask = {
  title: string;
  notes: string;
  /** A person id. */
  assignee: string | null;
  /** A project id. */
  project: string | null;
  /** The due day, as ms at UTC midnight. */
  due: number | null;
  /** Label ids. */
  labels: string[];
};

export type QuickCaptureTokenStyle = "pill" | "tag" | "plain";
export type QuickCaptureDensity = "compact" | "cozy" | "roomy";

export type QuickCaptureProps = {
  /** Projects a task can go to, with how many tasks each holds. @default defaultQuickCaptureProjects */
  projects?: QuickCaptureProject[];
  /** People a task can be assigned to. @default defaultQuickCapturePeople */
  people?: QuickCapturePerson[];
  /** Labels a task can carry. @default defaultQuickCaptureLabels */
  labels?: QuickCaptureLabel[];
  /** The person using it; a task assigned to them lands in My tasks. @default "noor" */
  me?: string;
  /** Tasks waiting in the Inbox. @default 3 */
  inboxCount?: number;
  /** Tasks in My tasks. @default 7 */
  mineCount?: number;
  /** What the form holds when it first opens. */
  defaultDraft?: Partial<QuickCaptureTask>;
  /** A task was created. Return a promise: a rejection flies the draft back intact with its message. */
  onCreate?: (task: QuickCaptureTask) => void | Promise<void>;
  /** A task was created and the form stayed open for the next one. */
  onCreateAnother?: (task: QuickCaptureTask) => void;
  /** The draft was let go after Escape's question. */
  onDiscard?: (draft: QuickCaptureTask) => void;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default true */
  defaultOpen?: boolean;
  /** Fires when New task, a create, Discard, the close button or Escape opens or closes it. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled "Create another" switch. */
  createAnother?: boolean;
  /** Initial "Create another" when uncontrolled. @default false */
  defaultCreateAnother?: boolean;
  /** Fires from the press that flipped "Create another". */
  onCreateAnotherChange?: (on: boolean) => void;
  /** The moment due dates count from, in ms — never read from the clock. @default defaultQuickCaptureNow */
  now?: number;
  /** The title field's placeholder. @default "Task title" */
  placeholder?: string;
  /** Tokens as rounded pills, square tags with an edge, or plain underlined words. @default "pill" */
  tokenStyle?: QuickCaptureTokenStyle;
  /** Padding and the title's size. @default "cozy" */
  density?: QuickCaptureDensity;
  /** The caret, filled tokens, Create, the toast and the count's bump, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Height of the frame in px. @default 520 */
  height?: number;
  /** Nothing can be created. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** Tuesday 13 October 2026, 08:30 UTC. */
export const defaultQuickCaptureNow = Date.UTC(2026, 9, 13, 8, 30);

export const defaultQuickCaptureProjects: QuickCaptureProject[] = [
  { id: "riverside", name: "Riverside upgrade", count: 12 },
  { id: "weir", name: "Weir survey", count: 5 },
  { id: "handover", name: "Handover pack", count: 4 },
];

export const defaultQuickCapturePeople: QuickCapturePerson[] = [
  { id: "noor", name: "Noor Haddad", handle: "noor" },
  { id: "tomasz", name: "Tomasz Wren", handle: "tomasz" },
  { id: "ade", name: "Ade Okonjo", handle: "ade" },
  { id: "priya", name: "Priya Raman", handle: "priya" },
  { id: "mara", name: "Mara Lindqvist", handle: "mara" },
];

export const defaultQuickCaptureLabels: QuickCaptureLabel[] = [
  { id: "survey", name: "Survey" },
  { id: "electrical", name: "Electrical" },
  { id: "urgent", name: "Urgent" },
  { id: "client", name: "Client" },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** Fixed UTC: a locale lookup during render would not survive hydration. */
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

type DueOption = { id: string; name: string; at: number };

function dueOptions(now: number): DueOption[] {
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const wd = d.getUTCDay();
  const ahead = (target: number) => ((target - wd + 7) % 7 || 7) * DAY;
  return [
    { id: "today", name: "Today", at: today },
    { id: "tomorrow", name: "Tomorrow", at: today + DAY },
    { id: "friday", name: "Friday", at: today + ahead(5) },
    { id: "monday", name: "Next Monday", at: today + ahead(1) },
    { id: "fortnight", name: "In two weeks", at: today + 14 * DAY },
  ];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** FNV-1a, unsigned: a stable hue turn for a project's swatch. */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const swatch = (id: string) =>
  `oklch(from var(--accent-bright) 0.74 0.12 calc(h + ${(hash(id) % 7) * 50 - 150}))`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Kind = "assignee" | "project" | "due" | "labels";
const TRIGGER: Record<string, Kind> = {
  "@": "assignee",
  "#": "project",
  "+": "labels",
  "^": "due",
};
const KIND_WORD: Record<Kind, string> = {
  assignee: "Assignee",
  project: "Project",
  due: "Due date",
  labels: "Label",
};
const KIND_ICON = {
  assignee: AtSign,
  project: Hash,
  due: CalendarDays,
  labels: Tag,
} as const;

const DENSITY: Record<
  QuickCaptureDensity,
  { pad: string; title: string; gap: string }
> = {
  compact: { pad: "px-3", title: "text-[15px] leading-6", gap: "gap-2" },
  cozy: { pad: "px-4", title: "text-[17px] leading-7", gap: "gap-3" },
  roomy: { pad: "px-5", title: "text-[19px] leading-8", gap: "gap-4" },
};

const EMPTY: QuickCaptureTask = {
  title: "",
  notes: "",
  assignee: null,
  project: null,
  due: null,
  labels: [],
};

type Option = { id: string; name: string; hint?: string };

type Picker = {
  /** Each opening is its own list, so a reopen never revives a closing one. */
  n: number;
  kind: Kind;
  via: "token" | "inline";
  query: string;
  active: number;
  place: React.CSSProperties;
};

type Toast = {
  n: number;
  task: QuickCaptureTask;
  target: string;
  state: "flying" | "waiting" | "sinking" | "returning";
};

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** A count whose digits roll the way it moved, and bump when it gains one. */
function Count({
  value,
  bump,
  motionSafe,
  countKey,
  label,
}: {
  value: number;
  bump: number;
  motionSafe: boolean;
  countKey: string;
  label: string;
}) {
  const [shown, setShown] = React.useState({ value, dir: 1 });
  if (shown.value !== value) {
    setShown({ value, dir: value > shown.value ? 1 : -1 });
  }
  const text = String(value);
  return (
    <span data-count={countKey} className="relative inline-flex shrink-0">
      <span className="sr-only">{label}</span>
      <motion.span
        key={bump}
        aria-hidden
        className="relative inline-flex h-5 min-w-5 items-center justify-center overflow-clip rounded-full bg-surface-2 px-1.5 font-mono text-[10px] text-ink-2 tabular-nums"
        initial={bump > 0 && motionSafe ? { scale: 1.32 } : false}
        animate={{ scale: 1 }}
        transition={motionSafe ? springs.recoil : { duration: 0 }}
      >
        {bump > 0 ? (
          // The tint that says "one landed here" — kept under reduced motion,
          // where it is the whole of the feedback.
          <motion.span
            className="absolute inset-0 bg-[color-mix(in_oklab,var(--qc-accent)_34%,transparent)]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: easings.exit }}
          />
        ) : null}
        <AnimatePresence mode="popLayout" initial={false} custom={shown.dir}>
          <motion.span
            key={text}
            custom={shown.dir}
            className="relative inline-block"
            style={{ lineHeight: "20px" }}
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
      </motion.span>
    </span>
  );
}

function tokenClass(style: QuickCaptureTokenStyle, filled: boolean) {
  if (style === "tag") {
    return cn(
      "h-7 rounded-1 border-l-2 bg-surface-2 px-2",
      filled
        ? "border-[var(--qc-accent)] text-foreground"
        : "border-hairline-strong text-ink-3",
    );
  }
  if (style === "plain") {
    return cn(
      "h-7 rounded-1 px-1 underline decoration-dotted underline-offset-4",
      filled
        ? "font-medium [color:var(--qc-accent)] decoration-[var(--qc-accent)]"
        : "text-ink-3 decoration-ink-3",
    );
  }
  return cn(
    "h-7 rounded-full border px-2.5",
    filled
      ? "border-[var(--qc-accent)] bg-[color-mix(in_oklab,var(--qc-accent)_13%,transparent)] text-foreground"
      : "border-dashed border-hairline-strong text-ink-3",
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A keyboard-first create dialog. Type a title; `@`, `#`, `+` and `^` open
 * the assignee, project, label and due-date lists right where you type, and
 * picking one turns it into a token. Every token is also a button that opens
 * its own combobox, and the tokens wrap to a second line when the dialog is
 * narrow.
 *
 * Creating lifts the filled form into a toast: a copy of the form's box
 * shrinks to a pill carrying the title on `springs.glide` while it travels to
 * the sidebar count it belongs to — x on glide and y on snap, so the path bows
 * — and sinks into the count, which bumps on `springs.recoil` as its digits
 * roll on snap. The create is optimistic: if it fails, the count rolls back
 * and the toast flies home on the same springs and unfolds into the form with
 * every field restored and the reason inline. Cmd or Ctrl+Enter (or the
 * Create another switch) keeps the dialog open and resets the form for the
 * next task while project and assignee stay.
 *
 * It is a modal dialog — the app behind goes inert, Tab wraps, Escape closes
 * an open list first and otherwise asks before letting typed text go. Under
 * reduced motion nothing flies: the count updates with a tint and the form
 * cross-fades; a failure fades the draft back.
 */
export function QuickCapture({
  projects = defaultQuickCaptureProjects,
  people = defaultQuickCapturePeople,
  labels = defaultQuickCaptureLabels,
  me = "noor",
  inboxCount = 3,
  mineCount = 7,
  defaultDraft,
  onCreate,
  onCreateAnother,
  onDiscard,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  createAnother: anotherProp,
  defaultCreateAnother = false,
  onCreateAnotherChange,
  now = defaultQuickCaptureNow,
  placeholder = "Task title",
  tokenStyle = "pill",
  density = "cozy",
  accent = "var(--accent-bright)",
  height = 520,
  disabled = false,
  className,
}: QuickCaptureProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const [ownAnother, setOwnAnother] = React.useState(defaultCreateAnother);
  const another = anotherProp ?? ownAnother;
  const [draft, setDraft] = React.useState<QuickCaptureTask>(() => ({
    ...EMPTY,
    ...defaultDraft,
    labels: defaultDraft?.labels ?? [],
  }));
  const [picker, setPicker] = React.useState<Picker | null>(null);
  const [dismissed, setDismissed] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [error, setError] = React.useState("");
  const [counts, setCounts] = React.useState<Record<string, number>>(() => ({
    inbox: inboxCount,
    mine: mineCount,
    ...Object.fromEntries(projects.map((p) => [p.id, p.count])),
  }));
  const [bumps, setBumps] = React.useState<Record<string, number>>({});
  const [toast, setToast] = React.useState<Toast | null>(null);
  const [created, setCreated] = React.useState<
    { n: number; task: QuickCaptureTask; state: "pending" | "done" }[]
  >([]);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const formRef = React.useRef<HTMLDivElement | null>(null);
  const titleRef = React.useRef<HTMLInputElement | null>(null);
  const opener = React.useRef<HTMLButtonElement | null>(null);
  const tokenRefs = React.useRef(new Map<Kind, HTMLButtonElement | null>());
  const keepRef = React.useRef<HTMLButtonElement | null>(null);
  const restoreFocus = React.useRef(false);
  const seq = React.useRef(0);
  const pickerSeq = React.useRef(0);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const phaseDone = React.useRef<(() => void) | null>(null);
  const timers = React.useRef<number[]>([]);

  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const tw = useMotionValue(0);
  const th = useMotionValue(0);
  const tr = useMotionValue(12);
  const ts = useMotionValue(1);
  const to = useMotionValue(0);

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      phaseDone.current?.();
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const due = dueOptions(now);
  const personOf = (id: string | null) => people.find((p) => p.id === id);
  const projectOf = (id: string | null) => projects.find((p) => p.id === id);
  const targetOf = (task: QuickCaptureTask) =>
    task.project ?? (task.assignee === me ? "mine" : "inbox");
  const targetName = (key: string) =>
    key === "inbox"
      ? "Inbox"
      : key === "mine"
        ? "My tasks"
        : (projectOf(key)?.name ?? key);
  const hasText = draft.title.trim() !== "" || draft.notes.trim() !== "";

  /* ------------------------------ opening ----------------------------- */

  const setOpen = (next: boolean) => {
    if (!next) restoreFocus.current = true;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setPicker(null);
      setConfirm(false);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() =>
      titleRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  React.useEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (opener.current?.isConnected) opener.current.focus();
  }, [open]);

  /* ------------------------------ options ----------------------------- */

  const optionsFor = (kind: Kind, query: string): Option[] => {
    const q = query.trim().toLowerCase();
    const match = (o: Option) =>
      !q ||
      o.name.toLowerCase().includes(q) ||
      (o.hint ?? "").toLowerCase().includes(q);
    if (kind === "assignee") {
      return [
        ...people.map((p) => ({
          id: p.id,
          name: p.name,
          hint: p.id === me ? "you" : `@${p.handle}`,
        })),
        { id: "__none", name: "No one", hint: "unassigned" },
      ].filter(match);
    }
    if (kind === "project") {
      return [
        ...projects.map((p) => ({
          id: p.id,
          name: p.name,
          hint: `${counts[p.id] ?? p.count} tasks`,
        })),
        { id: "__none", name: "No project", hint: "Inbox" },
      ].filter(match);
    }
    if (kind === "labels") {
      return labels.map((l) => ({ id: l.id, name: l.name })).filter(match);
    }
    return [
      ...due.map((o) => ({
        id: String(o.at),
        name: o.name,
        hint: dayLabel(o.at),
      })),
      { id: "__none", name: "No date" },
    ].filter(match);
  };

  const isChosen = (kind: Kind, id: string) =>
    kind === "assignee"
      ? (draft.assignee ?? "__none") === id
      : kind === "project"
        ? (draft.project ?? "__none") === id
        : kind === "labels"
          ? draft.labels.includes(id)
          : String(draft.due ?? "__none") === id;

  const choose = (
    kind: Kind,
    id: string,
    inline: { start: number; end: number } | null,
  ) => {
    setDraft((dr) => {
      const next = { ...dr };
      if (inline) {
        next.title = (
          dr.title.slice(0, inline.start) + dr.title.slice(inline.end)
        ).replace(/\s{2,}/g, " ");
      }
      if (kind === "assignee") next.assignee = id === "__none" ? null : id;
      else if (kind === "project") next.project = id === "__none" ? null : id;
      else if (kind === "due") next.due = id === "__none" ? null : Number(id);
      else
        next.labels = dr.labels.includes(id)
          ? dr.labels.filter((l) => l !== id)
          : [...dr.labels, id];
      return next;
    });
    setError("");
    const word =
      kind === "assignee"
        ? (personOf(id)?.name ?? "No one")
        : kind === "project"
          ? (projectOf(id)?.name ?? "No project")
          : kind === "due"
            ? id === "__none"
              ? "No date"
              : dayLabel(Number(id))
            : (labels.find((l) => l.id === id)?.name ?? "");
    setAnnouncement(`${KIND_WORD[kind]}: ${word}.`);
  };

  /** Where a list opens: under its anchor, or above it when the frame has no room. */
  const placeUnder = (anchor: HTMLElement | null): React.CSSProperties => {
    const layer = overlayRef.current;
    const box = dialogRef.current;
    if (!anchor || !layer || !box) return { left: 16, top: 96 };
    const a = anchor.getBoundingClientRect();
    const l = layer.getBoundingClientRect();
    const g = box.getBoundingClientRect();
    // Room is the overlay's; the list is placed in the dialog's own frame.
    const width = Math.min(256, l.width - 16);
    const left = Math.round(
      clamp(a.left - l.left, 8, l.width - width - 8) - (g.left - l.left),
    );
    const below = l.bottom - a.bottom;
    return below >= 196 || below >= a.top - l.top
      ? {
          left,
          top: Math.round(a.bottom - g.top + 4),
          width,
          maxHeight: Math.max(120, Math.min(220, below - 12)),
        }
      : {
          left,
          bottom: Math.round(g.bottom - a.top + 4),
          width,
          maxHeight: Math.max(120, Math.min(220, a.top - l.top - 12)),
        };
  };

  const openPicker = (kind: Kind) => {
    if (disabled) return;
    setPicker({
      n: ++pickerSeq.current,
      kind,
      via: "token",
      query: "",
      active: 0,
      place: placeUnder(tokenRefs.current.get(kind) ?? null),
    });
  };

  const closePicker = (refocus: boolean) => {
    const was = picker;
    setPicker(null);
    if (!refocus || !was) return;
    if (was.via === "token") tokenRefs.current.get(was.kind)?.focus();
    else titleRef.current?.focus();
  };

  /** The trigger being typed at the caret, if any: "@ma" → assignee "ma". */
  const triggerAt = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = /(?:^|\s)([@#+^])([^\s@#+^]*)$/.exec(before);
    if (!m || m[1] === undefined) return null;
    const kind = TRIGGER[m[1]];
    if (!kind) return null;
    return {
      kind,
      query: m[2] ?? "",
      start: caret - (m[2] ?? "").length - 1,
      end: caret,
    };
  };

  const syncInline = (text: string, caret: number) => {
    const t = triggerAt(text, caret);
    const sig = t ? `${t.start}:${t.kind}` : null;
    if (!t || sig === dismissed) {
      if (picker?.via === "inline") setPicker(null);
      return;
    }
    setPicker((p) => ({
      n: p?.via === "inline" && p.kind === t.kind ? p.n : ++pickerSeq.current,
      kind: t.kind,
      via: "inline",
      query: t.query,
      active: p?.via === "inline" && p.kind === t.kind ? p.active : 0,
      place: placeUnder(titleRef.current),
    }));
  };

  /* ------------------------------ creating ---------------------------- */

  const bump = (key: string, by: number) => {
    setCounts((c) => ({ ...c, [key]: Math.max(0, (c[key] ?? 0) + by) }));
    if (by > 0) setBumps((b) => ({ ...b, [key]: (b[key] ?? 0) + 1 }));
  };

  const rectIn = (el: Element | null) => {
    const root = rootRef.current;
    if (!el || !root) return null;
    const a = el.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    return { x: a.left - r.left, y: a.top - r.top, w: a.width, h: a.height };
  };

  // A stopped animation never resolves its promise, so each phase is its
  // own promise that settles when the phase ends or is cut short — a create
  // interrupted by the next one still lands and counts.
  const stopFlight = () => {
    for (const c of running.current) c.stop();
    running.current = [];
    const done = phaseDone.current;
    phaseDone.current = null;
    done?.();
  };
  const runPhase = (controls: AnimationPlaybackControls[]) => {
    running.current = controls;
    return new Promise<void>((resolve) => {
      phaseDone.current = resolve;
      void Promise.all(controls).then(() => {
        if (phaseDone.current === resolve) phaseDone.current = null;
        resolve();
      });
    });
  };

  /** The form becomes a pill and goes to its count: x on glide, y on snap. */
  const fly = (target: string) => {
    const from = rectIn(formRef.current);
    const dest = rectIn(
      rootRef.current?.querySelector(`[data-count="${target}"]`) ?? null,
    );
    const root = rootRef.current;
    if (!from || !dest || !root) return Promise.resolve();
    const pillW = Math.round(clamp(from.w * 0.55, 132, 220));
    const pillH = 30;
    const toX = r2(
      clamp(dest.x + dest.w / 2 - pillW / 2, 4, root.clientWidth - pillW - 4),
    );
    const toY = r2(
      clamp(dest.y + dest.h / 2 - pillH / 2, 4, root.clientHeight - pillH - 4),
    );
    stopFlight();
    tx.jump(r2(from.x));
    ty.jump(r2(from.y));
    tw.jump(r2(from.w));
    th.jump(r2(from.h));
    tr.jump(10);
    ts.jump(1);
    to.jump(1);
    return runPhase([
      animate(tx, toX, springs.glide),
      animate(ty, toY, springs.snap),
      animate(tw, pillW, springs.glide),
      animate(th, pillH, springs.glide),
      animate(tr, pillH / 2, springs.glide),
    ]);
  };

  const sink = () => {
    stopFlight();
    return runPhase([
      animate(ts, 0.3, { duration: durations.fast, ease: easings.exit }),
      animate(to, 0, { duration: durations.fast, ease: easings.exit }),
    ]);
  };

  const flyHome = () => {
    const home = rectIn(formRef.current);
    if (!home) return Promise.resolve();
    stopFlight();
    to.jump(1);
    return runPhase([
      animate(tx, r2(home.x), springs.glide),
      animate(ty, r2(home.y), springs.snap),
      animate(tw, r2(home.w), springs.glide),
      animate(th, r2(home.h), springs.glide),
      animate(tr, 10, springs.glide),
      animate(ts, 1, springs.glide),
    ]);
  };

  const create = (keepOpen: boolean) => {
    if (disabled) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Give the task a title.");
      setAnnouncement("Give the task a title.");
      titleRef.current?.focus();
      return;
    }
    const task: QuickCaptureTask = {
      ...draft,
      title,
      notes: draft.notes.trim(),
    };
    const target = targetOf(task);
    const n = ++seq.current;
    setError("");
    setPicker(null);
    setConfirm(false);
    setCreated((c) =>
      [{ n, task, state: "pending" as const }, ...c].slice(0, 6),
    );
    setAnnouncement(`Created ${title} in ${targetName(target)}.`);

    // The toast leaves from the form as it is now, before the form resets.
    const flight = motionSafe ? fly(target) : Promise.resolve();
    // The count takes the task when the toast reaches it — at once under
    // reduced motion, where the tint is the whole of the landing.
    if (motionSafe) void flight.then(() => bump(target, 1));
    else bump(target, 1);
    if (motionSafe) setToast({ n, task, target, state: "flying" });

    if (keepOpen) {
      setDraft((dr) => ({
        ...EMPTY,
        project: dr.project,
        assignee: dr.assignee,
      }));
      // The form comes back empty with a short cross-fade; the choices that
      // carry over pulse once so it is clear they stayed.
      formRef.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: durations.base * 1000,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
      if (motionSafe) {
        for (const kind of ["assignee", "project"] as Kind[]) {
          if (kind === "assignee" ? !task.assignee : !task.project) continue;
          tokenRefs.current
            .get(kind)
            ?.animate(
              [
                { transform: "scale(1)" },
                { transform: "scale(1.07)" },
                { transform: "scale(1)" },
              ],
              { duration: 420, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
            );
        }
      }
      onCreateAnother?.(task);
      titleRef.current?.focus();
    } else {
      setOpen(false);
    }

    const result = onCreate?.(task);
    const settled: Promise<{ ok: boolean; message?: string }> =
      result && typeof (result as Promise<void>).then === "function"
        ? (result as Promise<void>).then(
            () => ({ ok: true }),
            (reason: unknown) => ({
              ok: false,
              message:
                reason instanceof Error && reason.message
                  ? reason.message
                  : "Fernworks did not answer. Your task is still here.",
            }),
          )
        : Promise.resolve({ ok: true });

    let answered = false;
    void settled.then(() => {
      answered = true;
    });
    // Arrived before the answer: the pill waits on its count with a spinner.
    void flight.then(() => {
      if (!answered && seq.current === n) {
        setToast((t) => (t && t.n === n ? { ...t, state: "waiting" } : t));
      }
    });

    void Promise.all([flight, settled]).then(async ([, outcome]) => {
      // Only the newest create owns the toast; older ones settle quietly.
      const mine = seq.current === n && motionSafe;
      if (outcome.ok) {
        setCreated((c) =>
          c.map((e) => (e.n === n ? { ...e, state: "done" } : e)),
        );
        if (mine) {
          setToast((t) => (t && t.n === n ? { ...t, state: "sinking" } : t));
          await sink();
          setToast((t) => (t && t.n === n ? null : t));
        }
        return;
      }
      // Failed: the count gives the task back and the draft flies home.
      bump(target, -1);
      setCreated((c) => c.filter((e) => e.n !== n));
      if (openProp === undefined) setOwnOpen(true);
      onOpenChange?.(true);
      setDraft(task);
      setError(outcome.message ?? "");
      setAnnouncement(
        `Not created. ${outcome.message ?? ""} The draft is back.`,
      );
      if (mine) {
        setToast((t) => (t && t.n === n ? { ...t, state: "returning" } : t));
        // Wait a frame for the form to be back in the document to aim at.
        await new Promise((r) => window.requestAnimationFrame(() => r(null)));
        await flyHome();
        stopFlight();
        await runPhase([animate(to, 0, { duration: durations.fast })]);
        setToast((t) => (t && t.n === n ? null : t));
      }
    });
  };

  const discard = () => {
    const was = draft;
    setDraft({ ...EMPTY, labels: [] });
    setConfirm(false);
    setError("");
    setAnnouncement("Draft discarded.");
    onDiscard?.(was);
    setOpen(false);
  };

  const askToLeave = () => {
    if (!hasText) {
      setOpen(false);
      return;
    }
    setConfirm(true);
    setAnnouncement("Discard this task? Keep writing or discard.");
    timers.current.push(window.setTimeout(() => keepRef.current?.focus(), 0));
  };

  /* ----------------------------- keyboard ----------------------------- */

  const pickerOptions = picker ? optionsFor(picker.kind, picker.query) : [];
  const activeIndex = picker
    ? Math.min(picker.active, Math.max(0, pickerOptions.length - 1))
    : 0;

  const pickActive = () => {
    if (!picker) return;
    const o = pickerOptions[activeIndex];
    if (!o) return;
    let range: { start: number; end: number } | null = null;
    if (picker.via === "inline") {
      const caret = titleRef.current?.selectionStart ?? draft.title.length;
      const t = triggerAt(draft.title, caret);
      if (t) range = { start: t.start, end: t.end };
    }
    choose(picker.kind, o.id, range);
    if (picker.kind === "labels" && picker.via === "token") return;
    closePicker(true);
    if (range) {
      const at = range.start;
      timers.current.push(
        window.setTimeout(() => titleRef.current?.setSelectionRange(at, at), 0),
      );
    }
  };

  const listKeys = (event: React.KeyboardEvent): boolean => {
    if (!picker) return false;
    const n = pickerOptions.length;
    const move = (i: number) =>
      setPicker((p) => (p ? { ...p, active: n ? ((i % n) + n) % n : 0 } : p));
    switch (event.key) {
      case "ArrowDown":
        move(activeIndex + 1);
        break;
      case "ArrowUp":
        move(activeIndex - 1);
        break;
      case "Home":
        if (picker.via === "inline") return false;
        move(0);
        break;
      case "End":
        if (picker.via === "inline") return false;
        move(n - 1);
        break;
      case "Enter":
        if (event.metaKey || event.ctrlKey) return false;
        pickActive();
        break;
      case "Tab":
        // The list sits beside the dialog, so Tab would walk out of the
        // trap: it closes the list and hands focus back to its token.
        if (picker.via !== "inline") closePicker(true);
        else pickActive();
        break;
      case "Escape":
        if (picker.via === "inline") {
          const caret = titleRef.current?.selectionStart ?? draft.title.length;
          const t = triggerAt(draft.title, caret);
          setDismissed(t ? `${t.start}:${t.kind}` : null);
        }
        closePicker(true);
        break;
      default:
        return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const onDialogKey = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      create(true);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (confirm) {
        setConfirm(false);
        titleRef.current?.focus();
      } else askToLeave();
      return;
    }
    if (event.key !== "Tab") return;
    const box = dialogRef.current;
    if (!box) return;
    const nodes = Array.from(
      box.querySelectorAll<HTMLElement>(TABBABLE),
    ).filter(
      // A list's own filter field is reached by its token, never by Tab —
      // and a closing list must not catch the wrap.
      (el) => el.offsetParent !== null && el.tabIndex >= 0,
    );
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* ---------------------------- rendering ----------------------------- */

  const accentStyle = {
    "--qc-accent": accent,
    "--qc-on-accent": `oklch(from ${accent} clamp(0.18, (0.72 - l) * 100, 0.99) 0.01 h)`,
  } as React.CSSProperties;

  const tokenText = (kind: Kind): string | null => {
    if (kind === "assignee") {
      const p = personOf(draft.assignee);
      return p ? (p.id === me ? `${p.name} (you)` : p.name) : null;
    }
    if (kind === "project") return projectOf(draft.project)?.name ?? null;
    if (kind === "due") return draft.due === null ? null : dayLabel(draft.due);
    const names = draft.labels
      .map((id) => labels.find((l) => l.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(", ") : null;
  };

  const sidebarItems: { key: string; name: string; icon: React.ReactNode }[] = [
    {
      key: "inbox",
      name: "Inbox",
      icon: <Inbox aria-hidden className="size-4 shrink-0" />,
    },
    {
      key: "mine",
      name: "My tasks",
      icon: <CircleUser aria-hidden className="size-4 shrink-0" />,
    },
    ...projects.map((p) => ({
      key: p.id,
      name: p.name,
      icon: (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-1"
          style={{ backgroundColor: swatch(p.id) }}
        />
      ),
    })),
  ];
  const countFor = (key: string) => (
    <Count
      value={counts[key] ?? 0}
      bump={bumps[key] ?? 0}
      motionSafe={motionSafe}
      countKey={key}
      label={`, ${counts[key] ?? 0} ${(counts[key] ?? 0) === 1 ? "task" : "tasks"}`}
    />
  );

  const listId = `${uid}-list`;
  const titleInline = picker?.via === "inline";

  return (
    <div
      ref={rootRef}
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ height, ...accentStyle }}
    >
      <div inert={open} className="flex h-full flex-col @min-[36rem]:flex-row">
        {/* Sidebar on a wide frame, a strip of counts on a narrow one. */}
        <nav
          aria-label="Task lists"
          className="flex shrink-0 flex-col gap-1 border-b border-hairline bg-surface-1 px-2 py-2 @min-[36rem]:w-[11.5rem] @min-[36rem]:border-r @min-[36rem]:border-b-0 @min-[36rem]:py-3"
        >
          <span className="hidden px-2 pb-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[36rem]:block">
            Fernworks
          </span>
          <ul
            role="list"
            className="flex [scrollbar-width:none] gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] @min-[36rem]:flex-col @min-[36rem]:overflow-visible @min-[36rem]:[mask-image:none]"
          >
            {sidebarItems.map((item, i) => (
              <React.Fragment key={item.key}>
                {i === 2 ? (
                  <li
                    aria-hidden
                    className="hidden px-2 pt-3 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[36rem]:block"
                  >
                    Projects
                  </li>
                ) : null}
                <li className="shrink-0">
                  <span
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-2 px-2 text-[12px] text-ink-2 @min-[36rem]:text-[13px]",
                      item.key === "mine" && "bg-surface-2 text-foreground",
                    )}
                  >
                    {item.icon}
                    <span
                      title={item.name}
                      className="max-w-[7rem] truncate @min-[36rem]:max-w-none @min-[36rem]:flex-1"
                    >
                      {item.name}
                    </span>
                    {countFor(item.key)}
                  </span>
                </li>
              </React.Fragment>
            ))}
          </ul>
        </nav>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
            <span className="text-sm font-semibold">My tasks</span>
            <button
              ref={opener}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 bg-[var(--qc-accent)] px-3 text-[12px] font-medium [color:var(--qc-on-accent)] transition-opacity hover:opacity-90",
                FOCUS,
              )}
            >
              <Plus aria-hidden className="size-3.5" />
              New task
            </button>
          </div>
          <ul
            role="list"
            className="flex flex-col overflow-hidden px-2 py-2 text-[13px]"
          >
            <AnimatePresence initial={false}>
              {created.map((c) => (
                <motion.li
                  key={c.n}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{
                    opacity: c.state === "pending" ? 0.6 : 1,
                    height: "auto",
                  }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          height: springs.glide,
                          opacity: { duration: durations.base },
                        }
                      : { duration: 0 }
                  }
                  className="overflow-hidden"
                >
                  <span className="flex h-9 items-center gap-2.5 rounded-2 px-2">
                    <span
                      aria-hidden
                      className="size-3.5 shrink-0 rounded-full border border-hairline-strong"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {c.task.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-3">
                      {c.state === "pending"
                        ? "Saving…"
                        : targetName(targetOf(c.task))}
                    </span>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
            {[
              ["Replace P2 mechanical seal", "Riverside upgrade"],
              ["Send flow readings to Mara", "Weir survey"],
              ["Book the crane for Thursday", "Riverside upgrade"],
              ["Sign off as-built drawings", "Handover pack"],
            ].map(([t, p]) => (
              <li
                key={t}
                className="flex h-9 items-center gap-2.5 rounded-2 px-2"
              >
                <span
                  aria-hidden
                  className="size-3.5 shrink-0 rounded-full border border-hairline-strong"
                />
                <span className="min-w-0 flex-1 truncate">{t}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="overlay"
            ref={overlayRef}
            className="absolute inset-x-0 top-[3.25rem] bottom-0 z-20 flex items-start justify-center px-2 pt-2 @min-[36rem]:top-0 @min-[36rem]:left-[11.5rem] @min-[36rem]:px-4 @min-[36rem]:pt-[12%]"
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-background/60"
              onClick={() => (hasText ? askToLeave() : setOpen(false))}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            />
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${uid}-title`}
              onKeyDown={onDialogKey}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? { y: springs.glide, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="relative flex max-h-full w-full flex-col rounded-4 border border-hairline-strong bg-popover text-popover-foreground shadow-raised @min-[36rem]:w-[30rem]"
            >
              <div
                className={cn(
                  "flex items-center justify-between gap-3 pt-3",
                  d.pad,
                )}
              >
                <h2
                  id={`${uid}-title`}
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  New task
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={askToLeave}
                  className={cn(
                    "-mr-1.5 inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>

              <div className={cn("flex flex-col pt-1 pb-3", d.pad, d.gap)}>
                <div
                  ref={formRef}
                  className="flex flex-col rounded-3 border border-hairline bg-surface-0 px-3 py-2 transition-colors focus-within:border-[var(--qc-accent)] focus-within:ring-1 focus-within:ring-[var(--qc-accent)]"
                >
                  <input
                    ref={titleRef}
                    type="text"
                    role="combobox"
                    aria-label="Task title"
                    aria-expanded={titleInline}
                    aria-controls={titleInline ? listId : undefined}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      titleInline && pickerOptions[activeIndex]
                        ? `${listId}-${activeIndex}`
                        : undefined
                    }
                    aria-invalid={
                      error && !draft.title.trim() ? true : undefined
                    }
                    aria-describedby={error ? `${uid}-error` : `${uid}-hints`}
                    value={draft.title}
                    placeholder={placeholder}
                    readOnly={disabled}
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      const caret =
                        event.currentTarget.selectionStart ?? text.length;
                      setDraft((dr) => ({ ...dr, title: text }));
                      setDismissed(null);
                      if (error) setError("");
                      syncInline(text, caret);
                    }}
                    onKeyDown={(event) => {
                      if (listKeys(event)) return;
                      if (
                        event.key === "Enter" &&
                        !event.metaKey &&
                        !event.ctrlKey
                      ) {
                        event.preventDefault();
                        create(another);
                      }
                    }}
                    onBlur={() => {
                      if (picker?.via === "inline") setPicker(null);
                    }}
                    className={cn(
                      "w-full bg-transparent font-medium text-foreground caret-[var(--qc-accent)] outline-none placeholder:text-ink-3",
                      d.title,
                    )}
                  />
                  <textarea
                    aria-label="Notes"
                    rows={1}
                    value={draft.notes}
                    placeholder="Add notes"
                    readOnly={disabled}
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      setDraft((dr) => ({ ...dr, notes: text }));
                    }}
                    className="field-sizing-content max-h-24 w-full resize-none bg-transparent text-[13px] leading-5 text-ink-2 outline-none placeholder:text-ink-3"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Details"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {(["assignee", "project", "due", "labels"] as Kind[]).map(
                    (kind) => {
                      const text = tokenText(kind);
                      const Icon = KIND_ICON[kind];
                      const expanded =
                        picker?.kind === kind && picker.via === "token";
                      return (
                        <button
                          key={kind}
                          ref={(node) => {
                            tokenRefs.current.set(kind, node);
                          }}
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={expanded}
                          aria-label={`${KIND_WORD[kind]}: ${text ?? "none"}`}
                          onClick={() =>
                            expanded ? closePicker(false) : openPicker(kind)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              openPicker(kind);
                            } else if (
                              (event.key === "Backspace" ||
                                event.key === "Delete") &&
                              text
                            ) {
                              event.preventDefault();
                              setDraft((dr) => ({
                                ...dr,
                                ...(kind === "labels"
                                  ? { labels: [] }
                                  : { [kind]: null }),
                              }));
                              setAnnouncement(`${KIND_WORD[kind]} cleared.`);
                            }
                          }}
                          className={cn(
                            "inline-flex max-w-full min-w-0 items-center gap-1.5 text-[12px] transition-colors",
                            FOCUS,
                            tokenClass(tokenStyle, Boolean(text)),
                            expanded && "ring-1 ring-[var(--qc-accent)]",
                          )}
                        >
                          <Icon aria-hidden className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {text ?? KIND_WORD[kind]}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>

                {error ? (
                  <p
                    id={`${uid}-error`}
                    role="alert"
                    className="flex items-start gap-1.5 text-[12px] leading-4 text-danger"
                  >
                    <TriangleAlert
                      aria-hidden
                      className="mt-px size-3.5 shrink-0"
                    />
                    {error}
                  </p>
                ) : null}
              </div>

              <AnimatePresence initial={false} mode="popLayout">
                {confirm ? (
                  <motion.div
                    key="confirm"
                    role="group"
                    aria-labelledby={`${uid}-ask`}
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            y: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface-2 py-2.5",
                      d.pad,
                    )}
                  >
                    <span id={`${uid}-ask`} className="text-[13px] font-medium">
                      Discard this task?
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        ref={keepRef}
                        type="button"
                        onClick={() => {
                          setConfirm(false);
                          titleRef.current?.focus();
                        }}
                        className={cn(
                          "inline-flex h-8 items-center rounded-2 border border-input bg-surface-1 px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
                          FOCUS,
                        )}
                      >
                        Keep writing
                      </button>
                      <button
                        type="button"
                        onClick={discard}
                        className={cn(
                          "inline-flex h-8 items-center rounded-2 px-3 text-[12px] font-medium text-danger transition-colors hover:bg-surface-1",
                          FOCUS,
                        )}
                      >
                        Discard
                      </button>
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="footer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ duration: durations.fast }}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline py-2.5",
                      d.pad,
                    )}
                  >
                    <span
                      id={`${uid}-hints`}
                      className="hidden font-mono text-[10px] tracking-[0.04em] text-ink-3 @min-[36rem]:inline"
                    >
                      <span aria-hidden>
                        @ assign · # project · + label · ^ due
                      </span>
                      <span className="sr-only">
                        Type at to assign, hash for a project, plus for a label,
                        caret for a due date.
                      </span>
                    </span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="flex items-center gap-2">
                        <span
                          id={`${uid}-another`}
                          className="text-[12px] text-ink-2"
                        >
                          Create another
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={another}
                          aria-labelledby={`${uid}-another`}
                          onClick={() => {
                            const next = !another;
                            if (anotherProp === undefined) setOwnAnother(next);
                            onCreateAnotherChange?.(next);
                          }}
                          className={cn(
                            "relative h-5 w-8 shrink-0 rounded-full transition-colors",
                            FOCUS,
                            another
                              ? "bg-[var(--qc-accent)]"
                              : "bg-surface-2 ring-1 ring-hairline-strong",
                          )}
                        >
                          <motion.span
                            aria-hidden
                            className="absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm"
                            initial={false}
                            animate={{ x: another ? 12 : 0 }}
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          />
                        </button>
                      </span>
                      <button
                        type="button"
                        onClick={() => create(another)}
                        aria-disabled={disabled || undefined}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-2 bg-[var(--qc-accent)] px-3 text-[12px] font-medium [color:var(--qc-on-accent)] transition-opacity hover:opacity-90",
                          FOCUS,
                        )}
                      >
                        Create
                        <kbd
                          aria-hidden
                          className="font-mono text-[10px] opacity-70"
                        >
                          ↵
                        </kbd>
                      </button>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* The list a token or a typed trigger opened, inside the dialog, so a modal
                reader still reaches it; it may hang past the dialog's edge. */}
              <AnimatePresence>
                {picker ? (
                  <motion.div
                    key={picker.n}
                    initial={{
                      opacity: 0,
                      y: motionSafe ? -distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            y: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                    style={picker.place}
                    className="absolute z-30 flex flex-col overflow-hidden rounded-3 border border-hairline-strong bg-popover text-popover-foreground shadow-raised"
                    onPointerDown={(event) => {
                      if (picker.via === "inline") event.preventDefault();
                    }}
                  >
                    {picker.via === "token" ? (
                      <input
                        autoFocus
                        tabIndex={-1}
                        type="text"
                        role="combobox"
                        aria-label={`Find ${KIND_WORD[picker.kind].toLowerCase()}`}
                        aria-expanded
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={
                          pickerOptions[activeIndex]
                            ? `${listId}-${activeIndex}`
                            : undefined
                        }
                        value={picker.query}
                        placeholder={`${KIND_WORD[picker.kind]}…`}
                        onChange={(event) => {
                          const text = event.currentTarget.value;
                          setPicker((p) =>
                            p ? { ...p, query: text, active: 0 } : p,
                          );
                        }}
                        onKeyDown={(event) => {
                          listKeys(event);
                        }}
                        className={cn(
                          "h-9 shrink-0 border-b border-hairline bg-transparent px-3 text-[12px] text-foreground placeholder:text-ink-3",
                          FOCUS_IN,
                        )}
                      />
                    ) : null}
                    <ul
                      id={listId}
                      role="listbox"
                      aria-label={KIND_WORD[picker.kind]}
                      aria-multiselectable={
                        picker.kind === "labels" || undefined
                      }
                      className="flex flex-col overflow-y-auto p-1"
                    >
                      {pickerOptions.length === 0 ? (
                        <li className="px-2 py-1.5 text-[12px] text-ink-3">
                          No match
                        </li>
                      ) : (
                        pickerOptions.map((o, i) => {
                          const chosen = isChosen(picker.kind, o.id);
                          return (
                            <li
                              key={o.id}
                              id={`${listId}-${i}`}
                              role="option"
                              aria-selected={chosen}
                              onPointerEnter={() =>
                                setPicker((p) => (p ? { ...p, active: i } : p))
                              }
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setPicker((p) => (p ? { ...p, active: i } : p));
                                let range: {
                                  start: number;
                                  end: number;
                                } | null = null;
                                if (picker.via === "inline") {
                                  const caret =
                                    titleRef.current?.selectionStart ??
                                    draft.title.length;
                                  const t = triggerAt(draft.title, caret);
                                  if (t) range = { start: t.start, end: t.end };
                                }
                                choose(picker.kind, o.id, range);
                                if (!(
                                  picker.kind === "labels" &&
                                  picker.via === "token"
                                )) {
                                  closePicker(true);
                                }
                              }}
                              className={cn(
                                "relative flex cursor-default items-center gap-2 rounded-2 px-2 py-1.5 text-[12px]",
                                i === activeIndex && "bg-surface-2",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate text-foreground">
                                {o.name}
                              </span>
                              {o.hint ? (
                                <span className="shrink-0 text-[11px] text-ink-3">
                                  {o.hint}
                                </span>
                              ) : null}
                              <Check
                                aria-hidden
                                className={cn(
                                  "size-3.5 shrink-0 [color:var(--qc-accent)]",
                                  chosen ? "opacity-100" : "opacity-0",
                                )}
                              />
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* The toast: the form's box, carried to its count. */}
      {toast ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-40 flex items-center gap-2 overflow-hidden border border-[var(--qc-accent)] bg-popover px-3 text-[12px] font-medium text-foreground shadow-raised"
          style={{
            x: tx,
            y: ty,
            width: tw,
            height: th,
            borderRadius: tr,
            scale: ts,
            opacity: to,
          }}
        >
          {toast.state === "waiting" ? (
            <LoaderCircle
              className={cn("size-3.5 shrink-0", motionSafe && "animate-spin")}
            />
          ) : toast.state === "returning" ? (
            <TriangleAlert className="size-3.5 shrink-0 text-danger" />
          ) : (
            <Check className="size-3.5 shrink-0 [color:var(--qc-accent)]" />
          )}
          <span className="truncate">{toast.task.title}</span>
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
