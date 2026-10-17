"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUp,
  CalendarCheck,
  Check,
  Clock3,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
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
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type WidgetChoice = { value: string; label: string };
/** Widget id → what was chosen in it. */
export type WidgetChoices = Record<string, WidgetChoice>;

type WidgetBase = {
  id: string;
  /** Minutes the choices stay valid once posted; then the widget expires. */
  expiresIn?: number;
};

export type WidgetSlotsSpec = WidgetBase & {
  kind: "slots";
  /** The group's accessible name. @default "Times" */
  label?: string;
  slots: { id: string; label: string; detail?: string; taken?: boolean }[];
};

export type WidgetStepperSpec = WidgetBase & {
  kind: "stepper";
  label: string;
  min: number;
  max: number;
  /** @default 1 */
  step?: number;
  value: number;
  unit: { one: string; other: string };
};

export type WidgetCompareSpec = WidgetBase & {
  kind: "compare";
  /** The table's caption. @default "Compare" */
  label?: string;
  options: { id: string; label: string; detail?: string }[];
  /** One value per option, in the options' order. */
  rows: { label: string; values: string[] }[];
};

export type WidgetConfirmSpec = WidgetBase & {
  kind: "confirm";
  title: string;
  lines: { label: string; value: string }[];
  confirm: string;
  cancel?: string;
  /** The turn a cancel goes back to. @default the previous turn */
  cancelTo?: string;
};

export type WidgetSpec =
  WidgetSlotsSpec | WidgetStepperSpec | WidgetCompareSpec | WidgetConfirmSpec;

export type WidgetTurn = {
  id: string;
  /** What the assistant says; may read the choices so far. */
  text: string | ((choices: WidgetChoices) => string);
  /** The live control under the reply; may read the choices so far. */
  widget?: WidgetSpec | ((choices: WidgetChoices) => WidgetSpec);
};

export type WidgetChrome = "card" | "tinted" | "plain";
export type WidgetDensity = "compact" | "regular" | "roomy";
export type WidgetThreadStatus = "ready" | "loading" | "error";

export type WidgetThreadProps = {
  /** The assistant's script, in order. @default defaultWidgetTurns (booking a Coldbrook room) */
  turns?: WidgetTurn[];
  /** The visitor's opening message. @default "Book a room for the Gaugeworks review on Thursday." */
  request?: string;
  /** Choices already made: the thread replays them and opens at the first open widget. @default {} */
  defaultValue?: WidgetChoices;
  /** Fires from the choice that changed them, with every choice so far. */
  onValueChange?: (choices: WidgetChoices) => void;
  /** A widget was used: its id, the choice and every choice so far. */
  onWidgetSubmit?: (
    widgetId: string,
    choice: WidgetChoice,
    choices: WidgetChoices,
  ) => void;
  /** Free text was sent from the composer. */
  onSend?: (text: string) => void;
  /** Refresh on an expired widget (its id), or Try again after a failed load (null). */
  onRetry?: (widgetId: string | null) => void;
  /** Bordered widget cards, accent-washed panels, or controls set straight into the reply. @default "card" */
  widgetChrome?: WidgetChrome;
  /** Type and spacing. @default "regular" */
  density?: WidgetDensity;
  /** Your bubbles, chosen states and the flight — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The current time in ms; widgets with `expiresIn` expire against it. @default defaultWidgetNow */
  now?: number;
  /** How long the assistant "types" before a reply assembles, in ms. @default 520 */
  typingDelay?: number;
  /** Who is answering. @default "Coldbrook Desk" */
  assistant?: string;
  /** The surface's heading. @default "Book a room" */
  title?: string;
  /** Whether the thread has loaded. @default "ready" */
  status?: WidgetThreadStatus;
  /** Height of the surface in px; the thread scrolls inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be chosen or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Tuesday 20 October 2026, 09:30 UTC: the moment the booking starts. */
export const defaultWidgetNow = Date.UTC(2026, 9, 20, 9, 30);

const ROOMS = [
  { id: "fennel", label: "Fennel", detail: "2nd floor" },
  { id: "larch", label: "Larch", detail: "3rd floor" },
  { id: "quarry", label: "Quarry", detail: "3rd floor" },
];

const pick = (c: WidgetChoices, id: string, fallback: string) =>
  c[id]?.label ?? fallback;

/** Booking a Coldbrook meeting room: people, room, time, confirm, done. */
export const defaultWidgetTurns: WidgetTurn[] = [
  {
    id: "people",
    text: "How many people are coming?",
    widget: {
      kind: "stepper",
      id: "people",
      label: "People",
      min: 2,
      max: 16,
      value: 6,
      unit: { one: "person", other: "people" },
    },
  },
  {
    id: "room",
    text: (c) =>
      `For ${pick(c, "people", "6 people")}, three rooms are free on Thursday. Here's how they compare.`,
    widget: {
      kind: "compare",
      id: "room",
      label: "Rooms free on Thursday",
      options: ROOMS,
      rows: [
        { label: "Seats", values: ["8", "10", "14"] },
        { label: "Screen", values: ["55 in", "75 in", "Projector"] },
        { label: "Whiteboard", values: ["Wall", "Glass", "None"] },
        { label: "Video", values: ["Yes", "Yes", "No"] },
      ],
    },
  },
  {
    id: "time",
    text: (c) =>
      `${pick(c, "room", "Larch")} is free at these times on Thursday.`,
    widget: {
      kind: "slots",
      id: "time",
      label: "Times on Thursday",
      expiresIn: 5,
      slots: [
        { id: "0930", label: "09:30", detail: "1 h" },
        { id: "1100", label: "11:00", detail: "1 h" },
        { id: "1400", label: "14:00", detail: "1 h" },
        { id: "1530", label: "15:30", detail: "Taken", taken: true },
      ],
    },
  },
  {
    id: "confirm",
    text: "Here's the booking. Shall I hold it?",
    widget: (c) => ({
      kind: "confirm",
      id: "confirm",
      expiresIn: 5,
      title: `${pick(c, "room", "Larch")} · Thursday 22 October`,
      lines: [
        { label: "Time", value: `${pick(c, "time", "14:00")}, one hour` },
        { label: "People", value: pick(c, "people", "6 people") },
        { label: "Video", value: "Linked to the invite" },
      ],
      confirm: "Book it",
      cancel: "Change time",
      cancelTo: "time",
    }),
  },
  {
    id: "done",
    text: (c) =>
      `Booked. ${pick(c, "room", "Larch")} is yours on Thursday at ${pick(c, "time", "14:00")}, and the invite is on its way to ${pick(c, "people", "6 people")}.`,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

const EMPTY: WidgetChoices = {};
/** The ghost's travel; the bubble takes over as it lands. */
const FLIGHT = { ...springs.glide };

const DENSITY: Record<
  WidgetDensity,
  { text: string; gap: string; bubble: string; pad: string }
> = {
  compact: {
    text: "text-[12px] leading-[18px]",
    gap: "gap-3",
    bubble: "px-2.5 py-1",
    pad: "p-2.5",
  },
  regular: {
    text: "text-[13px] leading-5",
    gap: "gap-4",
    bubble: "px-3 py-1.5",
    pad: "p-3",
  },
  roomy: {
    text: "text-[14px] leading-6",
    gap: "gap-5",
    bubble: "px-3.5 py-2",
    pad: "p-3.5",
  },
};

const resolveText = (t: WidgetTurn, c: WidgetChoices) =>
  typeof t.text === "function" ? t.text(c) : t.text;
const resolveWidget = (t: WidgetTurn, c: WidgetChoices) =>
  typeof t.widget === "function" ? t.widget(c) : t.widget;

const plural = (n: number, u: { one: string; other: string }) =>
  `${n} ${n === 1 ? u.one : u.other}`;

type Box = { x: number; y: number; w: number; h: number };

type Msg =
  | { kind: "user"; id: string; text: string; landed: boolean }
  | {
      kind: "bot";
      id: string;
      turn: number;
      text: string;
      widget?: WidgetSpec;
      postedAt: number;
      state: "open" | "done" | "expired";
      chosen?: WidgetChoice;
      assemble: boolean;
    }
  | { kind: "typing"; id: string };

type BotMsg = Extract<Msg, { kind: "bot" }>;

/** The number of blocks a widget assembles from. */
const blocksOf = (w?: WidgetSpec) =>
  !w
    ? 1
    : w.kind === "slots"
      ? w.slots.length
      : w.kind === "stepper"
        ? 2
        : w.kind === "compare"
          ? w.rows.length + 2
          : w.lines.length + 2;

/** Choices in the script's order: what was said, replayed into messages. */
function replay(
  turns: WidgetTurn[],
  choices: WidgetChoices,
  now: number,
  request: string,
): Msg[] {
  const msgs: Msg[] = [
    { kind: "user", id: "m-request", text: request, landed: true },
  ];
  let i = 0;
  let guard = 0;
  while (i < turns.length && guard < 40) {
    guard += 1;
    const turn = turns[i];
    if (!turn) break;
    const widget = resolveWidget(turn, choices);
    const chosen = widget ? choices[widget.id] : undefined;
    msgs.push({
      kind: "bot",
      id: `m-t${i}`,
      turn: i,
      text: resolveText(turn, choices),
      widget,
      postedAt: now,
      state: chosen ? "done" : "open",
      chosen,
      assemble: false,
    });
    if (!widget || !chosen) return msgs;
    msgs.push({
      kind: "user",
      id: `m-u${i}`,
      text: chosen.label,
      landed: true,
    });
    i += 1;
  }
  return msgs;
}

/* ----------------------------------------------------------------------- */
/*                                 Widgets                                  */
/* ----------------------------------------------------------------------- */

type WidgetApi = {
  live: boolean;
  record: boolean;
  chosen?: WidgetChoice;
  motionSafe: boolean;
  submit: (choice: WidgetChoice, source: Element | null) => void;
};

/** A block that stands as a skeleton until its turn, then rises a nudge on snap. */
function Block({
  shown,
  motionSafe,
  className,
  children,
}: {
  shown: boolean;
  motionSafe: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <motion.div
        initial={false}
        animate={{
          opacity: shown ? 1 : 0,
          y: shown || !motionSafe ? 0 : distances.nudge,
        }}
        transition={
          motionSafe
            ? { y: springs.snap, opacity: { duration: durations.base } }
            : { duration: durations.base }
        }
        aria-hidden={!shown || undefined}
        className="h-full"
      >
        {children}
      </motion.div>
      <AnimatePresence initial={false}>
        {shown ? null : (
          <motion.span
            key="skeleton"
            aria-hidden
            className="pointer-events-none absolute inset-0.5 rounded-2 bg-surface-2"
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ChosenMark({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-(--wt-solid) text-primary-foreground"
      initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        motionSafe
          ? { scale: springs.flick, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      <Check className="size-2.5" strokeWidth={3.5} />
    </motion.span>
  );
}

function Slots({
  spec,
  built,
  api,
}: {
  spec: WidgetSlotsSpec;
  built: number;
  api: WidgetApi;
}) {
  const open = spec.slots.filter((s) => !s.taken);
  const [pickId, setPickId] = React.useState(open[0]?.id ?? "");
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const move = (dir: number) => {
    const i = open.findIndex((s) => s.id === pickId);
    const next = open[(i + dir + open.length) % open.length];
    if (!next) return;
    setPickId(next.id);
    refs.current.get(next.id)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={spec.label ?? "Times"}
      aria-disabled={!api.live || api.record || undefined}
      className="grid grid-cols-2 gap-1.5 @min-[26rem]/widget-thread:grid-cols-4"
    >
      {spec.slots.map((slot, i) => {
        const chosen = api.chosen?.value === slot.id;
        const tab = !api.record && api.live && slot.id === pickId;
        return (
          <Block key={slot.id} shown={built > i} motionSafe={api.motionSafe}>
            <motion.button
              ref={(n) => {
                if (n) refs.current.set(slot.id, n);
                else refs.current.delete(slot.id);
              }}
              type="button"
              role="radio"
              aria-checked={api.record ? chosen : slot.id === pickId}
              aria-disabled={slot.taken || !api.live || api.record || undefined}
              aria-label={`${slot.label}${slot.detail ? `, ${slot.detail}` : ""}${chosen ? ", chosen" : ""}`}
              tabIndex={tab ? 0 : -1}
              data-wt-tabstop={tab || undefined}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(-1);
                }
              }}
              onClick={(e) => {
                if (slot.taken || !api.live || api.record) return;
                api.submit(
                  { value: slot.id, label: slot.label },
                  e.currentTarget,
                );
              }}
              whileTap={
                api.motionSafe && api.live && !api.record && !slot.taken
                  ? { scale: 0.95 }
                  : undefined
              }
              transition={springs.flick}
              className={cn(
                "flex h-11 w-full flex-col items-center justify-center rounded-2 border text-center transition-colors",
                chosen
                  ? "border-(--wt-accent) bg-(--wt-wash)"
                  : slot.taken
                    ? "cursor-not-allowed border-dashed border-hairline text-ink-3"
                    : api.record
                      ? "border-hairline"
                      : "border-hairline-strong bg-card hover:border-(--wt-line) hover:bg-(--wt-wash)",
                FOCUS,
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-mono text-[13px] font-medium tabular-nums",
                  slot.taken && "line-through",
                )}
              >
                {chosen ? <ChosenMark motionSafe={api.motionSafe} /> : null}
                {slot.label}
              </span>
              {slot.detail ? (
                <span className="text-[10px] leading-3 text-ink-3">
                  {slot.detail}
                </span>
              ) : null}
            </motion.button>
          </Block>
        );
      })}
    </div>
  );
}

function Stepper({
  spec,
  built,
  api,
}: {
  spec: WidgetStepperSpec;
  built: number;
  api: WidgetApi;
}) {
  const step = spec.step ?? 1;
  const [n, setN] = React.useState(
    api.chosen ? Number(api.chosen.value) || spec.value : spec.value,
  );
  const [dir, setDir] = React.useState(1);
  const valueRef = React.useRef<HTMLDivElement | null>(null);
  const active = api.live && !api.record;
  const set = (v: number) => {
    const next = Math.min(spec.max, Math.max(spec.min, v));
    if (next === n) return;
    setDir(next > n ? 1 : -1);
    setN(next);
  };
  const send = () =>
    api.submit(
      { value: String(n), label: plural(n, spec.unit) },
      valueRef.current,
    );
  const iconBtn = cn(
    "inline-flex size-9 shrink-0 items-center justify-center rounded-2 border border-hairline-strong bg-card text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40",
    FOCUS,
  );
  return (
    <div className="flex flex-col gap-2">
      <Block shown={built > 0} motionSafe={api.motionSafe}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Fewer ${spec.unit.other}`}
            aria-disabled={!active || n <= spec.min || undefined}
            onClick={() => active && set(n - step)}
            className={iconBtn}
          >
            <Minus aria-hidden className="size-4" />
          </button>
          <div
            ref={valueRef}
            role="spinbutton"
            tabIndex={active ? 0 : -1}
            data-wt-tabstop={active || undefined}
            aria-label={spec.label}
            aria-valuenow={n}
            aria-valuemin={spec.min}
            aria-valuemax={spec.max}
            aria-valuetext={plural(n, spec.unit)}
            aria-disabled={!active || undefined}
            onKeyDown={(e) => {
              if (!active) return;
              const map: Record<string, number> = {
                ArrowUp: n + step,
                ArrowRight: n + step,
                ArrowDown: n - step,
                ArrowLeft: n - step,
                PageUp: n + step * 4,
                PageDown: n - step * 4,
                Home: spec.min,
                End: spec.max,
              };
              if (e.key in map) {
                e.preventDefault();
                set(map[e.key] ?? n);
              } else if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            className={cn(
              "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2 border bg-card px-3",
              api.record && api.chosen
                ? "border-(--wt-accent) bg-(--wt-wash)"
                : "border-hairline-strong",
              FOCUS,
            )}
          >
            {api.record && api.chosen ? (
              <ChosenMark motionSafe={api.motionSafe} />
            ) : null}
            <span
              className="relative inline-flex h-5 justify-center overflow-clip font-mono text-[15px] font-semibold tabular-nums"
              style={{ width: `${String(n).length}ch` }}
            >
              <AnimatePresence initial={false} mode="popLayout" custom={dir}>
                <motion.span
                  key={n}
                  custom={dir}
                  className="inline-block leading-5"
                  variants={{
                    enter: (d: number) => ({
                      opacity: 0,
                      y: api.motionSafe ? d * 10 : 0,
                    }),
                    shown: { opacity: 1, y: 0 },
                    leave: (d: number) => ({
                      opacity: 0,
                      y: api.motionSafe ? -d * 10 : 0,
                      transition: exitFor(durations.fast),
                    }),
                  }}
                  initial="enter"
                  animate="shown"
                  exit="leave"
                  transition={
                    api.motionSafe
                      ? {
                          y: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {n}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="text-[13px] text-ink-2">
              {n === 1 ? spec.unit.one : spec.unit.other}
            </span>
          </div>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`More ${spec.unit.other}`}
            aria-disabled={!active || n >= spec.max || undefined}
            onClick={() => active && set(n + step)}
            className={iconBtn}
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
      </Block>
      <Block shown={built > 1} motionSafe={api.motionSafe}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-3">
            {spec.min}–{spec.max} · arrows change it, Enter sends
          </span>
          <button
            type="button"
            tabIndex={-1}
            aria-disabled={!active || undefined}
            onClick={() => active && send()}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-2 bg-(--wt-solid) px-3 text-[12px] font-medium text-primary-foreground transition-opacity aria-disabled:opacity-40",
              FOCUS,
            )}
          >
            Use {plural(n, spec.unit)}
          </button>
        </div>
      </Block>
    </div>
  );
}

function Compare({
  spec,
  built,
  api,
}: {
  spec: WidgetCompareSpec;
  built: number;
  api: WidgetApi;
}) {
  const [pickIdx, setPickIdx] = React.useState(0);
  const btns = React.useRef(new Map<string, HTMLButtonElement>());
  const heads = React.useRef(new Map<string, HTMLTableCellElement>());
  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const [edge, setEdge] = React.useState({ scrolls: false, more: false });
  React.useEffect(() => {
    if (!scroller) return;
    const check = () =>
      setEdge((e) => {
        const scrolls = scroller.scrollWidth > scroller.clientWidth + 1;
        const more =
          scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1;
        return e.scrolls === scrolls && e.more === more ? e : { scrolls, more };
      });
    const ro = new ResizeObserver(check);
    ro.observe(scroller);
    scroller.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", check);
    };
  }, [scroller]);
  const active = api.live && !api.record;
  const n = spec.options.length;
  return (
    <div
      ref={setScroller}
      tabIndex={edge.scrolls ? 0 : undefined}
      aria-label={
        edge.scrolls
          ? `${spec.label ?? "Compare"}, scrolls sideways`
          : undefined
      }
      className={cn(
        "-mx-1 [scrollbar-width:thin] overflow-x-auto px-1 pb-1",
        FOCUS_IN,
      )}
      style={
        edge.more
          ? {
              maskImage:
                "linear-gradient(to right, black calc(100% - 24px), transparent)",
            }
          : undefined
      }
    >
      <table className="w-full min-w-[22rem] border-separate border-spacing-0 text-left">
        <caption className="sr-only">{spec.label ?? "Compare"}</caption>
        <thead>
          <tr>
            <td className="w-24" />
            {spec.options.map((o) => {
              const chosen = api.chosen?.value === o.id;
              return (
                <th
                  key={o.id}
                  ref={(node) => {
                    if (node) heads.current.set(o.id, node);
                    else heads.current.delete(o.id);
                  }}
                  scope="col"
                  className={cn(
                    "rounded-t-2 px-2 pt-1.5 pb-1 align-bottom",
                    chosen && "bg-(--wt-wash)",
                  )}
                >
                  <Block shown={built > 0} motionSafe={api.motionSafe}>
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-foreground">
                      {chosen ? (
                        <ChosenMark motionSafe={api.motionSafe} />
                      ) : null}
                      {o.label}
                    </span>
                    {o.detail ? (
                      <span className="block text-[10px] font-normal text-ink-3">
                        {o.detail}
                      </span>
                    ) : null}
                  </Block>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row, r) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="border-t border-hairline py-1 pr-2 text-[11px] font-normal text-ink-3"
              >
                {row.label}
              </th>
              {spec.options.map((o, i) => (
                <td
                  key={o.id}
                  className={cn(
                    "border-t border-hairline px-2 py-1 text-[12px] text-foreground",
                    api.chosen?.value === o.id && "bg-(--wt-wash)",
                  )}
                >
                  <Block shown={built > r + 1} motionSafe={api.motionSafe}>
                    {row.values[i] ?? "—"}
                  </Block>
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td />
            {spec.options.map((o, i) => {
              const chosen = api.chosen?.value === o.id;
              const tab = active && i === pickIdx;
              return (
                <td
                  key={o.id}
                  className={cn(
                    "rounded-b-2 px-1.5 pt-1.5 pb-1.5",
                    chosen && "bg-(--wt-wash)",
                  )}
                >
                  <Block
                    shown={built > spec.rows.length + 1}
                    motionSafe={api.motionSafe}
                  >
                    <motion.button
                      ref={(node) => {
                        if (node) btns.current.set(o.id, node);
                        else btns.current.delete(o.id);
                      }}
                      type="button"
                      tabIndex={tab ? 0 : -1}
                      data-wt-tabstop={tab || undefined}
                      aria-disabled={!active || undefined}
                      aria-label={
                        chosen ? `${o.label}, chosen` : `Choose ${o.label}`
                      }
                      onKeyDown={(e) => {
                        const to =
                          e.key === "ArrowRight"
                            ? (i + 1) % n
                            : e.key === "ArrowLeft"
                              ? (i - 1 + n) % n
                              : e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? n - 1
                                  : -1;
                        if (to < 0) return;
                        e.preventDefault();
                        setPickIdx(to);
                        const target = spec.options[to];
                        if (target) btns.current.get(target.id)?.focus();
                      }}
                      onClick={() => {
                        if (!active) return;
                        api.submit(
                          { value: o.id, label: o.label },
                          heads.current.get(o.id) ?? null,
                        );
                      }}
                      whileTap={
                        active && api.motionSafe ? { scale: 0.95 } : undefined
                      }
                      transition={springs.flick}
                      className={cn(
                        "inline-flex h-7 w-full items-center justify-center rounded-2 border text-[12px] font-medium transition-colors",
                        chosen
                          ? "border-transparent bg-(--wt-solid) text-primary-foreground"
                          : active
                            ? "border-hairline-strong bg-card text-foreground hover:border-(--wt-line) hover:bg-(--wt-wash)"
                            : "border-hairline text-ink-3",
                        FOCUS,
                      )}
                    >
                      {chosen ? "Chosen" : "Choose"}
                    </motion.button>
                  </Block>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Confirm({
  spec,
  built,
  api,
}: {
  spec: WidgetConfirmSpec;
  built: number;
  api: WidgetApi;
}) {
  const [focusIdx, setFocusIdx] = React.useState(0);
  const btns = React.useRef(new Map<string, HTMLButtonElement>());
  const active = api.live && !api.record;
  const options = [
    { value: "yes", label: spec.confirm },
    ...(spec.cancel ? [{ value: "no", label: spec.cancel }] : []),
  ];
  return (
    <div role="group" aria-label={spec.title} className="flex flex-col gap-2">
      <Block shown={built > 0} motionSafe={api.motionSafe}>
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <CalendarCheck
            aria-hidden
            className="size-4 shrink-0 text-(--wt-accent)"
          />
          {spec.title}
        </p>
      </Block>
      <dl className="flex flex-col">
        {spec.lines.map((l, i) => (
          <Block
            key={l.label}
            shown={built > i + 1}
            motionSafe={api.motionSafe}
          >
            <div className="flex items-center justify-between gap-3 border-t border-hairline py-1 text-[12px]">
              <dt className="text-ink-3">{l.label}</dt>
              <dd className="text-right text-foreground">{l.value}</dd>
            </div>
          </Block>
        ))}
      </dl>
      <Block shown={built > spec.lines.length + 1} motionSafe={api.motionSafe}>
        <div className="flex flex-wrap gap-2">
          {options.map((o, i) => {
            const chosen = api.chosen?.value === o.value;
            const tab = active && i === focusIdx;
            return (
              <motion.button
                key={o.value}
                ref={(node) => {
                  if (node) btns.current.set(o.value, node);
                  else btns.current.delete(o.value);
                }}
                type="button"
                tabIndex={tab ? 0 : -1}
                data-wt-tabstop={tab || undefined}
                aria-disabled={!active || undefined}
                aria-label={chosen ? `${o.label}, chosen` : o.label}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const to = (i + 1) % options.length;
                  setFocusIdx(to);
                  const target = options[to];
                  if (target) btns.current.get(target.value)?.focus();
                }}
                onClick={(e) => {
                  if (!active) return;
                  api.submit(o, e.currentTarget);
                }}
                whileTap={
                  active && api.motionSafe ? { scale: 0.96 } : undefined
                }
                transition={springs.flick}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors",
                  o.value === "yes"
                    ? "bg-(--wt-solid) text-primary-foreground"
                    : "border border-hairline-strong bg-card text-foreground hover:bg-surface-2",
                  !active && !chosen && "opacity-50",
                  FOCUS,
                )}
              >
                {chosen ? <Check aria-hidden className="size-3.5" /> : null}
                {o.label}
              </motion.button>
            );
          })}
        </div>
      </Block>
    </div>
  );
}

/**
 * One assistant reply with its widget. It assembles itself: skeleton blocks
 * turn real one by one on a cascade, and it reports when it is whole.
 */
function Reply({
  msg,
  expired,
  live,
  motionSafe,
  chrome,
  density,
  assistant,
  onSubmit,
  onRefresh,
  onBuilt,
}: {
  msg: BotMsg;
  expired: boolean;
  live: boolean;
  motionSafe: boolean;
  chrome: WidgetChrome;
  density: (typeof DENSITY)[WidgetDensity];
  assistant: string;
  onSubmit: (msg: BotMsg, choice: WidgetChoice, source: Element | null) => void;
  onRefresh: (msg: BotMsg) => void;
  onBuilt: (msg: BotMsg) => void;
}) {
  const total = blocksOf(msg.widget);
  const [built, setBuilt] = React.useState(msg.assemble ? 0 : total);
  const latest = React.useRef(onBuilt);
  React.useEffect(() => {
    latest.current = onBuilt;
  });
  React.useEffect(() => {
    if (!msg.assemble) return;
    let n = 0;
    const timers: number[] = [];
    // Reduced motion: the skeleton gives way to the whole widget at once.
    const step = motionSafe ? Math.round(cascade(total) * 1000) + 40 : 0;
    const first = motionSafe ? 160 : 140;
    const tick = () => {
      n = motionSafe ? n + 1 : total;
      setBuilt(n);
      if (n >= total) latest.current(msg);
      else timers.push(window.setTimeout(tick, step));
    };
    timers.push(window.setTimeout(tick, first));
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // A reply assembles once, when it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.id]);

  const record = msg.state === "done" || expired;
  const api: WidgetApi = {
    live: live && !expired,
    record,
    chosen: msg.chosen,
    motionSafe,
    submit: (choice, source) => onSubmit(msg, choice, source),
  };
  const w = msg.widget;
  const box =
    chrome === "card"
      ? cn(
          "rounded-3 border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_6%,transparent)]",
          density.pad,
        )
      : chrome === "tinted"
        ? cn("rounded-3 bg-(--wt-wash)", density.pad)
        : "border-t border-hairline pt-2.5";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className={cn("text-foreground", density.text)}>{msg.text}</p>
      {w ? (
        <div
          className={cn(
            "relative w-full max-w-[26rem] transition-[opacity,filter] duration-300",
            box,
            record && "opacity-70 saturate-[0.35]",
          )}
        >
          {w.kind === "slots" ? (
            <Slots spec={w} built={built} api={api} />
          ) : w.kind === "stepper" ? (
            <Stepper spec={w} built={built} api={api} />
          ) : w.kind === "compare" ? (
            <Compare spec={w} built={built} api={api} />
          ) : (
            <Confirm spec={w} built={built} api={api} />
          )}
          {msg.chosen ? (
            <span className="sr-only">Chosen: {msg.chosen.label}.</span>
          ) : null}
          <AnimatePresence initial={false}>
            {expired && msg.state !== "done" ? (
              <motion.div
                key="expired"
                className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-2 rounded-3 bg-card/90 p-3 text-center saturate-100"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base }}
              >
                <Clock3 aria-hidden className="size-4 text-warn" />
                <p className="text-[12px] text-foreground">
                  These choices are no longer held.
                </p>
                {msg.state === "open" ? (
                  <button
                    type="button"
                    aria-disabled={!live || undefined}
                    onClick={() => live && onRefresh(msg)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-2 border border-input bg-card px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
                      FOCUS,
                    )}
                  >
                    <RefreshCw aria-hidden className="size-3.5" />
                    Refresh
                  </button>
                ) : (
                  <span className="text-[11px] text-ink-3">
                    Refreshed below.
                  </span>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : msg.turn > 0 ? (
        <div
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full border border-(--wt-line) bg-(--wt-wash) px-2.5 py-1 text-[12px] text-foreground",
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4 text-(--wt-accent)"
            fill="none"
          >
            <motion.path
              d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: motionSafe && msg.assemble ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={
                motionSafe ? { ...springs.flick, delay: 0.2 } : { duration: 0 }
              }
            />
          </svg>
          Done · {assistant}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An assistant whose replies are small live controls: a quantity stepper, a
 * compare table, a slot picker, a confirm card. A reply first types, then its
 * widget assembles out of a skeleton block by block, each block rising a nudge
 * on `snap` in a cascade. Whatever is chosen inside a widget lifts out of it
 * and becomes the next sent message: a copy of the chosen thing travels to
 * where the new bubble lands, x and y on `glide`, its box morphing from the
 * control to the bubble while its fill warms to the bubble's colour; behind
 * it the widget fades to a read-only record with the choice ticked.
 *
 * Every widget is one tab stop with its own keyboard path — a radiogroup for
 * slots, a spinbutton for the stepper, roving Choose buttons in a real table,
 * roving buttons on the confirm card — so Tab leaves it for the composer.
 * Typing an option's label in the composer answers the open widget. Widgets
 * with `expiresIn` expire against `now` and offer Refresh. Under reduced
 * motion nothing flies or rises: the bubble fades in, the skeleton swaps to
 * the whole widget at once, and the choice is still sent and recorded.
 */
export function WidgetThread({
  turns = defaultWidgetTurns,
  request = "Book a room for the Gaugeworks review on Thursday.",
  defaultValue = EMPTY,
  onValueChange,
  onWidgetSubmit,
  onSend,
  onRetry,
  widgetChrome = "card",
  density = "regular",
  accent = "var(--accent-bright)",
  now = defaultWidgetNow,
  typingDelay = 520,
  assistant = "Coldbrook Desk",
  title = "Book a room",
  status = "ready",
  height = 520,
  disabled = false,
  className,
}: WidgetThreadProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.regular;
  const ready = status === "ready";
  const live = ready && !disabled;

  const [msgs, setMsgs] = React.useState<Msg[]>(() =>
    replay(turns, defaultValue, now, request),
  );
  const [choices, setChoices] = React.useState<WidgetChoices>(defaultValue);
  const [draft, setDraft] = React.useState("");
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const counter = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  const nowRef = React.useRef(now);
  React.useEffect(() => {
    nowRef.current = now;
  });
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<HTMLInputElement | null>(null);
  const ghostRef = React.useRef<HTMLDivElement | null>(null);
  const ghostFillRef = React.useRef<HTMLSpanElement | null>(null);
  const flight = React.useRef<{
    msgId: string;
    from: Box;
    label: string;
    then: () => void;
  } | null>(null);
  const flying = React.useRef<{
    stop: () => void;
    land: () => void;
  } | null>(null);
  const scrollAnim = React.useRef<AnimationPlaybackControls | null>(null);

  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );
  const newId = (p: string) => {
    counter.current += 1;
    return `${uid}-${p}${counter.current}`;
  };

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      flying.current?.stop();
      scrollAnim.current?.stop();
    };
  }, []);

  /* ------------------------------ scrolling ------------------------------ */

  const toFloor = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    scrollAnim.current?.stop();
    const target = Math.max(0, el.scrollHeight - el.clientHeight);
    if (!motionSafe || Math.abs(target - el.scrollTop) < 2) {
      el.scrollTop = target;
      return;
    }
    scrollAnim.current = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = Math.round(v);
      },
    });
  }, [motionSafe]);

  // A thread opens at its newest message.
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [status]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const cancel = () => scrollAnim.current?.stop();
    el.addEventListener("wheel", cancel, { passive: true });
    el.addEventListener("touchstart", cancel, { passive: true });
    return () => {
      el.removeEventListener("wheel", cancel);
      el.removeEventListener("touchstart", cancel);
    };
  }, []);

  /* ------------------------------ the flight ----------------------------- */

  // The bubble a choice becomes has just committed, invisible: measure it and
  // fly the ghost from the control to it. Imperative, so no state per frame.
  React.useLayoutEffect(() => {
    const f = flight.current;
    if (!f) return;
    const content = contentRef.current;
    const ghost = ghostRef.current;
    const target = content?.querySelector<HTMLElement>(
      `[data-wt-bubble="${CSS.escape(f.msgId)}"]`,
    );
    flight.current = null;
    if (!content || !ghost || !target) {
      f.then();
      return;
    }
    const c = content.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const to = {
      x: Math.round(r.left - c.left),
      y: Math.round(r.top - c.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
    for (const t of ghost.querySelectorAll("[data-wt-ghost-text]"))
      t.textContent = f.label;
    ghost.style.opacity = "1";
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      ghost.style.opacity = "0";
      flying.current = null;
      f.then();
    };
    const moves = [
      animate(ghost, { x: [f.from.x, to.x], y: [f.from.y, to.y] }, FLIGHT),
      animate(
        ghost,
        { width: [f.from.w, to.w], height: [f.from.h, to.h] },
        FLIGHT,
      ),
    ];
    const fill = ghostFillRef.current
      ? animate(
          ghostFillRef.current,
          { opacity: [0, 1] },
          { duration: durations.slow, ease: easings.enter },
        )
      : null;
    // The bubble takes over while the glide finishes its last pixels.
    const timer = window.setTimeout(land, 470);
    timers.current.push(timer);
    flying.current = {
      land,
      stop: () => {
        for (const m of moves) m.stop();
        fill?.stop();
        window.clearTimeout(timer);
        land();
      },
    };
    toFloor();
  });

  /* ------------------------------- the script ---------------------------- */

  const post = (index: number, c: WidgetChoices) => {
    const turn = turns[index];
    if (!turn) return;
    const typingId = newId("typing");
    setMsgs((m) => [...m, { kind: "typing", id: typingId }]);
    timers.current.push(window.setTimeout(toFloor, 30));
    timers.current.push(
      window.setTimeout(
        () => {
          const text = resolveText(turn, c);
          const widget = resolveWidget(turn, c);
          setMsgs((m) => [
            ...m.filter((x) => x.id !== typingId),
            {
              kind: "bot",
              id: newId("bot"),
              turn: index,
              text,
              widget,
              postedAt: nowRef.current,
              state: "open",
              assemble: true,
            },
          ]);
          say(`${assistant}: ${text}`);
          timers.current.push(window.setTimeout(toFloor, 60));
        },
        Math.max(0, typingDelay),
      ),
    );
  };

  const indexOfTurn = (id: string | undefined, fallback: number) => {
    const i = id ? turns.findIndex((t) => t.id === id) : -1;
    return i >= 0 ? i : fallback;
  };

  /** Appends the visitor's message, flying it from `source` when it can. */
  const sendAsUser = (
    text: string,
    source: Element | null,
    then: () => void,
  ) => {
    flying.current?.stop();
    const id = newId("user");
    const content = contentRef.current;
    const canFly = motionSafe && !!source && !!content;
    if (canFly && source && content) {
      const c = content.getBoundingClientRect();
      const r = source.getBoundingClientRect();
      flight.current = {
        msgId: id,
        label: text,
        from: {
          x: Math.round(r.left - c.left),
          y: Math.round(r.top - c.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
        then: () => {
          setMsgs((m) =>
            m.map((x) =>
              x.id === id && x.kind === "user" ? { ...x, landed: true } : x,
            ),
          );
          then();
        },
      };
    }
    setMsgs((m) => [...m, { kind: "user", id, text, landed: !canFly }]);
    if (!canFly) {
      timers.current.push(window.setTimeout(toFloor, 30));
      then();
    }
  };

  const submit = (
    msg: BotMsg,
    choice: WidgetChoice,
    source: Element | null,
  ) => {
    const w = msg.widget;
    if (!live || !w || msg.state !== "open") return;
    const next = { ...choices, [w.id]: choice };
    setChoices(next);
    setMsgs((m) =>
      m.map((x) =>
        x.id === msg.id && x.kind === "bot"
          ? { ...x, state: "done", chosen: choice }
          : x,
      ),
    );
    onValueChange?.(next);
    onWidgetSubmit?.(w.id, choice, next);
    say(`Sent: ${choice.label}.`);
    const back =
      w.kind === "confirm" && choice.value === "no"
        ? indexOfTurn(w.cancelTo, Math.max(0, msg.turn - 1))
        : msg.turn + 1;
    sendAsUser(choice.label, source, () => post(back, next));
  };

  const refresh = (msg: BotMsg) => {
    if (!live || !msg.widget) return;
    setMsgs((m) =>
      m.map((x) =>
        x.id === msg.id && x.kind === "bot" ? { ...x, state: "expired" } : x,
      ),
    );
    onRetry?.(msg.widget.id);
    post(msg.turn, choices);
  };

  const onBuilt = (msg: BotMsg) => {
    // Focus moves into a new widget only when the visitor was in the thread.
    const active = document.activeElement;
    const thread = scrollerRef.current;
    if (!thread || !(active instanceof HTMLElement) || !thread.contains(active))
      return;
    thread
      .querySelector<HTMLElement>(
        `[data-wt-reply="${CSS.escape(msg.id)}"] [data-wt-tabstop]`,
      )
      ?.focus({ preventScroll: true });
  };

  const openReply = [...msgs]
    .reverse()
    .find(
      (m): m is BotMsg => m.kind === "bot" && m.state === "open" && !!m.widget,
    );
  const isExpired = (m: BotMsg) =>
    m.state === "expired" ||
    (m.state === "open" &&
      !!m.widget?.expiresIn &&
      now - m.postedAt >= m.widget.expiresIn * 60_000);

  // Expiry is announced once, from the render that sees it happen.
  const expiredKey = msgs
    .filter(
      (m): m is BotMsg =>
        m.kind === "bot" && isExpired(m) && m.state === "open",
    )
    .map((m) => m.id)
    .join("|");
  const [lastExpired, setLastExpired] = React.useState(expiredKey);
  if (lastExpired !== expiredKey) {
    setLastExpired(expiredKey);
    if (expiredKey)
      setSaid((s) => ({
        n: s.n + 1,
        text: "A hold expired. Refresh to see what is free now.",
      }));
  }

  const matchOpen = (text: string): WidgetChoice | null => {
    const w = openReply?.widget;
    if (!w || isExpired(openReply)) return null;
    const q = text.trim().toLowerCase();
    if (w.kind === "slots") {
      const s = w.slots.find(
        (x) => !x.taken && q.includes(x.label.toLowerCase()),
      );
      return s ? { value: s.id, label: s.label } : null;
    }
    if (w.kind === "compare") {
      const o = w.options.find((x) => q.includes(x.label.toLowerCase()));
      return o ? { value: o.id, label: o.label } : null;
    }
    if (w.kind === "confirm") {
      if (
        /\b(yes|book|confirm|hold)\b/.test(q) ||
        q === w.confirm.toLowerCase()
      )
        return { value: "yes", label: w.confirm };
      if (
        w.cancel &&
        (/\b(no|change|different)\b/.test(q) || q === w.cancel.toLowerCase())
      )
        return { value: "no", label: w.cancel };
      return null;
    }
    const n = Number(q.match(/\d+/)?.[0]);
    if (Number.isFinite(n) && n >= w.min && n <= w.max)
      return { value: String(n), label: plural(n, w.unit) };
    return null;
  };

  const sendDraft = () => {
    const text = draft.trim();
    if (!text || !live) return;
    setDraft("");
    onSend?.(text);
    const hit = matchOpen(text);
    if (hit && openReply) {
      submit(openReply, hit, composerRef.current);
      return;
    }
    sendAsUser(text, composerRef.current, () => {
      const typingId = newId("typing");
      setMsgs((m) => [...m, { kind: "typing", id: typingId }]);
      timers.current.push(
        window.setTimeout(
          () => {
            setMsgs((m) => [
              ...m.filter((x) => x.id !== typingId),
              {
                kind: "bot",
                id: newId("bot"),
                turn: -1,
                text: openReply
                  ? "I can only book through the options above. Pick one there, or type its name."
                  : "That's everything for this booking.",
                postedAt: nowRef.current,
                state: "done",
                assemble: false,
              },
            ]);
            timers.current.push(window.setTimeout(toFloor, 60));
          },
          Math.max(0, typingDelay),
        ),
      );
    });
  };

  /* -------------------------------- render ------------------------------- */

  const chosenCount = Object.keys(choices).length;
  const widgetCount = turns.filter((t) => t.widget).length;

  const avatar = (
    <span
      aria-hidden
      className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-(--wt-wash) text-[11px] font-semibold text-(--wt-accent)"
    >
      {assistant.charAt(0)}
    </span>
  );

  const thread =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-4 p-4">
        <p className="sr-only">Loading the conversation.</p>
        <span
          aria-hidden
          className="h-9 w-3/5 self-end rounded-3 bg-surface-2"
        />
        <span aria-hidden className="h-24 w-4/5 rounded-3 bg-surface-2" />
        <span
          aria-hidden
          className="h-8 w-1/4 self-end rounded-3 bg-surface-2"
        />
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          The conversation did not load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry(null)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div ref={contentRef} className="relative">
        <ol
          role="list"
          aria-label="Conversation"
          className={cn(
            "mx-auto flex w-full max-w-[40rem] flex-col px-3 pt-4 pb-6 @min-[30rem]/widget-thread:px-4",
            d.gap,
          )}
        >
          {msgs.map((m) =>
            m.kind === "user" ? (
              <li key={m.id} className="flex flex-col items-end">
                <span className="sr-only">You: </span>
                <p
                  data-wt-bubble={m.id}
                  className={cn(
                    "max-w-[86%] rounded-3 rounded-br-1 bg-(--wt-solid) text-primary-foreground",
                    d.bubble,
                    d.text,
                    !m.landed && "opacity-0",
                  )}
                >
                  {m.text}
                </p>
              </li>
            ) : m.kind === "typing" ? (
              <motion.li
                key={m.id}
                aria-hidden
                className="flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.fast }}
              >
                {avatar}
                <span className="inline-flex h-6 items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-pulse rounded-full bg-ink-3 motion-reduce:animate-none"
                      style={{ animationDelay: `${i * 160}ms` }}
                    />
                  ))}
                </span>
              </motion.li>
            ) : (
              <motion.li
                key={m.id}
                data-wt-reply={m.id}
                className="flex items-start gap-2"
                initial={
                  m.assemble
                    ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? { y: springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.fast }
                }
              >
                <span className="sr-only">{assistant}: </span>
                {avatar}
                <Reply
                  msg={m}
                  expired={isExpired(m)}
                  live={live}
                  motionSafe={motionSafe}
                  chrome={widgetChrome}
                  density={d}
                  assistant={assistant}
                  onSubmit={submit}
                  onRefresh={refresh}
                  onBuilt={onBuilt}
                />
              </motion.li>
            ),
          )}
        </ol>
        <div
          ref={ghostRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 overflow-hidden rounded-3 border border-(--wt-line) bg-card shadow-[0_10px_24px_color-mix(in_oklab,black_18%,transparent)]"
          style={{ opacity: 0 }}
        >
          {/* The control's look underneath, the bubble's colour warming in
              over it: two layers, one cross-fade, no colour interpolation. */}
          <span
            data-wt-ghost-text
            className={cn(
              "flex h-full items-center truncate font-medium text-foreground",
              d.bubble,
              d.text,
            )}
          />
          <span
            ref={ghostFillRef}
            className="absolute inset-0 bg-(--wt-solid)"
            style={{ opacity: 0 }}
          >
            <span
              data-wt-ghost-text
              className={cn(
                "flex h-full items-center truncate font-medium text-primary-foreground",
                d.bubble,
                d.text,
              )}
            />
          </span>
        </div>
      </div>
    );

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "@container/widget-thread relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          height,
          "--wt-accent": accent,
          "--wt-wash": `color-mix(in oklab, ${accent} 11%, transparent)`,
          "--wt-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
          "--wt-solid": `oklch(from ${accent} 0.52 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 @min-[30rem]/widget-thread:px-4">
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--wt-wash) text-(--wt-accent)"
        >
          <CalendarCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-[11px] text-ink-3">
            {assistant} · replies you can use
          </p>
        </div>
        <span className="hidden h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.06em] text-ink-2 uppercase tabular-nums @min-[24rem]/widget-thread:inline-flex">
          {Math.min(chosenCount, widgetCount)} of {widgetCount} chosen
        </span>
      </header>

      <div
        ref={scrollerRef}
        className="[scrollbar-width:thin] overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_14px)]"
      >
        {thread}
      </div>

      <form
        className="flex items-center gap-2 border-t border-hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          sendDraft();
        }}
      >
        <input
          ref={composerRef}
          type="text"
          value={draft}
          readOnly={!live}
          aria-disabled={!live || undefined}
          aria-label={`Message ${assistant}`}
          placeholder={openReply ? "Or type a choice" : `Message ${assistant}`}
          onChange={(e) => {
            const text = e.currentTarget.value;
            setDraft(text);
          }}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-3 border border-hairline-strong bg-surface-1 px-3 text-[13px] text-foreground placeholder:text-ink-3",
            FOCUS_IN,
          )}
        />
        <button
          type="submit"
          aria-label="Send"
          aria-disabled={!live || !draft.trim() || undefined}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-3 bg-(--wt-solid) text-primary-foreground transition-opacity aria-disabled:opacity-40",
            FOCUS,
          )}
        >
          <ArrowUp aria-hidden className="size-4" />
        </button>
      </form>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
