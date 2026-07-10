"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  djb2,
  liftShadowCss,
  perspectives,
  seeded,
  wrapAngle,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type ShelfBook = {
  id: string;
  /** Spine label — also names the open spread's region. */
  title: string;
  /** Spine width in px; defaults to 26–40, seeded by id. */
  spineWidth?: number;
  /** Spine height in px; defaults to 120–150, seeded by id. */
  height?: number;
  /** OKLCH hue of the binding; defaults to an indexed golden-angle walk. */
  hue?: number;
  /** Page content revealed when the book opens. */
  spread: React.ReactNode;
};

export type PullShelfProps = {
  /** The rank. The first 8 books are shelved; 4–8 reads best. */
  books: ShelfBook[];
  /** Controlled open book id (`null` = everything shelved). */
  open?: string | null;
  /** Initial open book for uncontrolled usage. */
  defaultOpen?: string | null;
  onOpenChange?: (id: string | null) => void;
  className?: string;
  /** Accessible name for the shelf rank. */
  "aria-label"?: string;
};

/** Only a rank's worth of books — the shelf reads past eight as clutter. */
const MAX_BOOKS = 8;
/** Air between spines, px — also feeds the launch-origin estimate. */
const RANK_GAP = 6;
/** Tip: the browsed spine swings out about its left (hinge) edge, degrees. */
const TIP_ROTATE = -24;
/** ...and slides forward a touch, px. */
const TIP_SHIFT = 6;
/** Peak opacity of the shelf-gap shade behind a fully tipped spine. */
const GAP_SHADE = 0.55;
/** Sympathetic lean of the immediate neighbors, degrees. */
const LEAN = 3;
/** Lift of the spine as it flies out toward the spread, px. */
const PULL_RISE = -16;
/** Reserved flight stage above the rank where the spread opens, px. */
const STAGE_HEIGHT = 176;
/** The spread hovers this far down over the tallest spine tops, px. */
const STAGE_OVERLAP = 6;
/** Horizontal span the launch origin maps across, px. */
const LAUNCH_SPAN = 220;
/** The pulled book starts its flight this far below rest, near its slot, px. */
const LAUNCH_RISE = 56;
/** The two cover boards open a beat apart. */
const BOARD_STAGGER = cascade(2);
/** Golden-angle walk for default binding hues. */
const GOLDEN_ANGLE = 137.508;

type SpineMetrics = { width: number; height: number; hue: number };

/** Deterministic per-book variety: width and height seeded by id, hue by index. */
const metricsFor = (book: ShelfBook, index: number): SpineMetrics => {
  const rand = seeded(djb2(`pull-shelf:${book.id}`));
  const widthRand = rand();
  const heightRand = rand();
  return {
    width: book.spineWidth ?? Math.round(26 + widthRand * 14),
    height: book.height ?? Math.round(120 + heightRand * 30),
    hue: book.hue ?? Math.round(wrapAngle(index * GOLDEN_ANGLE) * 10) / 10,
  };
};

/**
 * Books on a perspective shelf — pull one and it tips out, then flies forward
 * to open. Shelved, each book is a hue-bound spine standing on an instrument
 * ledge (a surface plate with a hairline-strong front lip and a contact-shadow
 * line under the rank). Hovering with a fine pointer or focusing a spine tips
 * it out of the rank — rotateY(−24°) about its left hinge with a slight
 * forward shift on `snap`, the same tip factor driving the shelf-gap shade
 * behind it — while its immediate neighbors lean ±3° away in sympathy.
 * Pulling (click/Enter) flies the book forward: the spine fades out of its
 * slot (a dashed gap outline holds its place) and the open spread glides in
 * above the shelf from the slot's direction, two cover boards sweeping apart
 * from the gutter a beat apart beneath a mono header with a CLOSE chip.
 * Closing (the chip, Escape, or clicking the gap) folds the spread on an exit
 * tween and glides the spine back into its gap. One book opens at a time —
 * pulling another shelves the first.
 *
 * The open id is controlled (`open`/`onOpenChange`) or uncontrolled
 * (`defaultOpen`). Every spine is a real button carrying `aria-expanded`; the
 * spread is a `role="region"` named by its title. Focus moves to the close
 * chip on user-driven opens (a single cancelled rAF) and returns to the spine
 * on close; a polite region reads "<title> open" / "Shelved".
 *
 * Reduced motion: no tips, leans, or flight — spines highlight flat on
 * hover/focus and the spread cross-fades on a fast tween, with identical
 * semantics and focus discipline. All per-book variety (spine width, height,
 * hue) is seeded from the book id or index — nothing random.
 */
export function PullShelf({
  books,
  open: openProp,
  defaultOpen = null,
  onOpenChange,
  className,
  "aria-label": ariaLabel = "Shelf",
}: PullShelfProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState<string | null>(
    defaultOpen,
  );
  const openId = openProp !== undefined ? openProp : uncontrolledOpen;

  /** The spine currently tipped out by hover or focus (browse state). */
  const [tipped, setTipped] = React.useState<string | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  /** Set by user closes so the spine regains focus; external writes never steal. */
  const returnFocusRef = React.useRef<string | null>(null);
  /** Set by user opens so the spread's chip takes focus once it mounts. */
  const wantsChipFocusRef = React.useRef(false);

  // Derived fresh each render — plain data, the compiler memoizes with it.
  const rows = books
    .slice(0, MAX_BOOKS)
    .map((book, index) => ({ book, ...metricsFor(book, index) }));

  // Launch-origin estimate: each slot's center across the rank, pure math
  // from the same widths the flex rank renders from. Plain loop — the
  // compiler rejects closure-captured accumulators inside .map().
  const centers: number[] = [];
  let runningX = 0;
  for (const row of rows) {
    centers.push(runningX + row.width / 2);
    runningX += row.width + RANK_GAP;
  }
  const rankWidth = Math.max(runningX - RANK_GAP, 1);

  const openIndex = rows.findIndex((row) => row.book.id === openId);
  const openRow = openIndex >= 0 ? (rows[openIndex] ?? null) : null;
  const launchX =
    openRow !== null
      ? ((centers[openIndex] ?? rankWidth / 2) / rankWidth - 0.5) * LAUNCH_SPAN
      : 0;
  const tippedIndex =
    tipped !== null ? rows.findIndex((row) => row.book.id === tipped) : -1;

  const setOpen = (next: string | null) => {
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  /** Spine click: pull the book out, or shelve it if it is the open one. */
  const pullOrShelve = (id: string) => {
    if (id === openId) {
      wantsChipFocusRef.current = false;
      returnFocusRef.current = id;
      setOpen(null);
    } else {
      wantsChipFocusRef.current = true;
      setTipped((prev) => (prev === id ? null : prev));
      setOpen(id);
    }
  };

  const closeSpread = () => {
    if (openId === null) return;
    wantsChipFocusRef.current = false;
    returnFocusRef.current = openId;
    setOpen(null);
  };

  const hoverSpine = (id: string, hovering: boolean, pointerType: string) => {
    if (pointerType === "touch" || id === openId) return; // fine pointers only
    setTipped((prev) => (hovering ? id : prev === id ? null : prev));
  };

  const focusSpine = (id: string) => {
    if (id !== openId) setTipped(id);
  };

  const blurSpine = (id: string) => {
    setTipped((prev) => (prev === id ? null : prev));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && openId !== null) {
      event.preventDefault();
      closeSpread();
    }
  };

  // Focus return: after a user close, hand focus back to the book's spine.
  // DOM focus only — no state is written here.
  const prevOpenRef = React.useRef(openId);
  React.useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = openId;
    if (openId !== null || prev === openId) return;
    const returnId = returnFocusRef.current;
    returnFocusRef.current = null;
    if (returnId === null) return;
    const root = rootRef.current;
    if (root === null) return;
    Array.from(root.querySelectorAll<HTMLButtonElement>("[data-spine-id]"))
      .find((node) => node.dataset.spineId === returnId)
      ?.focus();
  }, [openId]);

  return (
    <div
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className={cn("relative flex w-full max-w-full flex-col", className)}
    >
      {/* Flight stage — the pulled book opens here, hovering over the shelf. */}
      <div className="relative z-20 w-full" style={{ height: STAGE_HEIGHT }}>
        <AnimatePresence mode="wait" initial={false}>
          {openRow !== null && (
            <OpenSpread
              key={openRow.book.id}
              book={openRow.book}
              hue={openRow.hue}
              launchX={launchX}
              motionSafe={motionSafe}
              wantsChipFocusRef={wantsChipFocusRef}
              onClose={closeSpread}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="relative w-full">
        {/* The rank: spines stand side by side on the ledge. */}
        <div
          role="group"
          aria-label={ariaLabel}
          className="relative z-10 flex items-end justify-center px-4"
          style={{ gap: RANK_GAP }}
        >
          {rows.map((row, index) => {
            const lean =
              motionSafe &&
              tippedIndex >= 0 &&
              Math.abs(index - tippedIndex) === 1 &&
              row.book.id !== openId
                ? Math.sign(index - tippedIndex) * LEAN
                : 0;
            return (
              <ShelfSpine
                key={row.book.id}
                book={row.book}
                width={row.width}
                height={row.height}
                hue={row.hue}
                tipped={tipped === row.book.id}
                lean={lean}
                pulled={row.book.id === openId}
                motionSafe={motionSafe}
                onPull={pullOrShelve}
                onHover={hoverSpine}
                onFocusSpine={focusSpine}
                onBlurSpine={blurSpine}
              />
            );
          })}
        </div>

        {/* The ledge: surface plate, hairline-strong front lip, and the
            contact-shadow line the rank casts on it. */}
        <div
          aria-hidden
          className="relative h-3 w-full rounded-[2px] border border-hairline-strong bg-surface-1"
        >
          <div
            className="absolute inset-x-0.5 top-px h-[5px]"
            style={{
              background:
                "linear-gradient(180deg, oklch(0 0 0 / 0.26), transparent)",
            }}
          />
        </div>
      </div>

      <span aria-live="polite" role="status" className="sr-only">
        {openRow !== null ? `${openRow.book.title} open` : "Shelved"}
      </span>
    </div>
  );
}

type ShelfSpineProps = {
  book: ShelfBook;
  width: number;
  height: number;
  hue: number;
  tipped: boolean;
  /** Sympathetic rotation (degrees) while a neighbor is tipped. */
  lean: number;
  pulled: boolean;
  motionSafe: boolean;
  onPull: (id: string) => void;
  onHover: (id: string, hovering: boolean, pointerType: string) => void;
  onFocusSpine: (id: string) => void;
  onBlurSpine: (id: string) => void;
};

/**
 * One book in the rank. A single tip factor (motion value, animated on
 * `snap`) derives the hinge rotation, the forward shift, and the shelf-gap
 * shade behind the spine; pull flight and sympathetic lean ride declarative
 * channels on the same button. The slot itself never moves — while the book
 * is out it shows a dashed gap outline, and the invisible button keeps the
 * gap clickable to shelve the book again.
 */
function ShelfSpine({
  book,
  width,
  height,
  hue,
  tipped,
  lean,
  pulled,
  motionSafe,
  onPull,
  onHover,
  onFocusSpine,
  onBlurSpine,
}: ShelfSpineProps) {
  const tip = useMotionValue(0);
  const tipRotate = useTransform(tip, (v) => v * TIP_ROTATE);
  const tipShift = useTransform(tip, (v) => v * TIP_SHIFT);
  const gapShade = useTransform(tip, (v) => v * GAP_SHADE);

  // The tip factor springs toward 1 while browsed, 0 otherwise; reduced
  // motion pins it at rest. Controls stop on every re-run and unmount.
  React.useEffect(() => {
    const controls = animate(
      tip,
      motionSafe && tipped && !pulled ? 1 : 0,
      springs.snap,
    );
    return () => controls.stop();
  }, [tip, tipped, pulled, motionSafe]);

  return (
    <div
      className="relative min-w-4 shrink select-none"
      style={{
        width,
        height,
        perspective: perspectives.near,
        zIndex: tipped && !pulled ? 20 : undefined,
      }}
    >
      {/* Shelf-gap shade — revealed behind the spine as it tips, opacity
          derived from the tip factor. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-[3px]"
        style={{
          opacity: gapShade,
          background:
            "linear-gradient(90deg, oklch(0 0 0 / 0.5) 0%, oklch(0 0 0 / 0.14) 85%)",
        }}
      />

      {/* The vacated slot keeps a dashed gap outline while the book is out. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-[3px] border border-dashed border-hairline-strong"
        initial={false}
        animate={{ opacity: pulled ? 1 : 0 }}
        transition={{ duration: durations.fast, ease: easings.move }}
      />

      <motion.button
        type="button"
        data-spine-id={book.id}
        aria-expanded={pulled}
        onClick={() => onPull(book.id)}
        onPointerEnter={(event) => onHover(book.id, true, event.pointerType)}
        onPointerLeave={(event) => onHover(book.id, false, event.pointerType)}
        onFocus={() => onFocusSpine(book.id)}
        onBlur={() => onBlurSpine(book.id)}
        initial={false}
        animate={{
          rotate: lean,
          y: motionSafe && pulled ? PULL_RISE : 0,
          opacity: pulled ? 0 : 1,
        }}
        transition={
          motionSafe
            ? {
                ...springs.glide,
                rotate: springs.snap,
                opacity: {
                  duration: durations.fast,
                  ease: pulled ? easings.exit : easings.enter,
                },
              }
            : { duration: durations.fast }
        }
        style={{
          x: tipShift,
          rotateY: tipRotate,
          // Left-bottom origin: the y-axis hinge sits on the spine's left
          // edge; the tiny sympathetic lean pivots at the shelf line.
          transformOrigin: "0% 100%",
          background: `linear-gradient(180deg, oklch(0.78 0.06 ${hue}) 0%, oklch(0.68 0.075 ${hue}) 72%, oklch(0.6 0.08 ${hue}) 100%)`,
          boxShadow: `inset 1px 0 0 oklch(0.99 0.02 ${hue} / 0.4), inset -1px 0 0 oklch(0.32 0.05 ${hue} / 0.35)`,
        }}
        className={cn(
          "absolute inset-0 cursor-pointer overflow-hidden rounded-[3px] outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          // Reduced-motion browse: a flat highlight instead of a tip.
          !motionSafe && tipped && !pulled && "ring-2 ring-ring/70",
        )}
      >
        {/* Top and bottom binding bands. */}
        <span
          aria-hidden
          className="absolute inset-x-[3px] top-[7px] h-[3px] rounded-full"
          style={{ background: `oklch(0.48 0.07 ${hue} / 0.55)` }}
        />
        <span
          aria-hidden
          className="absolute inset-x-[3px] bottom-[9px] h-[3px] rounded-full"
          style={{ background: `oklch(0.48 0.07 ${hue} / 0.55)` }}
        />
        {/* Mono title reading up the spine. */}
        <span className="absolute inset-x-0 top-3.5 bottom-4 flex items-center justify-center overflow-hidden">
          <span
            className="font-mono text-[9px] font-medium tracking-[0.16em] whitespace-nowrap uppercase"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              color: `oklch(0.25 0.05 ${hue})`,
            }}
          >
            {book.title}
          </span>
        </span>
      </motion.button>
    </div>
  );
}

type OpenSpreadProps = {
  book: ShelfBook;
  hue: number;
  /** Horizontal launch origin, px from center — the pulled slot's direction. */
  launchX: number;
  motionSafe: boolean;
  wantsChipFocusRef: React.RefObject<boolean>;
  onClose: () => void;
};

/**
 * The pulled book, flown forward and opened flat: two cover boards sweep
 * apart from the gutter on `glide` (right a beat behind) while the pages
 * fade in beneath a mono header row with the CLOSE chip.
 */
function OpenSpread({
  book,
  hue,
  launchX,
  motionSafe,
  wantsChipFocusRef,
  onClose,
}: OpenSpreadProps) {
  const chipRef = React.useRef<HTMLButtonElement | null>(null);

  // Focus lands on the close chip once the spread mounts — a single cancelled
  // rAF, and only for opens the user drove (never on defaultOpen mounts or
  // external controlled writes).
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (!wantsChipFocusRef.current) return;
      wantsChipFocusRef.current = false;
      chipRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [wantsChipFocusRef]);

  return (
    <motion.section
      role="region"
      aria-label={book.title}
      initial={
        motionSafe
          ? { opacity: 0, x: launchX, y: LAUNCH_RISE, scaleX: 0.5, scaleY: 0.5 }
          : { opacity: 0 }
      }
      animate={
        motionSafe
          ? { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 }
          : { opacity: 1 }
      }
      exit={
        motionSafe
          ? {
              opacity: 0,
              y: 24,
              scaleX: 0.16,
              scaleY: 0.82,
              transition: exitFor(durations.base),
            }
          : { opacity: 0, transition: exitFor(durations.fast) }
      }
      transition={
        motionSafe
          ? {
              ...springs.glide,
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
      className="absolute inset-x-0 mx-auto w-full max-w-[420px] overflow-hidden rounded-3 border border-hairline-strong bg-surface-2"
      style={{
        bottom: -STAGE_OVERLAP,
        boxShadow: liftShadowCss(0.5),
        transformOrigin: "50% 85%",
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: `oklch(0.7 0.09 ${hue})` }}
          />
          <span className="truncate font-mono text-[10px] tracking-[0.14em] text-ink uppercase">
            {book.title}
          </span>
        </span>
        <button
          ref={chipRef}
          type="button"
          onClick={onClose}
          aria-label={`Close ${book.title}`}
          className={cn(
            "shrink-0 cursor-pointer rounded-full border border-hairline-strong px-2.5 py-0.5",
            "font-mono text-[9px] tracking-[0.14em] text-ink-2 outline-none",
            "hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          CLOSE
        </button>
      </header>

      <div className="relative min-h-24" style={{ perspective: perspectives.near }}>
        {/* Cover boards sweep open from the gutter — the right a beat late. */}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1/2 bg-surface-1"
          style={{
            transformOrigin: "100% 50%",
            backgroundImage:
              "linear-gradient(270deg, oklch(0 0 0 / 0.1), transparent 34%)",
          }}
          initial={motionSafe ? { rotateY: 30, scaleX: 0.55 } : false}
          animate={{ rotateY: 0, scaleX: 1 }}
          transition={motionSafe ? springs.glide : { duration: durations.fast }}
        />
        <motion.div
          aria-hidden
          className="absolute inset-y-0 right-0 w-1/2 bg-surface-1"
          style={{
            transformOrigin: "0% 50%",
            backgroundImage:
              "linear-gradient(90deg, oklch(0 0 0 / 0.1), transparent 34%)",
          }}
          initial={motionSafe ? { rotateY: -30, scaleX: 0.55 } : false}
          animate={{ rotateY: 0, scaleX: 1 }}
          transition={
            motionSafe
              ? { ...springs.glide, delay: BOARD_STAGGER }
              : { duration: durations.fast }
          }
        />
        {/* Center gutter hairline between the pages. */}
        <div
          aria-hidden
          className="absolute inset-y-2 left-1/2 w-0 -translate-x-1/2 border-l border-hairline"
        />
        <motion.div
          className="relative z-10 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: motionSafe ? durations.base : durations.fast,
            ease: easings.enter,
            delay: motionSafe ? 0.12 : 0,
          }}
        >
          {book.spread}
        </motion.div>
      </div>
    </motion.section>
  );
}
