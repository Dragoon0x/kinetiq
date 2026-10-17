"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";
import {
  CreditCard,
  Hand,
  LayoutDashboard,
  ListChecks,
  Maximize2,
  MessageSquare,
  Minimize2,
  MousePointer2,
  Presentation,
  RotateCcw,
  Tag,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type StageModeValue = "normal" | "stage";

export type StageBoardKind =
  "pricing" | "onboarding" | "checkout" | "dashboard";

export type StageBoard = {
  id: string;
  label: string;
  /** Which page the built-in board draws. */
  kind: StageBoardKind;
  /** Open comments, shown in the sidebar. */
  comments: number;
  /** Comment pins on the board, as fractions of its width and height. */
  pins?: { x: number; y: number }[];
  /** One line under the label: "Edited 2h ago". */
  meta?: string;
};

export type StageAction = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type StageModeStatus = "ready" | "loading" | "error";

type Piece = "sidebar" | "header" | "toolbar";

export type StageModeProps = {
  /** The boards in the sidebar (a tab bar on a phone). @default defaultStageBoards */
  nav?: StageBoard[];
  /** Controlled current board id. */
  page?: string;
  /** Initial board when uncontrolled. @default the first board */
  defaultPage?: string;
  /** Fires with the board chosen from the sidebar or the tab bar. */
  onNavigate?: (id: string) => void;
  /** The tool buttons in the floating toolbar; the first is the active tool at first. @default defaultStageActions */
  actions?: StageAction[];
  /** Fires with the tool chosen from the toolbar. */
  onAction?: (id: string) => void;
  /** Drawn inside the board in place of the built-in page, at the board's design size. */
  children?: React.ReactNode;
  /** The board's design size, px; it is scaled to fit the room it has. @default { width: 640, height: 400 } */
  boardSize?: { width: number; height: number };
  /** Controlled mode. */
  mode?: StageModeValue;
  /** Initial mode when uncontrolled. @default "normal" */
  defaultMode?: StageModeValue;
  /** Fires from the button, key or gesture that changed the mode. */
  onModeChange?: (mode: StageModeValue) => void;
  /** Delay between the sidebar, the header and the toolbar as they step away, ms. @default 60 */
  cascade?: number;
  /** How near an edge the pointer must come to peek that piece of chrome back, px. @default 24 */
  peekZone?: number;
  /** Present, the current board, pins and the edge hints — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The toast shown the first time the stage is taken; null never shows it. @default how to leave and peek */
  hint?: string | null;
  /** Fires when the one-time hint leaves. */
  onHintDismiss?: () => void;
  /** Reviewers shown in the header. @default four names */
  people?: string[];
  /** The workspace, first in the breadcrumb. @default "Waylight" */
  workspace?: string;
  /** The project, second in the breadcrumb and the frame's name. @default "Q4 launch" */
  project?: string;
  /** Whether the boards have arrived. @default "ready" */
  status?: StageModeStatus;
  /** "Try again" was pressed after the boards failed to load. */
  onRetry?: () => void;
  /** The frame's height, px. @default 520 */
  height?: number;
  /** Classes for the outer frame. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultStageBoards: StageBoard[] = [
  {
    id: "pricing",
    label: "Pricing page",
    kind: "pricing",
    comments: 4,
    meta: "Edited 2h ago",
    pins: [
      { x: 0.26, y: 0.2 },
      { x: 0.53, y: 0.39 },
      { x: 0.8, y: 0.62 },
      { x: 0.49, y: 0.87 },
    ],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    kind: "onboarding",
    comments: 2,
    meta: "Edited yesterday",
    pins: [
      { x: 0.16, y: 0.47 },
      { x: 0.72, y: 0.66 },
    ],
  },
  {
    id: "checkout",
    label: "Checkout",
    kind: "checkout",
    comments: 3,
    meta: "Edited Mon",
    pins: [
      { x: 0.33, y: 0.55 },
      { x: 0.84, y: 0.31 },
      { x: 0.8, y: 0.84 },
    ],
  },
  {
    id: "dashboard",
    label: "Fleet dashboard",
    kind: "dashboard",
    comments: 1,
    meta: "Edited 12 Sep",
    pins: [{ x: 0.62, y: 0.5 }],
  },
];

export const defaultStageActions: StageAction[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "comment", label: "Comment", icon: MessageSquare },
  { id: "hand", label: "Pan", icon: Hand },
];

const DEFAULT_PEOPLE = [
  "Ines Duarte",
  "Tomas Berg",
  "Ada Mensah",
  "Rui Okafor",
];
const DEFAULT_BOARD = { width: 640, height: 400 };

/* ----------------------------------------------------------------------- */
/*                                 Geometry                                 */
/* ----------------------------------------------------------------------- */

const HEADER_H = 48;
const SIDEBAR_W = 184;
const TOOLBAR_H = 40;
const TOOLBAR_GAP = 12;
const PHONE_HEADER_H = 44;
const TABBAR_H = 52;
const PEEK_LINGER = 280;
const HINT_MS = 3600;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_INSET =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

type Fit = { x: number; y: number; s: number };

/** The board's box for a frame size, a layout and a mode: centred, contained. */
function fitBoard(
  w: number,
  h: number,
  phone: boolean,
  stage: boolean,
  board: { width: number; height: number },
): Fit {
  let x0: number;
  let y0: number;
  let bw: number;
  let bh: number;
  if (phone) {
    const pad = stage ? 10 : 14;
    x0 = pad;
    y0 = (stage ? 0 : PHONE_HEADER_H) + pad;
    bw = w - pad * 2;
    bh = h - (stage ? 0 : PHONE_HEADER_H + TABBAR_H) - pad * 2;
  } else if (stage) {
    const pad = 18;
    x0 = pad;
    y0 = pad;
    bw = w - pad * 2;
    bh = h - pad * 2;
  } else {
    const pad = 22;
    x0 = SIDEBAR_W + pad;
    y0 = HEADER_H + pad;
    bw = w - SIDEBAR_W - pad * 2;
    bh = h - HEADER_H - TOOLBAR_H - TOOLBAR_GAP - pad * 2;
  }
  const s = Math.max(0.05, Math.min(bw / board.width, bh / board.height));
  return {
    x: r2(x0 + (bw - board.width * s) / 2),
    y: r2(y0 + (bh - board.height * s) / 2),
    s: r3(s),
  };
}

/* ----------------------------------------------------------------------- */
/*                              Board artwork                               */
/* ----------------------------------------------------------------------- */

const Bar = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn("block h-1.5 rounded-full bg-hairline-strong", className)}
  />
);

function PricingArt() {
  const plans = [
    { name: "Depot", price: "£24", note: "Up to 20 vans" },
    { name: "Fleet", price: "£58", note: "Up to 120 vans", popular: true },
    { name: "Network", price: "Talk to us", note: "Every depot" },
  ];
  return (
    <div className="flex h-full flex-col items-center px-10 pt-7">
      <p className="font-mono text-[8px] tracking-[0.14em] text-(--sm-accent) uppercase">
        Pricing
      </p>
      <p className="mt-1.5 text-[20px] leading-6 font-semibold text-foreground">
        Plans that grow with your fleet
      </p>
      <p className="mt-1 text-[10px] text-ink-3">
        Every plan includes live tracking, proof of delivery and depot reports.
      </p>
      <div className="mt-3 flex rounded-full border border-hairline p-0.5 text-[9px]">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-foreground">
          Monthly
        </span>
        <span className="px-2.5 py-0.5 text-ink-3">Yearly · save 15%</span>
      </div>
      <div className="mt-5 grid w-full grid-cols-3 gap-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={cn(
              "relative flex flex-col gap-2 rounded-2 border bg-card p-3",
              p.popular ? "border-(--sm-line)" : "border-hairline",
            )}
          >
            {p.popular ? (
              <span className="absolute -top-2 right-3 rounded-full bg-(--sm-solid) px-1.5 py-px text-[7.5px] font-medium text-(--sm-on)">
                Popular
              </span>
            ) : null}
            <span className="text-[11px] font-semibold text-foreground">
              {p.name}
            </span>
            <span className="text-[17px] leading-5 font-semibold text-foreground">
              {p.price}
              {p.price.startsWith("£") ? (
                <span className="text-[8.5px] font-normal text-ink-3">
                  {" "}
                  / van / month
                </span>
              ) : null}
            </span>
            <span className="text-[8.5px] text-ink-3">{p.note}</span>
            <Bar className="w-11/12" />
            <Bar className="w-3/4" />
            <Bar className="w-4/5" />
            <span
              className={cn(
                "mt-1 flex h-5 items-center justify-center rounded-1 text-[8.5px] font-medium",
                p.popular
                  ? "bg-(--sm-solid) text-(--sm-on)"
                  : "border border-hairline text-foreground",
              )}
            >
              {p.price.startsWith("£") ? "Start a trial" : "Book a call"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex w-full items-center justify-between border-t border-hairline pt-3">
        <span className="text-[9px] text-ink-3">
          Trusted by 400 depots across the network
        </span>
        <span className="flex gap-2">
          {["Basinworks", "Fieldline", "Coldbrook", "Fernworks"].map((n) => (
            <span
              key={n}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[8px] font-medium text-ink-2"
            >
              {n}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function OnboardingArt() {
  const steps = ["Account", "Team", "Depots", "Invite drivers"];
  return (
    <div className="grid h-full grid-cols-[150px_1fr] gap-5 px-8 pt-8">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold text-foreground">
          Set up Waylight
        </p>
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full text-[7.5px] font-semibold",
                i < 2
                  ? "bg-(--sm-solid) text-(--sm-on)"
                  : i === 2
                    ? "border border-(--sm-accent) text-(--sm-accent)"
                    : "border border-hairline text-ink-3",
              )}
            >
              {i < 2 ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "text-[10px]",
                i === 2 ? "font-medium text-foreground" : "text-ink-3",
              )}
            >
              {s}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-4">
        <p className="text-[13px] font-semibold text-foreground">
          Add your first depot
        </p>
        <div className="grid grid-cols-2 gap-3">
          {["Depot name", "Postcode"].map((l) => (
            <div key={l} className="flex flex-col gap-1">
              <span className="text-[8.5px] text-ink-3">{l}</span>
              <span className="h-5 rounded-1 border border-hairline bg-surface-0" />
            </div>
          ))}
        </div>
        <div className="relative h-24 overflow-hidden rounded-2 border border-hairline bg-[radial-gradient(var(--hairline-strong)_1px,transparent_1.2px)] [background-size:10px_10px]">
          <span className="absolute top-9 left-[46%] size-3 rounded-full border-2 border-card bg-(--sm-solid)" />
        </div>
        <div className="flex justify-end gap-2">
          <span className="flex h-5 items-center rounded-1 border border-hairline px-2 text-[8.5px] text-foreground">
            Back
          </span>
          <span className="flex h-5 items-center rounded-1 bg-(--sm-solid) px-2 text-[8.5px] text-(--sm-on)">
            Save depot
          </span>
        </div>
      </div>
    </div>
  );
}

function CheckoutArt() {
  return (
    <div className="grid h-full grid-cols-[1fr_190px] gap-5 px-8 pt-7">
      <div className="flex flex-col gap-2.5">
        <p className="text-[14px] font-semibold text-foreground">Checkout</p>
        {["Email", "Company"].map((l) => (
          <div key={l} className="flex flex-col gap-1">
            <span className="text-[8.5px] text-ink-3">{l}</span>
            <span className="h-5 rounded-1 border border-hairline bg-surface-0" />
          </div>
        ))}
        <span className="pt-1 text-[9.5px] font-medium text-foreground">
          Delivery
        </span>
        {["Next day · £6", "Two to three days · free"].map((l, i) => (
          <div
            key={l}
            className={cn(
              "flex h-6 items-center gap-2 rounded-1 border px-2 text-[8.5px]",
              i === 0
                ? "border-(--sm-line) text-foreground"
                : "border-hairline text-ink-2",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full border",
                i === 0
                  ? "border-[3px] border-(--sm-accent)"
                  : "border-hairline-strong",
              )}
            />
            {l}
          </div>
        ))}
        <span className="pt-1 text-[9.5px] font-medium text-foreground">
          Card
        </span>
        <span className="h-5 rounded-1 border border-hairline bg-surface-0" />
      </div>
      <div className="flex flex-col gap-2 self-start rounded-3 border border-hairline bg-card p-3">
        <span className="text-[10px] font-semibold text-foreground">
          Order summary
        </span>
        {["Handheld scanner ×4", "Van mount ×4", "Fleet plan, 1 month"].map(
          (l) => (
            <div key={l} className="flex items-center gap-2">
              <span className="size-5 rounded-1 bg-surface-2" />
              <span className="flex-1 text-[8.5px] text-ink-2">{l}</span>
            </div>
          ),
        )}
        <span className="my-1 h-px bg-hairline" />
        <div className="flex justify-between text-[9.5px] font-semibold text-foreground">
          <span>Total</span>
          <span>£1,486.00</span>
        </div>
        <span className="flex h-6 items-center justify-center rounded-1 bg-(--sm-solid) text-[9px] font-medium text-(--sm-on)">
          Pay £1,486.00
        </span>
      </div>
    </div>
  );
}

function DashboardArt() {
  const bars = [42, 55, 48, 63, 58, 71, 66, 74, 69, 80, 77, 86];
  const stats = [
    ["On time", "96.4%"],
    ["Drops today", "1,284"],
    ["Late vans", "3"],
    ["Fuel / 100 km", "11.2 L"],
  ];
  return (
    <div className="flex h-full flex-col gap-3 px-7 pt-6">
      <p className="text-[14px] font-semibold text-foreground">
        Fleet this week
      </p>
      <div className="grid grid-cols-4 gap-2.5">
        {stats.map(([l, v]) => (
          <div
            key={l}
            className="flex flex-col gap-0.5 rounded-2 border border-hairline bg-card px-2.5 py-2"
          >
            <span className="text-[8px] text-ink-3">{l}</span>
            <span className="text-[14px] font-semibold text-foreground tabular-nums">
              {v}
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-32 items-end gap-1.5 rounded-2 border border-hairline bg-card px-3 pt-3 pb-2">
        {bars.map((b, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-t-1",
              i === bars.length - 1
                ? "bg-(--sm-solid)"
                : "bg-[color-mix(in_oklab,var(--sm-accent)_28%,transparent)]",
            )}
            style={{ height: `${b}%` }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {["GW-1042 · Leeds", "GW-1077 · Hull", "GW-1105 · York"].map((l) => (
          <div
            key={l}
            className="flex items-center gap-2 text-[8.5px] text-ink-2"
          >
            <span className="size-1.5 rounded-full bg-success" />
            <span className="w-24">{l}</span>
            <Bar className="flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

const ART: Record<StageBoardKind, () => React.ReactNode> = {
  pricing: PricingArt,
  onboarding: OnboardingArt,
  checkout: CheckoutArt,
  dashboard: DashboardArt,
};

const KIND_ICON: Record<
  StageBoardKind,
  React.ComponentType<{ className?: string }>
> = {
  pricing: Tag,
  onboarding: ListChecks,
  checkout: CreditCard,
  dashboard: LayoutDashboard,
};

/** A thumbnail of a board kind: a few blocks in the page's arrangement. */
function Thumb({ kind, current }: { kind: StageBoardKind; current: boolean }) {
  const block = current
    ? "bg-[color-mix(in_oklab,var(--sm-accent)_40%,transparent)]"
    : "bg-hairline-strong";
  return (
    <span
      aria-hidden
      className="relative flex h-6 w-9 shrink-0 gap-0.5 overflow-hidden rounded-1 border border-hairline bg-card p-0.5"
    >
      {kind === "pricing" ? (
        [0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-[1px]",
              i === 1 ? block : "bg-surface-2",
            )}
          />
        ))
      ) : kind === "onboarding" ? (
        <>
          <span className="w-2 rounded-[1px] bg-surface-2" />
          <span className={cn("flex-1 rounded-[1px]", block)} />
        </>
      ) : kind === "checkout" ? (
        <>
          <span className="flex-1 rounded-[1px] bg-surface-2" />
          <span className={cn("w-2.5 rounded-[1px]", block)} />
        </>
      ) : (
        <span className="flex flex-1 items-end gap-px">
          {[40, 60, 50, 80, 70].map((h, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-[1px]",
                i === 3 ? block : "bg-surface-2",
              )}
              style={{ height: `${h}%` }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The frame                                 */
/* ----------------------------------------------------------------------- */

/** Narrower than the phone breakpoint (30rem), and the frame's size. */
function useFrameSize(
  node: HTMLElement | null,
  fallback: { w: number; h: number },
) {
  const [size, setSize] = React.useState<{ w: number; h: number; n: number }>(
    () => ({ ...fallback, n: 0 }),
  );
  React.useLayoutEffect(() => {
    if (!node) return;
    const read = () => {
      const r = node.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((prev) =>
        prev.w === w && prev.h === h && prev.n > 0
          ? prev
          : { w, h, n: prev.n + 1 },
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return size;
}

/**
 * A board review with a presentation mode. Taking the stage, the sidebar
 * slides off the left edge on `springs.glide`, the header lifts away and the
 * toolbar sinks on `springs.snap`, each a `cascade` apart, while the board —
 * laid out once at its design size and carried by a transform — scales up
 * into the room they leave on glide; the zoom readout is the same scale as a
 * motion value, so it counts up as the board grows. Leaving plays the cascade
 * backwards.
 *
 * On stage, a pointer within `peekZone` of the left, top or bottom edge peeks
 * that piece back over the work on snap, with a hint bar on the edge that
 * brightens as the pointer nears; focus does the same, so hidden chrome stays
 * reachable by keyboard. The first time, a toast lands on `springs.recoil`
 * with how to leave and peek. F toggles the stage while focus is inside,
 * Escape leaves it, a two-finger tap toggles it on touch. Under 30rem the
 * stage just hides the header and the tab bar. Under reduced motion chrome
 * fades instead of travelling and the board jumps to its new fit.
 */
export function StageMode({
  nav = defaultStageBoards,
  page: pageProp,
  defaultPage,
  onNavigate,
  actions = defaultStageActions,
  onAction,
  children,
  boardSize = DEFAULT_BOARD,
  mode: modeProp,
  defaultMode = "normal",
  onModeChange,
  cascade = 60,
  peekZone = 24,
  accent = "var(--accent-bright)",
  hint,
  onHintDismiss,
  people = DEFAULT_PEOPLE,
  workspace = "Waylight",
  project = "Q4 launch",
  status = "ready",
  onRetry,
  height = 520,
  className,
}: StageModeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const [frame, setFrame] = React.useState<HTMLElement | null>(null);
  const size = useFrameSize(frame, { w: 720, h: height });
  const phone = size.w < 480;

  /* -------------------------------- mode -------------------------------- */

  const [ownMode, setOwnMode] = React.useState<StageModeValue>(defaultMode);
  const mode = modeProp ?? ownMode;
  const stage = mode === "stage";
  const [announcement, setAnnouncement] = React.useState("");

  // What changed last decides the timing: a mode change cascades, a peek
  // answers at once.
  const [cause, setCause] = React.useState<"mode" | "peek">("mode");
  const [seenMode, setSeenMode] = React.useState(mode);
  const [hintState, setHintState] = React.useState<
    "never" | "showing" | "done"
  >("never");
  const [peek, setPeek] = React.useState<Piece | null>(null);
  const [peekFocus, setPeekFocus] = React.useState<Piece | null>(null);
  const hintText =
    hint === undefined
      ? phone
        ? "Two-finger tap or Esc to leave"
        : "F or Esc to leave · Point at an edge to peek"
      : hint;
  if (seenMode !== mode) {
    setSeenMode(mode);
    setCause("mode");
    setPeek(null);
    setPeekFocus(null);
    if (mode === "stage" && hintState === "never" && hintText) {
      setHintState("showing");
    }
    if (mode === "normal" && hintState === "showing") setHintState("done");
  }

  const setMode = (next: StageModeValue) => {
    if (next === mode) return;
    if (next === "normal" && hintState === "showing") {
      setHintState("done");
      onHintDismiss?.();
    }
    if (modeProp === undefined) setOwnMode(next);
    onModeChange?.(next);
    setAnnouncement(
      next === "stage"
        ? "Stage mode. Press F or Escape to leave."
        : "Stage mode off.",
    );
  };

  /* -------------------------------- page -------------------------------- */

  const [ownPage, setOwnPage] = React.useState(defaultPage ?? nav[0]?.id ?? "");
  const pageId = pageProp ?? ownPage;
  const board = nav.find((b) => b.id === pageId) ?? nav[0] ?? null;
  const go = (id: string) => {
    if (id === pageId) return;
    if (pageProp === undefined) setOwnPage(id);
    onNavigate?.(id);
    const b = nav.find((x) => x.id === id);
    if (b) setAnnouncement(`${b.label}, ${b.comments} comments.`);
  };

  const [tool, setTool] = React.useState(actions[0]?.id ?? "");

  /* -------------------------------- board ------------------------------- */

  const fit = fitBoard(size.w, size.h, phone, stage, boardSize);
  const bx = useMotionValue(fit.x);
  const by = useMotionValue(fit.y);
  const bs = useMotionValue(fit.s);
  const zoom = useTransform(bs, (s) => `${Math.round(s * 100)}%`);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  React.useEffect(() => {
    for (const run of runs.current) run.stop();
    runs.current = [];
    if (size.n <= 1 || !motionSafe) {
      bx.jump(fit.x);
      by.jump(fit.y);
      bs.jump(fit.s);
      return;
    }
    runs.current = [
      animate(bx, fit.x, springs.glide),
      animate(by, fit.y, springs.glide),
      animate(bs, fit.s, springs.glide),
    ];
    const live = runs.current;
    return () => {
      for (const run of live) run.stop();
    };
  }, [fit.x, fit.y, fit.s, size.n, motionSafe, bx, by, bs]);
  // A re-run that stopped the springs mid-way still has to land.
  React.useEffect(
    () => () => {
      for (const run of runs.current) run.stop();
    },
    [],
  );

  /* -------------------------------- peeks ------------------------------- */

  const edgeLeft = useMotionValue(0);
  const edgeTop = useMotionValue(0);
  const edgeBottom = useMotionValue(0);
  const glowLeft = useTransform(edgeLeft, (v) => r2(0.12 + v * 0.6));
  const glowTop = useTransform(edgeTop, (v) => r2(0.12 + v * 0.6));
  const glowBottom = useTransform(edgeBottom, (v) => r2(0.12 + v * 0.6));
  const linger = React.useRef<number | null>(null);
  const pieceEls = React.useRef(new Map<Piece, HTMLElement>());
  const sidebarRef = React.useCallback((node: HTMLElement | null) => {
    if (node) pieceEls.current.set("sidebar", node);
    else pieceEls.current.delete("sidebar");
  }, []);
  const headerRef = React.useCallback((node: HTMLElement | null) => {
    if (node) pieceEls.current.set("header", node);
    else pieceEls.current.delete("header");
  }, []);
  const toolbarRef = React.useCallback((node: HTMLElement | null) => {
    if (node) pieceEls.current.set("toolbar", node);
    else pieceEls.current.delete("toolbar");
  }, []);
  const clearLinger = () => {
    if (linger.current !== null) window.clearTimeout(linger.current);
    linger.current = null;
  };
  React.useEffect(() => clearLinger, []);

  const showPeek = (p: Piece | null) => {
    if (p === peek) return;
    setCause("peek");
    setPeek(p);
  };

  const onFramePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!stage || phone || !frame || event.pointerType === "touch") return;
    const r = frame.getBoundingClientRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    const zone = Math.max(4, peekZone);
    const near = (d: number) => r2(clamp(1 - (d - zone) / (zone * 3), 0, 1));
    edgeLeft.set(near(x));
    edgeTop.set(near(y));
    edgeBottom.set(near(r.height - y));
    const over = peek ? pieceEls.current.get(peek) : undefined;
    if (over && event.target instanceof Node && over.contains(event.target)) {
      clearLinger();
      return;
    }
    const edge: Piece | null =
      x < zone
        ? "sidebar"
        : y < zone
          ? "header"
          : r.height - y < zone
            ? "toolbar"
            : null;
    if (edge) {
      clearLinger();
      showPeek(edge);
    } else if (peek && linger.current === null) {
      linger.current = window.setTimeout(() => {
        linger.current = null;
        setCause("peek");
        setPeek(null);
      }, PEEK_LINGER);
    }
  };

  const onFramePointerLeave = () => {
    edgeLeft.set(0);
    edgeTop.set(0);
    edgeBottom.set(0);
    if (peek && linger.current === null) {
      linger.current = window.setTimeout(() => {
        linger.current = null;
        setCause("peek");
        setPeek(null);
      }, PEEK_LINGER);
    }
  };

  /* ---------------------------- two-finger tap -------------------------- */

  const touches = React.useRef(new Map<number, { x: number; y: number }>());
  const pairAt = React.useRef<number | null>(null);
  const onTouchDown = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    touches.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (touches.current.size === 2) pairAt.current = event.timeStamp;
    else if (touches.current.size > 2) pairAt.current = null;
  };
  const onTouchMove = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const start = touches.current.get(event.pointerId);
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
    ) {
      pairAt.current = null;
    }
  };
  const onTouchUp = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    touches.current.delete(event.pointerId);
    if (touches.current.size > 0) return;
    const at = pairAt.current;
    pairAt.current = null;
    if (at !== null && event.timeStamp - at < 350)
      setMode(stage ? "normal" : "stage");
  };

  /* ------------------------------- keyboard ----------------------------- */

  const onFrameKey = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const typing =
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT";
    if (event.key === "Escape" && stage) {
      event.preventDefault();
      setMode("normal");
      return;
    }
    if (
      !typing &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      (event.key === "f" || event.key === "F")
    ) {
      event.preventDefault();
      setMode(stage ? "normal" : "stage");
    }
  };

  /* --------------------------------- hint ------------------------------- */

  const hintShowing = hintState === "showing" && stage && Boolean(hintText);
  const dismissRef = React.useRef(onHintDismiss);
  React.useEffect(() => {
    dismissRef.current = onHintDismiss;
  });
  React.useEffect(() => {
    if (hintState !== "showing") return;
    const t = window.setTimeout(() => {
      setHintState("done");
      dismissRef.current?.();
    }, HINT_MS);
    return () => window.clearTimeout(t);
  }, [hintState]);

  /* ------------------------------ choreography -------------------------- */

  const c = Math.max(0, cascade) / 1000;
  const shown = (p: Piece) => !stage || peek === p || peekFocus === p;
  const order: Record<Piece, number> = stage
    ? { sidebar: 0, header: 1, toolbar: 2 }
    : { toolbar: 0, header: 1, sidebar: 2 };
  const pieceSpring: Record<Piece, Transition> = {
    sidebar: springs.glide,
    header: springs.snap,
    toolbar: springs.snap,
  };
  const travel = (p: Piece, axis: "x" | "y"): Transition => {
    const delay = cause === "mode" ? order[p] * c : 0;
    if (!motionSafe) {
      // Fade out, then step away; step back, then fade in. Nothing travels.
      return {
        [axis]: { duration: 0, delay: shown(p) ? 0 : durations.fast + delay },
        opacity: { duration: durations.fast, delay, ease: easings.enter },
      } as Transition;
    }
    return {
      [axis]: { ...pieceSpring[p], delay },
      opacity: { duration: 0 },
    } as Transition;
  };
  const peekShadow = (p: Piece) =>
    stage && shown(p)
      ? "shadow-[0_14px_36px_color-mix(in_oklab,black_22%,transparent)]"
      : "";

  const pieceProps = (p: Piece) => ({
    onFocusCapture: () => {
      if (!stage) return;
      setCause("peek");
      setPeekFocus(p);
    },
    onBlurCapture: (event: React.FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      setCause("peek");
      setPeekFocus((cur) => (cur === p ? null : cur));
    },
  });

  /* -------------------------------- render ------------------------------ */

  const vars = {
    "--sm-accent": accent,
    "--sm-wash": `color-mix(in oklab, ${accent} 10%, transparent)`,
    "--sm-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--sm-solid": `oklch(from ${accent} 0.55 c h)`,
    "--sm-pin": `oklch(from ${accent} 0.62 c h)`,
    "--sm-on": "oklch(0.99 0.004 262)",
    height,
  } as React.CSSProperties;

  const Art = board ? ART[board.kind] : null;
  const zone = Math.max(4, peekZone);

  const presentButton = (compact: boolean) => (
    <button
      type="button"
      aria-pressed={stage}
      aria-keyshortcuts="F"
      onClick={() => setMode(stage ? "normal" : "stage")}
      title={stage ? "Leave stage (F or Esc)" : "Present (F)"}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 bg-(--sm-solid) px-3 text-[12px] font-medium text-(--sm-on) transition-colors hover:bg-[color-mix(in_oklab,var(--sm-solid)_88%,black)]",
        compact && "w-8 justify-center px-0",
        FOCUS,
      )}
    >
      {stage ? (
        <Minimize2 aria-hidden className="size-3.5" />
      ) : (
        <Presentation aria-hidden className="size-3.5" />
      )}
      {compact ? (
        <span className="sr-only">{stage ? "Leave stage" : "Present"}</span>
      ) : (
        <>
          {stage ? "Leave" : "Present"}
          <kbd className="rounded-1 bg-[color-mix(in_oklab,var(--sm-on)_18%,transparent)] px-1 font-mono text-[10px] leading-4">
            F
          </kbd>
        </>
      )}
    </button>
  );

  const boardList = (
    <ul className="flex flex-col gap-0.5" role="list">
      {nav.map((b, i) => {
        const current = b.id === board?.id;
        return (
          <li key={b.id}>
            <button
              type="button"
              aria-current={current ? "page" : undefined}
              tabIndex={current ? 0 : -1}
              data-sm-board={b.id}
              onClick={() => go(b.id)}
              onKeyDown={(event) => {
                const n = nav.length;
                const to =
                  event.key === "ArrowDown"
                    ? (i + 1) % n
                    : event.key === "ArrowUp"
                      ? (i - 1 + n) % n
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? n - 1
                          : -1;
                if (to < 0) return;
                event.preventDefault();
                const id = nav[to]?.id;
                if (!id) return;
                go(id);
                window.requestAnimationFrame(() =>
                  frame
                    ?.querySelector<HTMLElement>(`[data-sm-board="${id}"]`)
                    ?.focus(),
                );
              }}
              className={cn(
                "relative flex w-full items-center gap-2.5 rounded-2 px-2 py-1.5 text-left transition-colors",
                current ? "bg-surface-2" : "hover:bg-surface-2",
                FOCUS_INSET,
              )}
            >
              {current ? (
                <motion.span
                  layoutId={`${uid}-current`}
                  aria-hidden
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-(--sm-accent)"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <Thumb kind={b.kind} current={current} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "truncate text-[12.5px] leading-4",
                    current ? "font-medium text-foreground" : "text-ink-2",
                  )}
                >
                  {b.label}
                </span>
                {b.meta ? (
                  <span className="truncate text-[10.5px] leading-4 text-ink-3">
                    {b.meta}
                  </span>
                ) : null}
              </span>
              <span
                aria-label={`${b.comments} comment${b.comments === 1 ? "" : "s"}`}
                className="inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-ink-3 tabular-nums"
              >
                <MessageSquare aria-hidden className="size-3" />
                {b.comments}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const loading = status === "loading";
  const failed = status === "error";

  return (
    <section
      ref={setFrame}
      aria-label={`${project} board review`}
      onKeyDown={onFrameKey}
      onPointerMove={(event) => {
        onTouchMove(event);
        onFramePointerMove(event);
      }}
      onPointerLeave={onFramePointerLeave}
      onPointerDown={onTouchDown}
      onPointerUp={onTouchUp}
      onPointerCancel={onTouchUp}
      className={cn(
        "@container/stage-mode relative w-full touch-pan-x touch-pan-y overflow-hidden rounded-4 border border-hairline bg-surface-0 text-foreground",
        className,
      )}
      style={vars}
    >
      {/* The canvas the board sits on. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(var(--hairline-strong)_1px,transparent_1.3px)] [background-size:18px_18px] opacity-70"
      />

      {/* The board: laid out once at its design size, carried by a transform. */}
      <motion.div
        role="region"
        aria-label={board ? `Board: ${board.label}` : "Board"}
        aria-busy={loading || undefined}
        tabIndex={0}
        className={cn(
          "absolute top-0 left-0 overflow-hidden rounded-3 border border-hairline bg-card shadow-[0_10px_30px_color-mix(in_oklab,black_12%,transparent)]",
          FOCUS,
        )}
        style={{
          x: bx,
          y: by,
          scale: bs,
          originX: 0,
          originY: 0,
          width: boardSize.width,
          height: boardSize.height,
        }}
      >
        {loading ? (
          <div aria-hidden className="flex h-full flex-col gap-4 p-8">
            <span className="h-5 w-1/2 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-3 w-2/3 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            <div className="grid flex-1 grid-cols-3 gap-4 pt-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="rounded-2 bg-surface-2 motion-safe:animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 text-center">
            <p className="text-[18px] font-semibold text-foreground">
              The boards could not be loaded.
            </p>
            <p className="text-[13px] text-ink-3">
              Nothing was lost. Check the connection and try again.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-2 border border-hairline px-4 text-[13px] text-foreground hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-4" />
                Try again
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div
              aria-hidden
              className="flex h-6 items-center gap-1.5 border-b border-hairline bg-surface-1 px-3"
            >
              <span className="size-1.5 rounded-full bg-hairline-strong" />
              <span className="size-1.5 rounded-full bg-hairline-strong" />
              <span className="size-1.5 rounded-full bg-hairline-strong" />
              <span className="ml-3 h-3 w-40 rounded-full bg-surface-2" />
            </div>
            <div className="relative h-[calc(100%-24px)]">
              {children ?? (Art ? <Art /> : null)}
              {children
                ? null
                : (board?.pins ?? []).map((p, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="absolute flex size-4.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full rounded-bl-none border-2 border-card bg-(--sm-pin) font-mono text-[8.5px] font-semibold text-(--sm-on) shadow-sm"
                      style={{
                        left: `${r2(p.x * 100)}%`,
                        top: `${r2(p.y * 100)}%`,
                      }}
                    >
                      {i + 1}
                    </span>
                  ))}
            </div>
          </>
        )}
      </motion.div>

      {/* Edge hints: only on stage, brightening as the pointer nears. */}
      {stage && !phone ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.span
            className="absolute inset-y-6 left-0 rounded-r-full bg-(--sm-accent)"
            style={{ width: 3, opacity: glowLeft }}
          />
          <motion.span
            className="absolute inset-x-10 top-0 rounded-b-full bg-(--sm-accent)"
            style={{ height: 3, opacity: glowTop }}
          />
          <motion.span
            className="absolute inset-x-10 bottom-0 rounded-t-full bg-(--sm-accent)"
            style={{ height: 3, opacity: glowBottom }}
          />
        </div>
      ) : null}

      {/* Sidebar (wide). Full height; its top strip hides under the header. */}
      <motion.nav
        ref={sidebarRef}
        {...pieceProps("sidebar")}
        aria-label="Boards"
        initial={false}
        animate={{
          x: shown("sidebar") ? 0 : -(SIDEBAR_W + 20),
          opacity: shown("sidebar") || motionSafe ? 1 : 0,
        }}
        transition={travel("sidebar", "x")}
        className={cn(
          "absolute top-0 bottom-0 left-0 z-10 hidden flex-col border-r border-hairline bg-surface-1 @min-[30rem]/stage-mode:flex",
          !shown("sidebar") && "pointer-events-none",
          peekShadow("sidebar"),
        )}
        style={{ width: SIDEBAR_W }}
      >
        <div
          className="flex shrink-0 items-center gap-2 px-3.5"
          style={{ height: HEADER_H }}
        >
          <span
            aria-hidden
            className="flex size-5 items-center justify-center rounded-1 bg-(--sm-solid)"
          >
            <span className="size-2 rounded-full border-2 border-(--sm-on)" />
          </span>
          <span className="text-[13px] font-semibold">{workspace}</span>
        </div>
        <div className="flex items-center justify-between px-3.5 pt-2 pb-1.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Boards
          </span>
          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
            {nav.length}
          </span>
        </div>
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto px-1.5 pb-3">
          {loading ? (
            <div aria-hidden className="flex flex-col gap-2 px-2 pt-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-9 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                />
              ))}
            </div>
          ) : (
            boardList
          )}
        </div>
      </motion.nav>

      {/* Header. */}
      <motion.header
        ref={headerRef}
        {...pieceProps("header")}
        initial={false}
        animate={{
          y: shown("header") ? 0 : -((phone ? PHONE_HEADER_H : HEADER_H) + 14),
          opacity: shown("header") || motionSafe ? 1 : 0,
        }}
        transition={travel("header", "y")}
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-hairline bg-card px-3 @min-[30rem]/stage-mode:px-4",
          !shown("header") && "pointer-events-none",
          peekShadow("header"),
        )}
        style={{ height: phone ? PHONE_HEADER_H : HEADER_H }}
      >
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
            <li className="hidden shrink-0 items-center gap-2 font-semibold text-foreground @min-[30rem]/stage-mode:flex">
              <span
                aria-hidden
                className="flex size-5 items-center justify-center rounded-1 bg-(--sm-solid)"
              >
                <span className="size-2 rounded-full border-2 border-(--sm-on)" />
              </span>
              {workspace}
            </li>
            <li
              aria-hidden
              className="hidden text-ink-3 @min-[30rem]/stage-mode:block"
            >
              /
            </li>
            <li className="hidden shrink-0 text-ink-2 @min-[40rem]/stage-mode:block">
              {project}
            </li>
            <li
              aria-hidden
              className="hidden text-ink-3 @min-[40rem]/stage-mode:block"
            >
              /
            </li>
            <li
              aria-current="page"
              className="truncate font-medium text-foreground"
            >
              {board?.label ?? "Board"}
            </li>
          </ol>
        </nav>
        <div className="flex shrink-0 items-center gap-2.5">
          <ul
            role="list"
            aria-label={`Reviewers: ${people.join(", ")}`}
            className="hidden items-center @min-[36rem]/stage-mode:flex"
          >
            {people.slice(0, 4).map((name, i) => (
              <li
                key={name}
                aria-hidden
                title={name}
                className={cn(
                  "flex size-6.5 items-center justify-center rounded-full border-2 border-card bg-surface-2 font-mono text-[9.5px] font-semibold text-ink-2",
                  i > 0 && "-ml-1.5",
                )}
              >
                {initials(name)}
              </li>
            ))}
          </ul>
          {presentButton(phone)}
        </div>
      </motion.header>

      {/* Floating toolbar (wide). */}
      <div
        className="pointer-events-none absolute right-0 bottom-0 z-10 hidden justify-center @min-[30rem]/stage-mode:flex"
        style={{ left: SIDEBAR_W, paddingBottom: TOOLBAR_GAP }}
      >
        <motion.div
          ref={toolbarRef}
          {...pieceProps("toolbar")}
          role="toolbar"
          aria-label="Board tools"
          initial={false}
          animate={{
            y: shown("toolbar") ? 0 : TOOLBAR_H + TOOLBAR_GAP + 16,
            x: stage ? -SIDEBAR_W / 2 : 0,
            opacity: shown("toolbar") || motionSafe ? 1 : 0,
          }}
          transition={{
            ...(travel("toolbar", "y") as Record<string, Transition>),
            x: motionSafe
              ? {
                  ...springs.snap,
                  delay: cause === "mode" ? order.toolbar * c : 0,
                }
              : { duration: 0 },
          }}
          className={cn(
            "pointer-events-auto flex items-center gap-0.5 rounded-full border border-hairline bg-popover p-1 shadow-[0_8px_24px_color-mix(in_oklab,black_14%,transparent)]",
            !shown("toolbar") && "pointer-events-none",
          )}
          style={{ height: TOOLBAR_H }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "[data-sm-tool]",
              ),
            );
            const at = items.indexOf(document.activeElement as HTMLElement);
            if (at < 0) return;
            event.preventDefault();
            const n = items.length;
            items[
              (at + (event.key === "ArrowRight" ? 1 : -1) + n) % n
            ]?.focus();
          }}
        >
          {actions.map((a, i) => {
            const Icon = a.icon;
            const active = tool === a.id;
            return (
              <button
                key={a.id}
                type="button"
                data-sm-tool
                tabIndex={i === 0 ? 0 : -1}
                aria-label={a.label}
                aria-pressed={active}
                title={a.label}
                onClick={() => {
                  setTool(a.id);
                  onAction?.(a.id);
                }}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full transition-colors",
                  active
                    ? "bg-(--sm-wash) text-(--sm-accent)"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
          <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />
          <span className="inline-flex h-8 min-w-12 items-center justify-center font-mono text-[11px] text-ink-2 tabular-nums">
            <span className="sr-only">Zoom </span>
            <motion.span>{zoom}</motion.span>
          </span>
          <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />
          <button
            type="button"
            data-sm-tool
            tabIndex={-1}
            aria-pressed={stage}
            aria-label={stage ? "Leave stage" : "Present"}
            title={stage ? "Leave stage (F)" : "Present (F)"}
            onClick={() => setMode(stage ? "normal" : "stage")}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {stage ? (
              <Minimize2 aria-hidden className="size-4" />
            ) : (
              <Maximize2 aria-hidden className="size-4" />
            )}
          </button>
        </motion.div>
      </div>

      {/* Tab bar (phone). */}
      <motion.nav
        aria-label="Boards"
        initial={false}
        animate={{
          y: !stage ? 0 : TABBAR_H + 12,
          opacity: !stage || motionSafe ? 1 : 0,
        }}
        transition={
          motionSafe
            ? {
                y: { ...springs.snap, delay: stage ? c : 0 },
                opacity: { duration: 0 },
              }
            : {
                y: { duration: 0, delay: stage ? durations.fast : 0 },
                opacity: { duration: durations.fast },
              }
        }
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex items-stretch border-t border-hairline bg-card @min-[30rem]/stage-mode:hidden",
          stage && "pointer-events-none",
        )}
        style={{ height: TABBAR_H }}
      >
        {nav.map((b) => {
          const current = b.id === board?.id;
          const Icon = KIND_ICON[b.kind];
          return (
            <button
              key={b.id}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => go(b.id)}
              tabIndex={stage ? -1 : 0}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
                current
                  ? "text-(--sm-accent)"
                  : "text-ink-3 hover:text-foreground",
                FOCUS_INSET,
              )}
            >
              <Icon aria-hidden className="size-4" />
              <span className="max-w-full truncate px-1">
                {b.label.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </motion.nav>

      {/* Phone: a small way back off the stage. */}
      <AnimatePresence>
        {stage && phone ? (
          <motion.button
            key="leave"
            type="button"
            aria-label="Leave stage"
            onClick={() => setMode("normal")}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: durations.base, delay: 0.2 },
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            className={cn(
              "absolute top-2 right-2 z-30 inline-flex size-8 items-center justify-center rounded-full border border-hairline bg-popover text-ink-2 shadow-sm",
              FOCUS,
            )}
          >
            <Minimize2 aria-hidden className="size-3.5" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* The one-time hint. */}
      <div
        role="status"
        className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3"
        style={{ bottom: zone + 8 }}
      >
        <AnimatePresence>
          {hintShowing ? (
            <motion.div
              key="hint"
              initial={{ opacity: 0, y: motionSafe ? 16 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? 8 : 0,
                transition: exitFor(durations.base),
              }}
              transition={{
                y: motionSafe ? springs.recoil : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
              className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-hairline bg-popover py-1.5 pr-1.5 pl-3.5 text-[12px] text-foreground shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]"
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-(--sm-accent)"
              />
              <span className="min-w-0 truncate">{hintText}</span>
              <button
                type="button"
                aria-label="Dismiss hint"
                onClick={() => {
                  setHintState("done");
                  onHintDismiss?.();
                }}
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                <X aria-hidden className="size-3" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
