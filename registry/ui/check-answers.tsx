"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Check, CircleDashed, RotateCcw, TriangleAlert } from "lucide-react";

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

export type CheckAnswersKind =
  "text" | "email" | "tel" | "number" | "date" | "choice" | "textarea";

export type CheckAnswersField = {
  /** The key in the answers record. */
  id: string;
  label: string;
  /** @default "text" */
  kind?: CheckAnswersKind;
  /** An empty answer marks its row incomplete. @default false */
  required?: boolean;
  placeholder?: string;
  /** Choice kind: the options, as radio buttons. */
  options?: string[];
  /** Number kind: the unit after the value, in the editor and the summary. */
  suffix?: string;
  autoComplete?: string;
  /** Takes the whole editor row. @default true for text areas */
  wide?: boolean;
  /** The error for this answer, or null when it is fine. Runs after the required check. */
  validate?: (value: string, answers: Record<string, string>) => string | null;
};

export type CheckAnswersRow = {
  id: string;
  /** The question, as the summary reads it. */
  label: string;
  /** What Change opens. */
  fields: CheckAnswersField[];
  /** The summary line. @default the answers joined with commas */
  format?: (answers: Record<string, string>) => string;
};

export type CheckAnswersSection = {
  id: string;
  title: string;
  rows: CheckAnswersRow[];
};

export type CheckAnswersDensity = "compact" | "regular" | "roomy";
export type CheckAnswersDivider = "rule" | "dotted" | "zebra";
export type CheckAnswersStatus = "ready" | "loading" | "error";

export type CheckAnswersProps = {
  /** The summary, in order. @default defaultCheckAnswersSections */
  sections?: CheckAnswersSection[];
  /** Controlled answers, by field id. */
  value?: Record<string, string>;
  /** Initial answers when uncontrolled. @default defaultCheckAnswersValues */
  defaultValue?: Record<string, string>;
  /** Fires from the Save that changed answers, with all of them. */
  onChange?: (answers: Record<string, string>) => void;
  /** Change (or Answer) was pressed on a row. */
  onEdit?: (rowId: string) => void;
  /** A row was saved: only the answers it changed, then all of them. Return a promise to hold the row open until it settles; a rejection keeps it open. */
  onSave?: (
    rowId: string,
    changes: Record<string, string>,
    answers: Record<string, string>,
  ) => void | Promise<unknown>;
  /** Send was pressed with every row complete. Return a promise: the progress bar runs until it settles, and a rejection keeps the summary as it was. */
  onSubmit?: (answers: Record<string, string>) => void | Promise<unknown>;
  /** The submission's real progress, 0–1, while sending. Omit it and the bar creeps toward 90% until the promise settles. */
  progress?: number;
  /** How long a saved answer stays highlighted, ms. @default 1400 */
  highlightMs?: number;
  /** @default "Check your answers" */
  heading?: string;
  /** The line under the heading. @default "Permit BW-2026-0815 · Basinworks" */
  reference?: string;
  /** @default "Send application" */
  submitLabel?: string;
  /** Whether the answers have loaded. @default "ready" */
  status?: CheckAnswersStatus;
  /** "Try again" was pressed after the answers failed to load. */
  onRetry?: () => void;
  /** Row padding and type size. @default "regular" */
  density?: CheckAnswersDensity;
  /** Hairlines between rows, dotted rules, or alternate rows tinted. @default "rule" */
  dividerStyle?: CheckAnswersDivider;
  /** Change links, the open row's edge, the highlighter, progress and Send — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The panel's height in px; the sections scroll inside it. @default 540 */
  height?: number;
  /** Nothing can be changed or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2026-11-14" → "14 Nov 2026"; anything else stays as typed. */
const dayLabel = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`;
};

/** A drainage connection permit, at its review step. Two answers are missing. */
export const defaultCheckAnswersSections: CheckAnswersSection[] = [
  {
    id: "applicant",
    title: "Applicant",
    rows: [
      {
        id: "name",
        label: "Full name",
        fields: [
          {
            id: "name",
            label: "Full name",
            required: true,
            autoComplete: "name",
          },
        ],
      },
      {
        id: "email",
        label: "Email",
        fields: [
          {
            id: "email",
            label: "Email",
            kind: "email",
            required: true,
            autoComplete: "email",
            validate: (v) =>
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
                ? null
                : "Use an address like name@example.com",
          },
        ],
      },
      {
        id: "phone",
        label: "Phone",
        fields: [
          { id: "phone", label: "Phone", kind: "tel", autoComplete: "tel" },
        ],
      },
    ],
  },
  {
    id: "site",
    title: "Site",
    rows: [
      {
        id: "address",
        label: "Site address",
        fields: [
          { id: "street", label: "Street", required: true, wide: true },
          { id: "town", label: "Town", required: true },
          {
            id: "postcode",
            label: "Postcode",
            required: true,
            validate: (v) =>
              /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(v.trim())
                ? null
                : "Use a postcode like BW4 7QT",
          },
        ],
        format: (a) =>
          [a.street, a.town, a.postcode?.toUpperCase()]
            .filter((x) => x && x.trim())
            .join("\n"),
      },
      {
        id: "parcel",
        label: "Parcel reference",
        fields: [
          {
            id: "parcel",
            label: "Parcel reference",
            required: true,
            placeholder: "On your land registry plan, e.g. PR-30418",
            validate: (v) =>
              /^PR-?\d{5}$/i.test(v.trim())
                ? null
                : "Use the PR number from your plan, like PR-30418",
          },
        ],
        format: (a) => (a.parcel ?? "").toUpperCase(),
      },
      {
        id: "use",
        label: "Current use",
        fields: [
          {
            id: "use",
            label: "Current use",
            kind: "choice",
            required: true,
            options: ["Residential", "Commercial", "Agricultural", "Vacant"],
          },
        ],
      },
    ],
  },
  {
    id: "works",
    title: "Works",
    rows: [
      {
        id: "connection",
        label: "Connection",
        fields: [
          {
            id: "connection",
            label: "Connection",
            kind: "choice",
            required: true,
            options: ["Surface water", "Foul water", "Combined"],
          },
        ],
      },
      {
        id: "start",
        label: "Planned start",
        fields: [
          { id: "start", label: "Planned start", kind: "date", required: true },
        ],
      },
      {
        id: "depth",
        label: "Excavation depth",
        fields: [
          {
            id: "depth",
            label: "Depth",
            kind: "number",
            suffix: "m",
            required: true,
            validate: (v) => {
              const n = Number(v);
              return Number.isFinite(n) && n >= 0.3 && n <= 6
                ? null
                : "Between 0.3 and 6 metres";
            },
          },
        ],
      },
      {
        id: "contractor",
        label: "Contractor",
        fields: [
          {
            id: "contractor",
            label: "Contractor",
            required: true,
            placeholder: "Who will dig",
          },
        ],
      },
    ],
  },
  {
    id: "declaration",
    title: "Declaration",
    rows: [
      {
        id: "consent",
        label: "Landowner consent",
        fields: [
          {
            id: "consent",
            label: "Landowner consent",
            kind: "choice",
            required: true,
            options: ["I own the land", "I have written consent", "Not yet"],
            validate: (v) =>
              v === "Not yet" ? "Consent is needed before works start" : null,
          },
        ],
      },
    ],
  },
];

export const defaultCheckAnswersValues: Record<string, string> = {
  name: "Ada Mensah",
  email: "ada.mensah@fieldline.co",
  phone: "0161 555 0192",
  street: "4 Weir Cottages, Mill Lane",
  town: "Basin Vale",
  postcode: "BW4 7QT",
  parcel: "",
  use: "Residential",
  connection: "Surface water",
  start: "2026-11-14",
  depth: "1.2",
  contractor: "",
  consent: "I own the land",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FIELD_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring";

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const DENSITY: Record<
  CheckAnswersDensity,
  { pad: string; text: string; gap: string }
> = {
  compact: { pad: "py-2", text: "text-[13px] leading-5", gap: "gap-4" },
  regular: { pad: "py-3", text: "text-[13px] leading-5", gap: "gap-5" },
  roomy: { pad: "py-4", text: "text-sm leading-6", gap: "gap-6" },
};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const listWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

function fieldError(
  f: CheckAnswersField,
  answers: Record<string, string>,
): string | null {
  const v = answers[f.id] ?? "";
  if (v.trim() === "")
    return f.required ? `Enter ${f.label.toLowerCase()}` : null;
  return f.validate ? f.validate(v, answers) : null;
}

const rowComplete = (row: CheckAnswersRow, answers: Record<string, string>) =>
  row.fields.every((f) => fieldError(f, answers) === null);

function summaryOf(row: CheckAnswersRow, answers: Record<string, string>) {
  if (row.format) return row.format(answers);
  return row.fields
    .map((f) => {
      const v = (answers[f.id] ?? "").trim();
      if (!v) return "";
      if (f.kind === "date") return dayLabel(v);
      if (f.suffix) return `${v} ${f.suffix}`;
      return v;
    })
    .filter(Boolean)
    .join(", ");
}

/** A number whose digits roll toward the direction it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (seen !== value) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }
  return (
    <span
      aria-hidden
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${String(value).length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={value}
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
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * A highlighter stroke behind a value that was just saved: it sweeps in from
 * the left on snap (clamped, so the overshoot never paints past the end),
 * holds, then fades. Under reduced motion it is simply there, then fades.
 */
function Highlight({
  motionSafe,
  holdMs,
}: {
  motionSafe: boolean;
  holdMs: number;
}) {
  const sweep = useMotionValue(motionSafe ? 0 : 1);
  const fade = useMotionValue(1);
  React.useEffect(() => {
    const a = motionSafe ? animate(sweep, 1, springs.snap) : null;
    const b = animate(fade, 0, {
      delay: Math.max(0, holdMs - 600) / 1000,
      duration: 0.6,
      ease: easings.move,
    });
    return () => {
      a?.stop();
      b.stop();
    };
  }, [motionSafe, holdMs, sweep, fade]);
  const clip = useTransform(
    sweep,
    (v) => `inset(0 ${r1((1 - clamp01(v)) * 100)}% 0 0)`,
  );
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute -inset-x-1 inset-y-0 rounded-1 bg-(--ca-mark)"
      style={{ clipPath: clip, opacity: fade }}
    />
  );
}

/** A box whose height follows its content on glide, measured. */
function Measured({
  glide,
  children,
}: {
  glide: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [h, setH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setH(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: glide && h !== null ? h : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      // Clipped while it glides, with room for focus rings at the edges.
      style={{ overflow: "clip", overflowClipMargin: 6 }}
    >
      <div ref={setNode} className="relative">
        {children}
      </div>
    </motion.div>
  );
}

type Flash = { rowId: string; n: number };
type Sending = "idle" | "pending" | "sent" | "failed";

/* ----------------------------------------------------------------------- */
/*                                The review                                */
/* ----------------------------------------------------------------------- */

/**
 * The review step of a long form, read as a summary: sections of questions
 * and answers, each with a Change link. Change opens that row in place —
 * its measured height glides open, the answer lifts away on the exit ease
 * and the row's fields arrive in a cascade on snap while an accent edge
 * grows down its side — and Save closes it again with the new answer
 * landing on flick over a highlighter stroke that sweeps in on snap and
 * fades. Nothing leaves the page, and focus goes to the first field on the
 * way in and back to Change on the way out.
 *
 * Unanswered questions read "Not answered" and offer Answer instead of
 * Change; Send refuses while any remain and takes you to the first. A send
 * runs a progress bar (the host's `progress`, or an eased creep toward 90%)
 * while each section's tick draws as the bar passes it; success lands a
 * receipt on recoil, and failure keeps every answer and says so. Every
 * Change, Save and Cancel is a real button, Enter saves an open row and
 * Escape cancels it. Under reduced motion rows open and close at once, the
 * highlight simply appears and fades, and the bar still fills.
 */
export function CheckAnswers({
  sections = defaultCheckAnswersSections,
  value,
  defaultValue,
  onChange,
  onEdit,
  onSave,
  onSubmit,
  progress,
  highlightMs = 1400,
  heading = "Check your answers",
  reference = "Permit BW-2026-0815 · Basinworks",
  submitLabel = "Send application",
  status = "ready",
  onRetry,
  density = "regular",
  dividerStyle = "rule",
  accent = "var(--accent-bright)",
  height = 540,
  disabled = false,
  className,
}: CheckAnswersProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const headingId = `${uid}-heading`;
  const ready = status === "ready";
  const d = DENSITY[density] ?? DENSITY.regular;

  const [own, setOwn] = React.useState<Record<string, string>>(
    () => defaultValue ?? defaultCheckAnswersValues,
  );
  const answers = value ?? own;

  const [drafts, setDrafts] = React.useState<
    Record<string, Record<string, string>>
  >({});
  const [shown, setShown] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [saveFailed, setSaveFailed] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [flash, setFlash] = React.useState<Flash | null>(null);
  const [sending, setSending] = React.useState<Sending>("idle");
  const [passed, setPassed] = React.useState(0);
  const [attempted, setAttempted] = React.useState(false);
  const [focusAsk, setFocusAsk] = React.useState<{
    selector: string;
    n: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const sent = sending === "sent";
  const locked = disabled || !ready || sent || sending === "pending";
  const rows = sections.flatMap((s) => s.rows);
  const openIds = Object.keys(drafts);
  const incomplete = rows.filter((r) => !rowComplete(r, answers));
  const answered = rows.length - incomplete.length;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const alive = React.useRef(false);
  const bar = useMotionValue(0);
  const barRun = React.useRef<AnimationPlaybackControls | null>(null);
  const barWidth = useTransform(bar, (v) => `${r1(clamp01(v) * 100)}%`);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      barRun.current?.stop();
    };
  }, []);

  // Each section's tick draws as the bar passes its share of the way.
  useMotionValueEvent(bar, "change", (v) => {
    const n = Math.min(
      sections.length,
      Math.floor(clamp01(v) * (sections.length + 0.4)),
    );
    if (n !== passed) setPassed(n);
  });

  // A host that reports real progress drives the bar directly.
  React.useEffect(() => {
    if (sending !== "pending" || progress === undefined) return;
    barRun.current?.stop();
    barRun.current = animate(
      bar,
      clamp01(progress),
      motionSafe ? springs.glide : { duration: 0 },
    );
  }, [progress, sending, motionSafe, bar]);

  React.useEffect(() => {
    if (!focusAsk) return;
    rootRef.current?.querySelector<HTMLElement>(focusAsk.selector)?.focus();
  }, [focusAsk]);

  const ask = (selector: string) =>
    setFocusAsk((f) => ({ selector, n: (f?.n ?? 0) + 1 }));

  /* ------------------------------ actions ------------------------------- */

  const openRow = (row: CheckAnswersRow) => {
    if (locked) return;
    const draft: Record<string, string> = {};
    for (const f of row.fields) draft[f.id] = answers[f.id] ?? "";
    setDrafts((all) => ({ ...all, [row.id]: draft }));
    setShown((s) => ({ ...s, [row.id]: false }));
    setSaveFailed((s) => {
      if (!s.has(row.id)) return s;
      const n = new Set(s);
      n.delete(row.id);
      return n;
    });
    if (flash?.rowId === row.id) setFlash(null);
    onEdit?.(row.id);
    ask(`[data-ca-editor="${CSS.escape(row.id)}"] [data-ca-input]`);
  };

  const closeRow = (rowId: string) => {
    setDrafts((all) => {
      const rest = { ...all };
      delete rest[rowId];
      return rest;
    });
    setShown((s) => {
      const rest = { ...s };
      delete rest[rowId];
      return rest;
    });
    ask(`[data-ca-change="${CSS.escape(rowId)}"]`);
  };

  const cancelRow = (row: CheckAnswersRow) => {
    closeRow(row.id);
    say(`${row.label} unchanged.`);
  };

  const saveRow = (row: CheckAnswersRow) => {
    const draft = drafts[row.id];
    if (!draft || saving.has(row.id)) return;
    const merged = { ...answers, ...draft };
    const bad = row.fields.filter((f) => fieldError(f, merged));
    if (bad.length > 0) {
      setShown((s) => ({ ...s, [row.id]: true }));
      const first = bad[0];
      say(`${row.label}: ${first ? fieldError(first, merged) : ""}.`);
      if (first) {
        ask(
          `[data-ca-editor="${CSS.escape(row.id)}"] [data-ca-field="${CSS.escape(first.id)}"] [data-ca-input]`,
        );
      }
      return;
    }
    const changes: Record<string, string> = {};
    for (const f of row.fields) {
      if ((answers[f.id] ?? "") !== (draft[f.id] ?? "")) {
        changes[f.id] = draft[f.id] ?? "";
      }
    }
    const land = () => {
      if (Object.keys(changes).length > 0) {
        if (value === undefined) setOwn((o) => ({ ...o, ...changes }));
        onChange?.(merged);
        setFlash((f) => ({ rowId: row.id, n: (f?.n ?? 0) + 1 }));
        say(
          `${row.label} saved: ${summaryOf(row, merged).replace(/\n/g, ", ")}.`,
        );
      } else {
        say(`${row.label} unchanged.`);
      }
      if (sending === "failed") setSending("idle");
      closeRow(row.id);
    };
    if (Object.keys(changes).length === 0) {
      land();
      return;
    }
    const result = onSave?.(row.id, changes, merged);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaving((s) => new Set(s).add(row.id));
      say(`Saving ${row.label}.`);
      (result as Promise<unknown>).then(
        () => {
          if (!alive.current) return;
          setSaving((s) => {
            const n = new Set(s);
            n.delete(row.id);
            return n;
          });
          land();
        },
        () => {
          if (!alive.current) return;
          setSaving((s) => {
            const n = new Set(s);
            n.delete(row.id);
            return n;
          });
          setSaveFailed((s) => new Set(s).add(row.id));
          say(`${row.label} didn't save. It is still open.`);
        },
      );
    } else land();
  };

  const submit = () => {
    if (disabled || !ready || sent || sending === "pending") return;
    setAttempted(true);
    const open = rows.filter((r) => drafts[r.id]);
    if (open.length > 0) {
      const first = open[0];
      say(
        `Save or cancel ${listWords(open.map((r) => r.label.toLowerCase()))} first.`,
      );
      if (first) {
        ask(`[data-ca-editor="${CSS.escape(first.id)}"] [data-ca-input]`);
      }
      return;
    }
    if (incomplete.length > 0) {
      say(
        `${plural(incomplete.length, "answer is", "answers are")} missing: ${listWords(incomplete.map((r) => r.label))}.`,
      );
      const first = incomplete[0];
      if (first) ask(`[data-ca-change="${CSS.escape(first.id)}"]`);
      return;
    }
    barRun.current?.stop();
    bar.jump(0);
    setPassed(0);
    const result = onSubmit?.(answers);
    const finish = (ok: boolean) => {
      if (!alive.current) return;
      barRun.current?.stop();
      if (ok) {
        barRun.current = animate(
          bar,
          1,
          motionSafe ? springs.glide : { duration: 0 },
        );
        setSending("sent");
        say(`Application sent. ${reference}.`);
        // The receipt is at the top of the summary: bring it, and focus, there.
        ask("[data-ca-receipt]");
      } else {
        barRun.current = animate(bar, 0, {
          duration: durations.slow,
          ease: easings.exit,
        });
        setSending("failed");
        say("It didn't send. Every answer is kept; try again.");
      }
    };
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSending("pending");
      say("Sending your application.");
      if (progress === undefined) {
        // No real progress from the host: an honest creep that never claims
        // to be done, finished only by the promise.
        barRun.current = animate(bar, 0.9, {
          duration: motionSafe ? 5 : 0.01,
          ease: easings.enter,
        });
      }
      (result as Promise<unknown>).then(
        () => finish(true),
        () => finish(false),
      );
    } else finish(true);
  };

  /* ------------------------------- render ------------------------------- */

  const dividerFor = (i: number, last: boolean) =>
    dividerStyle === "zebra"
      ? i % 2 === 1
        ? "-mx-2 rounded-2 bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-2"
        : "-mx-2 px-2"
      : last
        ? ""
        : dividerStyle === "dotted"
          ? "border-b border-dotted border-hairline-strong"
          : "border-b border-hairline";

  const control = (
    row: CheckAnswersRow,
    f: CheckAnswersField,
    draft: Record<string, string>,
    error: string | null,
  ) => {
    const kind = f.kind ?? "text";
    const id = `${uid}-${row.id}-${f.id}`;
    const errId = `${id}-error`;
    const v = draft[f.id] ?? "";
    const set = (text: string) =>
      setDrafts((all) => ({
        ...all,
        [row.id]: { ...(all[row.id] ?? {}), [f.id]: text },
      }));
    const box = cn(
      "w-full rounded-2 border bg-card text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:opacity-60",
      error ? "border-danger/70" : "border-hairline-strong",
      FIELD_RING,
    );
    if (kind === "choice") {
      return (
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? errId : undefined}
          className="flex flex-wrap gap-1.5"
        >
          {(f.options ?? []).map((o, i) => (
            <label key={o} className="relative inline-flex">
              <input
                type="radio"
                name={id}
                value={o}
                checked={v === o}
                data-ca-input={
                  v === o || (i === 0 && !(f.options ?? []).includes(v))
                    ? ""
                    : undefined
                }
                onChange={() => set(o)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-[12px] transition-colors",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-focus-visible:outline-solid",
                  v === o
                    ? "border-(--ca-accent) bg-(--ca-wash) font-medium text-foreground"
                    : "border-hairline-strong text-ink-2 hover:text-foreground",
                )}
              >
                {o}
              </span>
            </label>
          ))}
        </div>
      );
    }
    if (kind === "textarea") {
      return (
        <textarea
          id={id}
          data-ca-input=""
          value={v}
          rows={3}
          placeholder={f.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => set(e.currentTarget.value)}
          className={cn(box, "resize-none px-3 py-2 leading-5")}
        />
      );
    }
    return (
      <div className="relative">
        <input
          id={id}
          data-ca-input=""
          type={
            kind === "email"
              ? "email"
              : kind === "tel"
                ? "tel"
                : kind === "date"
                  ? "date"
                  : "text"
          }
          inputMode={kind === "number" ? "decimal" : undefined}
          value={v}
          placeholder={f.placeholder}
          autoComplete={f.autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => set(e.currentTarget.value)}
          className={cn(box, "h-9 px-3", f.suffix && "pr-9 tabular-nums")}
        />
        {f.suffix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-ink-3"
          >
            {f.suffix}
          </span>
        ) : null}
      </div>
    );
  };

  const editor = (row: CheckAnswersRow, labelId: string) => {
    const draft = drafts[row.id] ?? {};
    const merged = { ...answers, ...draft };
    const busy = saving.has(row.id);
    const step = cascade(row.fields.length + 1);
    return (
      <form
        noValidate
        data-ca-editor={row.id}
        role="group"
        aria-labelledby={labelId}
        onSubmit={(e) => {
          e.preventDefault();
          saveRow(row);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            // Ours: the row closes, and nothing behind it.
            e.preventDefault();
            e.stopPropagation();
            cancelRow(row);
          }
        }}
        className="@container/check-answers-editor flex flex-col gap-3 pt-1 pb-1"
      >
        <div className="grid grid-cols-1 gap-3 @min-[24rem]/check-answers-editor:grid-cols-2">
          {row.fields.map((f, i) => {
            const error = shown[row.id] ? fieldError(f, merged) : null;
            const id = `${uid}-${row.id}-${f.id}`;
            return (
              <motion.div
                key={f.id}
                data-ca-field={f.id}
                className={cn(
                  "flex min-w-0 flex-col gap-1.5",
                  (f.wide ?? (f.kind === "textarea" || f.kind === "choice")) &&
                    "@min-[24rem]/check-answers-editor:col-span-2",
                  row.fields.length === 1 &&
                    "@min-[24rem]/check-answers-editor:col-span-2",
                )}
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? {
                        y: { ...springs.snap, delay: i * step },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: i * step,
                        },
                      }
                    : { duration: durations.fast }
                }
              >
                {f.kind === "choice" ? (
                  <span
                    id={`${id}-label`}
                    className="text-[12px] font-medium text-ink-2"
                  >
                    {f.label}
                  </span>
                ) : (
                  <label
                    htmlFor={id}
                    className="text-[12px] font-medium text-ink-2"
                  >
                    {f.label}
                  </label>
                )}
                {control(row, f, draft, error)}
                {error ? (
                  <p
                    id={`${id}-error`}
                    className="flex items-center gap-1.5 text-[12px] text-danger"
                  >
                    <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                    {error}
                  </p>
                ) : null}
              </motion.div>
            );
          })}
        </div>
        <motion.div
          className="flex flex-wrap items-center gap-2"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? {
                  y: { ...springs.snap, delay: row.fields.length * step },
                  opacity: {
                    duration: durations.base,
                    delay: row.fields.length * step,
                  },
                }
              : { duration: durations.fast }
          }
        >
          <button
            type="submit"
            aria-busy={busy || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90",
              FOCUS_RING,
            )}
            style={{
              backgroundColor: "oklch(from var(--ca-accent) 0.52 c h)",
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => cancelRow(row)}
            className={cn(
              "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Cancel
          </button>
          {saveFailed.has(row.id) ? (
            <span className="flex items-center gap-1.5 text-[12px] text-danger">
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              Didn&apos;t save. Try again.
            </span>
          ) : (
            <span className="hidden text-[11px] text-ink-3 @min-[24rem]/check-answers-editor:inline">
              Enter saves · Esc cancels
            </span>
          )}
        </motion.div>
      </form>
    );
  };

  const rowView = (row: CheckAnswersRow, i: number, last: boolean) => {
    const open = !!drafts[row.id];
    const done = rowComplete(row, answers);
    const text = summaryOf(row, answers);
    const labelId = `${uid}-${row.id}-label`;
    const flashing = flash?.rowId === row.id && !open;
    const missingHere = !done && attempted;
    return (
      <li key={row.id} className={cn("relative", dividerFor(i, last))}>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.span
              key="edge"
              aria-hidden
              className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-full bg-(--ca-accent)"
              style={{ originY: 0 }}
              initial={{ scaleY: motionSafe ? 0 : 1, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      scaleY: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            />
          ) : null}
        </AnimatePresence>
        <Measured glide={motionSafe}>
          <div
            className={cn(
              "relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 [grid-template-areas:'label_action'_'value_value']",
              "@min-[30rem]/check-answers:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] @min-[30rem]/check-answers:[grid-template-areas:'label_value_action']",
              d.pad,
              d.text,
            )}
          >
            <span
              id={labelId}
              className={cn(
                "min-w-0 font-medium [grid-area:label]",
                open ? "text-foreground" : "text-ink-2",
              )}
            >
              {row.label}
            </span>
            {open ? (
              <div className="min-w-0 [grid-area:value] @min-[30rem]/check-answers:[grid-column:2/4]">
                {editor(row, labelId)}
              </div>
            ) : (
              <>
                <div className="min-w-0 [grid-area:value]">
                  {done || text ? (
                    <motion.span
                      key={flashing ? `flash-${flash?.n}` : "still"}
                      className="relative inline-block max-w-full break-words whitespace-pre-line text-foreground"
                      initial={
                        flashing
                          ? {
                              opacity: 0.4,
                              y: motionSafe ? -distances.nudge : 0,
                            }
                          : false
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              y: springs.flick,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {flashing ? (
                        <Highlight
                          key={flash?.n}
                          motionSafe={motionSafe}
                          holdMs={highlightMs}
                        />
                      ) : null}
                      <span className="relative">{text}</span>
                      {!done ? (
                        <span className="relative mt-0.5 flex items-center gap-1.5 text-[12px] text-warn">
                          <TriangleAlert
                            aria-hidden
                            className="size-3.5 shrink-0"
                          />
                          Needs another look
                        </span>
                      ) : null}
                    </motion.span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        missingHere ? "text-danger" : "text-warn",
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full bg-current"
                      />
                      Not answered
                    </span>
                  )}
                </div>
                <div className="self-start justify-self-end [grid-area:action]">
                  <button
                    type="button"
                    data-ca-change={row.id}
                    aria-disabled={locked || undefined}
                    onClick={() => openRow(row)}
                    className={cn(
                      "-my-1 inline-flex h-7 items-center rounded-2 px-2 text-[12px] font-medium whitespace-nowrap text-(--ca-accent) underline-offset-2 transition-colors hover:bg-(--ca-wash) hover:underline aria-disabled:opacity-45 aria-disabled:hover:bg-transparent aria-disabled:hover:no-underline",
                      FOCUS_RING,
                    )}
                  >
                    {done ? "Change" : "Answer"}
                    <span className="sr-only"> {row.label.toLowerCase()}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </Measured>
      </li>
    );
  };

  const sectionView = (section: CheckAnswersSection, si: number) => {
    const missing = section.rows.filter((r) => !rowComplete(r, answers)).length;
    const ticked = (sending === "pending" || sent) && passed > si;
    return (
      <section
        key={section.id}
        aria-labelledby={`${uid}-${section.id}`}
        className="flex flex-col"
      >
        <div className="flex items-center gap-2 pb-1">
          <h3
            id={`${uid}-${section.id}`}
            className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase"
          >
            {section.title}
          </h3>
          <span className="h-px flex-1 bg-hairline" aria-hidden />
          <AnimatePresence initial={false} mode="popLayout">
            {ticked ? (
              <motion.span
                key="tick"
                className="inline-flex size-5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success"
                initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.flick,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <svg aria-hidden viewBox="0 0 16 16" className="size-3">
                  <motion.path
                    d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: motionSafe ? 0 : 1 }}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
                <span className="sr-only">{section.title} checked</span>
              </motion.span>
            ) : missing > 0 ? (
              <motion.span
                key="missing"
                className="inline-flex h-5 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] px-2 text-[11px] font-medium text-warn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              >
                {missing} to answer
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
        <ul role="list" className="m-0 flex list-none flex-col p-0">
          {section.rows.map((row, i) =>
            rowView(row, i, i === section.rows.length - 1),
          )}
        </ul>
      </section>
    );
  };

  const banner =
    sending === "sent" ? (
      <motion.div
        key="sent"
        data-ca-receipt=""
        tabIndex={-1}
        className="flex items-start gap-3 rounded-3 border border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,var(--card))] px-3 py-3 outline-none"
        initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.recoil, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success">
          <Check aria-hidden className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-foreground">
            Application sent
          </span>
          <span className="block text-[12px] text-ink-2">
            {reference}. We&apos;ll email the decision within 10 working days.
          </span>
        </span>
      </motion.div>
    ) : sending === "failed" ? (
      <div className="flex items-start gap-2 rounded-3 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))] px-3 py-2.5 text-[12px] text-danger">
        <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          It didn&apos;t send. Every answer is kept; try again when you&apos;re
          ready.
        </span>
      </div>
    ) : null;

  const outcome =
    sending === "pending"
      ? progress === undefined
        ? "Sending…"
        : `Sending · ${Math.round(clamp01(progress) * 100)}%`
      : sent
        ? "Sent"
        : sending === "failed"
          ? "Didn't send · nothing lost"
          : openIds.length > 0
            ? `${plural(openIds.length, "answer", "answers")} open`
            : incomplete.length > 0
              ? `${plural(incomplete.length, "answer", "answers")} missing`
              : "Ready to send";

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={headingId}
      aria-busy={status === "loading" || sending === "pending" || undefined}
      className={cn(
        "@container/check-answers relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--ca-accent" as string]: accent,
        ["--ca-wash" as string]: `color-mix(in oklab, ${accent} 10%, transparent)`,
        ["--ca-mark" as string]: `color-mix(in oklab, ${accent} 22%, transparent)`,
      }}
    >
      <header className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-[8rem] flex-1">
          <h2 id={headingId} className="truncate text-sm font-semibold">
            {heading}
          </h2>
          <p className="truncate text-[11px] text-ink-3">{reference}</p>
        </div>
        {ready ? (
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-1 px-2.5 text-[11px] text-ink-2">
            <span className="font-mono font-medium text-foreground">
              <Rolling value={answered} motionSafe={motionSafe} />
            </span>
            <span aria-hidden>of {rows.length} answered</span>
            <span className="sr-only">
              {answered} of {rows.length} answered
            </span>
          </span>
        ) : null}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden transition-opacity",
            sending === "pending" || sent ? "opacity-100" : "opacity-0",
          )}
        >
          <motion.span
            className="absolute inset-y-0 left-0 bg-(--ca-accent)"
            style={{ width: barWidth }}
          />
        </span>
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            Your answers didn&apos;t load.
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
      ) : (
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          <div className={cn("flex flex-col px-5 py-4", d.gap)}>
            {banner}
            {status === "loading"
              ? [0, 1].map((s) => (
                  <div key={s} aria-hidden className="flex flex-col gap-3">
                    <span className="h-2.5 w-20 rounded-full bg-surface-2" />
                    {[0, 1, 2].map((r) => (
                      <span
                        key={r}
                        className="h-5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                        style={{ width: `${55 + (((s * 3 + r) * 17) % 40)}%` }}
                      />
                    ))}
                  </div>
                ))
              : sections.map((s, i) => sectionView(s, i))}
          </div>
        </div>
      )}

      {status !== "error" ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
          <p
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px]",
              sent
                ? "text-success"
                : sending === "failed"
                  ? "text-danger"
                  : incomplete.length > 0 || openIds.length > 0
                    ? "text-warn"
                    : "text-ink-2",
            )}
          >
            {sent ? (
              <Check aria-hidden className="size-3.5" />
            ) : sending === "failed" ? (
              <TriangleAlert aria-hidden className="size-3.5" />
            ) : incomplete.length > 0 || openIds.length > 0 ? (
              <CircleDashed aria-hidden className="size-3.5" />
            ) : null}
            {outcome}
          </p>
          <button
            type="button"
            onClick={submit}
            aria-disabled={
              disabled || !ready || sent || sending === "pending" || undefined
            }
            aria-busy={sending === "pending" || undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-2 px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 aria-disabled:opacity-50",
              FOCUS_RING,
            )}
            style={{ backgroundColor: "oklch(from var(--ca-accent) 0.52 c h)" }}
          >
            {sending === "pending" ? (
              <motion.span
                aria-hidden
                className="size-3 rounded-full border-2 border-white/40 border-t-white"
                animate={motionSafe ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  motionSafe
                    ? { duration: 0.8, ease: "linear", repeat: Infinity }
                    : { duration: 0 }
                }
              />
            ) : sent ? (
              <Check aria-hidden className="size-4" />
            ) : null}
            {sending === "pending" ? "Sending" : sent ? "Sent" : submitLabel}
          </button>
        </footer>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
