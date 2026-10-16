"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { Check, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThreadQuestionKind =
  "choice" | "multi" | "text" | "textarea" | "number" | "email";

export type ThreadOption = { value: string; label: string; hint?: string };

export type ThreadQuestion = {
  /** Unique across the form. */
  id: string;
  label: string;
  kind: ThreadQuestionKind;
  /** Choices for the choice (one) and multi (any) kinds. */
  options?: ThreadOption[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

export type ThreadCondition = {
  /** The question whose answer decides. */
  when: string;
  /** The answer, or any of the answers, that reveal `show`. */
  is: string | string[];
  /** Questions that appear beneath it, in order. */
  show: string[];
};

export type ThreadValue = string | string[];
export type ThreadValues = Record<string, ThreadValue>;
export type ThreadStyle = "elbow" | "curve" | "stitch";

export type ThreadFieldsProps = {
  /** Every question, top-level and follow-up. @default defaultThreadQuestions (a Coldbrook Studios booking) */
  questions?: ThreadQuestion[];
  /** Which answers reveal which follow-ups. A question named in any `show` is a follow-up; the rest are top-level. @default defaultThreadConditions */
  conditions?: ThreadCondition[];
  /** Controlled answers, including those of hidden follow-ups, which are kept. */
  values?: ThreadValues;
  /** Initial answers when uncontrolled. @default {} */
  defaultValues?: ThreadValues;
  /** Fires from the edit that changed the answers, with all of them (hidden ones included). */
  onValuesChange?: (values: ThreadValues) => void;
  /** Fires from each edit with the question, its value and only the answers now visible. */
  onChange?: (id: string, value: ThreadValue, visible: ThreadValues) => void;
  /** Follow-ups appeared, with their ids and the question whose answer revealed them. */
  onReveal?: (ids: string[], by: string) => void;
  /** Submit with every visible required answer given; receives only visible answers. A promise shows progress; a rejection keeps everything. */
  onSubmit?: (answers: ThreadValues) => void | Promise<void>;
  /** How the thread is drawn: square turns, a single swoop to each follow-up, or tacking stitches. @default "elbow" */
  threadStyle?: ThreadStyle;
  /** How far follow-ups sit in, in px — the gutter the thread runs in. Capped at 16 below 34rem. @default 24 */
  indent?: number;
  /** The chosen option, the thread and its beads, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The form's heading and accessible name. @default "Book a studio" */
  title?: string;
  /** A quiet line under the heading. @default "Coldbrook Studios · Fernworks Row" */
  subtitle?: string;
  /** @default "Request booking" */
  submitLabel?: string;
  /** Panel height in px; the form scrolls inside it. @default 520 */
  height?: number;
  /** Loading draws placeholder questions. @default "ready" */
  status?: "ready" | "loading";
  /** Nothing can be answered or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- data --------------------------------- */

/** A booking for Coldbrook Studios: twelve questions, seven of them follow-ups. */
export const defaultThreadQuestions: ThreadQuestion[] = [
  {
    id: "booking",
    label: "What are you booking?",
    kind: "choice",
    required: true,
    options: [
      { value: "studio", label: "Studio day", hint: "One bench, 9 to 6" },
      { value: "workshop", label: "Workshop", hint: "Teach a group" },
      { value: "event", label: "Private event", hint: "Evenings only" },
    ],
  },
  {
    id: "size",
    label: "How many people?",
    kind: "number",
    required: true,
    placeholder: "12",
    hint: "Up to 16 in the print room.",
  },
  {
    id: "equipment",
    label: "Do you need equipment?",
    kind: "choice",
    required: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "kit",
    label: "Which equipment?",
    kind: "multi",
    required: true,
    options: [
      { value: "press", label: "Etching press" },
      { value: "kiln", label: "Kiln time" },
      { value: "projector", label: "Projector" },
      { value: "aprons", label: "Aprons and gloves" },
    ],
  },
  {
    id: "food",
    label: "Will there be food?",
    kind: "choice",
    required: true,
    options: [
      { value: "kitchen", label: "Our kitchen" },
      { value: "outside", label: "Outside caterer" },
      { value: "none", label: "No food" },
    ],
  },
  {
    id: "caterer",
    label: "Caterer's name",
    kind: "text",
    required: true,
    placeholder: "Basin Street Kitchen",
  },
  {
    id: "rating",
    label: "Food hygiene rating",
    kind: "text",
    placeholder: "5",
    hint: "We ask every outside caterer.",
  },
  {
    id: "date",
    label: "Preferred date",
    kind: "text",
    required: true,
    placeholder: "Sat 21 Nov",
  },
  {
    id: "access",
    label: "Will anyone need step-free access?",
    kind: "choice",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "accessNotes",
    label: "Tell us what would help",
    kind: "textarea",
    placeholder: "A ramp at the side door, a seat by the press…",
  },
  { id: "name", label: "Your name", kind: "text", required: true },
  {
    id: "email",
    label: "Email",
    kind: "email",
    required: true,
    placeholder: "you@studio.net",
  },
];

export const defaultThreadConditions: ThreadCondition[] = [
  { when: "booking", is: "workshop", show: ["size", "equipment"] },
  { when: "equipment", is: "yes", show: ["kit"] },
  { when: "booking", is: "event", show: ["food"] },
  { when: "food", is: "outside", show: ["caterer", "rating"] },
  { when: "access", is: "yes", show: ["accessNotes"] },
];

/* ------------------------------- helpers -------------------------------- */

const matches = (value: ThreadValue | undefined, is: string | string[]) => {
  const wanted = Array.isArray(is) ? is : [is];
  if (Array.isArray(value)) return value.some((v) => wanted.includes(v));
  return value !== undefined && value !== "" && wanted.includes(value);
};

const isEmpty = (value: ThreadValue | undefined) =>
  Array.isArray(value) ? value.length === 0 : (value ?? "").trim() === "";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkQuestion(q: ThreadQuestion, value: ThreadValue | undefined) {
  if (isEmpty(value)) {
    if (!q.required) return null;
    return q.kind === "choice"
      ? "Pick one"
      : q.kind === "multi"
        ? "Pick at least one"
        : "Fill this in";
  }
  const text = Array.isArray(value) ? "" : (value ?? "").trim();
  if (q.kind === "number" && !/^\d+$/.test(text)) return "Use a whole number";
  if (q.kind === "email" && !EMAIL.test(text))
    return "Add the part after the @";
  return null;
}

/** Every question now on the page, in reading order. */
function visibleIds(
  questions: ThreadQuestion[],
  conditions: ThreadCondition[],
  values: ThreadValues,
): string[] {
  const shown = new Set(conditions.flatMap((c) => c.show));
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    for (const c of conditions) {
      if (c.when === id && matches(values[id], c.is)) c.show.forEach(walk);
    }
  };
  questions.filter((q) => !shown.has(q.id)).forEach((q) => walk(q.id));
  return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const f = (x: number, y: number) => `${r2(x)} ${r2(y)}`;

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const CONTROL_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-1";

/* ------------------------------- context -------------------------------- */

type Ctx = {
  uid: string;
  values: ThreadValues;
  questionById: Map<string, ThreadQuestion>;
  conditions: ThreadCondition[];
  showErrors: boolean;
  narrow: boolean;
  gutter: number;
  threadStyle: ThreadStyle;
  motionSafe: boolean;
  disabled: boolean;
  setValue: (id: string, value: ThreadValue) => void;
  bindControl: (id: string, node: HTMLElement | null) => void;
};

const ThreadCtx = React.createContext<Ctx | null>(null);
const useThread = () => {
  const ctx = React.useContext(ThreadCtx);
  if (!ctx)
    throw new Error("ThreadFields parts must render inside ThreadFields");
  return ctx;
};

/* ------------------------------- thread ------------------------------- */

type Geometry = {
  anchor: { x: number; y: number };
  rail: number;
  bead: number;
  hooks: number[];
};

/**
 * The thread as path data. Coordinates are pixels inside the question block.
 * Elbows turn with a 6px radius; a curve swoops from the anchor to each hook.
 */
function threadPath(g: Geometry, style: ThreadStyle, narrow: boolean) {
  const { anchor: a, rail, bead, hooks } = g;
  const last = hooks[hooks.length - 1];
  if (last === undefined) return "";
  if (style === "curve") {
    return hooks
      .map((y) =>
        narrow
          ? `M ${f(a.x, a.y)} C ${f(rail, a.y)} ${f(rail, y)} ${f(bead, y)}`
          : `M ${f(a.x, a.y)} C ${f(a.x, a.y + (y - a.y) * 0.55)} ${f(rail, y)} ${f(bead, y)}`,
      )
      .join(" ");
  }
  const r = 6;
  const parts: string[] = [];
  if (narrow) {
    // Out of the option's left edge, down the left edge of the form.
    parts.push(
      `M ${f(a.x, a.y)} H ${r2(rail + r)} Q ${f(rail, a.y)} ${f(rail, a.y + r)}`,
    );
  } else {
    // Down from the card, across to the gutter, then down the gutter.
    const turn = a.y + 10;
    const dir = a.x >= rail ? -1 : 1;
    if (Math.abs(a.x - rail) < r * 2) {
      parts.push(`M ${f(a.x, a.y)} V ${r2(turn)} L ${f(rail, turn + r)}`);
    } else {
      parts.push(
        `M ${f(a.x, a.y)} V ${r2(turn - r)} Q ${f(a.x, turn)} ${f(a.x + dir * r, turn)} H ${r2(rail - dir * r)} Q ${f(rail, turn)} ${f(rail, turn + r)}`,
      );
    }
  }
  parts.push(
    `V ${r2(last - r)} Q ${f(rail, last)} ${f(rail + r, last)} H ${r2(bead)}`,
  );
  for (const y of hooks.slice(0, -1))
    parts.push(`M ${f(rail, y)} H ${r2(bead)}`);
  return parts.join(" ");
}

function beadsPath(g: Geometry) {
  const r = 2.5;
  const dot = (x: number, y: number) =>
    `M ${f(x - r, y)} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
  return [
    dot(g.anchor.x, g.anchor.y),
    ...g.hooks.map((y) => dot(g.bead, y)),
  ].join(" ");
}

/**
 * The follow-ups one answer reveals, and the thread that ties them to it.
 * The block's height and the thread's reveal share one motion value, so the
 * thread reaches each follow-up's label exactly as the label arrives; the
 * geometry is re-read from the layout whenever anything inside the question
 * resizes, never through React state per frame.
 */
function Branch({
  condition,
  index,
  open,
  block,
  option,
  depth,
  delay,
}: {
  condition: ThreadCondition;
  index: number;
  open: boolean;
  block: HTMLDivElement | null;
  option: HTMLElement | null;
  depth: number;
  delay: number;
}) {
  const ctx = useThread();
  const { motionSafe, narrow, gutter, threadStyle, uid, questionById } = ctx;
  const key = `${condition.when}-${index}`;
  const clipId = `${uid}-clip-${key}`;

  const [mounted, setMounted] = React.useState(open);
  // Whether the block has finished opening and now sizes itself.
  const [settledOpen, setSettledOpen] = React.useState(open);
  // Open at first paint (server markup included): no fade. Anything opened
  // later fades in with its height.
  const [fadeIn, setFadeIn] = React.useState(!open);
  if (open && !mounted) setMounted(true);
  // Reduced motion has nothing to fold: the follow-ups leave at once.
  if (!open && mounted && !motionSafe) {
    setMounted(false);
    setFadeIn(true);
    setSettledOpen(false);
  }
  // A fold un-settles the block at once, so reopening mid-fold animates back
  // open from wherever the fold had reached.
  if (!open && settledOpen && motionSafe) setSettledOpen(false);
  // Height is "auto" once open; while opening or folding it is carried by `h`.
  const auto = motionSafe ? open && settledOpen : open;

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const pathRef = React.useRef<SVGPathElement | null>(null);
  const beadsRef = React.useRef<SVGPathElement | null>(null);
  const clipRef = React.useRef<SVGRectElement | null>(null);
  const h = useMotionValue(0);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const autoRef = React.useRef(auto);
  React.useLayoutEffect(() => {
    autoRef.current = auto;
  });

  // Reads the layout and writes the thread straight to the SVG: called from
  // the height animation's frames and from the ResizeObserver, so no React
  // render happens per frame.
  const draw = React.useCallback(() => {
    const wrap = wrapRef.current;
    const content = contentRef.current;
    const path = pathRef.current;
    const beads = beadsRef.current;
    const clip = clipRef.current;
    if (!block || !option || !wrap || !content || !path || !beads || !clip)
      return;
    const full = content.offsetHeight || 1;
    // While the block sizes itself, `h` keeps its height, so a fold always
    // starts from the height the block is really drawn at.
    if (autoRef.current) h.jump(full);
    const b = block.getBoundingClientRect();
    const o = option.getBoundingClientRect();
    const hooks = Array.from(
      content.querySelectorAll<HTMLElement>(`[data-thread-hook="${key}"]`),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + Math.min(r.height, 20) / 2 - b.top;
    });
    const rail = Math.round(gutter / 2);
    const g: Geometry = {
      anchor: narrow
        ? { x: o.left - b.left, y: o.top + o.height / 2 - b.top }
        : { x: o.left + o.width / 2 - b.left, y: o.bottom - b.top },
      rail,
      bead: Math.max(rail + 2, gutter - 5),
      hooks,
    };
    path.setAttribute("d", threadPath(g, threadStyle, narrow));
    beads.setAttribute("d", beadsPath(g));
    const p = autoRef.current ? 1 : Math.min(1, Math.max(0, h.get() / full));
    const bottom = (hooks[hooks.length - 1] ?? g.anchor.y) + 6;
    clip.setAttribute("width", String(Math.round(b.width)));
    clip.setAttribute(
      "height",
      String(r2(Math.max(0, g.anchor.y - 4 + p * (bottom - g.anchor.y + 4)))),
    );
  }, [block, gutter, h, key, narrow, option, threadStyle]);

  // Open and fold. A layout effect, so the first frame of either is drawn
  // from where the block really is.
  React.useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !motionSafe) {
      draw();
      return;
    }
    if (open) {
      if (autoRef.current) {
        draw();
        return;
      }
      // A plain number animation written into `h`: animating `h` itself
      // waits on motion's keyframe resolver for an element that only just
      // mounted, and never starts.
      const r = animate(h.get(), content.offsetHeight, {
        ...springs.glide,
        delay,
        onUpdate: (v) => {
          h.set(v);
          draw();
        },
        onComplete: () => {
          autoRef.current = true;
          setSettledOpen(true);
          draw();
        },
      });
      run.current = r;
      return () => r.stop();
    }
    if (!mounted) return;
    const r = animate(h.get(), 0, {
      ...exitFor(durations.slow),
      onUpdate: (v) => {
        h.set(v);
        draw();
      },
      onComplete: () => {
        setMounted(false);
        setFadeIn(true);
        setSettledOpen(false);
      },
    });
    run.current = r;
    return () => r.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!mounted || !block) return;
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(block);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [block, draw, mounted]);

  if (!mounted) return null;
  const by = questionById.get(condition.when);
  const chosen = by?.options?.find((o) =>
    Array.isArray(condition.is)
      ? condition.is.includes(o.value)
      : o.value === condition.is,
  );

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible text-(--tf-accent)"
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect ref={clipRef} x={0} y={0} width={0} height={0} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <path
            ref={pathRef}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={threadStyle === "stitch" ? "3 4" : undefined}
            opacity={0.85}
          />
          <path
            ref={beadsRef}
            fill="currentColor"
            stroke="var(--card)"
            strokeWidth={1.5}
          />
        </g>
      </svg>
      <motion.div
        ref={wrapRef}
        role="group"
        aria-label={`Follow-ups to ${chosen?.label ?? by?.label ?? "this answer"}`}
        className={cn(auto ? "" : "overflow-hidden")}
        style={{ height: auto ? "auto" : h }}
        initial={fadeIn ? { opacity: 0 } : false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{
          duration: motionSafe ? durations.base : durations.fast,
          ease: easings.enter,
          delay: open && motionSafe ? delay : 0,
        }}
      >
        <div
          ref={contentRef}
          className="flex flex-col gap-5 pt-4 pl-[clamp(8px,var(--tf-indent),16px)] @min-[34rem]:pl-[max(8px,var(--tf-indent))]"
        >
          {condition.show.map((id) => {
            const q = questionById.get(id);
            return q ? (
              <QuestionBlock
                key={id}
                question={q}
                hookKey={key}
                depth={depth + 1}
              />
            ) : null;
          })}
        </div>
      </motion.div>
    </>
  );
}

/* ------------------------------- controls ------------------------------- */

function ChoiceGroup({
  question,
  labelId,
  describedBy,
  invalid,
  bindOption,
}: {
  question: ThreadQuestion;
  labelId: string;
  describedBy?: string;
  invalid: boolean;
  bindOption: (value: string, node: HTMLButtonElement | null) => void;
}) {
  const ctx = useThread();
  const multi = question.kind === "multi";
  const options = question.options ?? [];
  const raw = ctx.values[question.id];
  const selected = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const [active, setActive] = React.useState<string | null>(null);
  const tabValue =
    active && options.some((o) => o.value === active)
      ? active
      : (selected[0] ?? options[0]?.value);

  const choose = (value: string) => {
    if (ctx.disabled) return;
    if (multi) {
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      ctx.setValue(question.id, next);
    } else if (selected[0] !== value) {
      ctx.setValue(question.id, value);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const keys = [
      "ArrowDown",
      "ArrowRight",
      "ArrowUp",
      "ArrowLeft",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const n = options.length;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? n - 1
          : (index +
              (event.key === "ArrowDown" || event.key === "ArrowRight"
                ? 1
                : -1) +
              n) %
            n;
    const next = options[nextIndex];
    if (!next) return;
    setActive(next.value);
    refs.current.get(next.value)?.focus();
    // A radio group's selection follows focus; a checkbox group's does not.
    if (!multi) choose(next.value);
  };

  return (
    <div
      role={multi ? "group" : "radiogroup"}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={!multi && invalid ? true : undefined}
      aria-required={!multi && question.required ? true : undefined}
      className="ml-[clamp(8px,var(--tf-indent),16px)] flex flex-col gap-1.5 @min-[34rem]:ml-0 @min-[34rem]:flex-row @min-[34rem]:flex-wrap"
    >
      {options.map((o, i) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            ref={(node) => {
              if (node) refs.current.set(o.value, node);
              else refs.current.delete(o.value);
              bindOption(o.value, node);
              if (o.value === tabValue) ctx.bindControl(question.id, node);
            }}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            tabIndex={o.value === tabValue ? 0 : -1}
            disabled={ctx.disabled}
            onClick={() => {
              setActive(o.value);
              choose(o.value);
            }}
            onKeyDown={(event) => onKeyDown(event, i)}
            className={cn(
              "relative flex min-w-0 items-center gap-2.5 rounded-3 border bg-background px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 @min-[34rem]:min-w-[8.5rem] @min-[34rem]:flex-1",
              on
                ? "border-[color-mix(in_oklab,var(--tf-accent)_65%,transparent)] bg-[color-mix(in_oklab,var(--tf-accent)_7%,var(--background))]"
                : invalid
                  ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] hover:border-hairline-strong"
                  : "border-input hover:border-hairline-strong",
              CONTROL_RING,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "relative inline-flex size-4 shrink-0 items-center justify-center border transition-colors",
                multi ? "rounded-1" : "rounded-full",
                on
                  ? "border-(--tf-accent) bg-(--tf-accent)"
                  : "border-hairline-strong bg-background",
              )}
            >
              <AnimatePresence initial={false}>
                {on ? (
                  <motion.span
                    key="on"
                    className="inline-flex text-background"
                    initial={{ scale: ctx.motionSafe ? 0.3 : 1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      ctx.motionSafe
                        ? springs.snap
                        : { duration: durations.fast }
                    }
                  >
                    {multi ? (
                      <Check strokeWidth={3.5} className="size-3" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-background" />
                    )}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px] leading-5 font-medium text-foreground">
                {o.label}
              </span>
              {o.hint ? (
                <span className="text-[11.5px] leading-4 text-ink-3">
                  {o.hint}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- question ------------------------------- */

function QuestionBlock({
  question,
  hookKey,
  depth,
}: {
  question: ThreadQuestion;
  hookKey?: string;
  depth: number;
}) {
  const ctx = useThread();
  const base = `${ctx.uid}-${question.id}`;
  const labelId = `${base}-label`;
  const hintId = `${base}-hint`;
  const errId = `${base}-error`;
  const value = ctx.values[question.id];
  const error = ctx.showErrors ? checkQuestion(question, value) : null;
  const describedBy =
    [question.hint ? hintId : null, error ? errId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const [block, setBlock] = React.useState<HTMLDivElement | null>(null);
  const [options, setOptions] = React.useState<
    Record<string, HTMLButtonElement | null>
  >({});
  // Nulls are ignored: an inline ref is detached and re-attached on every
  // render, and storing the null would bounce the state back and forth.
  const bindOption = React.useCallback(
    (v: string, node: HTMLButtonElement | null) => {
      if (!node) return;
      setOptions((prev) => (prev[v] === node ? prev : { ...prev, [v]: node }));
    },
    [],
  );

  const branches = ctx.conditions
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.when === question.id);
  // A branch that opens while a sibling folds waits a beat, so the old thread
  // is pulled up before the new one drops. The previous answer is state
  // adjusted during render, known in the same render as the new one.
  const [seen, setSeen] = React.useState(value);
  const [previous, setPrevious] = React.useState<ThreadValue | undefined>(
    undefined,
  );
  if (seen !== value) {
    setPrevious(seen);
    setSeen(value);
  }
  const switching = branches.some(
    ({ c }) => matches(previous, c.is) && !matches(value, c.is),
  );

  const text = Array.isArray(value) ? "" : (value ?? "");
  const box = cn(
    "w-full rounded-2 border bg-background px-3 text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
    CONTROL_RING,
    error
      ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
      : "border-input hover:border-hairline-strong",
  );
  const common = {
    id: base,
    ref: (node: HTMLElement | null) => ctx.bindControl(question.id, node),
    disabled: ctx.disabled,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": question.required || undefined,
  };

  return (
    <div ref={setBlock} className="relative flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        {question.kind === "choice" || question.kind === "multi" ? (
          <span
            id={labelId}
            data-thread-hook={hookKey}
            className="text-[13px] leading-5 font-semibold text-foreground"
          >
            {question.label}
          </span>
        ) : (
          <label
            id={labelId}
            htmlFor={base}
            data-thread-hook={hookKey}
            className="text-[13px] leading-5 font-semibold text-foreground"
          >
            {question.label}
          </label>
        )}
        {question.required ? null : (
          <span className="text-[11.5px] text-ink-3">optional</span>
        )}
      </div>

      {question.kind === "choice" || question.kind === "multi" ? (
        <ChoiceGroup
          question={question}
          labelId={labelId}
          describedBy={describedBy}
          invalid={!!error}
          bindOption={bindOption}
        />
      ) : question.kind === "textarea" ? (
        <textarea
          {...common}
          rows={3}
          value={text}
          placeholder={question.placeholder}
          onChange={(e) => ctx.setValue(question.id, e.currentTarget.value)}
          className={cn(box, "block resize-y py-2 leading-5")}
        />
      ) : (
        <input
          {...common}
          type={question.kind === "email" ? "email" : "text"}
          inputMode={
            question.kind === "number"
              ? "numeric"
              : question.kind === "email"
                ? "email"
                : undefined
          }
          autoComplete={
            question.kind === "email"
              ? "email"
              : question.id === "name"
                ? "name"
                : undefined
          }
          value={text}
          placeholder={question.placeholder}
          onChange={(e) => ctx.setValue(question.id, e.currentTarget.value)}
          className={cn(
            box,
            "h-9",
            question.kind === "number" && "max-w-32 font-mono tabular-nums",
          )}
        />
      )}

      {question.hint ? (
        <p id={hintId} className="text-[11.5px] leading-4 text-ink-3">
          {question.hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errId}
          className="flex items-start gap-1.5 text-[11.5px] leading-4 text-danger"
        >
          <CircleAlert aria-hidden className="mt-px size-3 shrink-0" />
          {error}
        </p>
      ) : null}

      {branches.map(({ c, i }) => {
        const open = matches(value, c.is);
        const wanted = Array.isArray(c.is) ? c.is : [c.is];
        const anchorValue = Array.isArray(value)
          ? (value.find((v) => wanted.includes(v)) ?? wanted[0])
          : open
            ? (value as string)
            : wanted[0];
        return (
          <Branch
            key={`${c.when}-${i}`}
            condition={c}
            index={i}
            open={open}
            block={block}
            option={anchorValue ? (options[anchorValue] ?? null) : null}
            depth={depth}
            delay={switching ? 0.12 : 0}
          />
        );
      })}
    </div>
  );
}

/* --------------------------------- form --------------------------------- */

type Phase = "idle" | "sending" | "sent" | "failed";

/**
 * A single-page form where a follow-up question appears directly beneath the
 * answer that asked for it. Choosing such an answer opens the follow-ups to
 * their measured height on `springs.glide` while a thin thread draws from the
 * chosen option down the gutter and hooks into each new question's label —
 * the thread's reveal rides the same motion value as the height, so it
 * reaches each label as the label arrives. Changing the answer pulls the
 * thread back up on the exit ease as those questions fold away (their answers
 * are kept and come back with them), and the new answer's thread drops from
 * its own option. Follow-ups can have follow-ups, each level indented with its
 * own thread.
 *
 * Choice questions are radiogroups with roving focus — arrows move and choose,
 * Home and End jump — and multi-choice questions are groups of checkboxes
 * whose arrows move focus and Space toggles. Revealed and hidden follow-ups
 * are announced politely. Only visible questions are checked and submitted; a
 * refused submit keeps everything. Below 34rem the options stack and the
 * thread runs down the form's left edge. Under reduced motion follow-ups
 * cross-fade in at full height with the thread already whole.
 */
export function ThreadFields({
  questions = defaultThreadQuestions,
  conditions = defaultThreadConditions,
  values,
  defaultValues,
  onValuesChange,
  onChange,
  onReveal,
  onSubmit,
  threadStyle = "elbow",
  indent = 24,
  accent = "var(--accent-bright)",
  title = "Book a studio",
  subtitle = "Coldbrook Studios · Fernworks Row",
  submitLabel = "Request booking",
  height = 520,
  status = "ready",
  disabled = false,
  className,
}: ThreadFieldsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const [own, setOwn] = React.useState<ThreadValues>(() => defaultValues ?? {});
  const current = values ?? own;
  const [showErrors, setShowErrors] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [announcement, setAnnouncement] = React.useState("");
  const [narrow, setNarrow] = React.useState(false);
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const controls = React.useRef(new Map<string, HTMLElement>());
  const alive = React.useRef(false);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The same 34rem the container queries use, read on the same element, so
  // the thread's anchor rule always matches the layout CSS chose.
  React.useEffect(() => {
    if (!root) return;
    const read = () => setNarrow(root.clientWidth < 544);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);

  const questionById = React.useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  );
  const topLevel = React.useMemo(() => {
    const shown = new Set(conditions.flatMap((c) => c.show));
    return questions.filter((q) => !shown.has(q.id));
  }, [conditions, questions]);

  const visible = visibleIds(questions, conditions, current);
  const visibleAnswers = (vals: ThreadValues, ids: string[]) =>
    Object.fromEntries(
      ids
        .filter((id) => vals[id] !== undefined)
        .map((id) => [id, vals[id] as ThreadValue]),
    );
  const required = visible
    .map((id) => questionById.get(id))
    .filter((q): q is ThreadQuestion => !!q?.required);
  const answered = required.filter((q) => !isEmpty(current[q.id])).length;

  const setValue = (id: string, value: ThreadValue) => {
    const next = { ...current, [id]: value };
    if (values === undefined) setOwn(next);
    onValuesChange?.(next);
    if (phase === "sent" || phase === "failed") setPhase("idle");
    const before = visibleIds(questions, conditions, current);
    const after = visibleIds(questions, conditions, next);
    onChange?.(id, value, visibleAnswers(next, after));
    const added = after.filter((q) => !before.includes(q));
    const removed = before.filter((q) => !after.includes(q));
    const names = (ids: string[]) =>
      ids
        .map((q) => questionById.get(q)?.label.replace(/\?$/, "") ?? q)
        .join(", ");
    const kept = removed.filter((q) => !isEmpty(next[q])).length;
    // Frozen at the moment of change, from the new answer.
    if (added.length > 0) {
      onReveal?.(added, id);
      setAnnouncement(
        `${added.length === 1 ? "1 follow-up question" : `${added.length} follow-up questions`}: ${names(added)}.${
          removed.length ? ` ${removed.length} hidden; answers kept.` : ""
        }`,
      );
    } else if (removed.length > 0) {
      setAnnouncement(
        `Follow-up ${removed.length === 1 ? "question" : "questions"} hidden${
          kept
            ? `; ${kept === 1 ? "your answer is" : "your answers are"} kept`
            : ""
        }.`,
      );
    }
  };

  const bindControl = React.useCallback(
    (id: string, node: HTMLElement | null) => {
      if (node) controls.current.set(id, node);
    },
    [],
  );

  const send = () => {
    const answers = visibleAnswers(current, visible);
    setPhase("sending");
    setAnnouncement("Sending the booking request.");
    let result: void | Promise<void> = undefined;
    try {
      result = onSubmit?.(answers);
    } catch {
      setPhase("failed");
      setAnnouncement(
        "Couldn't send the booking. Nothing you entered was lost.",
      );
      return;
    }
    Promise.resolve(result).then(
      () => {
        if (!alive.current) return;
        setPhase("sent");
        setAnnouncement("Booking request sent.");
      },
      () => {
        if (!alive.current) return;
        setPhase("failed");
        setAnnouncement(
          "Couldn't send the booking. Nothing you entered was lost.",
        );
      },
    );
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (disabled || phase === "sending" || status === "loading") return;
    setShowErrors(true);
    const bad = visible
      .map((id) => questionById.get(id))
      .filter(
        (q): q is ThreadQuestion =>
          !!q && checkQuestion(q, current[q.id]) !== null,
      );
    if (bad.length > 0) {
      const first = bad[0];
      if (first) {
        const node = controls.current.get(first.id);
        if (node?.isConnected) node.focus();
      }
      setAnnouncement(
        `${bad.length === 1 ? "1 question needs" : `${bad.length} questions need`} an answer: ${bad
          .map((q) => q.label.replace(/\?$/, ""))
          .join(", ")}.`,
      );
      return;
    }
    send();
  };

  const fill = useMotionValue(0);
  React.useEffect(() => {
    if (phase === "sending") {
      fill.jump(0);
      const r = animate(fill, 0.85, {
        duration: motionSafe ? 3 : 1.5,
        ease: [0.12, 0.7, 0.3, 1],
      });
      return () => r.stop();
    }
    const r =
      phase === "sent"
        ? animate(fill, 1, { duration: durations.base, ease: easings.enter })
        : animate(fill, 0, exitFor(durations.slow));
    return () => r.stop();
  }, [fill, motionSafe, phase]);

  const gutter = Math.round(
    narrow ? Math.min(16, Math.max(8, indent)) : Math.max(8, indent),
  );
  const ctx: Ctx = {
    uid,
    values: current,
    questionById,
    conditions,
    showErrors,
    narrow,
    gutter,
    threadStyle,
    motionSafe,
    disabled,
    setValue,
    bindControl,
  };

  return (
    <div ref={setRoot} className={cn("@container w-full", className)}>
      <div
        className="relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
        style={
          {
            height,
            "--tf-accent": accent,
            "--tf-indent": `${Math.round(indent)}px`,
          } as React.CSSProperties
        }
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] leading-5 font-semibold">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-[12px] leading-4 text-ink-3">{subtitle}</p>
            ) : null}
          </div>
          {status === "ready" ? (
            <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-hairline bg-surface-0 px-2 font-mono text-[10.5px] text-ink-2 tabular-nums">
              {answered} of {required.length} answered
            </span>
          ) : null}
        </header>

        <form
          noValidate
          aria-labelledby={titleId}
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
            <AnimatePresence initial={false}>
              {phase === "failed" || phase === "sent" ? (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          y: springs.snap,
                          opacity: { duration: durations.base },
                        }
                      : { duration: durations.fast }
                  }
                  className={cn(
                    "mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-3 border px-3 py-2.5 text-[12.5px]",
                    phase === "failed"
                      ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))]"
                      : "border-[color-mix(in_oklab,var(--tf-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--tf-accent)_7%,var(--card))]",
                  )}
                >
                  {phase === "failed" ? (
                    <>
                      <CircleAlert
                        aria-hidden
                        className="size-4 shrink-0 text-danger"
                      />
                      <span className="min-w-0 flex-1">
                        Couldn&apos;t send the booking. Nothing you entered was
                        lost.
                      </span>
                      <button
                        type="button"
                        onClick={() => submit()}
                        className={cn(
                          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-[12px] font-medium transition-colors hover:bg-surface-2",
                          RING,
                        )}
                      >
                        <RotateCcw aria-hidden className="size-3.5" />
                        Try again
                      </button>
                    </>
                  ) : (
                    <>
                      <Check
                        aria-hidden
                        strokeWidth={2.5}
                        className="size-4 shrink-0 text-(--tf-accent)"
                      />
                      <span className="min-w-0 flex-1">
                        Request sent. The studio confirms within a day.
                      </span>
                    </>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {status === "loading" ? (
              <div aria-hidden className="flex flex-col gap-7">
                {[0, 1, 2].map((k) => (
                  <div key={k} className="flex flex-col gap-2">
                    <span className="h-3.5 w-40 rounded-1 bg-surface-2" />
                    <span className="h-12 rounded-3 bg-surface-2" />
                  </div>
                ))}
              </div>
            ) : (
              <ThreadCtx.Provider value={ctx}>
                <div
                  className="flex flex-col gap-7"
                  aria-busy={phase === "sending" || undefined}
                >
                  {topLevel.map((q) => (
                    <QuestionBlock key={q.id} question={q} depth={0} />
                  ))}
                </div>
              </ThreadCtx.Provider>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
            <span className="mr-auto hidden text-[12px] text-ink-3 @min-[26rem]:inline">
              Hidden answers are kept, not sent.
            </span>
            <button
              type="submit"
              disabled={disabled || status === "loading"}
              aria-disabled={phase === "sending" || undefined}
              aria-busy={phase === "sending" || undefined}
              className={cn(
                "relative inline-flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-2 bg-foreground px-4 text-[13px] font-medium text-background disabled:cursor-not-allowed disabled:opacity-50",
                RING,
                phase === "sending" && "cursor-progress",
              )}
            >
              <motion.span
                aria-hidden
                className="absolute inset-0 bg-[color-mix(in_oklab,var(--tf-accent)_70%,transparent)]"
                style={{ scaleX: fill, originX: 0 }}
              />
              <span className="relative inline-flex items-center gap-1.5">
                {phase === "sending" ? (
                  <LoaderCircle
                    aria-hidden
                    className={cn("size-3.5", motionSafe && "animate-spin")}
                  />
                ) : phase === "sent" ? (
                  <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
                ) : null}
                {phase === "sending"
                  ? "Sending…"
                  : phase === "sent"
                    ? "Sent"
                    : submitLabel}
              </span>
            </button>
          </footer>
        </form>

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </div>
  );
}
