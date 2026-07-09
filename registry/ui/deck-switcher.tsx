"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, exitFor, springs } from "@/registry/lib/motion";
import { clamp, mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Shared rake tilt every decked card wears, in degrees. */
const RAKE_TILT = 38;
/** Vertical pitch between adjacent deck slots, in px. */
const RAKE_GAP = 56;
/** Scale shed per step of deck depth. */
const SCALE_STEP = 0.06;
/** Deepest scale a raked card may reach. */
const SCALE_FLOOR = 0.7;
/** Largest scale a card passing the front may swell to. */
const SCALE_LIFT = 1.12;
/** Opacity shed per step of deck depth. */
const FADE_STEP = 0.11;
/** Opacity floor at the back of the deck. */
const FADE_FLOOR = 0.42;
/** Brightness shed per step of deck depth. */
const BRIGHT_STEP = 0.08;
/** Brightness floor at the back of the deck. */
const BRIGHT_FLOOR = 0.62;
/** px an unchosen card sinks while it folds away after a commit. */
const FOLD_SINK = 20;
/** Scale an unchosen card sheds while it folds away after a commit. */
const FOLD_SHRINK = 0.05;
/** Pointer travel (px) that slides the rake by one slot. */
const PX_PER_STEP = 64;
/** Springy give past the ends of the rake, in slots. */
const OVERDRAG = 0.35;
/** Pointer travel (px) before a press becomes a drag — protects card taps. */
const DRAG_THRESHOLD = 5;
/** Accumulated wheel delta that equals one slot. */
const WHEEL_NOTCH = 50;
/** Wheel input is rate-limited to one slot per this many ms. */
const WHEEL_LOCK_MS = 140;
/** Idle gap (ms) after which the wheel accumulator resets. */
const WHEEL_IDLE_MS = 250;

type DragState = {
  pointerId: number;
  /** Pointer y where the press began — measures the tap threshold. */
  startY: number;
  /** Last pointer y, for per-move deltas. */
  lastY: number;
  engaged: boolean;
};

export type DeckView = {
  /** Stable id — becomes the active handle and the option's DOM id. */
  id: string;
  /** Title-bar label; also the option's accessible name in the deck. */
  title: string;
  /** The view surface. Interactive while focused, inert while raked. */
  content: React.ReactNode;
};

export type DeckSwitcherProps = {
  /** Open views, 2–6. Every view stays mounted so its state survives a switch. */
  views: DeckView[];
  /** Controlled active view id. */
  activeId?: string;
  /** Initially active view id when uncontrolled. Defaults to the first view. */
  defaultActiveId?: string;
  /** Fires when a deck commit lands on a different view. */
  onActiveChange?: (id: string) => void;
  /** Stage height in px. */
  height?: number;
  className?: string;
  /** Accessible name for the deck listbox. */
  "aria-label"?: string;
};

/**
 * A view switcher that trades the tab strip for a raked deck: the active view
 * fills the stage as a flat card until the DECK chip fans every open view back
 * into a tilted stack — a shared rotateX(38°) inside a
 * `perspective(perspectives.far)` stage, per-card transforms only, no
 * preserve-3d. Deck slot `i` (front = the view that was active) sits at
 * `translateY(i·56) scale(1 − i·0.06)` with brightness/opacity falling off
 * into the stack; entering the deck deals the cards out from the focused pose
 * on `glide` with a `cascade` stagger.
 *
 * One float motion value — `lead` — is the rake's source of truth: each
 * card's pose derives from `slot − lead`, so a vertical drag or a hand-bound
 * non-passive wheel listener (mounted only while the deck is open) slides the
 * whole rake, and release snaps `lead` to the nearest slot on `snap`. The
 * front card is the candidate (accent hairline, brightened title chip).
 * Tapping any visible card — or Enter/Space — commits it: the chosen card
 * zooms forward to the flat pose on `glide` while the rest fold behind and
 * fade on `exitFor`; Escape cancels back to the previously active view with
 * no change event. Mid-flight commit/cancel/reopen is safe — every retarget
 * stops its in-flight controls first.
 *
 * Semantics: focused, the stage is plain DOM and the DECK chip is a real
 * button (`aria-expanded`, `aria-haspopup="listbox"`). Open, the stage
 * becomes a `listbox` (`aria-activedescendant` on the candidate) and cards
 * become `option`s; ArrowUp/Down slide the rake one slot, Home/End jump,
 * Enter/Space commit, Escape cancels and focus returns to the DECK button.
 * While raked, view contents are aria-hidden + inert — only cards are
 * targets. A polite sr-only region reads "Deck open, N views" / "<title>
 * active".
 *
 * Reduced motion: the deck is a flat vertical list of title cards — no rake,
 * no tilt, duration-fast transitions — with the same listbox semantics, and a
 * commit swaps views instantly.
 */
export function DeckSwitcher({
  views,
  activeId,
  defaultActiveId,
  onActiveChange,
  height = 300,
  className,
  "aria-label": ariaLabel = "View switcher",
}: DeckSwitcherProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const count = views.length;
  const lastIndex = Math.max(0, count - 1);

  const [uncontrolledActive, setUncontrolledActive] = React.useState(
    () => activeId ?? defaultActiveId ?? views[0]?.id ?? "",
  );
  const resolvedActiveId = activeId !== undefined ? activeId : uncontrolledActive;
  /** The effective active view — falls back to the first view on a stale id. */
  const activeView =
    views.find((view) => view.id === resolvedActiveId) ?? views[0];

  const [mode, setMode] = React.useState<"focused" | "deck">("focused");
  /** The view that anchored the front when the deck last opened. */
  const [orderBaseId, setOrderBaseId] = React.useState(
    () => activeId ?? defaultActiveId ?? views[0]?.id ?? "",
  );
  /** Live candidate slot — the deck-order index of the front card. */
  const [candidate, setCandidate] = React.useState(0);
  const [grabbing, setGrabbing] = React.useState(false);

  const deckOpen = mode === "deck";
  /** The raked, spring-driven pathway; false renders the flat list instead. */
  const spatialDeck = deckOpen && motionSafe;

  /** Deck order: the anchoring view first, the rest in cyclic view order. */
  const order = React.useMemo(() => {
    if (count === 0) return [] as DeckView[];
    const base = Math.max(
      0,
      views.findIndex((view) => view.id === orderBaseId),
    );
    return [...views.slice(base), ...views.slice(0, base)];
  }, [views, orderBaseId, count]);

  /** The rake's source of truth: a float slot position. */
  const lead = useMotionValue(0);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const flatListRef = React.useRef<HTMLUListElement | null>(null);
  const deckButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const leadControlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** The slot the rake last settled on or is heading to. */
  const targetLeadRef = React.useRef(0);
  const candidateRef = React.useRef(0);
  const dragRef = React.useRef<DragState | null>(null);
  const wheelRef = React.useRef({ acc: 0, steppedAt: 0, lastAt: 0 });
  const prevModeRef = React.useRef(mode);

  // Live candidate: nearest slot of the rake, deduped (event callback, not an
  // effect body — the house pattern for deriving state from a motion value).
  useMotionValueEvent(lead, "change", (value) => {
    const next = clamp(Math.round(value), 0, lastIndex);
    if (next === candidateRef.current) return;
    candidateRef.current = next;
    setCandidate(next);
  });

  const moveTo = React.useCallback(
    (slot: number) => {
      const target = clamp(slot, 0, lastIndex);
      targetLeadRef.current = target;
      if (motionSafe) {
        leadControlsRef.current?.stop();
        // `snap` for the single-slot slide, `glide` for a Home/End jump.
        const spring =
          Math.abs(target - lead.get()) <= 1.01 ? springs.snap : springs.glide;
        leadControlsRef.current = animate(lead, target, spring);
      } else {
        candidateRef.current = target;
        setCandidate(target);
      }
    },
    [lastIndex, motionSafe, lead],
  );

  const moveBy = React.useCallback(
    (delta: number) => {
      moveTo(Math.round(targetLeadRef.current) + delta);
    },
    [moveTo],
  );

  const openDeck = () => {
    if (deckOpen || count === 0) return;
    leadControlsRef.current?.stop();
    lead.jump(0);
    targetLeadRef.current = 0;
    candidateRef.current = 0;
    setCandidate(0);
    setOrderBaseId(activeView?.id ?? "");
    setMode("deck");
  };

  const cancelDeck = () => {
    if (!deckOpen) return;
    leadControlsRef.current?.stop();
    setMode("focused");
  };

  const commitView = (slot: number) => {
    if (!deckOpen) return;
    const view = order[clamp(slot, 0, lastIndex)];
    if (!view) return;
    leadControlsRef.current?.stop();
    if (view.id !== activeView?.id) {
      if (activeId === undefined) setUncontrolledActive(view.id);
      onActiveChange?.(view.id);
    }
    setMode("focused");
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!deckOpen) return;
    switch (event.key) {
      case "ArrowDown":
        moveBy(1);
        break;
      case "ArrowUp":
        moveBy(-1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(lastIndex);
        break;
      case "Enter":
      case " ": {
        // A mid-drag Enter reads the live front card; otherwise the slot the
        // last arrow/wheel/release aimed at.
        const slot = dragRef.current?.engaged
          ? candidateRef.current
          : Math.round(targetLeadRef.current);
        commitView(slot);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  /** Escape cancels from anywhere inside — stage, flat list, or DECK chip. */
  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !deckOpen) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDeck();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!spatialDeck) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    leadControlsRef.current?.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId || !spatialDeck) return;
    if (!drag.engaged) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      // Crossed the threshold — a drag, not a tap. Capture now so taps on
      // cards still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }
    const dy = event.clientY - drag.lastY;
    drag.lastY = event.clientY;
    // Drag up pulls deeper cards toward the front.
    lead.set(
      clamp(lead.get() - dy / PX_PER_STEP, -OVERDRAG, lastIndex + OVERDRAG),
    );
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return; // A tap — leave the click to its card.
    setGrabbing(false);
    if (!spatialDeck) return; // The deck closed mid-drag — nothing to snap.
    const target = clamp(Math.round(lead.get()), 0, lastIndex);
    targetLeadRef.current = target;
    leadControlsRef.current?.stop();
    leadControlsRef.current = animate(lead, target, {
      ...springs.snap,
      velocity: lead.getVelocity(),
    });
  };

  // Wheel: element-bound and non-passive (React's onWheel is passive), mounted
  // only while the raked deck is up — elsewhere the page keeps its scroll.
  React.useEffect(() => {
    if (!spatialDeck) return;
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (dragRef.current?.engaged) return;
      const wheel = wheelRef.current;
      if (event.timeStamp - wheel.lastAt > WHEEL_IDLE_MS) wheel.acc = 0;
      wheel.lastAt = event.timeStamp;
      if (event.timeStamp - wheel.steppedAt < WHEEL_LOCK_MS) return;
      // deltaMode 1 is line-based (Firefox) — normalize toward pixels.
      wheel.acc += event.deltaMode === 1 ? event.deltaY * 24 : event.deltaY;
      if (Math.abs(wheel.acc) < WHEEL_NOTCH) return;
      const direction = wheel.acc > 0 ? 1 : -1;
      wheel.acc = 0;
      wheel.steppedAt = event.timeStamp;
      moveBy(direction);
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [spatialDeck, moveBy]);

  // Focus follows the mode: into the listbox when the deck opens (re-aimed if
  // the reduced-motion pathway flips mid-deck), back to the DECK button when
  // it closes (commit or cancel). Guarded so mount is silent.
  React.useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (mode === "deck") {
      (motionSafe ? stageRef.current : flatListRef.current)?.focus({
        preventScroll: true,
      });
    } else if (prev === "deck") {
      deckButtonRef.current?.focus({ preventScroll: true });
    }
  }, [mode, motionSafe]);

  // Re-seat the rake when the spatial path (re)mounts — the flat list may
  // have moved the candidate while the springs were away.
  React.useEffect(() => {
    if (!motionSafe) return;
    leadControlsRef.current?.stop();
    lead.jump(candidateRef.current);
    targetLeadRef.current = candidateRef.current;
  }, [motionSafe, lead]);

  // A snap in flight must not outlive the component.
  React.useEffect(() => () => leadControlsRef.current?.stop(), []);

  const optionId = (id: string) => `${uid}option-${id}`;
  const flatOptionId = (id: string) => `${uid}flat-${id}`;
  const stageId = `${uid}stage`;

  const candidateView = order[clamp(candidate, 0, lastIndex)];
  /** Stable view index by id — the title-bar mono index never re-deals. */
  const viewIndexById = new Map(views.map((view, i) => [view.id, i] as const));

  const announcement =
    count === 0
      ? null
      : deckOpen
        ? `Deck open, ${count} views`
        : `${activeView?.title ?? ""} active`;

  return (
    <div
      className={cn("relative w-full", className)}
      onKeyDown={handleRootKeyDown}
    >
      <div
        ref={stageRef}
        id={stageId}
        role={spatialDeck ? "listbox" : undefined}
        aria-label={spatialDeck ? ariaLabel : undefined}
        aria-orientation={spatialDeck ? "vertical" : undefined}
        aria-activedescendant={
          spatialDeck && candidateView ? optionId(candidateView.id) : undefined
        }
        tabIndex={spatialDeck ? 0 : undefined}
        onKeyDown={spatialDeck ? handleListKeyDown : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          "relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-0",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          spatialDeck && "touch-none select-none",
          spatialDeck && (grabbing ? "cursor-grabbing" : "cursor-grab"),
        )}
        style={{ height, perspective: perspectives.far }}
      >
        {order.map((view, slot) => (
          <DeckCard
            key={view.id}
            view={view}
            slot={slot}
            viewIndex={viewIndexById.get(view.id) ?? slot}
            count={count}
            lead={lead}
            mode={mode}
            motionSafe={motionSafe}
            isActive={view.id === activeView?.id}
            isCandidate={spatialDeck && slot === candidate}
            spatialDeck={spatialDeck}
            flatDeckOpen={deckOpen && !motionSafe}
            grabbing={grabbing}
            optionId={optionId(view.id)}
            enterDelay={slot * cascade(count)}
            onCommit={() => commitView(slot)}
          />
        ))}

        {/* Reduced motion: the deck is a flat list of title cards instead. */}
        {deckOpen && !motionSafe && (
          <motion.ul
            ref={flatListRef}
            role="listbox"
            aria-label={ariaLabel}
            aria-orientation="vertical"
            aria-activedescendant={
              candidateView ? flatOptionId(candidateView.id) : undefined
            }
            tabIndex={0}
            onKeyDown={handleListKeyDown}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast }}
            className={cn(
              "absolute inset-0 z-20 m-0 flex list-none flex-col gap-2 overflow-y-auto bg-surface-0 p-3",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {order.map((view, slot) => (
              <li
                key={view.id}
                id={flatOptionId(view.id)}
                role="option"
                aria-selected={slot === candidate}
                tabIndex={-1}
                onClick={() => commitView(slot)}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center gap-2 rounded-3 border bg-surface-1 px-3 py-2.5 transition-colors",
                  slot === candidate ? "border-cobalt/60" : "border-hairline",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tracking-[0.08em] tabular-nums",
                    slot === candidate ? "text-cobalt" : "text-ink-3",
                  )}
                >
                  {String((viewIndexById.get(view.id) ?? slot) + 1).padStart(
                    2,
                    "0",
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs font-medium tracking-wide",
                    slot === candidate ? "text-ink" : "text-ink-2",
                  )}
                >
                  {view.title}
                </span>
                {view.id === activeView?.id && (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-cobalt"
                  />
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </div>

      {/* The DECK chip — a real disclosure button riding the stage's corner. */}
      <button
        ref={deckButtonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={deckOpen}
        aria-controls={stageId}
        onClick={deckOpen ? cancelDeck : openDeck}
        className={cn(
          "absolute right-3 bottom-3 z-30 flex cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-surface-2/90 px-2.5 py-1.5 backdrop-blur",
          "font-mono text-[10px] tracking-[0.14em] text-ink-2 transition-colors hover:text-ink",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          className="size-3 shrink-0"
        >
          <rect x="4.5" y="1.5" width="7" height="4.4" rx="1" opacity="0.45" />
          <rect x="3" y="5.2" width="10" height="4.6" rx="1" opacity="0.7" />
          <rect x="1.5" y="9.2" width="13" height="5.1" rx="1.1" />
        </svg>
        DECK
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type DeckCardProps = {
  view: DeckView;
  /** This card's slot in deck order — 0 fronts the rake. */
  slot: number;
  /** Stable index in the views array, for the mono title chip. */
  viewIndex: number;
  count: number;
  lead: MotionValue<number>;
  mode: "focused" | "deck";
  motionSafe: boolean;
  isActive: boolean;
  isCandidate: boolean;
  spatialDeck: boolean;
  /** The reduced-motion list is up — this card hides behind it. */
  flatDeckOpen: boolean;
  grabbing: boolean;
  optionId: string;
  enterDelay: number;
  onCommit: () => void;
};

/**
 * One view card. Two owned motion values choreograph it: `t` blends the flat
 * focused pose into the raked deck pose (whose target derives live from the
 * shared `lead`), and `veil` fades an unchosen card out — sinking and
 * shrinking a hair — after a commit. Every retarget stops the in-flight
 * controls first, so commit/cancel/reopen spam always lands cleanly.
 */
function DeckCard({
  view,
  slot,
  viewIndex,
  count,
  lead,
  mode,
  motionSafe,
  isActive,
  isCandidate,
  spatialDeck,
  flatDeckOpen,
  grabbing,
  optionId,
  enterDelay,
  onCommit,
}: DeckCardProps) {
  /** 0 = flat focused pose, 1 = raked deck pose. */
  const t = useMotionValue(0);
  /** 1 = present; folds to 0 when this card loses a commit. */
  const veil = useMotionValue(1);
  /** Flat-pose opacity — 1 only for the active view. Jumped, never sprung. */
  const focusWeight = useMotionValue(isActive ? 1 : 0);

  const tControlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const veilControlsRef = React.useRef<ReturnType<typeof animate> | null>(null);

  // The card's whole life is mode-driven: deal out on glide (staggered), zoom
  // forward on glide when chosen, fold behind on exitFor when not. Stop
  // before every retarget; clean up whatever is in flight on unmount.
  React.useEffect(() => {
    tControlsRef.current?.stop();
    veilControlsRef.current?.stop();
    if (!motionSafe) {
      focusWeight.jump(isActive ? 1 : 0);
      t.jump(0);
      veil.jump(1);
    } else if (mode === "deck") {
      focusWeight.jump(isActive ? 1 : 0);
      veil.jump(1);
      if (t.get() !== 1) {
        tControlsRef.current = animate(t, 1, {
          ...springs.glide,
          delay: enterDelay,
        });
      }
    } else if (isActive) {
      focusWeight.jump(1);
      veil.jump(1);
      if (t.get() !== 0) tControlsRef.current = animate(t, 0, springs.glide);
    } else {
      focusWeight.jump(0);
      if (t.get() > 0) {
        veilControlsRef.current = animate(veil, 0, {
          ...exitFor(durations.base),
          // Faded out — silently reset to the flat pose for the next deal.
          onComplete: () => {
            t.jump(0);
            veil.jump(1);
          },
        });
      } else {
        t.jump(0);
        veil.jump(1);
      }
    }
    return () => {
      tControlsRef.current?.stop();
      veilControlsRef.current?.stop();
    };
  }, [mode, motionSafe, isActive, enterDelay, t, veil, focusWeight]);

  const transform = useTransform(
    [t, lead, veil],
    ([tv = 0, lv = 0, vv = 1]: number[]) => {
      const p = slot - lv;
      const deckScale = clamp(1 - p * SCALE_STEP, SCALE_FLOOR, SCALE_LIFT);
      const y = p * RAKE_GAP * tv + (1 - vv) * FOLD_SINK;
      const scale =
        (1 + (deckScale - 1) * tv) * (1 - (1 - vv) * FOLD_SHRINK);
      const rotate = RAKE_TILT * tv;
      return `translateY(${y.toFixed(2)}px) rotateX(${rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    },
  );

  const opacity = useTransform(
    [t, lead, veil, focusWeight],
    ([tv = 0, lv = 0, vv = 1, fw = 0]: number[]) => {
      const p = slot - lv;
      const deckOpacity =
        p >= 0
          ? clamp(1 - p * FADE_STEP, FADE_FLOOR, 1)
          : mapRange(p, -0.85, 0, 0, 1);
      return (fw * (1 - tv) + deckOpacity * tv) * vv;
    },
  );

  const filter = useTransform([t, lead], ([tv = 0, lv = 0]: number[]) => {
    const p = Math.max(slot - lv, 0);
    const deckBright = clamp(1 - p * BRIGHT_STEP, BRIGHT_FLOOR, 1);
    return `brightness(${(1 + (deckBright - 1) * tv).toFixed(3)})`;
  });

  const visibility = useTransform(opacity, (value) =>
    value < 0.02 ? "hidden" : "visible",
  );

  return (
    <motion.div
      id={optionId}
      role={spatialDeck ? "option" : undefined}
      aria-selected={spatialDeck ? isCandidate : undefined}
      aria-label={spatialDeck ? view.title : undefined}
      aria-hidden={flatDeckOpen || undefined}
      inert={flatDeckOpen ? true : undefined}
      tabIndex={spatialDeck ? -1 : undefined}
      onClick={spatialDeck ? onCommit : undefined}
      className={cn(
        "absolute inset-0 flex flex-col overflow-hidden rounded-3 border bg-surface-1 transition-colors",
        isCandidate ? "border-cobalt/60" : "border-hairline",
        spatialDeck && (grabbing ? "cursor-grabbing" : "cursor-pointer"),
      )}
      style={{
        zIndex: mode === "focused" && isActive ? count + 1 : count - slot,
        transform,
        opacity,
        filter,
        visibility,
        transformOrigin: "50% 30%",
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    >
      {/* Mini title bar — mono index, title, and the active tell. */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hairline bg-surface-2 px-3">
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] tracking-[0.08em] tabular-nums transition-colors",
            isCandidate ? "text-cobalt" : "text-ink-3",
          )}
        >
          {String(viewIndex + 1).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide transition-colors",
            isCandidate ? "text-ink" : "text-ink-2",
          )}
        >
          {view.title}
        </span>
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            isActive ? "bg-cobalt" : "bg-surface-0 ring-1 ring-hairline-strong",
          )}
        />
      </div>
      {/* The view surface — live while focused, inert while raked. */}
      <div
        aria-hidden={spatialDeck || undefined}
        inert={spatialDeck ? true : undefined}
        className={cn(
          "min-h-0 flex-1 overflow-auto",
          spatialDeck && "pointer-events-none",
        )}
      >
        {view.content}
      </div>
    </motion.div>
  );
}
