"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionStyle,
} from "motion/react";
import {
  ChevronDown,
  CircleAlert,
  CloudCheck,
  CloudOff,
  LoaderCircle,
  PencilLine,
  RotateCcw,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DraftFieldKind = "text" | "textarea" | "select" | "date";

export type DraftField = {
  id: string;
  label: string;
  kind: DraftFieldKind;
  /** Choices for the select kind. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  /** Span both columns on wide layouts (textareas always do). */
  wide?: boolean;
};

export type DraftValues = Record<string, string>;

export type DraftCollaborator = {
  id: string;
  name: string;
  /** Hue (0–360) of their avatar. */
  hue: number;
};

export type DraftRemoteEdit = {
  /** Unique; each edit is taken once. */
  id: string;
  field: string;
  value: string;
  /** A collaborator id. */
  by: string;
  /** When they made it, ms on the same clock as `now`. */
  at: number;
  /** The value they started from. Yours differing from it means you both changed the field. */
  base?: string;
};

export type DraftIndicatorStyle = "pill" | "dot" | "line";
export type DraftDensity = "compact" | "cozy" | "roomy";
export type DraftTone = "neutral" | "paper" | "slate";

export type DraftKeeperProps = {
  /** Controlled document. Clean remote edits are reported through onValuesChange. */
  values?: DraftValues;
  /** Initial document when uncontrolled. @default defaultDraftValues */
  defaultValues?: DraftValues;
  /** Fires from your edits, kept versions and clean remote edits, with the whole document. */
  onValuesChange?: (values: DraftValues) => void;
  /** The form. @default defaultDraftFields (a Waylight 4.2 launch brief) */
  fields?: DraftField[];
  /** Who else is in the document. @default defaultDraftCollaborators */
  collaborators?: DraftCollaborator[];
  /** Remote edits, pushed by the host; new ids are taken as they arrive. @default [] */
  incoming?: DraftRemoteEdit[];
  /** Your name, for your avatar in the header. @default "You" */
  me?: string;
  /** Offline, edits queue with a count and are sent when you are back. @default true */
  online?: boolean;
  /** Saves the queued changes. A promise shows Saving; a rejection keeps the queue and offers Retry. */
  onSave?: (values: DraftValues, changed: string[]) => void | Promise<void>;
  /** Someone else changed a field you had also changed; it has split into two versions. */
  onConflict?: (
    field: string,
    yours: string,
    theirs: string,
    by: DraftCollaborator,
  ) => void;
  /** A version was kept. */
  onResolve?: (field: string, kept: "yours" | "theirs", value: string) => void;
  /** Quiet time after your last keystroke before an autosave, in ms. @default 1200 */
  autosaveMs?: number;
  /** When the document was last saved, ms on the `now` clock. @default now − 12 s */
  lastSaved?: number;
  /** The moment to count from, in ms. Never read from the clock during render. @default defaultDraftNow */
  now?: number;
  /** The save indicator: a bordered pill, a quiet dot, or a line along the panel's top edge. @default "pill" */
  indicatorStyle?: DraftIndicatorStyle;
  /** Field heights and the room between them. @default "cozy" */
  density?: DraftDensity;
  /** The surface temperature, in both themes: plain card, warmed paper, or cooled slate. @default "neutral" */
  tone?: DraftTone;
  /** The form's heading and accessible name. @default "Waylight 4.2 launch brief" */
  title?: string;
  /** Panel height in px; the form scrolls inside it. @default 520 */
  height?: number;
  /** Nothing can be edited or saved. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- data --------------------------------- */

/** A fixed afternoon, so the default renders the same everywhere. */
export const defaultDraftNow = Date.UTC(2026, 9, 12, 15, 20);

export const defaultDraftFields: DraftField[] = [
  { id: "name", label: "Release name", kind: "text" },
  {
    id: "status",
    label: "Status",
    kind: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "review", label: "In review" },
      { value: "ready", label: "Ready to ship" },
    ],
  },
  {
    id: "summary",
    label: "Summary",
    kind: "textarea",
    hint: "Two sentences for the changelog.",
  },
  {
    id: "audience",
    label: "Audience",
    kind: "select",
    options: [
      { value: "all", label: "Every workspace" },
      { value: "teams", label: "Teams plan" },
      { value: "beta", label: "Beta group" },
    ],
  },
  {
    id: "launch",
    label: "Launch date",
    kind: "date",
    placeholder: "YYYY-MM-DD",
  },
  { id: "rollout", label: "Rollout plan", kind: "textarea" },
  { id: "support", label: "Support notes", kind: "textarea" },
];

/** One stable empty list: the default is compared by identity in render. */
const NO_EDITS: DraftRemoteEdit[] = [];

export const defaultDraftCollaborators: DraftCollaborator[] = [
  { id: "mira", name: "Mira Haddad", hue: 330 },
  { id: "jonah", name: "Jonah Price", hue: 160 },
];

/** The summary as it was before either of you touched it. */
export const draftSummaryBase =
  "Quiet Hours pauses notifications on a schedule.";

/** Your rewrite is already in; Mira's lands from the first frame. */
export const defaultDraftValues: DraftValues = {
  name: "Waylight 4.2 · Quiet Hours",
  status: "review",
  summary:
    "Quiet Hours lets teams pause notifications on a schedule, so focus time survives the busiest weeks.",
  audience: "teams",
  launch: "2026-11-04",
  rollout: "Beta group on Monday, then 20% of workspaces a day.",
  support: "Macros updated. Help article drafted, waiting on screenshots.",
};

/* ------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const possessive = (name: string) =>
  `${name}${name.endsWith("s") ? "'" : "'s"}`;

/** Word-level difference: which words of each side the other does not share. */
function diffWords(a: string, b: string) {
  const ta = a.split(/(\s+)/);
  const tb = b.split(/(\s+)/);
  const n = ta.length;
  const m = tb.length;
  // Longest common subsequence on tokens; the texts are a few sentences.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = dp[i] as number[];
      row[j] =
        ta[i] === tb[j]
          ? (dp[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const keepA = new Array<boolean>(n).fill(false);
  const keepB = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      keepA[i] = true;
      keepB[j] = true;
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) i++;
    else j++;
  }
  // Runs of changed words are joined across the spaces between them, so a
  // rewritten phrase reads as one mark rather than a row of separate ones.
  const mark = (tokens: string[], keep: boolean[]) => {
    const runs: { t: string; changed: boolean }[] = [];
    tokens.forEach((t, k) => {
      const blank = t.trim() === "";
      const changed = blank
        ? !keep[k - 1] && !keep[k + 1] && k > 0 && k < tokens.length - 1
        : !keep[k];
      const prev = runs[runs.length - 1];
      if (prev && prev.changed === changed) prev.t += t;
      else runs.push({ t, changed });
    });
    return runs;
  };
  return { a: mark(ta, keepA), b: mark(tb, keepB) };
}

type Conflict = {
  yours: string;
  theirs: string;
  by: string;
  at: number;
  /** Arrived after mount: the split opens with motion. */
  fresh: boolean;
};

type Presence = { by: string; at: number; n: number; fresh: boolean };

type Remote = {
  values: DraftValues;
  conflicts: Record<string, Conflict>;
  presence: Record<string, Presence>;
  handled: Set<string>;
  events: RemoteEvent[];
  announcement: string;
};

type RemoteEvent =
  | {
      kind: "conflict";
      field: string;
      yours: string;
      theirs: string;
      by: string;
    }
  | { kind: "applied"; field: string; values: DraftValues };

/**
 * Takes new remote edits. Pure, so it can run in the first render (the server
 * draws an open conflict exactly as the browser does) and again in any render
 * that brings new edits. Reports are queued as events for an effect to send.
 */
function ingest(
  st: Remote,
  edits: DraftRemoteEdit[],
  touched: Set<string>,
  fieldLabel: (id: string) => string,
  nameOf: (id: string) => string,
  fresh: boolean,
): Remote {
  let { values, conflicts, presence, announcement } = st;
  const handled = new Set(st.handled);
  const events = [...st.events];
  for (const e of edits) {
    if (handled.has(e.id)) continue;
    handled.add(e.id);
    const yours = values[e.field] ?? "";
    const open = conflicts[e.field];
    const who = nameOf(e.by);
    if (open) {
      conflicts = {
        ...conflicts,
        [e.field]: { ...open, theirs: e.value, by: e.by, at: e.at },
      };
      continue;
    }
    if (yours === e.value) continue;
    const changedByYou =
      touched.has(e.field) || (e.base !== undefined && yours !== e.base);
    if (changedByYou) {
      conflicts = {
        ...conflicts,
        [e.field]: { yours, theirs: e.value, by: e.by, at: e.at, fresh },
      };
      events.push({
        kind: "conflict",
        field: e.field,
        yours,
        theirs: e.value,
        by: e.by,
      });
      announcement = `${who} also edited ${fieldLabel(e.field)}. Choose a version.`;
    } else {
      values = { ...values, [e.field]: e.value };
      presence = {
        ...presence,
        [e.field]: {
          by: e.by,
          at: e.at,
          n: (presence[e.field]?.n ?? 0) + 1,
          fresh,
        },
      };
      events.push({ kind: "applied", field: e.field, values });
      announcement = `${who} changed ${fieldLabel(e.field)}.`;
    }
  }
  return { values, conflicts, presence, handled, events, announcement };
}

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const CONTROL_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-1";

type Density = { control: string; gap: string; area: number };
const DENSITY: Record<DraftDensity, Density> = {
  compact: { control: "h-8", gap: "gap-y-3.5", area: 2 },
  cozy: { control: "h-9", gap: "gap-y-5", area: 3 },
  roomy: { control: "h-10", gap: "gap-y-7", area: 4 },
};

const TONE: Record<DraftTone, { panel: string; field: string; pane: string }> =
  {
    neutral: {
      panel: "var(--card)",
      field: "var(--background)",
      pane: "var(--bg-2)",
    },
    paper: {
      panel: "color-mix(in oklab, var(--card) 93%, oklch(0.82 0.07 75))",
      field: "color-mix(in oklab, var(--background) 95%, oklch(0.82 0.07 75))",
      pane: "color-mix(in oklab, var(--bg-2) 90%, oklch(0.82 0.07 75))",
    },
    slate: {
      panel: "color-mix(in oklab, var(--card) 93%, oklch(0.62 0.08 250))",
      field: "color-mix(in oklab, var(--background) 95%, oklch(0.62 0.08 250))",
      pane: "color-mix(in oklab, var(--bg-2) 90%, oklch(0.62 0.08 250))",
    },
  };

/* ------------------------------ small parts ------------------------------ */

function Avatar({
  person,
  size = "md",
  fresh = false,
  motionSafe,
  className,
}: {
  person: { name: string; hue: number };
  size?: "sm" | "md";
  fresh?: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <motion.span
      aria-hidden
      title={person.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-(--dk-panel)",
        size === "sm" ? "size-5 text-[9px]" : "size-6 text-[10px]",
        className,
      )}
      style={{
        backgroundColor: `oklch(0.74 0.11 ${person.hue})`,
        color: `oklch(0.24 0.04 ${person.hue})`,
      }}
      initial={fresh && motionSafe ? { y: -14, scale: 0.6, opacity: 0 } : false}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={motionSafe ? springs.recoil : { duration: durations.fast }}
    >
      {initials(person.name)}
    </motion.span>
  );
}

/** A count that rolls a step when it changes. */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [prev, setPrev] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (prev !== value) {
    setPrev(value);
    setDir(value > prev ? 1 : -1);
  }
  return (
    <span
      aria-hidden
      className="relative inline-flex overflow-hidden tabular-nums"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="inline-block"
          initial={{ y: motionSafe ? `${dir * 100}%` : 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{
            y: motionSafe ? `${-dir * 100}%` : 0,
            opacity: 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* --------------------------------- split --------------------------------- */

/**
 * The two versions of one field. A single motion value `x` decides the
 * split: -1 is only yours, 0 is both side by side, 1 is only theirs. The
 * grid's tracks, the gap and each pane's opacity are read from it, so the
 * opening, the keep and the fold are one continuous movement — and the same
 * tracks serve columns on wide layouts and rows on narrow ones.
 */
function Split({
  field,
  conflict,
  who,
  motionSafe,
  disabled,
  resolving,
  uid,
  onKeep,
  onDone,
  bindKeep,
}: {
  field: DraftField;
  conflict: Conflict;
  who: DraftCollaborator;
  motionSafe: boolean;
  disabled: boolean;
  resolving: "yours" | "theirs" | null;
  uid: string;
  onKeep: (side: "yours" | "theirs") => void;
  onDone: () => void;
  bindKeep: (node: HTMLButtonElement | null) => void;
}) {
  const diff = React.useMemo(
    () => diffWords(conflict.yours, conflict.theirs),
    [conflict.yours, conflict.theirs],
  );
  const theirName = possessive(firstName(who.name));
  const tint = `oklch(0.74 0.11 ${who.hue})`;
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const done = React.useRef(onDone);
  React.useEffect(() => {
    done.current = onDone;
  });

  const x = useMotionValue(conflict.fresh && motionSafe ? -1 : 0);
  const tracks = useTransform(x, (v) => {
    const a = v > 0 ? 1 - v : 1;
    const b = v < 0 ? 1 + v : 1;
    return `minmax(0,${r3(a)}fr) minmax(0,${r3(b)}fr)`;
  });
  const gap = useTransform(x, (v) => `${r2(8 * (1 - Math.abs(v)))}px`);
  const yoursOpacity = useTransform(x, (v) => r3(v > 0 ? 1 - v : 1));
  const theirsOpacity = useTransform(x, (v) => r3(v < 0 ? 1 + v : 1));

  // Arriving: theirs grows out of the field on glide. A plain number is
  // animated and written in, so nothing waits on a freshly mounted element.
  React.useEffect(() => {
    if (!conflict.fresh || !motionSafe) return;
    x.jump(-1);
    const r = animate(-1, 0, { ...springs.glide, onUpdate: (v) => x.set(v) });
    return () => r.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeping: the kept side takes the whole field as the other folds away.
  React.useEffect(() => {
    if (!resolving || !motionSafe) return;
    const r = animate(x.get(), resolving === "yours" ? -1 : 1, {
      ...exitFor(durations.slow),
      onUpdate: (v) => x.set(v),
      onComplete: () => done.current(),
    });
    return () => r.stop();
  }, [motionSafe, resolving, x]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    buttons.current[(index + 1) % 2]?.focus();
  };

  const pane = (side: "yours" | "theirs", index: number) => {
    const words = side === "yours" ? diff.a : diff.b;
    const label = side === "yours" ? "Yours" : theirName;
    const keepLabel = side === "yours" ? "Keep yours" : `Keep ${theirName}`;
    return (
      <motion.div
        key={side}
        role="region"
        aria-label={
          side === "yours" ? "Your version" : `${possessive(who.name)} version`
        }
        className="min-w-0 overflow-hidden"
        style={{ opacity: side === "yours" ? yoursOpacity : theirsOpacity }}
      >
        <div
          className="flex h-full flex-col gap-2 rounded-2 border p-2.5 @min-[36rem]:min-w-[13rem]"
          style={{
            backgroundColor: "var(--dk-pane)",
            borderColor:
              side === "theirs"
                ? `color-mix(in oklab, ${tint} 55%, transparent)`
                : "var(--hairline-strong)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
              {side === "theirs" ? (
                <Avatar person={who} size="sm" motionSafe={motionSafe} />
              ) : (
                <PencilLine
                  aria-hidden
                  className="size-3.5 shrink-0 text-ink-3"
                />
              )}
              <span className="truncate">{label}</span>
            </span>
            <button
              ref={(node) => {
                buttons.current[index] = node;
                if (index === 0) bindKeep(node);
              }}
              type="button"
              disabled={disabled}
              aria-disabled={resolving !== null || undefined}
              onClick={() => {
                if (resolving === null) onKeep(side);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center rounded-2 border px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                side === "theirs"
                  ? "border-transparent hover:brightness-95"
                  : "border-hairline-strong bg-card text-foreground hover:bg-surface-2",
                RING,
              )}
              style={
                side === "theirs"
                  ? {
                      backgroundColor: tint,
                      color: `oklch(0.24 0.04 ${who.hue})`,
                    }
                  : undefined
              }
            >
              {keepLabel}
            </button>
          </div>
          <p className="text-[13px] leading-5 text-foreground">
            {words.map((w, k) =>
              w.changed ? (
                <mark
                  key={k}
                  className="rounded-[3px] px-px text-foreground"
                  style={{
                    backgroundColor:
                      side === "theirs"
                        ? `color-mix(in oklab, ${tint} 34%, transparent)`
                        : "color-mix(in oklab, var(--accent-bright) 18%, transparent)",
                  }}
                >
                  {w.t}
                </mark>
              ) : (
                <React.Fragment key={k}>{w.t}</React.Fragment>
              ),
            )}
          </p>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      role="group"
      id={`${uid}-${field.id}-split`}
      aria-label={`${field.label} has two versions`}
      className="grid grid-cols-1 grid-rows-(--dk-tracks) gap-(--dk-gap) @min-[36rem]:grid-cols-(--dk-tracks) @min-[36rem]:grid-rows-1"
      style={{ "--dk-tracks": tracks, "--dk-gap": gap } as MotionStyle}
    >
      {pane("yours", 0)}
      {pane("theirs", 1)}
    </motion.div>
  );
}

/* --------------------------------- form --------------------------------- */

type SaveState = "saved" | "saving" | "error";

/**
 * A long form that keeps itself: edits queue, and `autosaveMs` after your
 * last keystroke they are sent as one save, with an indicator that counts the
 * time since — from the `now` prop on the server, then a ticker that runs only
 * while the panel is on screen and the page is shown. Offline, edits pile up
 * with a count that rolls on `springs.snap`; a failed save keeps the queue and
 * offers Retry; Ctrl or Cmd+S saves now.
 *
 * When someone else edits a field you have also changed, their avatar drops
 * onto it on `springs.recoil` and the field splits along its width on
 * `springs.glide` into yours and theirs, each with the words the other lacks
 * marked. Tab reaches the choice. Keeping one slides it into the whole field
 * as the other folds away on the exit ease, and the field comes back
 * editable with the kept text. An edit to a field you had not touched simply
 * applies, with their avatar and a note. Below 36rem the versions stack and
 * the indicator shrinks to its icon. Under reduced motion the versions
 * cross-fade in and out and avatars appear in place.
 */
export function DraftKeeper({
  values,
  defaultValues,
  onValuesChange,
  fields = defaultDraftFields,
  collaborators = defaultDraftCollaborators,
  incoming = NO_EDITS,
  me = "You",
  online = true,
  onSave,
  onConflict,
  onResolve,
  autosaveMs = 1200,
  lastSaved,
  now = defaultDraftNow,
  indicatorStyle = "pill",
  density = "cozy",
  tone = "neutral",
  title = "Waylight 4.2 launch brief",
  height = 520,
  disabled = false,
  className,
}: DraftKeeperProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const t = TONE[tone] ?? TONE.neutral;

  const people = React.useMemo(
    () => new Map(collaborators.map((c) => [c.id, c])),
    [collaborators],
  );
  const personOf = React.useCallback(
    (id: string): DraftCollaborator =>
      people.get(id) ?? { id, name: "Someone", hue: 260 },
    [people],
  );
  const fieldById = React.useMemo(
    () => new Map(fields.map((f) => [f.id, f])),
    [fields],
  );
  const labelOf = React.useCallback(
    (id: string) => fieldById.get(id)?.label ?? id,
    [fieldById],
  );

  const [touched, setTouched] = React.useState<Set<string>>(() => new Set());
  const [remote, setRemote] = React.useState<Remote>(() =>
    ingest(
      {
        values:
          values ??
          defaultValues ??
          (fields === defaultDraftFields ? defaultDraftValues : {}),
        conflicts: {},
        presence: {},
        handled: new Set(),
        events: [],
        announcement: "",
      },
      incoming,
      new Set(),
      labelOf,
      (id) => personOf(id).name,
      false,
    ),
  );
  // New remote edits are taken in the render that brings them.
  const [seenIncoming, setSeenIncoming] = React.useState(incoming);
  const [announcement, setAnnouncement] = React.useState("");
  if (incoming !== seenIncoming) {
    setSeenIncoming(incoming);
    const next = ingest(
      values !== undefined ? { ...remote, values } : remote,
      incoming,
      touched,
      labelOf,
      (id) => personOf(id).name,
      true,
    );
    setRemote(next);
    if (next.announcement !== remote.announcement)
      setAnnouncement(next.announcement);
  }
  const current = values ?? remote.values;

  const [queue, setQueue] = React.useState<string[]>([]);
  const [saveState, setSaveState] = React.useState<SaveState>("saved");
  const [savedAt, setSavedAt] = React.useState(lastSaved ?? now - 12_000);
  const [elapsed, setElapsed] = React.useState(0);
  const [visible, setVisible] = React.useState(true);
  const [resolving, setResolving] = React.useState<
    Record<string, "yours" | "theirs">
  >({});
  const [backFrom, setBackFrom] = React.useState<Record<string, number>>({});

  const root = React.useRef<HTMLDivElement | null>(null);
  const valuesRef = React.useRef(current);
  const queueRef = React.useRef(queue);
  const onlineRef = React.useRef(online);
  React.useEffect(() => {
    valuesRef.current = current;
    queueRef.current = queue;
    onlineRef.current = online;
  });
  const mountedAt = React.useRef(0);
  const saving = React.useRef(false);
  const again = React.useRef(false);
  const editedWhileSaving = React.useRef(new Set<string>());
  const debounce = React.useRef<number | null>(null);
  const reported = React.useRef(0);
  const keepButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const focusedField = React.useRef<string | null>(null);
  const controls = React.useRef(new Map<string, HTMLElement>());
  const alive = React.useRef(false);

  React.useEffect(() => {
    alive.current = true;
    mountedAt.current = Date.now();
    return () => {
      alive.current = false;
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, []);

  // Remote events are reported once each, after the render that took them.
  React.useEffect(() => {
    const events = remote.events;
    for (let i = reported.current; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      if (e.kind === "conflict") {
        onConflict?.(e.field, e.yours, e.theirs, personOf(e.by));
        // Only a field you were in hands its focus to the choice. The field's
        // control is already gone, so this asks where focus was last seen.
        if (focusedField.current === e.field) {
          window.requestAnimationFrame(() =>
            keepButtons.current.get(e.field)?.focus(),
          );
        }
      } else if (values !== undefined) {
        onValuesChange?.(e.values);
      }
    }
    reported.current = events.length;
  }, [onConflict, onValuesChange, personOf, remote.events, values]);

  // The ticker: once a second while on screen and shown, every 15 s after a
  // minute. Its spoken status never changes per tick.
  React.useEffect(() => {
    const node = root.current;
    if (!node) return;
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      inView = !!entry?.isIntersecting;
      update();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  React.useEffect(() => {
    if (!visible) return;
    let timer = 0;
    const tick = () => {
      const e = Date.now() - mountedAt.current;
      setElapsed(e);
      const age = (now + e - savedAt) / 1000;
      timer = window.setTimeout(tick, age < 60 ? 1000 : 15000);
    };
    timer = window.setTimeout(tick, 1000);
    return () => window.clearTimeout(timer);
  }, [now, savedAt, visible]);

  /* -------------------------------- saving ------------------------------- */

  // The latest save, for the follow-up a finished save schedules.
  const saveRef = React.useRef<() => void>(() => {});

  const save = React.useCallback(() => {
    if (debounce.current) {
      window.clearTimeout(debounce.current);
      debounce.current = null;
    }
    if (saving.current) {
      again.current = true;
      return;
    }
    const ids = queueRef.current;
    if (ids.length === 0 || !onlineRef.current) return;
    saving.current = true;
    editedWhileSaving.current = new Set();
    setSaveState("saving");
    setAnnouncement(
      `Saving ${ids.length === 1 ? "1 change" : `${ids.length} changes`}.`,
    );
    let result: void | Promise<void> = undefined;
    try {
      result = onSave?.(valuesRef.current, ids);
    } catch (error) {
      result = Promise.reject(error);
    }
    Promise.resolve(result).then(
      () => {
        saving.current = false;
        if (!alive.current) return;
        const kept = ids.filter((id) => editedWhileSaving.current.has(id));
        const next = [
          ...new Set([
            ...queueRef.current.filter((id) => !ids.includes(id)),
            ...kept,
          ]),
        ];
        queueRef.current = next;
        setQueue(next);
        setSavedAt(now + Date.now() - mountedAt.current);
        setSaveState("saved");
        setAnnouncement(
          next.length ? "Saved. More changes waiting." : "All changes saved.",
        );
        if (again.current || next.length) {
          again.current = false;
          if (next.length) {
            debounce.current = window.setTimeout(
              () => saveRef.current(),
              autosaveMs,
            );
          }
        }
      },
      () => {
        saving.current = false;
        again.current = false;
        if (!alive.current) return;
        setSaveState("error");
        setAnnouncement(
          `Couldn't save. ${queueRef.current.length === 1 ? "1 change is" : `${queueRef.current.length} changes are`} kept.`,
        );
      },
    );
  }, [autosaveMs, now, onSave]);

  React.useEffect(() => {
    saveRef.current = save;
  });

  // Back online with a queue: send it (on the next tick, not in this render).
  React.useEffect(() => {
    if (!online || queueRef.current.length === 0) return;
    const timer = window.setTimeout(save, 200);
    return () => window.clearTimeout(timer);
  }, [online, save]);

  const enqueue = (id: string) => {
    if (saving.current) editedWhileSaving.current.add(id);
    const next = queueRef.current.includes(id)
      ? queueRef.current
      : [...queueRef.current, id];
    queueRef.current = next;
    setQueue(next);
    if (saveState === "error") setSaveState("saved");
    if (debounce.current) window.clearTimeout(debounce.current);
    if (online) debounce.current = window.setTimeout(save, autosaveMs);
    else {
      setAnnouncement(
        `Offline. ${next.length === 1 ? "1 change" : `${next.length} changes`} queued.`,
      );
    }
  };

  const write = (next: DraftValues) => {
    valuesRef.current = next;
    if (values === undefined) setRemote((prev) => ({ ...prev, values: next }));
    onValuesChange?.(next);
  };

  const edit = (id: string, value: string) => {
    if (disabled) return;
    write({ ...current, [id]: value });
    if (!touched.has(id)) setTouched((prev) => new Set(prev).add(id));
    enqueue(id);
  };

  const keep = (id: string, side: "yours" | "theirs") => {
    const c = remote.conflicts[id];
    if (!c || resolving[id]) return;
    const value = side === "yours" ? (current[id] ?? c.yours) : c.theirs;
    onResolve?.(id, side, value);
    if (side === "theirs") write({ ...current, [id]: value });
    enqueue(id);
    setResolving((prev) => ({ ...prev, [id]: side }));
    setAnnouncement(
      side === "yours"
        ? `Kept your ${labelOf(id).toLowerCase()}.`
        : `Kept ${possessive(personOf(c.by).name)} ${labelOf(id).toLowerCase()}.`,
    );
    if (!motionSafe) finish(id);
  };

  const finish = (id: string) => {
    setRemote((prev) => {
      const conflicts = { ...prev.conflicts };
      delete conflicts[id];
      return { ...prev, conflicts };
    });
    setResolving((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBackFrom((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    window.requestAnimationFrame(() =>
      controls.current.get(id)?.focus({ preventScroll: true }),
    );
  };

  /* ------------------------------ indicator ------------------------------ */

  const hostNow = now + elapsed;
  const count = queue.length;
  const state: "saved" | "pending" | "saving" | "offline" | "error" = !online
    ? "offline"
    : saveState === "saving"
      ? "saving"
      : saveState === "error"
        ? "error"
        : count > 0
          ? "pending"
          : "saved";
  const stateText =
    state === "offline"
      ? count
        ? "queued"
        : "Offline"
      : state === "saving"
        ? "Saving…"
        : state === "error"
          ? "Couldn't save ·"
          : state === "pending"
            ? "Unsaved changes"
            : `Saved · ${ago(hostNow - savedAt)}`;
  const icon =
    state === "offline" ? (
      <CloudOff aria-hidden className="size-3.5 shrink-0" />
    ) : state === "saving" ? (
      <LoaderCircle
        aria-hidden
        className={cn("size-3.5 shrink-0", motionSafe && "animate-spin")}
      />
    ) : state === "error" ? (
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
    ) : state === "pending" ? (
      <PencilLine aria-hidden className="size-3.5 shrink-0" />
    ) : (
      <CloudCheck aria-hidden className="size-3.5 shrink-0" />
    );
  const toneClass =
    state === "error"
      ? "text-danger"
      : state === "offline"
        ? "text-warn"
        : state === "saved"
          ? "text-ink-2"
          : "text-foreground";
  const spoken =
    state === "offline"
      ? `Offline. ${count === 1 ? "1 change" : `${count} changes`} queued.`
      : state === "saving"
        ? "Saving."
        : state === "error"
          ? `Couldn't save. ${count === 1 ? "1 change" : `${count} changes`} kept.`
          : state === "pending"
            ? "Unsaved changes."
            : "All changes saved.";

  const label = (
    <span className="hidden items-center gap-1 whitespace-nowrap @min-[30rem]:inline-flex">
      {state === "offline" ? (
        <>
          Offline · <Roll value={count} motionSafe={motionSafe} /> queued
        </>
      ) : state === "error" ? (
        <>
          Couldn&apos;t save · <Roll value={count} motionSafe={motionSafe} />{" "}
          kept
        </>
      ) : (
        stateText
      )}
    </span>
  );

  const line = useMotionValue(0);
  React.useEffect(() => {
    if (indicatorStyle !== "line") return;
    // Plain numbers written into `line`: the bar may have only just mounted.
    if (state === "saving") {
      line.jump(0.08);
      const r = animate(0.08, 0.8, {
        duration: 2.4,
        ease: [0.12, 0.7, 0.3, 1],
        onUpdate: (v) => line.set(v),
      });
      return () => r.stop();
    }
    // Unsaved shows a stub; offline and failed hold the whole edge.
    const to = state === "saved" ? 0 : state === "pending" ? 0.15 : 1;
    const r = animate(line.get(), to, {
      duration: state === "saved" ? durations.slow : durations.base,
      ease: easings.enter,
      onUpdate: (v) => line.set(v),
    });
    return () => r.stop();
  }, [indicatorStyle, line, state]);

  const retry =
    state === "error" ? (
      <button
        type="button"
        onClick={save}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
          RING,
        )}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Retry
      </button>
    ) : null;

  const indicator = (
    <div className="flex shrink-0 items-center gap-1.5">
      <span
        title={spoken}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 text-[12px] transition-colors",
          toneClass,
          indicatorStyle === "pill" &&
            "h-7 rounded-full border border-hairline px-2 @min-[30rem]:px-2.5",
          indicatorStyle === "pill" &&
            state === "error" &&
            "border-[color-mix(in_oklab,var(--danger)_40%,transparent)]",
          indicatorStyle === "pill" &&
            state === "offline" &&
            "border-[color-mix(in_oklab,var(--warn)_45%,transparent)]",
        )}
        style={
          indicatorStyle === "pill"
            ? { backgroundColor: "var(--dk-field)" }
            : undefined
        }
      >
        {indicatorStyle === "dot" ? (
          <span className="relative inline-flex size-3.5 items-center justify-center">
            <motion.span
              className={cn(
                "size-2 rounded-full",
                state === "saved"
                  ? "bg-success"
                  : state === "error"
                    ? "bg-danger"
                    : state === "offline"
                      ? "bg-warn"
                      : "bg-(--accent-bright)",
              )}
              animate={
                state === "saving" && motionSafe
                  ? { scale: [1, 1.5, 1], opacity: [1, 0.55, 1] }
                  : { scale: 1, opacity: 1 }
              }
              transition={
                state === "saving" && motionSafe
                  ? { duration: 0.9, repeat: Infinity, ease: easings.move }
                  : { duration: durations.fast }
              }
            />
          </span>
        ) : indicatorStyle === "line" ? (
          <span className="inline-flex @min-[30rem]:hidden">{icon}</span>
        ) : (
          icon
        )}
        {label}
      </span>
      {retry}
    </div>
  );

  /* -------------------------------- render ------------------------------- */

  return (
    <div ref={root} className={cn("@container w-full", className)}>
      <div
        className="relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline text-foreground"
        style={
          {
            height,
            backgroundColor: t.panel,
            "--dk-panel": t.panel,
            "--dk-field": t.field,
            "--dk-pane": t.pane,
          } as React.CSSProperties
        }
      >
        {indicatorStyle === "line" ? (
          <motion.span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5",
              state === "error"
                ? "bg-danger"
                : state === "offline"
                  ? "bg-warn"
                  : "bg-(--accent-bright)",
            )}
            style={{ scaleX: line, originX: 0 }}
          />
        ) : null}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-[15px] leading-5 font-semibold"
            >
              {title}
            </h2>
            <p className="text-[12px] leading-4 text-ink-3">
              Shared with{" "}
              {collaborators.map((c) => firstName(c.name)).join(" and ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span
              className="flex items-center -space-x-1.5"
              aria-label={`Editing now: ${[me, ...collaborators.map((c) => c.name)].join(", ")}`}
              role="img"
            >
              <span
                aria-hidden
                title={me}
                className="inline-flex size-6 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background ring-2 ring-(--dk-panel)"
              >
                {initials(me) || "Y"}
              </span>
              {collaborators.map((c) => (
                <Avatar key={c.id} person={c} motionSafe={motionSafe} />
              ))}
            </span>
            {indicator}
          </div>
        </header>

        <form
          noValidate
          aria-labelledby={titleId}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key.toLowerCase() === "s"
            ) {
              event.preventDefault();
              if (queueRef.current.length === 0)
                setAnnouncement("Already saved.");
              save();
            }
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
            <div
              className={cn(
                "grid grid-cols-1 gap-x-4 @min-[36rem]:grid-cols-2",
                d.gap,
              )}
            >
              {fields.map((field) => {
                const id = `${uid}-${field.id}`;
                const conflict = remote.conflicts[field.id];
                const seen = remote.presence[field.id];
                const who = conflict
                  ? personOf(conflict.by)
                  : seen
                    ? personOf(seen.by)
                    : null;
                const value = current[field.id] ?? "";
                const hintId = `${id}-hint`;
                const noteId = `${id}-note`;
                const box = cn(
                  "w-full rounded-2 border border-input text-[13px] text-foreground transition-colors placeholder:text-ink-3 hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60",
                  CONTROL_RING,
                );
                const describedBy =
                  [
                    field.hint ? hintId : null,
                    seen && !conflict ? noteId : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined;
                const bind = (node: HTMLElement | null) => {
                  if (node) controls.current.set(field.id, node);
                };
                const control =
                  field.kind === "textarea" ? (
                    <textarea
                      ref={bind}
                      id={id}
                      rows={d.area}
                      value={value}
                      disabled={disabled}
                      placeholder={field.placeholder}
                      aria-describedby={describedBy}
                      onChange={(e) => edit(field.id, e.currentTarget.value)}
                      className={cn(box, "block resize-y px-3 py-2 leading-5")}
                      style={{ backgroundColor: "var(--dk-field)" }}
                    />
                  ) : field.kind === "select" ? (
                    <span className="relative block">
                      <select
                        ref={bind}
                        id={id}
                        value={value}
                        disabled={disabled}
                        aria-describedby={describedBy}
                        onChange={(e) => edit(field.id, e.currentTarget.value)}
                        className={cn(
                          box,
                          d.control,
                          "appearance-none pr-8 pl-3",
                        )}
                        style={{ backgroundColor: "var(--dk-field)" }}
                      >
                        {(field.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
                      />
                    </span>
                  ) : (
                    <input
                      ref={bind}
                      id={id}
                      type="text"
                      inputMode={field.kind === "date" ? "numeric" : undefined}
                      value={value}
                      disabled={disabled}
                      placeholder={field.placeholder}
                      aria-describedby={describedBy}
                      onChange={(e) => edit(field.id, e.currentTarget.value)}
                      className={cn(
                        box,
                        d.control,
                        "px-3",
                        field.kind === "date" && "font-mono tabular-nums",
                      )}
                      style={{ backgroundColor: "var(--dk-field)" }}
                    />
                  );
                return (
                  <div
                    key={field.id}
                    onFocus={() => {
                      focusedField.current = field.id;
                    }}
                    onBlur={(event) => {
                      const into = event.relatedTarget;
                      if (
                        !(into instanceof Node) ||
                        !event.currentTarget.contains(into)
                      ) {
                        if (focusedField.current === field.id)
                          focusedField.current = null;
                      }
                    }}
                    className={cn(
                      "relative flex min-w-0 flex-col gap-1.5",
                      (field.wide || field.kind === "textarea" || conflict) &&
                        "@min-[36rem]:col-span-2",
                    )}
                  >
                    <div className="flex h-6 items-center justify-between gap-2">
                      {conflict ? (
                        <span className="text-[12.5px] font-medium text-foreground">
                          {field.label}
                        </span>
                      ) : (
                        <label
                          htmlFor={id}
                          className="text-[12.5px] font-medium text-foreground"
                        >
                          {field.label}
                        </label>
                      )}
                      {who ? (
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
                          <span className="hidden truncate @min-[24rem]:inline">
                            {conflict
                              ? `${firstName(who.name)} also edited`
                              : `${firstName(who.name)} edited · ${ago(hostNow - (seen?.at ?? hostNow))}`}
                          </span>
                          <Avatar
                            key={`${field.id}-${conflict ? "c" : "p"}-${seen?.n ?? 0}`}
                            person={who}
                            size="sm"
                            fresh={
                              conflict ? conflict.fresh : (seen?.fresh ?? false)
                            }
                            motionSafe={motionSafe}
                          />
                        </span>
                      ) : null}
                    </div>
                    {conflict ? (
                      <Split
                        field={field}
                        conflict={conflict}
                        who={personOf(conflict.by)}
                        motionSafe={motionSafe}
                        disabled={disabled}
                        resolving={resolving[field.id] ?? null}
                        uid={uid}
                        onKeep={(side) => keep(field.id, side)}
                        onDone={() => finish(field.id)}
                        bindKeep={(node) => {
                          if (node) keepButtons.current.set(field.id, node);
                          else keepButtons.current.delete(field.id);
                        }}
                      />
                    ) : (
                      <motion.div
                        key={`control-${backFrom[field.id] ?? 0}`}
                        className="relative"
                        initial={backFrom[field.id] ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: durations.base,
                          ease: easings.enter,
                        }}
                      >
                        {control}
                        <AnimatePresence>
                          {seen?.fresh ? (
                            <motion.span
                              key={seen.n}
                              aria-hidden
                              className="pointer-events-none absolute inset-0 rounded-2"
                              style={{
                                backgroundColor: `color-mix(in oklab, oklch(0.74 0.11 ${who?.hue ?? 260}) 22%, transparent)`,
                              }}
                              initial={{ opacity: 1 }}
                              animate={{ opacity: 0 }}
                              transition={{
                                duration: 1.1,
                                ease: easings.linear,
                              }}
                            />
                          ) : null}
                        </AnimatePresence>
                      </motion.div>
                    )}
                    {field.hint && !conflict ? (
                      <p
                        id={hintId}
                        className="text-[11.5px] leading-4 text-ink-3"
                      >
                        {field.hint}
                      </p>
                    ) : null}
                    {seen && !conflict ? (
                      <p id={noteId} className="sr-only">
                        {`${who?.name ?? "Someone"} edited this ${ago(hostNow - seen.at)}.`}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-hairline px-4 py-2.5 text-[11.5px] text-ink-3">
            <span>
              <kbd className="rounded-1 border border-hairline px-1 font-mono text-[10.5px]">
                Ctrl S
              </kbd>{" "}
              saves now
            </span>
            <span className="tabular-nums">
              {Object.keys(remote.conflicts).length > 0
                ? `${Object.keys(remote.conflicts).length} to choose`
                : count > 0
                  ? `${count} unsaved`
                  : "Up to date"}
            </span>
          </footer>
        </form>

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <p className="sr-only" role="status">
          {spoken}
        </p>
      </div>
    </div>
  );
}
