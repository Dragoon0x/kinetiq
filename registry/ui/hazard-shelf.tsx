"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Archive,
  ArrowRightLeft,
  ChevronDown,
  LoaderCircle,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type HazardKind = "transfer" | "archive" | "delete";

/** One thing an action reaches, counted: "412 documents". */
export type HazardTouch = {
  id: string;
  count: number;
  /** The noun for one: "document". */
  one: string;
  /** The noun for many: "documents". */
  other: string;
  /** What happens to them, in a few words: "deleted with the workspace". */
  note?: string;
};

export type HazardAction = {
  id: string;
  kind: HazardKind;
  /** "Delete workspace". */
  title: string;
  /** One line under the title. */
  summary: string;
  /** Everything the action reaches, in the order a reader should meet it. */
  touches: HazardTouch[];
  /** The armed confirm button's words. @default "Delete Fernworks" (by kind) */
  confirmLabel?: string;
  /** What the row says once it is done. @default "Deletion scheduled" (by kind) */
  doneLabel?: string;
};

/** Someone ownership can pass to. */
export type HazardMember = { id: string; name: string; role: string };

export type HazardStatus = "ready" | "loading" | "error";
export type HazardStripeStyle = "tape" | "rail" | "hatch" | "plain";
export type HazardDensity = "compact" | "regular" | "roomy";
export type HazardTone = "amber" | "red" | "ink";

export type HazardShelfProps = {
  /** The actions on the shelf, top to bottom. @default defaultHazardActions */
  actions?: HazardAction[];
  /** The workspace's name: what the confirm field asks for. @default "Fernworks" */
  workspace?: string;
  /** Who ownership can be transferred to. @default defaultHazardMembers */
  members?: HazardMember[];
  /** Controlled open action id, or null for none. */
  value?: string | null;
  /** Initial open action when uncontrolled; an action open at first render is shown unrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the press or key that opened or rolled up a panel. */
  onValueChange?: (id: string | null) => void;
  /** Fires after a confirmed transfer, with the new owner's id. Return a promise to show it pending; a rejection is reported in the panel. */
  onTransfer?: (memberId: string) => void | Promise<unknown>;
  /** Fires after a confirmed archive. May return a promise. */
  onArchive?: () => void | Promise<unknown>;
  /** Fires after a confirmed delete. May return a promise. */
  onDelete?: () => void | Promise<unknown>;
  /** Whether the consequence counts have arrived. Loading shows placeholders; nothing can be confirmed until they are in. @default "ready" */
  status?: HazardStatus;
  /** "Count again" was pressed after the counts failed. */
  onRetry?: () => void;
  /** How the caution shows: a striped tape across the panel's top, a rail down its edge, a faint hatch, or a plain hairline. @default "tape" */
  stripeStyle?: HazardStripeStyle;
  /** Row padding, type size and tile size. @default "regular" */
  density?: HazardDensity;
  /** The hazard hue: amber caution, red danger, or graphite. @default "amber" */
  tone?: HazardTone;
  /** How long the counts take to fill in from zero, ms. @default 700 */
  countDuration?: number;
  /** The typed name must match letter case too. @default true */
  matchCase?: boolean;
  /** The shelf's heading. @default "Irreversible actions" */
  title?: string;
  /** Tallest the shelf grows before it scrolls inside, px. @default 520 */
  maxHeight?: number;
  /** Triggers and confirms are inert and the shelf dims. @default false */
  disabled?: boolean;
  /** Classes for the outer shelf. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                Defaults                                  */
/* ----------------------------------------------------------------------- */

export const defaultHazardMembers: HazardMember[] = [
  { id: "ada", name: "Ada Moreau", role: "Admin" },
  { id: "kofi", name: "Kofi Mensah", role: "Admin" },
  { id: "ines", name: "Ines Park", role: "Admin" },
];

export const defaultHazardActions: HazardAction[] = [
  {
    id: "transfer",
    kind: "transfer",
    title: "Transfer ownership",
    summary: "Hand the workspace to another admin. You stay on as an admin.",
    touches: [
      {
        id: "plan",
        count: 1,
        one: "billing plan",
        other: "billing plans",
        note: "moves to the new owner",
      },
      {
        id: "integrations",
        count: 3,
        one: "integration",
        other: "integrations",
        note: "need the new owner to reconnect",
      },
      {
        id: "members",
        count: 18,
        one: "member",
        other: "members",
        note: "keep their roles",
      },
    ],
  },
  {
    id: "archive",
    kind: "archive",
    title: "Archive workspace",
    summary:
      "Freeze everything as it is. Nobody can edit until it is restored.",
    touches: [
      {
        id: "documents",
        count: 412,
        one: "document",
        other: "documents",
        note: "become read-only",
      },
      {
        id: "members",
        count: 18,
        one: "member",
        other: "members",
        note: "lose edit access",
      },
      {
        id: "exports",
        count: 6,
        one: "scheduled export",
        other: "scheduled exports",
        note: "stop running",
      },
    ],
  },
  {
    id: "delete",
    kind: "delete",
    title: "Delete workspace",
    summary:
      "Remove the workspace and everything in it. This cannot be undone.",
    touches: [
      {
        id: "documents",
        count: 412,
        one: "document",
        other: "documents",
        note: "deleted with their history",
      },
      {
        id: "members",
        count: 18,
        one: "member",
        other: "members",
        note: "removed from the workspace",
      },
      {
        id: "integrations",
        count: 3,
        one: "integration",
        other: "integrations",
        note: "disconnected and revoked",
      },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const noop = () => () => {};
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Thousands by hand: a locale lookup in render would not survive hydration. */
const group = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const counted = (t: HazardTouch) =>
  `${group(t.count)} ${t.count === 1 ? t.one : t.other}`;

/** "a, b and c" — one accessible string, never a list of fragments. */
const sentence = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

const ICON: Record<HazardKind, typeof Trash2> = {
  transfer: ArrowRightLeft,
  archive: Archive,
  delete: Trash2,
};

const VERB: Record<HazardKind, { doing: string; ing: string; past: string }> = {
  transfer: { doing: "Transfer", ing: "Transferring", past: "transferred" },
  archive: { doing: "Archive", ing: "Archiving", past: "archived" },
  delete: { doing: "Delete", ing: "Deleting", past: "deleted" },
};

const LEAD: Record<HazardKind, string> = {
  transfer: "hands over",
  archive: "freezes, for everyone",
  delete: "removes, for everyone",
};

type ToneSpec = {
  /** Text and strokes: the plain token, tuned for contrast in each theme. */
  text: string;
  /** The stripe pigment: the token's hue at a fixed lightness. */
  pigment: string;
  /** The stripe's dark band. */
  gap: string;
  /** The armed button's fill and its label. */
  solid: string;
  solidText: string;
  line: string;
};

/*
 * Stripes are pigment, not text: a warn token darkened for a light page reads
 * as mud when it fills a band, so the band takes the token's hue and chroma at
 * a fixed lightness and looks the same in both themes.
 */
const TONES: Record<HazardTone, ToneSpec> = {
  amber: {
    text: "text-warn",
    pigment: "oklch(from var(--warn) 0.8 c h)",
    gap: "oklch(from var(--warn) 0.27 0.03 h)",
    solid: "oklch(from var(--warn) 0.8 c h)",
    solidText: "oklch(from var(--warn) 0.24 0.04 h)",
    line: "var(--warn)",
  },
  red: {
    text: "text-danger",
    pigment: "oklch(from var(--danger) 0.64 c h)",
    gap: "oklch(from var(--danger) 0.25 0.03 h)",
    solid: "var(--danger)",
    solidText: "var(--destructive-foreground)",
    line: "var(--danger)",
  },
  ink: {
    text: "text-foreground",
    pigment: "oklch(from var(--ink-2) 0.5 0.01 h)",
    gap: "oklch(from var(--ink-2) 0.86 0.005 h)",
    solid: "var(--foreground)",
    solidText: "var(--background)",
    line: "var(--ink-2)",
  },
};

const DENSITY: Record<
  HazardDensity,
  {
    row: string;
    title: string;
    summary: string;
    tile: string;
    icon: string;
    figure: string;
    panel: string;
    gap: string;
    indent: string;
  }
> = {
  compact: {
    row: "gap-x-3 gap-y-2.5 px-3.5 py-2.5",
    title: "text-[13px]",
    summary: "text-[12px]",
    tile: "size-8",
    icon: "size-3.5",
    figure: "text-[17px]",
    panel: "gap-3 px-3.5 pt-4 pb-5",
    gap: "@min-[34rem]:gap-1.5",
    indent: "@min-[34rem]:mr-3.5 @min-[34rem]:ml-[3.625rem]",
  },
  regular: {
    row: "gap-x-3.5 gap-y-3 px-4 py-3.5",
    title: "text-[14px]",
    summary: "text-[12.5px]",
    tile: "size-9",
    icon: "size-4",
    figure: "text-[20px]",
    panel: "gap-4 px-4 pt-5 pb-6",
    gap: "@min-[34rem]:gap-2",
    indent: "@min-[34rem]:mr-4 @min-[34rem]:ml-[4.125rem]",
  },
  roomy: {
    row: "gap-x-4 gap-y-3.5 px-5 py-5",
    title: "text-[15px]",
    summary: "text-[13px]",
    tile: "size-10",
    icon: "size-[18px]",
    figure: "text-[24px]",
    panel: "gap-5 px-5 pt-6 pb-7",
    gap: "@min-[34rem]:gap-2.5",
    indent: "@min-[34rem]:mr-5 @min-[34rem]:ml-[4.75rem]",
  },
};

const stripes = (angle = 135, band = 6) =>
  `repeating-linear-gradient(${angle}deg, var(--hs-pigment) 0 ${band}px, var(--hs-gap) ${band}px ${band * 2}px)`;

const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--hs-pigment) 16%, transparent) 0 1px, transparent 1px 9px)";

/**
 * A small sample of the caution style, for places a panel is not open: the
 * shelf's badge, and a lip along each destructive action's tile.
 */
function StripeSwatch({
  style,
  edge = false,
  className,
}: {
  style: HazardStripeStyle;
  edge?: boolean;
  className?: string;
}) {
  const image =
    style === "tape"
      ? stripes(135, 3)
      : style === "rail"
        ? stripes(90, edge ? 3 : 2)
        : style === "hatch"
          ? "repeating-linear-gradient(135deg, color-mix(in oklab, var(--hs-pigment) 55%, transparent) 0 1px, transparent 1px 4px)"
          : undefined;
  return (
    <span
      aria-hidden
      className={cn("block", className)}
      style={{
        backgroundColor: style === "plain" ? "var(--hs-pigment)" : undefined,
        backgroundImage: image,
      }}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                               Count figure                               */
/* ----------------------------------------------------------------------- */

/**
 * A consequence figure that fills in from zero. The figure is a motion value
 * rendered as text, so the count never re-renders React per frame, and it is
 * tabular mono so the digits growing never nudge the label beside them.
 */
function CountFigure({
  value,
  run,
  delay,
  duration,
  motionSafe,
  className,
}: {
  value: number;
  run: boolean;
  delay: number;
  duration: number;
  motionSafe: boolean;
  className?: string;
}) {
  const count = useMotionValue(run && motionSafe ? 0 : value);
  const text = useTransform(count, (v) => group(v));

  React.useEffect(() => {
    if (!run || !motionSafe) {
      count.jump(value);
      return;
    }
    // Restarted from wherever a StrictMode rehearsal left it, so the count
    // always finishes rather than freezing at the frame the cleanup stopped.
    const controls = animate(count, value, {
      duration: Math.max(0.05, duration / 1000),
      delay,
      ease: easings.enter,
    });
    return () => controls.stop();
  }, [count, delay, duration, motionSafe, run, value]);

  return <motion.span className={className}>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                                  Panel                                   */
/* ----------------------------------------------------------------------- */

type PanelProps = {
  action: HazardAction;
  workspace: string;
  members: HazardMember[];
  status: HazardStatus;
  onRetry?: () => void;
  stripeStyle: HazardStripeStyle;
  density: HazardDensity;
  tone: ToneSpec;
  countDuration: number;
  matchCase: boolean;
  motionSafe: boolean;
  /** Mounted with the first render: shown unrolled, figures already in. */
  instant: boolean;
  /** Opened by the visitor (not by a host's value): the first step takes focus. */
  autoFocus: boolean;
  pending: boolean;
  failure: string | null;
  labelId: string;
  panelId: string;
  onCancel: () => void;
  onConfirm: (ownerId: string | null) => void;
  onMeasured: (height: number) => void;
};

function Panel({
  action,
  workspace,
  members,
  status,
  onRetry,
  stripeStyle,
  density,
  tone,
  countDuration,
  matchCase,
  motionSafe,
  instant,
  autoFocus,
  pending,
  failure,
  labelId,
  panelId,
  onCancel,
  onConfirm,
  onMeasured,
}: PanelProps) {
  const [isPresent, safeToRemove] = usePresence();
  const uid = React.useId();
  const d = DENSITY[density];
  const inputId = `${uid}-name`;
  const hintId = `${uid}-hint`;

  const [typed, setTyped] = React.useState("");
  const [owner, setOwner] = React.useState<string | null>(null);
  const [nudge, setNudge] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const ownerRefs = React.useRef(new Map<string, HTMLInputElement>());

  /* --- the unroll: one height value drives the clip, the roll and its stripes */
  const height = useMotionValue(0);
  const target = React.useRef(0);
  // Whether this panel arrived with the first render, frozen at mount: the
  // flag flips once hydration is over and must not re-run the arrival.
  const [arrived] = React.useState(instant);
  const [auto, setAuto] = React.useState(instant);
  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls | null>(null);

  const rollScale = useTransform(height, (h) =>
    r3(1 - 0.55 * clamp01(h / Math.max(1, target.current))),
  );
  // The stripes on the roll travel with the paid-out length, so it reads as
  // turning rather than sliding.
  const rollStripes = useTransform(height, (h) => `0px ${r1(h * 0.75)}px`);

  React.useEffect(() => {
    if (!content) return;
    const settle = () => {
      const next = Math.ceil(content.getBoundingClientRect().height);
      if (next <= 0) return;
      target.current = next;
      onMeasured(next);
      running.current?.stop();
      if (auto || !motionSafe) {
        height.jump(next);
        if (auto) setAuto(false);
        return;
      }
      running.current = animate(height, next, {
        ...springs.glide,
        // Checked again once it has landed: a panel rolling up above this
        // one moves it while it unrolls.
        onComplete: () => onMeasured(next),
      });
    };
    settle();
    const observer = new ResizeObserver(settle);
    observer.observe(content);
    return () => {
      observer.disconnect();
      running.current?.stop();
    };
    // The unroll is driven by measurement alone; `onMeasured` is a parent
    // callback whose identity must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, content, height, motionSafe]);

  // Rolling up never springs: it leaves on the exit ease, then lets go. A
  // panel reopened while it is still rolling up is the same node coming
  // back: it unrolls again from wherever it had got to.
  /* --- focus the first step as it arrives */
  const [firstStep, setFirstStep] = React.useState<HTMLElement | null>(null);
  const leaving = React.useRef(false);
  React.useEffect(() => {
    if (isPresent) {
      if (!leaving.current) return;
      leaving.current = false;
      running.current?.stop();
      if (target.current > 0) {
        if (motionSafe)
          running.current = animate(height, target.current, springs.glide);
        else height.jump(target.current);
      }
      if (autoFocus) firstStep?.focus({ preventScroll: true });
      return;
    }
    leaving.current = true;
    running.current?.stop();
    if (!motionSafe) {
      height.jump(0);
      safeToRemove?.();
      return;
    }
    const controls = animate(height, 0, {
      ...exitFor(durations.slow),
      onComplete: () => safeToRemove?.(),
    });
    return () => controls.stop();
    // Presence alone drives this; focus and target are read when it flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, isPresent, motionSafe, safeToRemove]);
  React.useEffect(() => {
    if (!firstStep || !autoFocus) return;
    firstStep.focus({ preventScroll: true });
  }, [firstStep, autoFocus]);

  const bindInput = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (action.kind !== "transfer" && node) setFirstStep(node);
    },
    [action.kind],
  );

  /* --- the name check */
  const norm = (s: string) => (matchCase ? s : s.toLowerCase());
  const want = norm(workspace);
  const have = norm(typed.trim());
  let matched = 0;
  while (matched < have.length && have[matched] === want[matched]) {
    matched += 1;
  }
  const nameOk = have === want;
  const mismatch = have.length > 0 && matched < have.length;
  const needsOwner = action.kind === "transfer";
  const countsIn = status === "ready";
  const armed = nameOk && (!needsOwner || owner !== null) && countsIn;

  const ownerName = members.find((m) => m.id === owner)?.name;
  const verb = VERB[action.kind];
  const confirmLabel =
    action.confirmLabel ?? `${verb.doing} ${workspace}`.trim();
  const run = countsIn && !arrived;
  const step = cascade(action.touches.length);

  // A press with the name wrong leans the field once, a short tween: a
  // refusal never bounces.
  React.useEffect(() => {
    const node = inputRef.current;
    if (!nudge || !node || !motionSafe) return;
    const controls = animate(
      node,
      { x: [0, -4, 3, -2, 0] },
      { duration: durations.slow, ease: easings.move },
    );
    return () => controls.stop();
  }, [motionSafe, nudge]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!armed) {
      // An unarmed press goes back to the step that is missing.
      if (needsOwner && owner === null) {
        const first = members[0];
        if (first) ownerRefs.current.get(first.id)?.focus();
      } else {
        inputRef.current?.focus();
      }
      setNudge((n) => n + 1);
      return;
    }
    onConfirm(owner);
  };

  const stripeLayer =
    stripeStyle === "plain"
      ? undefined
      : stripes(135, density === "compact" ? 5 : 6);

  return (
    <motion.div
      id={panelId}
      role="region"
      aria-labelledby={labelId}
      className={cn(
        "relative overflow-hidden",
        "@min-[34rem]:mb-3 @min-[34rem]:rounded-3 @min-[34rem]:border @min-[34rem]:border-hairline-strong",
        d.indent,
        "border-y border-hairline-strong bg-surface-1",
      )}
      style={{ height: auto ? "auto" : height }}
    >
      <div ref={setContent} className="relative">
        {stripeStyle === "hatch" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: HATCH }}
          />
        ) : null}
        {stripeStyle === "tape" ? (
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-2"
            style={{ backgroundImage: stripeLayer }}
          />
        ) : null}
        {stripeStyle === "rail" ? (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ backgroundImage: stripeLayer }}
          />
        ) : null}
        {stripeStyle === "plain" ? (
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px"
            style={{ backgroundColor: tone.line }}
          />
        ) : null}

        <div
          className={cn(
            "relative flex flex-col",
            d.panel,
            stripeStyle === "rail" && "pl-6",
          )}
        >
          <p className="text-[12.5px] leading-snug text-ink-2">
            <span className="font-medium text-foreground">
              {verb.ing} {workspace}
            </span>{" "}
            {LEAD[action.kind]}:
          </p>

          {status === "error" ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-hairline bg-card px-3 py-2.5">
              <TriangleAlert
                aria-hidden
                className={cn("size-4 shrink-0", tone.text)}
              />
              <p className="min-w-0 flex-1 basis-48 text-[12.5px] text-ink-2">
                We could not count what this touches, so it cannot be confirmed
                yet.
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Count again
                </button>
              ) : null}
            </div>
          ) : (
            <ul
              aria-label={`What ${verb.ing.toLowerCase()} ${workspace} reaches`}
              aria-busy={status === "loading" || undefined}
              className={cn(
                "grid grid-cols-1 divide-y divide-hairline rounded-2 border border-hairline bg-card",
                "@min-[34rem]:grid-cols-3 @min-[34rem]:divide-y-0 @min-[34rem]:border-0 @min-[34rem]:bg-transparent",
                d.gap,
              )}
            >
              {action.touches.map((t, i) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 @min-[34rem]:flex-col @min-[34rem]:flex-nowrap @min-[34rem]:items-start @min-[34rem]:rounded-2 @min-[34rem]:border @min-[34rem]:border-hairline @min-[34rem]:bg-card @min-[34rem]:py-2.5"
                >
                  {status === "loading" ? (
                    <>
                      <span className="sr-only">Counting {t.other}</span>
                      <span
                        aria-hidden
                        className="my-1 h-4 w-12 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                      />
                      <span aria-hidden className="text-[12px] text-ink-3">
                        {t.other}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="sr-only">
                        {counted(t)}
                        {t.note ? `, ${t.note}` : ""}
                      </span>
                      <span aria-hidden className="flex items-baseline gap-1.5">
                        <CountFigure
                          value={t.count}
                          run={run}
                          delay={0.12 + i * step}
                          duration={countDuration}
                          motionSafe={motionSafe}
                          className={cn(
                            "font-mono leading-tight font-medium tracking-tight text-foreground tabular-nums",
                            d.figure,
                          )}
                        />
                        <span className="text-[12.5px] text-ink-2">
                          {t.count === 1 ? t.one : t.other}
                        </span>
                      </span>
                      {t.note ? (
                        <span
                          aria-hidden
                          className="text-[11.5px] leading-snug text-ink-3"
                        >
                          {t.note}
                        </span>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            {needsOwner ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[12.5px] text-ink-2">
                  New owner
                </legend>
                <div className="flex flex-wrap gap-2">
                  {members.map((m, i) => {
                    const initials = m.name
                      .split(/\s+/)
                      .map((w) => w[0] ?? "")
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          "relative flex h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-2 border border-hairline bg-card pr-3.5 pl-1.5 transition-colors select-none hover:border-hairline-strong",
                          "has-checked:border-(--hs-line) has-checked:bg-[color-mix(in_oklab,var(--hs-line)_8%,var(--card))]",
                          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
                        )}
                      >
                        <input
                          ref={(node) => {
                            if (node) ownerRefs.current.set(m.id, node);
                            else ownerRefs.current.delete(m.id);
                            if (node && i === 0) setFirstStep(node);
                          }}
                          type="radio"
                          name={`${uid}-owner`}
                          value={m.id}
                          checked={owner === m.id}
                          aria-disabled={pending || undefined}
                          onChange={() => {
                            if (!pending) setOwner(m.id);
                          }}
                          className="sr-only"
                        />
                        <span
                          aria-hidden
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[11px] text-ink-2"
                        >
                          {initials}
                        </span>
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-[12.5px] text-foreground">
                            {m.name}
                          </span>
                          <span className="text-[11px] text-ink-3">
                            {m.role}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={inputId} className="text-[12.5px] text-ink-2">
                Type{" "}
                <span className="font-mono text-foreground">{workspace}</span>{" "}
                to confirm
              </label>
              <input
                ref={bindInput}
                id={inputId}
                value={typed}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setTyped(next);
                }}
                readOnly={pending}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={mismatch || undefined}
                aria-describedby={hintId}
                className={cn(
                  "h-9 w-full max-w-80 rounded-2 border bg-card px-3 font-mono text-[13px] text-foreground transition-colors outline-none placeholder:text-ink-3",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  mismatch ? "border-(--hs-line)" : "border-input",
                )}
              />
              <span
                aria-hidden
                className="flex flex-wrap font-mono text-[12px]"
              >
                {Array.from(workspace).map((ch, i) => {
                  const lit = i < matched && i < have.length;
                  return (
                    <span
                      key={`${i}-${ch}`}
                      className={cn(
                        "relative px-[1.5px] pb-1 transition-colors",
                        lit ? tone.text : "text-ink-3",
                      )}
                      style={{ transitionDuration: `${durations.fast}s` }}
                    >
                      {ch === " " ? " " : ch}
                      <motion.span
                        className="absolute inset-x-[1.5px] bottom-0 h-[1.5px] rounded-full bg-(--hs-line)"
                        style={{ originX: 0 }}
                        initial={false}
                        animate={{ scaleX: lit ? 1 : 0, opacity: lit ? 1 : 0 }}
                        transition={
                          motionSafe
                            ? {
                                scaleX: springs.flick,
                                opacity: { duration: 0 },
                              }
                            : { duration: 0 }
                        }
                      />
                    </span>
                  );
                })}
              </span>
              <p id={hintId} className="text-[11.5px] text-ink-3">
                {status === "loading"
                  ? "Counting what this touches…"
                  : status === "error"
                    ? "Counts are missing, so this cannot be confirmed."
                    : mismatch
                      ? `That is not the workspace name. Type ${workspace} exactly.`
                      : needsOwner && owner === null
                        ? "Choose the new owner, then type the name."
                        : nameOk
                          ? "Name matches."
                          : `Type the workspace name exactly${matchCase ? ", capitals included" : ""}.`}
              </p>
            </div>

            {failure ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-2 border border-hairline-strong bg-card px-3 py-2.5"
              >
                <TriangleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-danger"
                />
                <p className="text-[12.5px] leading-snug text-ink-2">
                  {failure}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className={cn(
                  "inline-flex h-9 flex-1 items-center justify-center rounded-2 border border-hairline-strong px-3.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground @min-[34rem]:flex-none",
                  FOCUS_RING,
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                aria-disabled={!armed || pending || undefined}
                aria-busy={pending || undefined}
                className={cn(
                  "relative inline-flex h-9 flex-[2] items-center justify-center gap-2 overflow-hidden rounded-2 border px-4 text-[12.5px] font-medium transition-colors @min-[34rem]:flex-none",
                  armed ? "border-transparent" : "border-(--hs-line)",
                  armed ? "" : tone.text,
                  !armed && "cursor-not-allowed opacity-80",
                  FOCUS_RING,
                )}
                style={armed ? { color: tone.solidText } : undefined}
              >
                {/* The arming sweep: the fill crosses the button once the
                    name matches, and drains back when it stops matching. */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0"
                  style={{ backgroundColor: tone.solid, originX: 0 }}
                  initial={false}
                  animate={{ scaleX: armed ? 1 : 0 }}
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                />
                <span className="relative inline-flex items-center gap-2">
                  {pending ? (
                    <LoaderCircle
                      aria-hidden
                      className="size-3.5 motion-safe:animate-spin"
                    />
                  ) : null}
                  {pending
                    ? `${verb.ing}…`
                    : needsOwner && ownerName && armed
                      ? `Transfer to ${ownerName}`
                      : confirmLabel}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* The roll: what has not paid out yet, riding the leading edge. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2.5 rounded-full"
        style={{
          scaleY: rollScale,
          originY: 1,
          backgroundColor: tone.pigment,
          backgroundImage:
            stripeStyle === "plain"
              ? "linear-gradient(to bottom, color-mix(in oklab, white 30%, transparent), transparent 45%, color-mix(in oklab, black 30%, transparent))"
              : `linear-gradient(to bottom, color-mix(in oklab, white 28%, transparent), transparent 45%, color-mix(in oklab, black 34%, transparent)), ${stripes(135, 5)}`,
          backgroundPosition: rollStripes,
        }}
      />
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * The irreversible end of a workspace's settings. Each action is a row that
 * says what it touches; opening one unrolls a caution-striped panel under it
 * like a blind coming off a roll — the height runs to its measured size on
 * `glide`, the content is revealed top-down, and a striped roll rides the
 * leading edge, its stripes turning and its thickness thinning as it pays
 * out. Then the consequences fill in from zero, a `cascade()` apart.
 *
 * Confirming asks for the workspace name; each letter typed in order lights
 * with an underline drawn on `flick`, and a full match sweeps the confirm
 * button's fill in on `snap`. Callbacks fire only after that; a promise shows
 * the action pending, a rejection names what was not done. Escape, Cancel or
 * opening another action rolls the panel up on the exit ease. Nothing
 * celebrates.
 */
export function HazardShelf({
  actions = defaultHazardActions,
  workspace = "Fernworks",
  members = defaultHazardMembers,
  value,
  defaultValue = null,
  onValueChange,
  onTransfer,
  onArchive,
  onDelete,
  status = "ready",
  onRetry,
  stripeStyle = "tape",
  density = "regular",
  tone = "amber",
  countDuration = 700,
  matchCase = true,
  title = "Irreversible actions",
  maxHeight = 520,
  disabled = false,
  className,
}: HazardShelfProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const t = TONES[tone] ?? TONES.amber;

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  // Only a panel the visitor opened pulls focus into itself.
  const [opened, setOpened] = React.useState<string | null>(null);
  const openId = value !== undefined ? value : own;
  const [done, setDone] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<{
    id: string;
    text: string;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const scroller = React.useRef<HTMLDivElement | null>(null);
  const rows = React.useRef(new Map<string, HTMLLIElement>());
  const triggers = React.useRef(new Map<string, HTMLButtonElement>());
  const alive = React.useRef(true);
  // Panels open at the very first render are shown unrolled; any opened after
  // that unroll.
  const hydrated = React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setOpen = (id: string | null) => {
    if (id === openId) return;
    if (value === undefined) setOwn(id);
    setOpened(id);
    setFailure(null);
    onValueChange?.(id);
    const action = actions.find((a) => a.id === id);
    if (action) {
      setAnnouncement(
        status === "ready"
          ? `${VERB[action.kind].ing} ${workspace} ${LEAD[action.kind]}: ${sentence(action.touches.map(counted))}. Type ${workspace} to confirm.`
          : `${action.title} opened. Counting what it touches.`,
      );
    } else if (openId) {
      setAnnouncement("Rolled up.");
    }
  };

  const close = (id: string) => {
    setOpen(null);
    triggers.current.get(id)?.focus({ preventScroll: true });
  };

  /** Brings the opening row and its panel into view inside the shelf only. */
  const reveal = (id: string, panelHeight: number) => {
    const box = scroller.current;
    const row = rows.current.get(id);
    if (!box || !row) return;
    const top = row.offsetTop;
    const head =
      (row.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    const end = top + head + panelHeight + 12;
    let next = box.scrollTop;
    if (end > box.scrollTop + box.clientHeight)
      next = end - box.clientHeight + 8;
    if (top < next) next = Math.max(0, top - 4);
    if (Math.abs(next - box.scrollTop) < 2) return;
    box.scrollTo({ top: next, behavior: motionSafe ? "smooth" : "auto" });
  };

  const confirm = async (action: HazardAction, ownerId: string | null) => {
    if (pending) return;
    const run =
      action.kind === "transfer"
        ? () => onTransfer?.(ownerId ?? "")
        : action.kind === "archive"
          ? () => onArchive?.()
          : () => onDelete?.();
    setPending(action.id);
    setFailure(null);
    try {
      await run();
      if (!alive.current) return;
      const owner = members.find((m) => m.id === ownerId);
      const label =
        action.doneLabel ??
        (action.kind === "transfer"
          ? `Owned by ${owner?.name ?? "the new owner"}`
          : action.kind === "archive"
            ? "Archived"
            : "Deletion scheduled");
      setDone((prev) => ({ ...prev, [action.id]: label }));
      setPending(null);
      if (value === undefined) setOwn(null);
      onValueChange?.(null);
      setAnnouncement(
        action.kind === "transfer"
          ? `${workspace} now belongs to ${owner?.name ?? "the new owner"}.`
          : `${workspace} ${VERB[action.kind].past}.`,
      );
      triggers.current.get(action.id)?.focus({ preventScroll: true });
    } catch (error) {
      if (!alive.current) return;
      const parts = action.touches.map(counted);
      const one = action.touches.length === 1 && action.touches[0]?.count === 1;
      const head =
        action.kind === "transfer"
          ? `Ownership of ${workspace} was not transferred.`
          : `${workspace} was not ${VERB[action.kind].past}.`;
      const reason =
        error instanceof Error && error.message ? ` ${error.message}` : "";
      const text = `${head} ${sentence(parts)} ${one ? "is" : "are"} unchanged.${reason}`;
      setPending(null);
      setFailure({ id: action.id, text });
      setAnnouncement(text);
    }
  };

  const toneStyle = {
    ["--hs-pigment" as string]: t.pigment,
    ["--hs-gap" as string]: t.gap,
    ["--hs-line" as string]: t.line,
  } as React.CSSProperties;

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ ...toneStyle, maxHeight }}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-hairline px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <p className="text-[12px] leading-snug text-ink-3">
            Each of these changes {workspace} for everyone in it. Open one to
            see exactly what it reaches.
          </p>
        </div>
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-6 shrink-0 items-center overflow-hidden rounded-full border border-hairline"
        >
          <StripeSwatch style={stripeStyle} className="h-full w-5" />
          <span className="px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            {workspace}
          </span>
        </span>
      </header>

      <div
        ref={scroller}
        className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        <ul role="list" className="flex flex-col">
          {actions.map((action) => {
            const Icon = ICON[action.kind] ?? Trash2;
            const open = openId === action.id;
            const doneLabel = done[action.id];
            const busy = pending === action.id;
            const panelId = `${uid}-panel-${action.id}`;
            const labelId = `${uid}-label-${action.id}`;
            const inert = disabled || doneLabel !== undefined;
            return (
              <li
                key={action.id}
                ref={(node) => {
                  if (node) rows.current.set(action.id, node);
                  else rows.current.delete(action.id);
                }}
                className="border-b border-hairline last:border-b-0"
                onKeyDown={(event) => {
                  if (event.key === "Escape" && open) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!busy) close(action.id);
                  }
                }}
              >
                <div className={cn("flex flex-wrap items-start", d.row)}>
                  <span
                    aria-hidden
                    className={cn(
                      "relative grid shrink-0 place-items-center overflow-hidden rounded-2 border",
                      d.tile,
                      action.kind === "transfer" ? "text-ink-2" : t.text,
                    )}
                    style={{
                      borderColor:
                        "color-mix(in oklab, var(--hs-line) 30%, transparent)",
                      backgroundColor:
                        "color-mix(in oklab, var(--hs-line) 9%, transparent)",
                    }}
                  >
                    {action.kind === "transfer" ? null : (
                      <StripeSwatch
                        style={stripeStyle}
                        edge
                        className="absolute inset-x-0 bottom-0 h-[3px]"
                      />
                    )}
                    <Icon className={cn("relative", d.icon)} />
                  </span>
                  <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                    <h3
                      id={labelId}
                      className={cn("leading-snug font-medium", d.title)}
                    >
                      {action.title}
                    </h3>
                    <p className={cn("leading-snug text-ink-2", d.summary)}>
                      {action.summary}
                    </p>
                    <p className="mt-1 font-mono text-[10.5px] leading-snug tracking-[0.02em] text-ink-3">
                      {status === "loading" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="inline-block h-2 w-24 rounded-full bg-surface-2 motion-safe:animate-pulse"
                          />
                          <span className="sr-only">Counting</span>
                        </span>
                      ) : status === "error" ? (
                        "Counts did not load"
                      ) : (
                        action.touches.map(counted).join(" · ")
                      )}
                    </p>
                  </div>
                  <div className="flex w-full shrink-0 justify-end @min-[34rem]:w-auto @min-[34rem]:self-center">
                    <button
                      ref={(node) => {
                        if (node) triggers.current.set(action.id, node);
                        else triggers.current.delete(action.id);
                      }}
                      type="button"
                      aria-expanded={doneLabel ? undefined : open}
                      aria-controls={open ? panelId : undefined}
                      aria-disabled={inert || undefined}
                      aria-label={
                        doneLabel
                          ? `${action.title}: ${doneLabel}`
                          : `${action.title}${open ? ", open" : ""}`
                      }
                      onClick={() => {
                        if (inert || busy) return;
                        setOpen(open ? null : action.id);
                      }}
                      className={cn(
                        "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-2 border px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors @min-[34rem]:w-auto",
                        doneLabel
                          ? "cursor-default border-hairline bg-surface-2 font-normal text-ink-2"
                          : open
                            ? "border-(--hs-line) bg-[color-mix(in_oklab,var(--hs-line)_10%,transparent)]"
                            : "border-hairline-strong hover:border-(--hs-line)",
                        !doneLabel &&
                          (action.kind === "transfer"
                            ? "text-foreground"
                            : t.text),
                        disabled && "cursor-not-allowed",
                        FOCUS_RING,
                      )}
                    >
                      {doneLabel ? (
                        <>
                          <svg
                            aria-hidden
                            viewBox="0 0 16 16"
                            className="size-3.5 shrink-0"
                          >
                            <motion.path
                              d="M3.5 8.5 6.5 11.5 12.5 4.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={{ pathLength: motionSafe ? 0 : 1 }}
                              animate={{ pathLength: 1 }}
                              transition={
                                motionSafe ? springs.flick : { duration: 0 }
                              }
                            />
                          </svg>
                          {doneLabel}
                        </>
                      ) : (
                        <>
                          {VERB[action.kind].doing}…
                          <motion.span
                            aria-hidden
                            className="inline-flex"
                            initial={false}
                            animate={{ rotate: open ? 180 : 0 }}
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          >
                            <ChevronDown className="size-3.5" />
                          </motion.span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {open && !doneLabel ? (
                    <Panel
                      key="panel"
                      action={action}
                      workspace={workspace}
                      members={members}
                      status={status}
                      onRetry={onRetry}
                      stripeStyle={stripeStyle}
                      density={density}
                      tone={t}
                      countDuration={countDuration}
                      matchCase={matchCase}
                      motionSafe={motionSafe}
                      instant={!hydrated}
                      autoFocus={opened === action.id}
                      pending={busy}
                      failure={failure?.id === action.id ? failure.text : null}
                      labelId={labelId}
                      panelId={panelId}
                      onCancel={() => close(action.id)}
                      onConfirm={(ownerId) => void confirm(action, ownerId)}
                      onMeasured={(h) => {
                        // Only a panel the visitor opened moves the shelf.
                        if (opened === action.id) reveal(action.id, h);
                      }}
                    />
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
