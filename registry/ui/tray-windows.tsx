"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import {
  Ellipsis,
  Inbox,
  Mail,
  Minus,
  RotateCcw,
  Ticket,
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
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TrayRecordKind = "draft" | "ticket";
export type TrayTone = "ok" | "warn" | "danger" | "neutral";

export type TrayRecord = {
  id: string;
  kind: TrayRecordKind;
  /** The window's title and the chip's label. */
  title: string;
  /** One line under the title: who it is to or from. */
  meta: string;
  /** Drafts: the reply as written so far. Tickets: a reply in progress, if any. */
  body?: string;
  /** Tickets: the last message from the requester. */
  message?: string;
  /** Tickets: where the ticket stands. */
  status?: { label: string; tone: TrayTone };
};

/** Where a window sits, as fractions of the workspace. */
export type TrayPosition = { x: number; y: number; w: number; h: number };

export type TrayChipSize = "sm" | "md" | "lg";
export type TrayPlacement = "bottom" | "floating" | "side";
export type TrayStatus = "ready" | "loading" | "error";

export type TrayWindowsProps = {
  /** Every record with a window. @default defaultTrayRecords */
  records?: TrayRecord[];
  /** Controlled tray: the ids parked, in the order they were parked. */
  tray?: string[];
  /** Initial tray when uncontrolled. @default ["t-2210", "t-2219"] */
  defaultTray?: string[];
  /** Fires with the whole tray after a minimise, a restore or a close. */
  onTrayChange?: (ids: string[]) => void;
  /** Controlled ids with unsaved changes. */
  unsaved?: string[];
  /** Initial unsaved ids when uncontrolled. @default ["d-3195"] */
  defaultUnsaved?: string[];
  /** Fires when typing or saving changes which ids are unsaved. */
  onUnsavedChange?: (ids: string[]) => void;
  /** Where each window sits, as fractions of the workspace. @default defaultTrayPositions */
  positions?: Record<string, TrayPosition>;
  /** A window was minimised into the tray. */
  onMinimise?: (id: string) => void;
  /** A chip was restored to its window. */
  onRestore?: (id: string) => void;
  /** A window or a chip was closed (after the unsaved check). */
  onCloseItem?: (id: string) => void;
  /** Save (a draft) or Send (a ticket reply) was pressed, with the text. */
  onSave?: (id: string, body: string) => void;
  /** Chip length and height; large adds a meta line. @default "md" */
  chipSize?: TrayChipSize;
  /** A bar docked along the bottom edge, a dock floating above it, or a column on the right. @default "bottom" */
  trayPosition?: TrayPlacement;
  /** Unsaved markers, focus and the primary buttons — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The most chips shown before the rest go behind the overflow menu. @default 6 */
  trayLimit?: number;
  /** Whether the records have arrived. @default "ready" */
  status?: TrayStatus;
  /** "Try again" was pressed after the records failed to load. */
  onRetry?: () => void;
  /** The workspace's name. @default "Fernworks" */
  workspace?: string;
  /** The frame's title. @default "Support desk" */
  title?: string;
  /** The frame's height, px. @default 520 */
  height?: number;
  /** Classes for the outer frame. */
  className?: string;
};

type Rect = { x: number; y: number; w: number; h: number };
type Flight = {
  id: string;
  kind: "park" | "restore";
  from: Rect;
  /** Corner radius at each end. */
  radius: [number, number];
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultTrayRecords: TrayRecord[] = [
  {
    id: "d-3195",
    kind: "draft",
    title: "Re: Refund for order 3195",
    meta: "To Ines Duarte · Coldbrook Café",
    body: "Hi Ines, I’ve refunded the twelve cups that arrived crushed. The credit shows on your account within two working days, and the replacement sleeve goes out with Thursday’s delivery.",
  },
  {
    id: "t-2214",
    kind: "ticket",
    title: "Invoice INV-2048 shows the wrong depot",
    meta: "Ada Mensah · Basinworks Logistics",
    status: { label: "Waiting on us", tone: "warn" },
    message:
      "The invoice says Hull but the goods went to Wakefield. Our finance team can’t pay it until the address matches.",
  },
  {
    id: "d-3201",
    kind: "draft",
    title: "Stock update for order 3201",
    meta: "To Tomas Berg · Gaugeworks Depot",
    body: "Hi Tomas, the telematics units land at York on Wednesday. I’ll book the fitting for Thursday morning unless you",
  },
  {
    id: "t-2210",
    kind: "ticket",
    title: "Scanner won’t pair with van 1042",
    meta: "Rui Okafor · Fieldline",
    status: { label: "Open", tone: "neutral" },
    message:
      "Tried the reset twice. The light blinks amber and the app never sees it.",
  },
  {
    id: "t-2219",
    kind: "ticket",
    title: "Driver app logs out at shift change",
    meta: "Lena Haas · Waylight",
    status: { label: "New", tone: "ok" },
    message: "Every day at 14:00 the whole Leeds team is signed out mid-route.",
  },
];

export const defaultTrayPositions: Record<string, TrayPosition> = {
  "d-3195": { x: 0.025, y: 0.05, w: 0.48, h: 0.9 },
  "t-2214": { x: 0.52, y: 0.04, w: 0.455, h: 0.56 },
  "d-3201": { x: 0.49, y: 0.5, w: 0.485, h: 0.46 },
  "t-2210": { x: 0.14, y: 0.1, w: 0.5, h: 0.62 },
  "t-2219": { x: 0.33, y: 0.18, w: 0.5, h: 0.62 },
};

const DEFAULT_TRAY = ["t-2210", "t-2219"];
const DEFAULT_UNSAVED = ["d-3195"];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_INSET =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TONE: Record<TrayTone, string> = {
  ok: "text-success border-[color-mix(in_oklab,var(--success)_40%,transparent)]",
  warn: "text-warn border-[color-mix(in_oklab,var(--warn)_45%,transparent)]",
  danger:
    "text-danger border-[color-mix(in_oklab,var(--danger)_40%,transparent)]",
  neutral: "text-ink-2 border-hairline",
};

/** Chip length along the tray and height across it, per size. */
const CHIP: Record<TrayChipSize, { len: number; h: number; radius: number }> = {
  sm: { len: 116, h: 28, radius: 8 },
  md: { len: 156, h: 32, radius: 9 },
  lg: { len: 196, h: 44, radius: 10 },
};
const ICON_CHIP = 36;
const OVERFLOW_LEN = 48;
const CHIP_GAP = 6;
const WINDOW_RADIUS = 12;

const r1 = (v: number) => Math.round(v * 10) / 10;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const KindIcon = ({
  kind,
  className,
}: {
  kind: TrayRecordKind;
  className?: string;
}) =>
  kind === "draft" ? (
    <Mail aria-hidden className={className} />
  ) : (
    <Ticket aria-hidden className={className} />
  );

/** A window's rectangle in the workspace from its fractions, kept inside. */
function placeWindow(
  p: TrayPosition | undefined,
  W: number,
  H: number,
  compact: boolean,
): Rect {
  if (compact || !p) {
    const pad = compact ? 8 : 16;
    return {
      x: pad,
      y: pad,
      w: Math.max(0, W - pad * 2),
      h: Math.max(0, H - pad * 2),
    };
  }
  const w = clamp(p.w * W, Math.min(240, W - 16), W - 16);
  const h = clamp(p.h * H, Math.min(170, H - 16), H - 16);
  const x = clamp(p.x * W, 8, W - w - 8);
  const y = clamp(p.y * H, 8, H - h - 8);
  return { x: r1(x), y: r1(y), w: r1(w), h: r1(h) };
}

/* ----------------------------------------------------------------------- */
/*                                 The ghost                                */
/* ----------------------------------------------------------------------- */

/**
 * The window in flight: one glide value carries its box from one rectangle
 * to the other — position, size and corner radius together — while the body
 * lines fade in the first half, so it reads as the window folding into its
 * chip rather than a picture shrinking.
 */
function Ghost({
  flight,
  record,
  motionSafe,
  target,
  onLand,
}: {
  flight: Flight;
  record: TrayRecord | undefined;
  motionSafe: boolean;
  /** Measures where the flight lands, once that thing has rendered. */
  target: () => Rect | null;
  onLand: () => void;
}) {
  const { from } = flight;
  const parking = flight.kind === "park";
  const x = useMotionValue(from.x);
  const y = useMotionValue(from.y);
  const width = useMotionValue(from.w);
  const height = useMotionValue(from.h);
  const borderRadius = useMotionValue(flight.radius[0]);
  const body = useMotionValue(parking ? 1 : 0);
  const progress = React.useRef(0);
  const latest = React.useRef({ target, onLand });
  React.useEffect(() => {
    latest.current = { target, onLand };
  });

  // The far end is measured after mount, when the chip (or the window) it
  // lands on exists. A plain number is animated and written into the motion
  // values, so a value bound to a fresh element never sits idle; a re-run
  // after a stop picks the flight up from where it was.
  React.useEffect(() => {
    const to = latest.current.target() ?? from;
    const write = (t: number) => {
      progress.current = t;
      x.set(r1(lerp(from.x, to.x, t)));
      y.set(r1(lerp(from.y, to.y, t)));
      width.set(r1(lerp(from.w, to.w, t)));
      height.set(r1(lerp(from.h, to.h, t)));
      borderRadius.set(r1(lerp(flight.radius[0], flight.radius[1], t)));
      body.set(r1(parking ? clamp(1 - t * 2, 0, 1) : clamp(t * 2 - 1, 0, 1)));
    };
    if (!motionSafe) {
      write(1);
      latest.current.onLand();
      return;
    }
    const run = animate(progress.current, 1, {
      ...springs.glide,
      restDelta: 0.002,
      onUpdate: write,
      onComplete: () => latest.current.onLand(),
    });
    return () => run.stop();
  }, [
    motionSafe,
    from,
    flight.radius,
    parking,
    x,
    y,
    width,
    height,
    borderRadius,
    body,
  ]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 flex flex-col overflow-hidden border border-hairline-strong bg-card shadow-[0_16px_40px_color-mix(in_oklab,black_24%,transparent)]"
      style={{ x, y, width, height, borderRadius }}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 px-2.5">
        {record ? (
          <KindIcon
            kind={record.kind}
            className="size-3.5 shrink-0 text-ink-3"
          />
        ) : null}
        <span className="truncate text-[12px] font-medium text-foreground">
          {record?.title}
        </span>
      </div>
      <motion.div
        className="flex flex-col gap-2 px-3 pt-2"
        style={{ opacity: body }}
      >
        <span className="h-2 w-3/4 rounded-full bg-hairline-strong" />
        <span className="h-2 w-11/12 rounded-full bg-surface-2" />
        <span className="h-2 w-2/3 rounded-full bg-surface-2" />
        <span className="h-2 w-5/6 rounded-full bg-surface-2" />
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  A chip                                  */
/* ----------------------------------------------------------------------- */

function Chip({
  record,
  number,
  size,
  icon,
  side,
  unsaved,
  hidden,
  landed,
  tabbable,
  motionSafe,
  onRestore,
  onClose,
  onKey,
  onFocus,
}: {
  record: TrayRecord;
  number: number;
  size: TrayChipSize;
  icon: boolean;
  side: boolean;
  unsaved: boolean;
  hidden: boolean;
  landed: number;
  tabbable: boolean;
  motionSafe: boolean;
  onRestore: () => void;
  onClose: () => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
}) {
  const c = CHIP[size];
  const y = useMotionValue(0);

  // Landing: a short drop settled by `recoil`, two visible bounces.
  React.useEffect(() => {
    if (!landed || !motionSafe) return;
    y.jump(-distances.step);
    const run = animate(y, 0, springs.recoil);
    return () => {
      run.stop();
      y.jump(0);
    };
  }, [landed, motionSafe, y]);

  const name = `${number}. ${record.title}${unsaved ? ", unsaved changes" : ""}`;

  return (
    <motion.div
      layout="position"
      // Under reduced motion a parked chip fades in where the flight would land.
      initial={motionSafe ? false : { opacity: 0 }}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{
        layout: motionSafe ? springs.glide : { duration: 0 },
        opacity: { duration: hidden || motionSafe ? 0 : durations.fast },
      }}
      data-tw-chip={record.id}
      className="group/tray-windows relative shrink-0"
      style={{
        y,
        width: icon ? ICON_CHIP : side ? "100%" : c.len,
        height: icon ? ICON_CHIP : c.h,
      }}
    >
      <button
        type="button"
        aria-label={name}
        title={record.title}
        aria-keyshortcuts={
          number <= 9 ? `Control+${number} Meta+${number}` : undefined
        }
        tabIndex={tabbable ? 0 : -1}
        onClick={onRestore}
        onKeyDown={onKey}
        onFocus={onFocus}
        className={cn(
          "flex size-full items-center gap-2 border border-hairline bg-card text-left shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent)] transition-colors hover:border-(--tw-line) hover:bg-surface-1",
          icon ? "justify-center rounded-2" : "pr-7 pl-2",
          FOCUS,
        )}
        style={{ borderRadius: icon ? undefined : c.radius }}
      >
        <span className="relative shrink-0">
          <KindIcon
            kind={record.kind}
            className={cn(icon ? "size-4" : "size-3.5", "text-ink-2")}
          />
          {unsaved ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 size-2 rounded-full border border-card bg-(--tw-pigment)"
            />
          ) : null}
        </span>
        {icon ? (
          <span
            aria-hidden
            className="absolute right-0.5 bottom-0 font-mono text-[8.5px] text-ink-3"
          >
            {number <= 9 ? number : ""}
          </span>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "truncate leading-4 text-foreground",
                  size === "sm" ? "text-[11.5px]" : "text-[12px]",
                )}
              >
                {record.title}
              </span>
              {size === "lg" ? (
                <span className="truncate text-[10.5px] leading-4 text-ink-3">
                  {record.meta}
                </span>
              ) : null}
            </span>
            {number <= 9 ? (
              <span
                aria-hidden
                className="shrink-0 font-mono text-[9.5px] text-ink-3 opacity-0 transition-opacity group-focus-within/tray-windows:opacity-100 group-hover/tray-windows:opacity-100"
              >
                {number}
              </span>
            ) : null}
          </>
        )}
      </button>
      {icon ? null : (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Close ${record.title}`}
            onClick={onClose}
            className="absolute top-1/2 right-1 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X aria-hidden className="size-3" />
          </button>
        </>
      )}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 A window                                 */
/* ----------------------------------------------------------------------- */

function TrayWindow({
  record,
  rect,
  z,
  front,
  hidden,
  unsaved,
  body,
  motionSafe,
  onFront,
  onMinimise,
  onClose,
  onBody,
  onSave,
}: {
  record: TrayRecord;
  rect: Rect;
  z: number;
  front: boolean;
  hidden: boolean;
  unsaved: boolean;
  body: string;
  motionSafe: boolean;
  onFront: () => void;
  onMinimise: () => void;
  onClose: () => void;
  onBody: (text: string) => void;
  onSave: () => void;
}) {
  const draft = record.kind === "draft";
  return (
    <motion.section
      role="group"
      aria-label={`${record.title}${unsaved ? ", unsaved changes" : ""}`}
      data-tw-window={record.id}
      onPointerDownCapture={onFront}
      onFocusCapture={onFront}
      initial={false}
      animate={{ opacity: hidden ? 0 : 1 }}
      exit={{
        opacity: 0,
        transition: exitFor(motionSafe ? durations.fast : durations.blink),
      }}
      transition={{ duration: durations.fast, ease: easings.enter }}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-3 border bg-card",
        front
          ? "border-hairline-strong shadow-[0_14px_36px_color-mix(in_oklab,black_16%,transparent)]"
          : "border-hairline shadow-[0_4px_14px_color-mix(in_oklab,black_8%,transparent)]",
        hidden && "pointer-events-none",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: z,
      }}
    >
      <div
        className={cn(
          "flex h-[34px] shrink-0 items-center gap-2 border-b border-hairline pr-1 pl-3",
          front ? "bg-surface-1" : "bg-surface-0",
        )}
      >
        <KindIcon kind={record.kind} className="size-3.5 shrink-0 text-ink-3" />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            title={record.title}
            className="truncate text-[12.5px] font-medium text-foreground"
          >
            {record.title}
          </span>
          {unsaved ? (
            <span
              aria-hidden
              title="Unsaved changes"
              className="size-1.5 shrink-0 rounded-full bg-(--tw-pigment)"
            />
          ) : null}
        </span>
        <button
          type="button"
          aria-label={`Minimise ${record.title}`}
          aria-keyshortcuts="Control+M Meta+M"
          title="Minimise (Ctrl or Cmd+M)"
          onClick={onMinimise}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <Minus aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Close ${record.title}`}
          onClick={onClose}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-hidden px-3 pt-2 pb-2.5">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-[12px] text-ink-2">
            {record.meta}
          </span>
          {record.status ? (
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10.5px] leading-none font-medium",
                TONE[record.status.tone],
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {record.status.label}
            </span>
          ) : null}
        </div>
        {record.message ? (
          <blockquote className="line-clamp-3 shrink-0 border-l-2 border-hairline-strong pl-2.5 text-[12.5px] leading-[1.5] text-ink-2">
            {record.message}
          </blockquote>
        ) : null}
        <textarea
          aria-label={
            draft ? `Body of ${record.title}` : `Reply to ${record.title}`
          }
          value={body}
          placeholder={draft ? "Write the reply…" : "Write a reply…"}
          onChange={(event) => {
            const text = event.currentTarget.value;
            onBody(text);
          }}
          className="w-full flex-1 resize-none rounded-2 border border-input bg-surface-0 px-2.5 py-2 text-[13px] leading-[1.5] text-foreground transition-colors outline-none placeholder:text-ink-3 focus-visible:border-(--tw-line) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
          style={{ minHeight: 40 }}
        />
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="truncate text-[11px] text-ink-3">
            {unsaved
              ? "Unsaved changes"
              : draft
                ? "Saved"
                : "Nothing waiting to send"}
          </span>
          <button
            type="button"
            onClick={onSave}
            aria-disabled={!unsaved || undefined}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-2 px-2.5 text-[12px] font-medium transition-colors",
              unsaved
                ? "bg-(--tw-solid) text-(--tw-on) hover:bg-[color-mix(in_oklab,var(--tw-solid)_88%,black)]"
                : "border border-hairline text-ink-3",
              FOCUS,
            )}
          >
            {draft ? "Save" : "Send"}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The frame                                */
/* ----------------------------------------------------------------------- */

/**
 * A support workspace where any open window can be parked. Minimise and a
 * ghost of the window — its title bar and a few body lines — flies from the
 * window to its chip's slot in the tray on `springs.glide`, position, size and
 * corner radius from one value, the body fading in the first half; the chip
 * lands on `springs.recoil`, a small drop and two bounces. Restore runs the
 * flight back to exactly where the window was, and focus goes back into it.
 * Chips carry an unsaved marker so nothing parked is lost; closing one with
 * unsaved changes asks first. Chips that do not fit go behind a "+N" menu.
 *
 * Cmd or Ctrl+M minimises the window holding focus; Cmd or Ctrl with a number
 * restores that chip. The tray is a toolbar with a roving tabindex. Under
 * 30rem windows become full-width sheets and the tray a row of icons. Under
 * reduced motion there is no flight: the window fades out and the chip fades
 * in, and back.
 */
export function TrayWindows({
  records = defaultTrayRecords,
  tray: trayProp,
  defaultTray = DEFAULT_TRAY,
  onTrayChange,
  unsaved: unsavedProp,
  defaultUnsaved = DEFAULT_UNSAVED,
  onUnsavedChange,
  positions = defaultTrayPositions,
  onMinimise,
  onRestore,
  onCloseItem,
  onSave,
  chipSize = "md",
  trayPosition = "bottom",
  accent = "var(--accent-bright)",
  trayLimit = 6,
  status = "ready",
  onRetry,
  workspace = "Fernworks",
  title = "Support desk",
  height = 520,
  className,
}: TrayWindowsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  /* ------------------------------- state -------------------------------- */

  const [ownTray, setOwnTray] = React.useState(defaultTray);
  const trayRaw = trayProp ?? ownTray;
  const [closed, setClosed] = React.useState<string[]>([]);
  const live = records.filter((r) => !closed.includes(r.id));
  const tray = trayRaw.filter((id) => live.some((r) => r.id === id));
  const openIds = live.map((r) => r.id).filter((id) => !tray.includes(id));

  const [ownUnsaved, setOwnUnsaved] = React.useState(defaultUnsaved);
  const unsaved = unsavedProp ?? ownUnsaved;
  const [bodies, setBodies] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(records.map((r) => [r.id, r.body ?? ""])),
  );

  // Front-to-back order of the open windows: the last is in front.
  const [order, setOrder] = React.useState<string[]>(() =>
    records.map((r) => r.id).filter((id) => !defaultTray.includes(id)),
  );
  const missingOrder = openIds.filter((id) => !order.includes(id));
  if (missingOrder.length) setOrder([...order, ...missingOrder]);
  const stack = order.filter((id) => openIds.includes(id));
  const frontId = stack[stack.length - 1] ?? null;

  const [announcement, setAnnouncement] = React.useState("");

  const commitTray = (next: string[]) => {
    if (trayProp === undefined) setOwnTray(next);
    onTrayChange?.(next);
  };
  const commitUnsaved = (next: string[]) => {
    if (same(next, unsaved)) return;
    if (unsavedProp === undefined) setOwnUnsaved(next);
    onUnsavedChange?.(next);
  };
  const bringToFront = (id: string) => {
    if (stack[stack.length - 1] === id) return;
    setOrder((o) => [...o.filter((x) => x !== id), id]);
  };
  const recordOf = (id: string) => records.find((r) => r.id === id);

  /* ------------------------------ measuring ----------------------------- */

  const [frame, setFrame] = React.useState<HTMLElement | null>(null);
  const [work, setWork] = React.useState<HTMLElement | null>(null);
  const [trayEl, setTrayEl] = React.useState<HTMLElement | null>(null);
  const [size, setSize] = React.useState({
    fw: 720,
    w: 720,
    h: height - 92,
    tray: 700,
  });
  React.useLayoutEffect(() => {
    if (!frame || !work) return;
    const read = () => {
      const fw = Math.round(frame.getBoundingClientRect().width);
      const w = work.clientWidth;
      const h = work.clientHeight;
      const t = trayEl
        ? Math.round(
            trayPosition === "side" && fw >= 480
              ? trayEl.clientHeight
              : trayEl.clientWidth,
          )
        : w;
      setSize((s) =>
        s.fw === fw && s.w === w && s.h === h && s.tray === t
          ? s
          : { fw, w, h, tray: t },
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(frame);
    ro.observe(work);
    if (trayEl) ro.observe(trayEl);
    return () => ro.disconnect();
  }, [frame, work, trayEl, trayPosition]);
  const compact = size.fw < 480;
  const placement: TrayPlacement =
    compact && trayPosition === "side" ? "bottom" : trayPosition;
  const vertical = placement === "side";

  /* ------------------------------ capacity ------------------------------ */

  const chip = CHIP[chipSize] ?? CHIP.md;
  const along = compact ? ICON_CHIP : vertical ? chip.h : chip.len;
  const room =
    placement === "floating" && !compact
      ? Math.max(0, size.w - 48)
      : size.tray - 16;
  const fitAll = tray.length * (along + CHIP_GAP) - CHIP_GAP <= room;
  const capacity = Math.max(
    1,
    Math.min(
      Math.max(1, Math.round(trayLimit)),
      fitAll
        ? tray.length
        : Math.floor((room - OVERFLOW_LEN) / (along + CHIP_GAP)),
    ),
  );
  const shownChips = tray.slice(0, capacity);
  const overflow = tray.slice(capacity);

  /* ------------------------------- flights ------------------------------ */

  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [landed, setLanded] = React.useState<Record<string, number>>({});
  const [arriving, setArriving] = React.useState<string[]>([]);
  const [focusTarget, setFocusTarget] = React.useState<{
    sel: string;
    n: number;
  } | null>(null);
  const focusSoon = (sel: string) =>
    setFocusTarget((f) => ({ sel, n: (f?.n ?? 0) + 1 }));
  React.useEffect(() => {
    if (!focusTarget || !frame) return;
    frame
      .querySelector<HTMLElement>(focusTarget.sel)
      ?.focus({ preventScroll: true });
  }, [focusTarget, frame]);

  const rectOf = (el: Element | null | undefined): Rect | null => {
    if (!el || !frame) return null;
    const f = frame.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: r1(r.left - f.left),
      y: r1(r.top - f.top),
      w: r1(r.width),
      h: r1(r.height),
    };
  };
  const chipTarget = (id: string) =>
    frame?.querySelector(`[data-tw-chip="${CSS.escape(id)}"]`) ??
    frame?.querySelector("[data-tw-overflow]") ??
    null;

  const land = (flight: Flight) => {
    setFlights((list) =>
      list.filter((f) => f !== flight && f.id !== flight.id),
    );
    if (flight.kind === "park") {
      setLanded((l) => ({ ...l, [flight.id]: (l[flight.id] ?? 0) + 1 }));
      focusSoon(`[data-tw-chip="${flight.id}"] button, [data-tw-overflow]`);
    } else {
      setArriving((a) => a.filter((x) => x !== flight.id));
      focusSoon(`[data-tw-window="${flight.id}"] textarea`);
    }
  };

  /* ------------------------------ actions ------------------------------- */

  const minimise = (id: string) => {
    const record = recordOf(id);
    if (!record || tray.includes(id)) return;
    const from = rectOf(
      frame?.querySelector(`[data-tw-window="${CSS.escape(id)}"]`),
    );
    setFlights((list) => list.filter((f) => f.id !== id));
    setArriving((a) => a.filter((x) => x !== id));
    commitTray([...tray, id]);
    onMinimise?.(id);
    if (motionSafe && from) {
      setFlights((list) => [
        ...list,
        {
          id,
          kind: "park",
          from,
          radius: [WINDOW_RADIUS, compact ? 8 : chip.radius],
        },
      ]);
    } else {
      setLanded((l) => ({ ...l, [id]: (l[id] ?? 0) + 1 }));
      focusSoon(`[data-tw-chip="${id}"] button, [data-tw-overflow]`);
    }
    setAnnouncement(
      `Parked ${record.title}${unsaved.includes(id) ? ", with unsaved changes" : ""}. ${tray.length + 1} in the tray.`,
    );
  };

  const restore = (id: string, fromEl?: Element | null) => {
    const record = recordOf(id);
    if (!record || !tray.includes(id)) return;
    setMenuOpen(false);
    const from = rectOf(fromEl ?? chipTarget(id));
    setFlights((list) => list.filter((f) => f.id !== id));
    commitTray(tray.filter((x) => x !== id));
    setOrder((o) => [...o.filter((x) => x !== id), id]);
    onRestore?.(id);
    if (motionSafe && from) {
      setArriving((a) => [...a.filter((x) => x !== id), id]);
      setFlights((list) => [
        ...list,
        {
          id,
          kind: "restore",
          from,
          radius: [compact ? 8 : chip.radius, WINDOW_RADIUS],
        },
      ]);
    } else {
      focusSoon(`[data-tw-window="${id}"] textarea`);
    }
    setAnnouncement(`Restored ${record.title}.`);
  };

  const [confirming, setConfirming] = React.useState<string | null>(null);
  const closeItem = (id: string, force = false) => {
    const record = recordOf(id);
    if (!record) return;
    if (!force && unsaved.includes(id)) {
      setConfirming(id);
      focusSoon("[data-tw-keep]");
      return;
    }
    setConfirming(null);
    const wasParked = tray.includes(id);
    setClosed((c) => [...c, id]);
    if (wasParked) commitTray(tray.filter((x) => x !== id));
    commitUnsaved(unsaved.filter((x) => x !== id));
    setFlights((list) => list.filter((f) => f.id !== id));
    onCloseItem?.(id);
    setAnnouncement(`Closed ${record.title}.`);
    if (wasParked) {
      const rest = tray.filter((x) => x !== id);
      focusSoon(
        rest[0]
          ? `[data-tw-chip="${rest[0]}"] button`
          : "[data-tw-frame-title]",
      );
    } else {
      const next = stack.filter((x) => x !== id);
      const top = next[next.length - 1];
      focusSoon(
        top ? `[data-tw-window="${top}"] textarea` : "[data-tw-frame-title]",
      );
    }
  };

  const save = (id: string) => {
    if (!unsaved.includes(id)) return;
    const record = recordOf(id);
    commitUnsaved(unsaved.filter((x) => x !== id));
    onSave?.(id, bodies[id] ?? "");
    if (record?.kind === "ticket") setBodies((b) => ({ ...b, [id]: "" }));
    setAnnouncement(record?.kind === "ticket" ? "Reply sent." : "Draft saved.");
  };

  const edit = (id: string, text: string) => {
    setBodies((b) => ({ ...b, [id]: text }));
    const original = recordOf(id)?.body ?? "";
    if (text !== original && !unsaved.includes(id))
      commitUnsaved([...unsaved, id]);
  };

  /* ---------------------------- overflow menu --------------------------- */

  const [menuOpen, setMenuOpen] = React.useState(false);
  React.useEffect(() => {
    if (!menuOpen || !frame) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target as Node;
      if (frame.querySelector("[data-tw-menu]")?.contains(t)) return;
      if (frame.querySelector("[data-tw-overflow]")?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen, frame]);
  if (menuOpen && overflow.length === 0) setMenuOpen(false);

  /* ------------------------------ keyboard ------------------------------ */

  const onFrameKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "m") {
      const holder = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-tw-window]",
      );
      const id = holder?.getAttribute("data-tw-window") ?? frontId;
      if (!id) return;
      event.preventDefault();
      minimise(id);
      return;
    }
    if (/^[1-9]$/.test(key)) {
      const id = tray[Number(key) - 1];
      if (!id) return;
      event.preventDefault();
      restore(id);
    }
  };

  const [chipFocus, setChipFocus] = React.useState(0);
  const tabbableChip = Math.min(chipFocus, Math.max(0, shownChips.length - 1));
  const onChipKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const n = shownChips.length + (overflow.length ? 1 : 0);
    const next = vertical ? "ArrowDown" : "ArrowRight";
    const prev = vertical ? "ArrowUp" : "ArrowLeft";
    let to = -1;
    if (event.key === next) to = Math.min(n - 1, i + 1);
    else if (event.key === prev) to = Math.max(0, i - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const id = shownChips[i];
      if (id) closeItem(id);
      return;
    }
    if (to < 0) return;
    event.preventDefault();
    setChipFocus(to);
    const id = shownChips[to];
    const el = id
      ? frame?.querySelector<HTMLElement>(`[data-tw-chip="${id}"] button`)
      : frame?.querySelector<HTMLElement>("[data-tw-overflow]");
    el?.focus();
  };

  /* -------------------------------- render ------------------------------ */

  const vars = {
    "--tw-accent": accent,
    "--tw-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--tw-solid": `oklch(from ${accent} 0.55 c h)`,
    "--tw-pigment": `oklch(from ${accent} 0.68 c h)`,
    "--tw-on": "oklch(0.99 0.004 262)",
    height,
  } as React.CSSProperties;

  const confirmRecord = confirming ? recordOf(confirming) : undefined;
  const parkedUnsaved = tray.filter((id) => unsaved.includes(id)).length;

  const trayBar = (
    <div
      ref={setTrayEl}
      role="toolbar"
      aria-label="Tray"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn(
        "relative flex",
        vertical
          ? "h-full flex-col overflow-hidden p-2"
          : "w-full items-center overflow-hidden px-2",
        placement === "floating" && !vertical && "w-auto max-w-full",
      )}
      style={{ gap: CHIP_GAP }}
    >
      {tray.length === 0 ? (
        <span
          className={cn("px-2 text-[11.5px] text-ink-3", vertical && "pt-1")}
        >
          {compact ? "Tray empty" : "Minimise a window to park it here"}
        </span>
      ) : null}
      {shownChips.map((id, i) => {
        const record = recordOf(id);
        if (!record) return null;
        return (
          <Chip
            key={id}
            record={record}
            number={i + 1}
            size={chipSize}
            icon={compact}
            side={vertical}
            unsaved={unsaved.includes(id)}
            hidden={flights.some((f) => f.id === id && f.kind === "park")}
            landed={landed[id] ?? 0}
            tabbable={i === tabbableChip}
            motionSafe={motionSafe}
            onRestore={() => restore(id)}
            onClose={() => closeItem(id)}
            onKey={(event) => onChipKey(event, i)}
            onFocus={() => setChipFocus(i)}
          />
        );
      })}
      {overflow.length ? (
        <div className="relative shrink-0">
          <button
            type="button"
            data-tw-overflow
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={`${uid}-menu`}
            aria-label={`${overflow.length} more in the tray${overflow.some((id) => unsaved.includes(id)) ? ", some unsaved" : ""}`}
            tabIndex={tabbableChip === shownChips.length ? 0 : -1}
            onClick={() => {
              setMenuOpen((o) => !o);
              if (!menuOpen) focusSoon("[data-tw-menu] [role=menuitem]");
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                if (!vertical) {
                  event.preventDefault();
                  setMenuOpen(true);
                  focusSoon("[data-tw-menu] [role=menuitem]");
                  return;
                }
              }
              onChipKey(event, shownChips.length);
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1 border border-hairline bg-card font-mono text-[11px] text-ink-2 transition-colors hover:bg-surface-1 hover:text-foreground",
              compact ? "rounded-2" : "",
              FOCUS,
            )}
            style={{
              width: vertical ? "100%" : compact ? ICON_CHIP : OVERFLOW_LEN,
              height: compact ? ICON_CHIP : chip.h,
              borderRadius: compact ? undefined : chip.radius,
            }}
          >
            <Ellipsis aria-hidden className="size-3.5" />
            {`+${overflow.length}`}
            {overflow.some((id) => unsaved.includes(id)) ? (
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-(--tw-pigment)"
              />
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      ref={setFrame}
      aria-labelledby={`${uid}-title`}
      onKeyDown={onFrameKey}
      className={cn(
        "@container/tray-windows relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={vars}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Inbox aria-hidden className="size-4 shrink-0 text-(--tw-accent)" />
          <h2
            id={`${uid}-title`}
            data-tw-frame-title
            tabIndex={-1}
            className="truncate text-[14px] font-semibold outline-none"
          >
            {title}
          </h2>
          <span className="hidden truncate font-mono text-[10.5px] text-ink-3 @min-[26rem]/tray-windows:inline">
            {workspace}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums">
          {`${stack.length} open · ${tray.length} parked${parkedUnsaved ? ` · ${parkedUnsaved} unsaved` : ""}`}
        </span>
      </header>

      <div
        className={cn(
          "relative flex flex-1 overflow-hidden",
          vertical ? "flex-row" : "flex-col",
        )}
      >
        {/* The workspace. */}
        <div
          ref={setWork}
          className="relative flex-1 overflow-hidden bg-surface-0 bg-[radial-gradient(var(--hairline)_1px,transparent_1.2px)] [background-size:16px_16px]"
        >
          {status === "loading" ? (
            <div
              aria-hidden
              className="absolute inset-4 grid grid-cols-2 gap-3"
            >
              <span className="rounded-3 bg-surface-2 motion-safe:animate-pulse" />
              <span className="rounded-3 bg-surface-2 motion-safe:animate-pulse" />
            </div>
          ) : status === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-2 px-6 text-center">
              <p className="text-[13px] font-medium">
                The workspace could not be loaded.
              </p>
              <p className="text-[12px] text-ink-3">
                Drafts are kept on this device until it can.
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className={cn(
                    "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-[12px] hover:bg-surface-2",
                    FOCUS,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {stack.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-1 px-6 text-center">
                  <p className="text-[13px] font-medium">Nothing open</p>
                  <p className="text-[12px] text-ink-3">
                    {tray.length
                      ? `Everything you parked is in the tray. ${compact ? "Tap a chip" : "Ctrl 1"} brings back the first.`
                      : "Every window is closed."}
                  </p>
                </div>
              ) : null}
              <AnimatePresence>
                {/* DOM order is the records' order and never changes:
                    coming to the front is a z-index, not a move, so a press
                    that raises a window still lands as a click. */}
                {openIds.map((id) => {
                  const record = recordOf(id);
                  if (!record) return null;
                  return (
                    <TrayWindow
                      key={id}
                      record={record}
                      rect={placeWindow(positions[id], size.w, size.h, compact)}
                      z={stack.indexOf(id) + 1}
                      front={id === frontId}
                      hidden={arriving.includes(id)}
                      unsaved={unsaved.includes(id)}
                      body={bodies[id] ?? ""}
                      motionSafe={motionSafe}
                      onFront={() => bringToFront(id)}
                      onMinimise={() => minimise(id)}
                      onClose={() => closeItem(id)}
                      onBody={(text) => edit(id, text)}
                      onSave={() => save(id)}
                    />
                  );
                })}
              </AnimatePresence>
            </>
          )}

          {placement === "floating" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-6">
              <div className="pointer-events-auto flex max-w-full items-center rounded-3 border border-hairline bg-popover py-1.5 shadow-[0_10px_28px_color-mix(in_oklab,black_16%,transparent)]">
                {trayBar}
              </div>
            </div>
          ) : null}
        </div>

        {placement === "bottom" ? (
          <div
            className="flex shrink-0 items-center border-t border-hairline bg-surface-1"
            style={{ height: (compact ? ICON_CHIP : chip.h) + 16 }}
          >
            {trayBar}
          </div>
        ) : placement === "side" ? (
          <div className="w-44 shrink-0 border-l border-hairline bg-surface-1">
            {trayBar}
          </div>
        ) : null}

        {/* The overflow menu. */}
        <AnimatePresence>
          {menuOpen && overflow.length ? (
            <motion.div
              key="menu"
              data-tw-menu
              id={`${uid}-menu`}
              role="menu"
              aria-label="More in the tray"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
              onKeyDown={(event) => {
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    "[role=menuitem]",
                  ),
                );
                const at = items.indexOf(document.activeElement as HTMLElement);
                if (event.key === "Escape" || event.key === "Tab") {
                  if (event.key === "Escape") event.preventDefault();
                  setMenuOpen(false);
                  focusSoon("[data-tw-overflow]");
                  return;
                }
                const n = items.length;
                const to =
                  event.key === "ArrowDown"
                    ? (at + 1) % n
                    : event.key === "ArrowUp"
                      ? (at - 1 + n) % n
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? n - 1
                          : -1;
                if (to < 0) return;
                event.preventDefault();
                items[to]?.focus();
              }}
              className="absolute z-50 flex w-60 max-w-[calc(100%-16px)] flex-col gap-0.5 rounded-3 border border-hairline bg-popover p-1 shadow-[0_14px_36px_color-mix(in_oklab,black_20%,transparent)]"
              style={
                vertical
                  ? { right: 184, bottom: 12 }
                  : {
                      right: 8,
                      bottom:
                        (compact ? ICON_CHIP : chip.h) +
                        (placement === "floating" ? 34 : 22),
                    }
              }
            >
              {overflow.map((id, i) => {
                const record = recordOf(id);
                if (!record) return null;
                const n = capacity + i + 1;
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-label={`${n}. ${record.title}${unsaved.includes(id) ? ", unsaved changes" : ""}`}
                    onClick={() =>
                      restore(id, frame?.querySelector("[data-tw-overflow]"))
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-2 px-2 py-1.5 text-left text-[12.5px] text-foreground hover:bg-surface-2",
                      FOCUS_INSET,
                    )}
                  >
                    <KindIcon
                      kind={record.kind}
                      className="size-3.5 shrink-0 text-ink-3"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {record.title}
                    </span>
                    {unsaved.includes(id) ? (
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full bg-(--tw-pigment)"
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="shrink-0 font-mono text-[10px] text-ink-3"
                    >
                      {n <= 9 ? n : ""}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Flights ride above everything, inside the frame's clip. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[60]">
        {flights.map((f) => (
          <Ghost
            key={`${f.kind}-${f.id}`}
            flight={f}
            record={recordOf(f.id)}
            motionSafe={motionSafe}
            target={() =>
              rectOf(
                f.kind === "park"
                  ? chipTarget(f.id)
                  : (frame?.querySelector(
                      `[data-tw-window="${CSS.escape(f.id)}"]`,
                    ) ?? null),
              )
            }
            onLand={() => land(f)}
          />
        ))}
      </div>

      {/* Unsaved check before closing. */}
      <AnimatePresence>
        {confirmRecord ? (
          <motion.div
            key="confirm"
            role="alertdialog"
            aria-labelledby={`${uid}-confirm-title`}
            aria-describedby={`${uid}-confirm-body`}
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                const id = confirmRecord.id;
                setConfirming(null);
                focusSoon(
                  tray.includes(id)
                    ? `[data-tw-chip="${id}"] button`
                    : `[data-tw-window="${id}"] textarea`,
                );
                return;
              }
              if (event.key === "Tab") {
                const buttons = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>("button"),
                );
                const at = buttons.indexOf(
                  document.activeElement as HTMLElement,
                );
                event.preventDefault();
                buttons[
                  (at + (event.shiftKey ? -1 : 1) + buttons.length) %
                    buttons.length
                ]?.focus();
              }
            }}
            className="absolute inset-x-3 bottom-3 z-[70] mx-auto flex max-w-sm flex-col gap-2.5 rounded-3 border border-hairline bg-popover p-3.5 shadow-[0_16px_40px_color-mix(in_oklab,black_22%,transparent)]"
          >
            <p
              id={`${uid}-confirm-title`}
              className="text-[13px] font-semibold"
            >
              Discard unsaved changes?
            </p>
            <p
              id={`${uid}-confirm-body`}
              className="text-[12px] leading-[1.5] text-ink-2"
            >
              {`“${confirmRecord.title}” has changes that are not saved. Closing it throws them away.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-tw-keep
                onClick={() => {
                  const id = confirmRecord.id;
                  setConfirming(null);
                  focusSoon(
                    tray.includes(id)
                      ? `[data-tw-chip="${id}"] button`
                      : `[data-tw-window="${id}"] textarea`,
                  );
                }}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-foreground hover:bg-surface-2",
                  FOCUS,
                )}
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => closeItem(confirmRecord.id, true)}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 px-3 text-[12px] font-medium text-danger hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]",
                  FOCUS,
                )}
              >
                Discard
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
