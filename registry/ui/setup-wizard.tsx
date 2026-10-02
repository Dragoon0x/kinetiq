"use client";

import * as React from "react";

import {
  ChevronLeft,
  LoaderCircle,
  Pencil,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Variants,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type WizardValue = string | boolean;
/** Every answer in the wizard, by field id. */
export type WizardValues = Readonly<Record<string, WizardValue>>;
export type WizardFieldKind =
  "text" | "email" | "url" | "choice" | "segmented" | "toggle";
export type WizardRail = "side" | "top" | "bar";
export type WizardValidate = "next" | "blur" | "live";
export type WizardDirection = "horizontal" | "vertical" | "depth";
export type WizardStatus = "ready" | "loading" | "error";

export type WizardOption = {
  id: string;
  label: string;
  /** A line under the label on a choice card. */
  description?: string;
  /** A short note at the card's end: a price, a limit. */
  meta?: string;
};

export type WizardField = {
  id: string;
  kind: WizardFieldKind;
  /** The visible label; also how the review and the messages name the field. */
  label: string;
  /** A quiet line under the field. */
  hint?: string;
  placeholder?: string;
  /** An empty answer holds the step. */
  required?: boolean;
  /** What an empty required field says. @default "<Label> is required." */
  requiredMessage?: string;
  /** Text kinds: the shortest answer accepted. */
  minLength?: number;
  /** Text kinds: a shape the answer must match. */
  pattern?: RegExp;
  /** What an answer that misses `pattern` says. */
  patternMessage?: string;
  /** Any other rule. Return a message to hold the step, or nothing to pass. */
  validate?: (
    value: WizardValue,
    values: WizardValues,
  ) => string | null | undefined;
  /** Text kinds: fixed text drawn inside the field before the answer. */
  prefix?: string;
  /** Text kinds: fixed text drawn inside the field after the answer. */
  suffix?: string;
  /** Choice and segmented kinds: what can be picked. */
  options?: WizardOption[];
  /** Pairs with its neighbour when the panel is wide enough. */
  half?: boolean;
  /** How the answer reads in the review and the rail. */
  format?: (value: WizardValue, values: WizardValues) => string;
  autoComplete?: string;
};

export type WizardStep = {
  id: string;
  /** The rail's label and the panel's heading. */
  title: string;
  /** A line under the heading. */
  description?: string;
  fields: WizardField[];
  /** What the rail keeps for this step once it is answered. @default the first field's answer */
  summary?: (values: WizardValues) => string;
};

export type SetupWizardProps = {
  /** The steps before the review, in order. @default defaultWizardSteps */
  steps?: WizardStep[];
  /** Controlled answers, by field id. */
  value?: WizardValues;
  /** Initial answers when uncontrolled. @default defaultWizardValues with the default steps, blanks otherwise */
  defaultValue?: WizardValues;
  /** Fires from the keystroke, pick or switch that changed an answer, with every answer. */
  onValueChange?: (values: WizardValues) => void;
  /** Controlled step index; `steps.length` is the review. */
  step?: number;
  /** Initial step when uncontrolled. @default 0 */
  defaultStep?: number;
  /** Fires from Next, Back, Edit or a rail node with the step asked for. */
  onStepChange?: (index: number) => void;
  /** A Next (or a rail jump) was held, with the step and the ids of the fields that need attention. */
  onInvalid?: (step: number, fieldIds: string[]) => void;
  /** Runs from the review's button. Return a promise to hold it pending; a rejection's message is shown. */
  onSubmit?: (values: WizardValues) => void | Promise<void>;
  /** Start over was pressed on the finished state. */
  onRestart?: () => void;
  /** The progress rail: beside the panel with each answer kept under its step, across the top, or a slim segmented bar. @default "side" */
  rail?: WizardRail;
  /** When a field's message shows: after a held Next, when the field is left, or as you type. @default "next" */
  validate?: WizardValidate;
  /** The axis the panels travel on between steps: sideways, up and down, or in depth. @default "horizontal" */
  direction?: WizardDirection;
  /** The wizard's heading and accessible name. @default "Set up your workspace" */
  title?: string;
  /** A line under the heading. */
  subtitle?: string;
  /** The review step's heading and rail label. @default "Review" */
  reviewTitle?: string;
  /** The review's button. @default "Create workspace" */
  submitLabel?: string;
  /** The button while `onSubmit` is pending. @default "Working…" */
  pendingLabel?: string;
  /** The finished state's heading, or a function of the answers. @default "<name> is ready" */
  doneTitle?: string | ((values: WizardValues) => string);
  /** The finished state's line. */
  doneBody?: string;
  /** Loading draws placeholder rows; error offers Retry. @default "ready" */
  status?: WizardStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The region's accessible name when it should differ from the title. */
  label?: string;
  /** Play the step swish and the choice clicks. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the wizard but takes no input. */
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults ------------------------------- */

const TAKEN = new Set(["fieldline", "admin", "support", "www"]);

const SIZES: WizardOption[] = [
  { id: "1", label: "Just me" },
  { id: "2-10", label: "2–10" },
  { id: "11-50", label: "11–50" },
  { id: "51+", label: "51+" },
];

const PLANS: WizardOption[] = [
  {
    id: "starter",
    label: "Starter",
    description: "Up to 3 people and 50 routes a month.",
    meta: "Free",
  },
  {
    id: "team",
    label: "Team",
    description: "Unlimited routes and shared depots.",
    meta: "€8 / seat",
  },
  {
    id: "scale",
    label: "Scale",
    description: "Single sign-on, audit log, priority help.",
    meta: "€14 / seat",
  },
];

const sizeText = (v: WizardValue) => {
  const o = SIZES.find((s) => s.id === v);
  if (!o) return "";
  return o.id === "1" ? o.label : `${o.label} people`;
};

export const defaultWizardSteps: WizardStep[] = [
  {
    id: "workspace",
    title: "Workspace",
    description: "Name it the way your team says it out loud.",
    fields: [
      {
        id: "name",
        kind: "text",
        label: "Workspace name",
        placeholder: "Fernworks Studio",
        required: true,
        requiredMessage: "Name your workspace.",
        minLength: 2,
        half: true,
        autoComplete: "organization",
      },
      {
        id: "address",
        kind: "text",
        label: "Address",
        placeholder: "fernworks",
        suffix: ".fieldline.app",
        required: true,
        requiredMessage: "Choose an address.",
        pattern: /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
        patternMessage: "Use lowercase letters, numbers and hyphens.",
        validate: (v) =>
          TAKEN.has(String(v).trim()) ? "That address is taken." : null,
        half: true,
        hint: "Where your team signs in. You can change it later.",
        format: (v) => `${String(v).trim()}.fieldline.app`,
      },
    ],
    summary: (v) => String(v.name ?? "").trim(),
  },
  {
    id: "team",
    title: "Team",
    description: "So routes and seats start at the right size.",
    fields: [
      {
        id: "size",
        kind: "segmented",
        label: "Team size",
        required: true,
        requiredMessage: "Pick a team size.",
        options: SIZES,
        format: sizeText,
      },
      {
        id: "teammate",
        kind: "email",
        label: "First teammate",
        placeholder: "name@fernworks.io",
        hint: "They get an invite when you finish.",
        autoComplete: "off",
      },
    ],
    summary: (v) => sizeText(v.size ?? ""),
  },
  {
    id: "plan",
    title: "Plan",
    description: "Every plan starts with 14 days of Scale.",
    fields: [
      {
        id: "plan",
        kind: "choice",
        label: "Plan",
        required: true,
        requiredMessage: "Pick a plan.",
        options: PLANS,
      },
      {
        id: "yearly",
        kind: "toggle",
        label: "Bill yearly",
        hint: "Two months free on Team and Scale.",
        format: (v) => (v ? "Yearly" : "Monthly"),
      },
    ],
    summary: (v) => {
      const plan = PLANS.find((p) => p.id === v.plan)?.label;
      return plan ? `${plan} · ${v.yearly ? "yearly" : "monthly"}` : "";
    },
  },
];

export const defaultWizardValues: WizardValues = {
  name: "Fernworks Studio",
  address: "fernworks",
  size: "",
  teammate: "",
  plan: "",
  yearly: true,
};

/* -------------------------------- helpers ------------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
/** The ring drawn on a box when the control inside it has keyboard focus. */
const RING_WITHIN =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r6 = (v: number) => Number(v.toFixed(6));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const blankOf = (f: WizardField): WizardValue =>
  f.kind === "toggle" ? false : "";

const blankValues = (steps: WizardStep[]): WizardValues => {
  const out: Record<string, WizardValue> = {};
  for (const s of steps) for (const f of s.fields) out[f.id] = blankOf(f);
  return out;
};

function problemOf(
  field: WizardField,
  value: WizardValue,
  values: WizardValues,
): string | null {
  if (field.kind === "toggle") return field.validate?.(value, values) ?? null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    if (!field.required) return null;
    if (field.requiredMessage) return field.requiredMessage;
    return field.kind === "choice" || field.kind === "segmented"
      ? `Choose a ${field.label.toLowerCase()}.`
      : `${field.label} is required.`;
  }
  if (field.kind === "email" && !EMAIL.test(text)) {
    return "That doesn't look like an email address.";
  }
  if (field.kind === "url" && !WEB.test(text)) {
    return "Enter a web address, like fernworks.io.";
  }
  if (field.minLength && text.length < field.minLength) {
    return `Use at least ${plural(field.minLength, "character")}.`;
  }
  if (field.pattern && !field.pattern.test(text)) {
    return field.patternMessage ?? "Check this answer.";
  }
  return field.validate?.(value, values) ?? null;
}

function textOf(
  field: WizardField,
  value: WizardValue,
  values: WizardValues,
): string {
  if (field.format) {
    const empty = typeof value === "string" ? !value.trim() : false;
    return empty ? "" : field.format(value, values);
  }
  if (field.kind === "toggle") return value ? "On" : "Off";
  if (field.kind === "choice" || field.kind === "segmented") {
    return field.options?.find((o) => o.id === value)?.label ?? "";
  }
  return typeof value === "string" ? value.trim() : "";
}

/* ------------------------------ measuring ------------------------------- */

/** A box whose height glides to its content's measured height. */
function Measured({
  children,
  motionSafe,
}: {
  children: React.ReactNode;
  motionSafe: boolean;
}) {
  const height = useMotionValue(-1);
  const style = useTransform(height, (h) => (h < 0 ? "auto" : h));
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!node) return;
    let running: AnimationPlaybackControls | null = null;
    const ro = new ResizeObserver(() => {
      const h = node.offsetHeight;
      const now = height.get();
      if (now < 0 || !motionSafe) {
        running?.stop();
        height.jump(h);
        return;
      }
      if (Math.abs(now - h) < 0.5) return;
      running?.stop();
      running = animate(height, h, {
        ...springs.glide,
        velocity: height.getVelocity(),
      });
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      // A re-run finishes the glide where it should end rather than freezing it.
      running?.stop();
      if (height.get() >= 0) height.jump(node.offsetHeight);
    };
  }, [node, motionSafe, height]);

  return (
    <motion.div
      style={{ height: style }}
      className="relative overflow-clip [overflow-clip-margin:6px]"
    >
      <div ref={setNode} className="relative">
        {children}
      </div>
    </motion.div>
  );
}

/* --------------------------------- rail --------------------------------- */

type NodeState = "done" | "current" | "visited" | "upcoming";

type RailNode = {
  index: number;
  title: string;
  caption: string | null;
  state: NodeState;
  reachable: boolean;
  /** One sentence: the node's accessible name. */
  name: string;
  /** The answer is on its way here: hold the chip back until it lands. */
  inFlight: boolean;
  /** How many times an answer has landed here this session. */
  landings: number;
};

type RailProps = {
  nodes: RailNode[];
  progress: MotionValue<number>;
  motionSafe: boolean;
  flash: { at: number; n: number } | null;
  label: string;
  disabled: boolean;
  onJump: (index: number) => void;
  bindSlot: (node: HTMLElement | null) => void;
};

function NodeDot({
  node,
  motionSafe,
  flash,
}: {
  node: RailNode;
  motionSafe: boolean;
  flash: number | null;
}) {
  const done = node.state === "done";
  return (
    <span
      data-dot={node.index}
      className={cn(
        "relative grid size-[22px] shrink-0 place-items-center rounded-full border bg-card font-mono text-[10px] leading-none tabular-nums transition-colors",
        node.state === "current"
          ? "border-cobalt-bright text-cobalt-bright ring-1 ring-cobalt-bright ring-inset"
          : node.state === "visited"
            ? "border-hairline-strong text-ink-2"
            : node.state === "done"
              ? "border-cobalt-bright text-primary-foreground"
              : "border-hairline-strong text-ink-3",
      )}
    >
      <motion.span
        aria-hidden
        className="absolute -inset-px rounded-full bg-cobalt-bright"
        initial={false}
        animate={{ scale: done ? 1 : 0.4, opacity: done ? 1 : 0 }}
        transition={
          motionSafe
            ? { scale: springs.snap, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      />
      {done ? (
        <svg
          aria-hidden
          viewBox="0 0 22 22"
          className="relative size-[22px] fill-none stroke-primary-foreground"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="M6.6 11.4 9.6 14.3 15.4 8"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ ...springs.flick, delay: 0.08 }}
          />
        </svg>
      ) : (
        <span className="relative">{node.index + 1}</span>
      )}
      {flash !== null ? (
        <motion.span
          key={flash}
          aria-hidden
          className="pointer-events-none absolute -inset-[3px] rounded-full border-2 border-danger"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: durations.page, ease: easings.enter }}
        />
      ) : null}
    </span>
  );
}

function Chip({ node }: { node: RailNode }) {
  if (!node.caption) return null;
  return (
    <span
      title={node.caption}
      className="relative inline-flex h-5 max-w-full items-center overflow-clip rounded-1 bg-surface-2 px-1.5 text-[11px] text-ink-2"
      style={{ opacity: node.inFlight ? 0 : 1 }}
    >
      <span className="truncate">{node.caption}</span>
      <motion.span
        aria-hidden
        className="absolute inset-0 bg-cobalt-wash"
        initial={false}
        animate={{ opacity: node.inFlight ? 1 : 0 }}
        transition={{ duration: durations.slow, ease: easings.enter }}
      />
    </span>
  );
}

/** A vertical rail whose nodes carry their answers; its fill is placed between measured node centres. */
function SideRail({
  nodes,
  progress,
  motionSafe,
  flash,
  label,
  disabled,
  onJump,
  bindSlot,
}: RailProps) {
  const [list, setList] = React.useState<HTMLOListElement | null>(null);
  const [geo, setGeo] = React.useState<{ x: number; ys: number[] } | null>(
    null,
  );
  const count = nodes.length;

  React.useEffect(() => {
    if (!list) return;
    const ro = new ResizeObserver(() => {
      const box = list.getBoundingClientRect();
      const dots = Array.from(list.querySelectorAll<HTMLElement>("[data-dot]"));
      if (dots.length < 2) return;
      let x = 0;
      const ys = dots.map((d) => {
        const r = d.getBoundingClientRect();
        x = r2(r.left - box.left + r.width / 2);
        return r2(r.top - box.top + r.height / 2);
      });
      setGeo((g) =>
        g && g.x === x && g.ys.join() === ys.join() ? g : { x, ys },
      );
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, [list, count]);

  const fill = useTransform(progress, (p) => {
    if (!geo || geo.ys.length < 2) return 0;
    const ys = geo.ys;
    const last = ys.length - 1;
    const c = Math.min(last, Math.max(0, p));
    const i = Math.min(last - 1, Math.floor(c));
    const a = ys[i] ?? 0;
    const b = ys[i + 1] ?? a;
    return r2(Math.max(0, a + (b - a) * (c - i) - (ys[0] ?? 0)));
  });

  const first = geo?.ys[0] ?? 0;
  const last = geo?.ys[geo.ys.length - 1] ?? 0;

  return (
    <nav aria-label={label}>
      <ol ref={setList} className="relative flex flex-col gap-0.5">
        {geo ? (
          <>
            <span
              aria-hidden
              className="absolute w-0.5 -translate-x-1/2 rounded-full bg-hairline-strong"
              style={{ left: geo.x, top: first, height: r2(last - first) }}
            />
            <motion.span
              aria-hidden
              className="absolute w-0.5 -translate-x-1/2 rounded-full bg-cobalt-bright"
              style={{ left: geo.x, top: first, height: fill }}
            />
          </>
        ) : null}
        {nodes.map((node) => (
          <li key={node.index}>
            <button
              type="button"
              aria-label={node.name}
              aria-current={node.state === "current" ? "step" : undefined}
              aria-disabled={!node.reachable || undefined}
              disabled={disabled}
              onClick={() => onJump(node.index)}
              className={cn(
                "flex w-full items-start gap-3 rounded-2 p-1.5 text-left transition-colors",
                FOCUS,
                node.reachable ? "hover:bg-surface-2" : "cursor-default",
              )}
            >
              <NodeDot
                node={node}
                motionSafe={motionSafe}
                flash={flash && flash.at === node.index ? flash.n : null}
              />
              <span className="flex min-w-0 flex-1 flex-col pt-0.5">
                <span
                  ref={bindSlot}
                  data-slot={`side:${node.index}`}
                  className={cn(
                    "truncate text-[13px] leading-[18px]",
                    node.state === "current"
                      ? "font-medium text-foreground"
                      : node.state === "upcoming"
                        ? "text-ink-3"
                        : "text-ink-2",
                  )}
                >
                  {node.title}
                </span>
                {node.caption ? (
                  <motion.span
                    className="block overflow-clip [overflow-clip-margin:2px]"
                    initial={
                      node.landings > 0 && motionSafe ? { height: 0 } : false
                    }
                    animate={{ height: "auto" }}
                    transition={springs.glide}
                  >
                    <span className="block pt-0.5">
                      <Chip node={node} />
                    </span>
                  </motion.span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Nodes evenly across the top; at 40rem the answers sit under the labels. */
function TopRail({
  nodes,
  progress,
  motionSafe,
  flash,
  label,
  disabled,
  onJump,
  bindSlot,
  captions,
}: RailProps & { captions: boolean }) {
  const count = nodes.length;
  const inset = `${r2(50 / count)}%`;
  const fill = useTransform(progress, (p) =>
    r6(clamp01(p / Math.max(1, count - 1))),
  );
  return (
    <nav aria-label={label}>
      <ol
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden
          className="absolute top-[14px] h-0.5 rounded-full bg-hairline-strong"
          style={{ left: inset, right: inset }}
        />
        <motion.span
          aria-hidden
          className="absolute top-[14px] h-0.5 origin-left rounded-full bg-cobalt-bright"
          style={{ left: inset, right: inset, scaleX: fill }}
        />
        {nodes.map((node) => (
          <li key={node.index} className="flex min-w-0 justify-center">
            <button
              type="button"
              aria-label={node.name}
              aria-current={node.state === "current" ? "step" : undefined}
              aria-disabled={!node.reachable || undefined}
              disabled={disabled}
              onClick={() => onJump(node.index)}
              className={cn(
                "flex max-w-full min-w-0 flex-col items-center gap-1 rounded-2 px-1 pt-1 pb-1 transition-colors",
                FOCUS,
                node.reachable ? "hover:bg-surface-2" : "cursor-default",
              )}
            >
              <NodeDot
                node={node}
                motionSafe={motionSafe}
                flash={flash && flash.at === node.index ? flash.n : null}
              />
              <span
                className={cn(
                  "max-w-full truncate text-[11px] leading-4",
                  node.state === "current"
                    ? "font-medium text-foreground"
                    : node.state === "upcoming"
                      ? "text-ink-3"
                      : "text-ink-2",
                )}
              >
                {node.title}
              </span>
              {captions ? (
                <span
                  ref={bindSlot}
                  data-slot={`top:${node.index}`}
                  className="hidden h-5 max-w-full items-center justify-center @min-[40rem]:flex"
                >
                  <Chip node={node} />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function BarSegment({
  node,
  progress,
  disabled,
  onJump,
}: {
  node: RailNode;
  progress: MotionValue<number>;
  disabled: boolean;
  onJump: (index: number) => void;
}) {
  const fill = useTransform(progress, (p) => r6(clamp01(p + 1 - node.index)));
  return (
    <button
      type="button"
      aria-label={node.name}
      aria-current={node.state === "current" ? "step" : undefined}
      aria-disabled={!node.reachable || undefined}
      disabled={disabled}
      onClick={() => onJump(node.index)}
      className={cn(
        "flex h-5 w-full items-center rounded-1",
        FOCUS,
        !node.reachable && "cursor-default",
      )}
    >
      <span className="relative h-1.5 w-full overflow-clip rounded-full bg-hairline-strong">
        <motion.span
          aria-hidden
          className="absolute inset-0 origin-left rounded-full bg-cobalt-bright"
          style={{ scaleX: fill }}
        />
      </span>
    </button>
  );
}

function BarRail({
  nodes,
  progress,
  label,
  disabled,
  onJump,
  current,
  flash,
}: RailProps & { current: number }) {
  const after = nodes[current + 1];
  const finished = nodes.every((n) => n.state === "done");
  return (
    <nav aria-label={label}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
          {finished
            ? `All ${nodes.length} steps done`
            : `Step ${current + 1} of ${nodes.length}`}
        </span>
        <span className="min-w-0 truncate text-[12px] text-ink-3">
          {finished ? "" : after ? `Next: ${after.title}` : "Last step"}
        </span>
      </div>
      <ol
        className="relative grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))`,
        }}
      >
        {nodes.map((node) => (
          <li key={node.index} className="relative">
            <BarSegment
              node={node}
              progress={progress}
              disabled={disabled}
              onJump={onJump}
            />
            {flash && flash.at === node.index ? (
              <motion.span
                key={flash.n}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-danger"
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 0 }}
                transition={{ duration: durations.page, ease: easings.enter }}
              />
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* -------------------------------- flights ------------------------------- */

type Flight = {
  key: number;
  step: number;
  text: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** The destination is the slot's centre (a top rail) or its left edge. */
  centre: boolean;
};

/**
 * An answer on its way to the rail: x on glide and y on snap, so the two
 * settle at different rates and the path bows instead of running straight.
 */
function Flyer({
  flight,
  onLand,
}: {
  flight: Flight;
  onLand: (key: number) => void;
}) {
  const x = useMotionValue(flight.fromX);
  const y = useMotionValue(flight.fromY);
  const opacity = useMotionValue(0);
  const scale = useMotionValue(1.08);
  const [node, setNode] = React.useState<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!node) return;
    const tx = flight.centre
      ? r2(flight.toX - node.offsetWidth / 2)
      : flight.toX;
    const runs = [
      animate(opacity, 1, { duration: durations.blink }),
      animate(scale, 1, springs.glide),
      animate(y, flight.toY, springs.snap),
      animate(x, tx, {
        ...springs.glide,
        onComplete: () => onLand(flight.key),
      }),
    ];
    return () => {
      for (const r of runs) r.stop();
    };
  }, [node, flight, onLand, x, y, opacity, scale]);

  return (
    <motion.span
      ref={setNode}
      className="absolute top-0 left-0 inline-flex h-5 max-w-56 items-center rounded-1 border border-cobalt-bright/40 bg-popover px-1.5 text-[11px] whitespace-nowrap text-cobalt-bright shadow-[0_4px_12px_color-mix(in_oklab,black_14%,transparent)]"
      style={{ x, y, opacity, scale, originX: 0, originY: 0.5 }}
    >
      <span className="truncate">{flight.text}</span>
    </motion.span>
  );
}

/* -------------------------------- fields -------------------------------- */

type FieldProps = {
  field: WizardField;
  value: WizardValue;
  error: string | null;
  tick: boolean;
  uid: string;
  motionSafe: boolean;
  onChange: (value: WizardValue, index?: number) => void;
  onBlur: () => void;
};

function Message({
  id,
  text,
  motionSafe,
}: {
  id: string;
  text: string | null;
  motionSafe: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {text ? (
        <motion.p
          key="message"
          id={id}
          className="flex items-center gap-1.5 text-[12px] leading-4 text-danger"
          initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{
            opacity: { duration: durations.base, ease: easings.enter },
            y: motionSafe ? springs.snap : { duration: 0 },
          }}
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {text}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

function Field({
  field,
  value,
  error,
  tick,
  uid,
  motionSafe,
  onChange,
  onBlur,
}: FieldProps) {
  const id = `${uid}-f-${field.id}`;
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [
      field.hint && field.kind !== "toggle" ? hintId : null,
      error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const text = typeof value === "string" ? value : "";
  const optional =
    !field.required && field.kind !== "toggle" ? (
      <span className="font-normal text-ink-3"> · optional</span>
    ) : null;

  let control: React.ReactNode;
  if (field.kind === "text" || field.kind === "email" || field.kind === "url") {
    control = (
      <div
        className={cn(
          "flex h-9 items-center overflow-clip rounded-2 border bg-background text-[13px] transition-colors",
          RING_WITHIN,
          error
            ? "border-danger/70"
            : "border-input hover:border-hairline-strong",
        )}
      >
        {field.prefix ? (
          <span className="flex h-full shrink-0 items-center border-r border-input bg-surface-2 px-3 text-ink-3 select-none">
            {field.prefix}
          </span>
        ) : null}
        <input
          id={id}
          data-field={field.id}
          type={field.kind === "text" ? "text" : field.kind}
          inputMode={field.kind === "email" ? "email" : undefined}
          value={text}
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          spellCheck={field.kind === "text" && !field.suffix}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={onBlur}
          className={cn(
            "h-full w-full min-w-0 flex-1 bg-transparent px-3 text-foreground outline-none placeholder:text-ink-3",
          )}
        />
        <AnimatePresence initial={false}>
          {tick ? (
            <motion.svg
              key="tick"
              aria-hidden
              viewBox="0 0 16 16"
              className="mr-2.5 size-4 shrink-0 fill-none stroke-success"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              <motion.path
                d="M3.5 8.4 6.6 11.3 12.5 4.9"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={springs.flick}
              />
            </motion.svg>
          ) : null}
        </AnimatePresence>
        {field.suffix ? (
          <span className="flex h-full shrink-0 items-center border-l border-input bg-surface-2 px-3 text-ink-3 select-none">
            {field.suffix}
          </span>
        ) : null}
      </div>
    );
  } else if (field.kind === "choice") {
    const options = field.options ?? [];
    control = (
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className="grid gap-2 @min-[36rem]/panel:grid-cols-3"
      >
        {options.map((o, i) => {
          const on = value === o.id;
          return (
            <label
              key={o.id}
              className={cn(
                "relative flex cursor-pointer flex-col gap-1 rounded-3 border px-3 py-2.5 transition-colors",
                RING_WITHIN,
                on
                  ? "border-cobalt-bright bg-cobalt-wash"
                  : error
                    ? "border-danger/60 bg-background hover:border-danger"
                    : "border-hairline bg-background hover:border-hairline-strong",
              )}
            >
              <input
                type="radio"
                name={id}
                value={o.id}
                data-field={field.id}
                checked={on}
                onChange={() => onChange(o.id, i)}
                className="sr-only"
              />
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                    on ? "border-cobalt-bright" : "border-hairline-strong",
                  )}
                >
                  <motion.span
                    className="size-2 rounded-full bg-cobalt-bright"
                    initial={false}
                    animate={{ scale: on ? 1 : 0 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                  {o.label}
                </span>
                {o.meta ? (
                  <span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
                    {o.meta}
                  </span>
                ) : null}
              </span>
              {o.description ? (
                <span className="pl-6 text-[12px] leading-4 text-ink-3">
                  {o.description}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    );
  } else if (field.kind === "segmented") {
    const options = field.options ?? [];
    const at = options.findIndex((o) => o.id === value);
    control = (
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(
          "relative grid h-9 rounded-2 border bg-background p-0.5 transition-colors",
          error ? "border-danger/70" : "border-input",
        )}
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        <motion.span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0.5 rounded-1 border border-cobalt-bright/50 bg-cobalt-wash"
          style={{
            width: `calc((100% - 4px) / ${Math.max(1, options.length)})`,
          }}
          initial={false}
          animate={{ x: `${Math.max(0, at) * 100}%`, opacity: at < 0 ? 0 : 1 }}
          transition={
            motionSafe
              ? { x: springs.snap, opacity: { duration: durations.fast } }
              : { duration: 0 }
          }
        />
        {options.map((o, i) => {
          const on = value === o.id;
          return (
            <label
              key={o.id}
              className={cn(
                "relative flex cursor-pointer items-center justify-center rounded-1 px-1 text-[12px] transition-colors",
                RING_WITHIN,
                on
                  ? "font-medium text-cobalt-bright"
                  : "text-ink-2 hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name={id}
                value={o.id}
                data-field={field.id}
                checked={on}
                onChange={() => onChange(o.id, i)}
                className="sr-only"
              />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </div>
    );
  } else {
    const on = value === true;
    control = (
      <label
        className={cn(
          "flex cursor-pointer items-center justify-between gap-4 rounded-3 border border-hairline bg-background px-3 py-2.5 transition-colors hover:border-hairline-strong",
          RING_WITHIN,
        )}
      >
        <span className="min-w-0">
          <span
            id={labelId}
            className="block text-[13px] font-medium text-foreground"
          >
            {field.label}
          </span>
          {field.hint ? (
            <span
              id={hintId}
              className="block text-[12px] leading-4 text-ink-3"
            >
              {field.hint}
            </span>
          ) : null}
        </span>
        <input
          type="checkbox"
          role="switch"
          data-field={field.id}
          checked={on}
          aria-labelledby={labelId}
          aria-describedby={
            [field.hint ? hintId : null, error ? errorId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            on ? "bg-cobalt-bright" : "bg-ink-3/35",
          )}
        >
          <motion.span
            className="absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]"
            initial={false}
            animate={{ x: on ? 16 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        </span>
      </label>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        field.half
          ? "@min-[36rem]/panel:col-span-1"
          : "@min-[36rem]/panel:col-span-2",
      )}
    >
      {field.kind === "toggle" ? null : field.kind === "choice" ||
        field.kind === "segmented" ? (
        <span id={labelId} className="text-[12px] font-medium text-ink-2">
          {field.label}
          {optional}
        </span>
      ) : (
        <label
          id={labelId}
          htmlFor={id}
          className="text-[12px] font-medium text-ink-2"
        >
          {field.label}
          {optional}
        </label>
      )}
      {control}
      {field.hint && field.kind !== "toggle" ? (
        <p id={hintId} className="text-[12px] leading-4 text-ink-3">
          {field.hint}
        </p>
      ) : null}
      <Message id={errorId} text={error} motionSafe={motionSafe} />
    </div>
  );
}

/* -------------------------------- wizard -------------------------------- */

type Phase = "idle" | "pending" | "error" | "done";

const messageOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : "That didn't go through. Try again.";

/**
 * A setup flow you cannot get lost in. A rail shows every step and fills as
 * you go — one motion value on glide — and what you answered travels into it:
 * a valid Next lifts the step's answer off the panel and flies it to that
 * step's place on the rail (x on glide, y on snap, so the path bows), where it
 * stays. A Next the step cannot take leans the rail toward the next node and
 * pulls it back, while the fields say why and focus goes to the first of them.
 *
 * Panels swap by direction — Next from one side, Back from the other, by
 * 16px on snap, on the axis `direction` names — inside a box that glides to
 * each panel's measured height. The last step is a review of every answer
 * with an Edit link per step; editing returns you straight to the review.
 *
 * The rail is a navigation list of buttons, the panel a real form (Enter is
 * Next), choices are native radio groups and the switch a native checkbox;
 * the new panel's heading takes focus as it arrives and every step change is
 * announced. Under reduced motion panels cross-fade in place, answers appear
 * on the rail without flying and a held Next flashes the next node instead of
 * leaning, while progress, messages and answers all still show.
 */
export function SetupWizard({
  steps = defaultWizardSteps,
  value,
  defaultValue,
  onValueChange,
  step,
  defaultStep = 0,
  onStepChange,
  onInvalid,
  onSubmit,
  onRestart,
  rail = "side",
  validate = "next",
  direction = "horizontal",
  title = "Set up your workspace",
  subtitle,
  reviewTitle = "Review",
  submitLabel = "Create workspace",
  pendingLabel = "Working…",
  doneTitle,
  doneBody = "Your answers are saved. You can change any of them later in settings.",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: SetupWizardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const n = steps.length;
  const reviewAt = n;
  const count = n + 1;
  const clampIndex = (i: number) =>
    Math.min(reviewAt, Math.max(0, Math.round(i)));

  const [seed] = React.useState<WizardValues>(
    () =>
      defaultValue ??
      (steps === defaultWizardSteps ? defaultWizardValues : blankValues(steps)),
  );
  const [ownValues, setOwnValues] = React.useState<WizardValues>(seed);
  const values = value ?? ownValues;

  const [ownStep, setOwnStep] = React.useState(() => clampIndex(defaultStep));
  const current = clampIndex(step ?? ownStep);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [failure, setFailure] = React.useState<string | null>(null);
  const [attempted, setAttempted] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [dirty, setDirty] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [returning, setReturning] = React.useState(false);
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [landings, setLandings] = React.useState<Record<number, number>>({});
  const [flash, setFlash] = React.useState<{ at: number; n: number } | null>(
    null,
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [arrived, setArrived] = React.useState<{
    key: string;
    node: HTMLElement;
  } | null>(null);

  const titleAt = (i: number) =>
    i >= reviewAt ? reviewTitle : (steps[i]?.title ?? "");

  // The step on screen follows the step asked for — the host's answer when
  // controlled — and the direction is read from the change, here in render.
  const [shown, setShown] = React.useState(current);
  const [dir, setDir] = React.useState(1);
  const [furthest, setFurthest] = React.useState(current);
  if (shown !== current) {
    setDir(current > shown ? 1 : -1);
    setShown(current);
    setSaid((s) => ({
      n: s.n + 1,
      text: `Step ${current + 1} of ${count}, ${titleAt(current)}.`,
    }));
  }
  if (current > furthest) setFurthest(current);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const headings = React.useRef(new Map<string, HTMLElement>());
  const slots = React.useRef(new Map<string, HTMLElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const focusNext = React.useRef<string | null>(null);
  const focusField = React.useRef<string | null>(null);
  const flightSeq = React.useRef(0);
  const alive = React.useRef(true);

  const progress = useMotionValue(current);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const keyAt = (i: number, p: Phase = phase) =>
    p === "done" ? "done" : i >= reviewAt ? "review" : (steps[i]?.id ?? "");
  const panelKey = keyAt(current);

  const valueOf = (f: WizardField) => values[f.id] ?? blankOf(f);
  const errorsAt = (i: number) => {
    const s = steps[i];
    if (!s) return [];
    return s.fields.flatMap((f) => {
      const message = problemOf(f, valueOf(f), values);
      return message ? [{ field: f, message }] : [];
    });
  };
  const validAt = (i: number) => errorsAt(i).length === 0;

  const captionAt = (i: number): string | null => {
    const s = steps[i];
    if (!s) return null;
    const first = s.fields[0];
    const text = s.summary
      ? s.summary(values)
      : first
        ? textOf(first, valueOf(first), values)
        : "";
    return text.trim() ? text.trim() : null;
  };

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const doneText =
    typeof doneTitle === "function"
      ? doneTitle(values)
      : (doneTitle ??
        (typeof values.name === "string" && values.name.trim()
          ? `${values.name.trim()} is ready`
          : "You're all set"));

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /* --------------------------- the visitor's moves -------------------------- */

  const goTo = (to: number) => {
    const target = clampIndex(to);
    if (target === current) return;
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      focusNext.current = keyAt(target, "idle");
    }
    audio.play("swish", {
      pitch: target > current ? 1.12 : 0.88,
      gain: 0.32,
      pan: panOf(root),
    });
    if (step === undefined) setOwnStep(target);
    onStepChange?.(target);
  };

  const bumpLanding = (i: number) =>
    setLandings((l) => ({ ...l, [i]: (l[i] ?? 0) + 1 }));

  /** Lifts step i's answer off the panel and flies it to its slot on the rail. */
  const fly = (i: number) => {
    const text = captionAt(i);
    if (!text) return;
    const root = rootRef.current;
    const head = headings.current.get(keyAt(i, "idle"));
    const visible = (el: HTMLElement | undefined) =>
      el && el.getClientRects().length > 0 ? el : undefined;
    const side = visible(slots.current.get(`side:${i}`));
    const top = side ? undefined : visible(slots.current.get(`top:${i}`));
    const slot = side ?? top;
    bumpLanding(i);
    if (!motionSafe || !root || !head || !slot) return;
    const box = root.getBoundingClientRect();
    const ox = box.left + root.clientLeft - root.scrollLeft;
    const oy = box.top + root.clientTop - root.scrollTop;
    const h = head.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    flightSeq.current += 1;
    const flight: Flight = {
      key: flightSeq.current,
      step: i,
      text,
      fromX: r2(h.left - ox),
      fromY: r2(h.top - oy + (h.height - 20) / 2),
      // Under a side label the answer sits on the next line, 2px down.
      toX: r2((top ? s.left + s.width / 2 : s.left) - ox),
      toY: r2((side ? s.bottom + 2 : s.top) - oy),
      centre: !!top,
    };
    setFlights((list) => [...list.filter((f) => f.step !== i), flight]);
  };

  const land = React.useCallback((key: number) => {
    setFlights((list) => list.filter((f) => f.key !== key));
  }, []);

  /** The flow tries to move and is held: the rail leans toward the next node and is pulled back. */
  const hold = (i: number, errs: { field: WizardField; message: string }[]) => {
    const s = steps[i];
    if (!s) return;
    setAttempted((prev) => (prev.has(s.id) ? prev : new Set(prev).add(s.id)));
    setFlash((f) => ({ at: Math.min(reviewAt, i + 1), n: (f?.n ?? 0) + 1 }));
    if (motionSafe) {
      const base = i;
      run(
        "progress",
        animate(progress, base + 0.45, {
          ...springs.flick,
          onComplete: () =>
            run("progress", animate(progress, base, springs.snap)),
        }),
      );
    }
    audio.play("click", {
      pitch: 0.62,
      gain: 0.4,
      pan: panOf(rootRef.current),
    });
    const names = errs.map((e) => e.field.label).join(", ");
    say(
      `${plural(errs.length, "field")} ${errs.length === 1 ? "needs" : "need"} attention: ${names}.`,
    );
    const first = errs[0];
    if (first) focusField.current = first.field.id;
    onInvalid?.(
      i,
      errs.map((e) => e.field.id),
    );
  };

  const submit = async () => {
    if (phase === "pending" || disabled) return;
    for (let k = 0; k < n; k += 1) {
      const errs = errorsAt(k);
      if (errs.length === 0) continue;
      const s = steps[k];
      if (s) {
        setAttempted((prev) =>
          prev.has(s.id) ? prev : new Set(prev).add(s.id),
        );
        say(`${s.title} needs attention before you finish.`);
      }
      onInvalid?.(
        k,
        errs.map((e) => e.field.id),
      );
      setReturning(true);
      goTo(k);
      return;
    }
    setFailure(null);
    setPhase("pending");
    say(pendingLabel);
    try {
      await onSubmit?.(values);
      if (!alive.current) return;
      const root = rootRef.current;
      if (root && root.contains(document.activeElement)) {
        focusNext.current = "done";
      }
      setPhase("done");
      say(`${doneText}.`);
    } catch (error) {
      if (!alive.current) return;
      setPhase("error");
      setFailure(messageOf(error));
    }
  };

  const next = () => {
    if (disabled || phase === "pending" || phase === "done") return;
    if (current >= reviewAt) {
      void submit();
      return;
    }
    const errs = errorsAt(current);
    if (errs.length > 0) {
      hold(current, errs);
      return;
    }
    const to = returning ? reviewAt : current + 1;
    fly(current);
    if (to === reviewAt) setReturning(false);
    goTo(to);
  };

  const back = () => {
    if (disabled || phase === "pending" || current === 0) return;
    setReturning(false);
    goTo(current - 1);
  };

  const jump = (i: number) => {
    if (disabled || phase === "pending" || phase === "done") return;
    if (i === current || i > furthest) return;
    if (i < current) {
      setReturning(false);
      goTo(i);
      return;
    }
    // Forward along the rail: every step on the way has to stand.
    for (let k = current; k < i; k += 1) {
      const errs = errorsAt(k);
      if (errs.length === 0) continue;
      if (k === current) hold(k, errs);
      else goTo(k);
      return;
    }
    fly(current);
    goTo(i);
  };

  const edit = (i: number) => {
    if (disabled || phase === "pending") return;
    audio.play("click", { pitch: 1.1, gain: 0.4, pan: panOf(rootRef.current) });
    setReturning(true);
    goTo(i);
  };

  const restart = () => {
    onRestart?.();
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      focusNext.current = keyAt(0, "idle");
    }
    setPhase("idle");
    setFailure(null);
    setAttempted(new Set());
    setTouched(new Set());
    setDirty(new Set());
    setReturning(false);
    setFlights([]);
    setLandings({});
    setFurthest(0);
    if (value === undefined) setOwnValues(seed);
    audio.play("swish", { pitch: 0.88, gain: 0.32, pan: panOf(root) });
    if (step === undefined) setOwnStep(0);
    onStepChange?.(0);
  };

  const change = (field: WizardField, next: WizardValue, index?: number) => {
    if (disabled) return;
    const all = { ...values, [field.id]: next };
    if (value === undefined) setOwnValues(all);
    onValueChange?.(all);
    setDirty((d) => (d.has(field.id) ? d : new Set(d).add(field.id)));
    if (phase === "error") setPhase("idle");
    if (index !== undefined || field.kind === "toggle") {
      audio.play("click", {
        pitch:
          field.kind === "toggle"
            ? next
              ? 1.15
              : 0.9
            : 0.9 + (index ?? 0) * 0.12,
        gain: 0.45,
        pan: panOf(rootRef.current),
      });
    }
  };

  const blur = (field: WizardField) =>
    setTouched((t) => (t.has(field.id) ? t : new Set(t).add(field.id)));

  /* -------------------------------- effects -------------------------------- */

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The rail's fill follows the step on glide; a re-run carries it on from
  // wherever it is rather than freezing it part-way.
  const target = phase === "done" ? reviewAt : current;
  React.useEffect(() => {
    const map = anims.current;
    map.get("progress")?.stop();
    const c = animate(
      progress,
      target,
      motionSafe
        ? { ...springs.glide, velocity: progress.getVelocity() }
        : { duration: durations.fast, ease: easings.enter },
    );
    map.set("progress", c);
    return () => c.stop();
  }, [target, motionSafe, progress]);

  React.useEffect(() => {
    const map = anims.current;
    return () => {
      for (const c of map.values()) c.stop();
      map.clear();
    };
  }, []);

  /** Brings a node inside the root into view without scrolling the page. */
  const reveal = React.useCallback((node: HTMLElement) => {
    const root = rootRef.current;
    if (!root || root.scrollHeight <= root.clientHeight) return;
    const box = root.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    if (r.top < box.top + 8) {
      root.scrollTo({ top: root.scrollTop + r.top - box.top - 12 });
    } else if (r.bottom > box.bottom - 8) {
      root.scrollTo({ top: root.scrollTop + r.bottom - box.bottom + 12 });
    }
  }, []);

  // Focus follows the panel the visitor moved to, once that panel exists.
  React.useEffect(() => {
    if (!arrived || !arrived.node.isConnected) return;
    if (focusNext.current !== arrived.key) return;
    focusNext.current = null;
    arrived.node.focus({ preventScroll: true });
    reveal(arrived.node);
  }, [arrived, reveal]);

  // A held Next sends focus to the first field that needs attention, after
  // its message is in the document so it is read with the field.
  React.useEffect(() => {
    const id = focusField.current;
    const root = rootRef.current;
    if (!id || !root) return;
    focusField.current = null;
    const controls = Array.from(
      root.querySelectorAll<HTMLInputElement>(`[data-field="${id}"]`),
    );
    const el = controls.find((c) => c.checked) ?? controls[0];
    if (!el) return;
    el.focus({ preventScroll: true });
    reveal(el);
  });

  const bindHeading = React.useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const key = node.dataset.panel ?? "";
    headings.current.set(key, node);
    setArrived((a) => (a && a.node === node ? a : { key, node }));
  }, []);

  const bindSlot = React.useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const key = node.dataset.slot;
    if (key) slots.current.set(key, node);
  }, []);

  /* --------------------------------- view ---------------------------------- */

  const inFlight = new Set(flights.map((f) => f.step));
  const nodes: RailNode[] = Array.from({ length: count }, (_, i) => {
    const isReview = i === reviewAt;
    const answered = !isReview && i < furthest && validAt(i);
    const state: NodeState =
      phase === "done"
        ? "done"
        : i === current
          ? "current"
          : answered
            ? "done"
            : i <= furthest
              ? "visited"
              : "upcoming";
    const caption =
      answered || (phase === "done" && !isReview) ? captionAt(i) : null;
    const word =
      state === "done"
        ? "done"
        : state === "current"
          ? "current step"
          : state === "visited"
            ? "not finished"
            : "not started";
    return {
      index: i,
      title: titleAt(i),
      caption,
      state,
      reachable:
        !disabled && phase !== "done" && i !== current && i <= furthest,
      name: `Step ${i + 1}, ${titleAt(i)}, ${word}${caption ? `, ${caption}` : ""}`,
      inFlight: inFlight.has(i),
      landings: landings[i] ?? 0,
    };
  });

  const railLabel = `${title}: progress`;
  const railProps: RailProps = {
    nodes,
    progress,
    motionSafe,
    flash,
    label: railLabel,
    disabled,
    onJump: jump,
    bindSlot,
  };

  const variants: Variants = {
    enter: (d: number) =>
      !motionSafe
        ? { opacity: 0 }
        : direction === "vertical"
          ? { opacity: 0, y: d * distances.shift }
          : direction === "depth"
            ? { opacity: 0, scale: d > 0 ? 0.96 : 1.03 }
            : { opacity: 0, x: d * distances.shift },
    center: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: (d: number) => ({
      ...(!motionSafe
        ? { opacity: 0 }
        : direction === "vertical"
          ? { opacity: 0, y: -d * distances.shift }
          : direction === "depth"
            ? { opacity: 0, scale: d > 0 ? 1.03 : 0.96 }
            : { opacity: 0, x: -d * distances.shift }),
      transition: exitFor(motionSafe ? durations.base : durations.fast),
    }),
  };

  const pending = phase === "pending";
  const primary =
    current >= reviewAt
      ? pending
        ? pendingLabel
        : submitLabel
      : returning
        ? "Back to review"
        : current === reviewAt - 1
          ? "Review"
          : "Continue";
  const primaryLabels = Array.from(
    new Set([
      "Continue",
      "Review",
      "Back to review",
      submitLabel,
      pendingLabel,
    ]),
  );

  let panel: React.ReactNode;
  if (phase === "done") {
    panel = (
      <div className="flex flex-col items-start gap-3 py-1">
        <motion.span
          aria-hidden
          className="grid size-11 place-items-center rounded-full bg-[oklch(from_var(--success)_0.82_c_h)]"
          initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { scale: springs.recoil, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6 fill-none stroke-[oklch(from_var(--success)_0.32_c_h)]"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M6.5 12.4 10.3 16 17.6 8.4"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ ...springs.flick, delay: 0.14 }}
            />
          </svg>
        </motion.span>
        <div>
          <h3
            ref={bindHeading}
            data-panel="done"
            tabIndex={-1}
            className="text-[15px] font-semibold text-foreground outline-none"
          >
            {doneText}
          </h3>
          <p className="mt-1 text-[13px] text-ink-3">{doneBody}</p>
        </div>
        <button
          type="button"
          onClick={restart}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-4" />
          Start over
        </button>
      </div>
    );
  } else if (current >= reviewAt) {
    const gap = cascade(n);
    panel = (
      <div className="flex flex-col gap-4">
        <div>
          <h3
            ref={bindHeading}
            data-panel="review"
            tabIndex={-1}
            className="text-[15px] font-semibold text-foreground outline-none"
          >
            {reviewTitle}
          </h3>
          <p className="mt-1 text-[13px] text-ink-3">
            Check each answer. Edit takes you back to that step.
          </p>
        </div>
        <div className="grid gap-2.5 @min-[36rem]/panel:grid-cols-2">
          {steps.map((s, i) => {
            const headId = `${uid}-review-${s.id}`;
            return (
              <motion.section
                key={s.id}
                aria-labelledby={headId}
                className={cn(
                  "min-w-0 rounded-3 border border-hairline bg-surface-1 px-3 pt-2 pb-3",
                  steps.length % 2 === 1 &&
                    i === steps.length - 1 &&
                    "@min-[36rem]/panel:col-span-2",
                )}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  y: motionSafe
                    ? { ...springs.snap, delay: 0.06 + i * gap }
                    : { duration: 0 },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: (motionSafe ? 0.06 : 0) + i * gap,
                  },
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4
                    id={headId}
                    className="truncate font-mono text-[11px] tracking-[0.06em] text-ink-3 uppercase"
                  >
                    {s.title}
                  </h4>
                  <button
                    type="button"
                    aria-label={`Edit ${s.title}`}
                    disabled={disabled || pending}
                    onClick={() => edit(i)}
                    className={cn(
                      "-mr-1.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[12px] text-cobalt-bright transition-colors enabled:hover:bg-cobalt-wash disabled:opacity-50",
                      FOCUS,
                    )}
                  >
                    <Pencil aria-hidden className="size-3.5" />
                    Edit
                  </button>
                </div>
                <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
                  {s.fields.map((f) => {
                    const shownText = textOf(f, valueOf(f), values);
                    return (
                      <React.Fragment key={f.id}>
                        <dt className="text-ink-3">{f.label}</dt>
                        <dd
                          className="min-w-0 truncate text-right text-foreground"
                          title={shownText || undefined}
                        >
                          {shownText || (
                            <span className="text-ink-3">Not set</span>
                          )}
                        </dd>
                      </React.Fragment>
                    );
                  })}
                </dl>
              </motion.section>
            );
          })}
        </div>
        <AnimatePresence initial={false}>
          {failure ? (
            <motion.div
              key="failure"
              role="alert"
              className="flex items-start gap-2 rounded-2 border border-danger/40 bg-danger/8 px-3 py-2 text-[13px] text-danger"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{failure}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  } else {
    const s = steps[current];
    const shownError = (f: WizardField) => {
      if (!s) return null;
      const message = problemOf(f, valueOf(f), values);
      if (!message) return null;
      const seen =
        attempted.has(s.id) ||
        (validate === "blur" && touched.has(f.id)) ||
        (validate === "live" && (dirty.has(f.id) || touched.has(f.id)));
      return seen ? message : null;
    };
    panel = s ? (
      <div className="flex flex-col gap-4">
        <div>
          <h3
            ref={bindHeading}
            data-panel={s.id}
            tabIndex={-1}
            className="text-[15px] font-semibold text-foreground outline-none"
          >
            {s.title}
          </h3>
          {s.description ? (
            <p className="mt-1 text-[13px] text-ink-3">{s.description}</p>
          ) : null}
        </div>
        <div className="grid gap-4 @min-[36rem]/panel:grid-cols-2">
          {s.fields.map((f) => {
            const error = shownError(f);
            const v = valueOf(f);
            const tick =
              validate === "live" &&
              !error &&
              typeof v === "string" &&
              v.trim() !== "" &&
              (f.kind === "text" || f.kind === "email" || f.kind === "url") &&
              !problemOf(f, v, values);
            return (
              <Field
                key={f.id}
                field={f}
                value={v}
                error={error}
                tick={tick}
                uid={uid}
                motionSafe={motionSafe}
                onChange={(next, index) => change(f, next, index)}
                onBlur={() => blur(f)}
              />
            );
          })}
        </div>
      </div>
    ) : null;
  }

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-hidden className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full bg-ink-3/15",
                motionSafe && "animate-pulse",
              )}
            />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <span className="h-3 w-24 rounded-1 bg-ink-3/15" />
            <span
              className={cn(
                "h-9 rounded-2 bg-ink-3/10",
                motionSafe && "animate-pulse",
              )}
            />
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">
          The setup steps didn&apos;t load.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[13px] text-foreground transition-colors enabled:hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const header = (
    <div className="min-w-0">
      <h2 id={titleId} className="text-[15px] font-semibold text-foreground">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>
      ) : null}
    </div>
  );

  const side = rail === "side" && status === "ready";

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || pending || undefined}
      className={cn(
        "@container relative isolate w-full [scrollbar-width:thin] overflow-x-hidden overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        className={cn(
          "grid gap-4 p-4 @min-[40rem]:gap-6 @min-[40rem]:p-5",
          side &&
            "@min-[40rem]:grid-cols-[13rem_minmax(0,1fr)] @min-[64rem]:grid-cols-[16rem_minmax(0,1fr)]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-4 @min-[40rem]:gap-5">
          {header}
          {status !== "ready" ? null : rail === "side" ? (
            <>
              <div className="hidden @min-[40rem]:block">
                <SideRail {...railProps} />
              </div>
              <div className="@min-[40rem]:hidden">
                <TopRail {...railProps} captions={false} />
              </div>
            </>
          ) : rail === "top" ? (
            <TopRail {...railProps} captions />
          ) : (
            <BarRail
              {...railProps}
              current={phase === "done" ? reviewAt : current}
            />
          )}
        </div>

        <div className="@container/panel flex min-w-0 flex-col gap-4">
          {status !== "ready" ? (
            body
          ) : (
            <form
              noValidate
              aria-labelledby={titleId}
              onSubmit={(event) => {
                event.preventDefault();
                next();
              }}
              className="flex flex-col gap-4"
            >
              <fieldset disabled={disabled} className="contents">
                <Measured motionSafe={motionSafe}>
                  <AnimatePresence
                    initial={false}
                    mode="popLayout"
                    custom={dir}
                  >
                    <motion.div
                      key={panelKey}
                      custom={dir}
                      variants={variants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{
                        x: springs.snap,
                        y: springs.snap,
                        scale: springs.snap,
                        opacity: {
                          duration: motionSafe
                            ? durations.base
                            : durations.fast,
                          ease: easings.enter,
                        },
                      }}
                    >
                      {panel}
                    </motion.div>
                  </AnimatePresence>
                </Measured>
                {phase === "done" ? null : (
                  <div className="flex items-center gap-2 border-t border-hairline pt-3">
                    <span className="mr-auto hidden font-mono text-[11px] text-ink-3 tabular-nums @min-[30rem]:inline">
                      {current + 1} of {count}
                    </span>
                    {current > 0 ? (
                      <button
                        type="button"
                        onClick={back}
                        disabled={pending}
                        className={cn(
                          "inline-flex h-9 shrink-0 items-center gap-1 rounded-2 pr-3 pl-2 text-[13px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
                          FOCUS,
                        )}
                      >
                        <ChevronLeft aria-hidden className="size-4" />
                        Back
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      aria-disabled={pending || undefined}
                      className={cn(
                        "inline-flex h-9 flex-1 items-center justify-center rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 @min-[30rem]:flex-none",
                        FOCUS,
                        pending && "cursor-progress",
                      )}
                    >
                      <span className="grid">
                        {primaryLabels.map((text) => (
                          <span
                            key={text}
                            aria-hidden={text !== primary || undefined}
                            className={cn(
                              "col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap",
                              text === primary ? "visible" : "invisible",
                            )}
                          >
                            {text === pendingLabel ? (
                              <LoaderCircle
                                aria-hidden
                                className={cn(
                                  "size-4",
                                  motionSafe && "animate-spin",
                                )}
                              />
                            ) : null}
                            {text}
                          </span>
                        ))}
                      </span>
                    </button>
                  </div>
                )}
              </fieldset>
            </form>
          )}
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-30"
      >
        {flights.map((f) => (
          <Flyer key={f.key} flight={f} onLand={land} />
        ))}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
