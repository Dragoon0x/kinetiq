"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Check,
  ImagePlus,
  ImageUp,
  Link2,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
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
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type PlateScene = "coast" | "dune" | "room" | "night";

/** A picture drawn in code: the scene, its seed and its base hue. */
export type PlateArt = { scene: PlateScene; seed: number; hue: number };

export type PlateAsset = {
  id: string;
  /** The plate's title; also its accessible name. */
  name: string;
  /** The folder it lives in. */
  folder: string;
  /** Pixel size, shown under the picture. */
  width?: number;
  height?: number;
  /** A real image to show. Without it the plate is drawn from `art`. */
  src?: string;
  /** The drawn picture. @default derived from the id */
  art?: PlateArt;
  /** An upload still going, or one that failed. @default "ready" */
  status?: "ready" | "uploading" | "error";
  /** Upload progress, 0 to 1, while uploading. */
  progress?: number;
  /** Why the upload failed. */
  error?: string;
};

export type PlateFolder = { id: string; name: string };
export type PlateTab = "library" | "upload" | "link";
export type PlateBadgeStyle = "disc" | "tab" | "frame";
export type PlatePickerStatus = "ready" | "loading" | "error";

export type PlatePickerProps = {
  /** Every plate in the library. @default defaultPlateAssets (14 plates) */
  assets?: PlateAsset[];
  /** The folders, in order; "All" is added in front. @default defaultPlateFolders */
  folders?: PlateFolder[];
  /** Controlled folder id ("all" for every folder). */
  folder?: string;
  /** Initial folder when uncontrolled. @default "all" */
  defaultFolder?: string;
  /** Fires from the chip or key that changed the folder. */
  onFolderChange?: (folder: string) => void;
  /** Controlled selection: plate ids in the order they will be inserted. */
  selected?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultSelected?: string[];
  /** Fires from every pick, removal and reorder with the ids in order. */
  onSelect?: (ids: string[]) => void;
  /** How many plates may be chosen. @default 6 */
  max?: number;
  /** Uploads one file; call `report` with 0–1 as it goes. Resolve (optionally with fields to merge) or reject with the reason. @default a short simulated upload */
  onUpload?: (
    file: File,
    report: (progress: number) => void,
  ) => Promise<void | Partial<PlateAsset>>;
  /** An address was added from the Link tab. Reject to refuse it with a reason. */
  onLink?: (url: string) => void | Promise<void>;
  /** Insert was pressed, with the chosen plates in order. */
  onInsert?: (assets: PlateAsset[]) => void;
  /** Cancel was pressed (or Escape on the dialog). */
  onCancel?: () => void;
  /** Controlled tab. */
  tab?: PlateTab;
  /** Initial tab when uncontrolled. @default "library" */
  defaultTab?: PlateTab;
  /** Fires from the tab press or key that changed the tab. */
  onTabChange?: (tab: PlateTab) => void;
  /** Grid columns at full width; containers under 30rem always use two. @default 4 */
  columns?: number;
  /** The pick number: a disc on the corner, a folded corner tab, or a thick frame with the number in its corner. @default "disc" */
  badgeStyle?: PlateBadgeStyle;
  /** Badges, the selection ring, the tray's numbers and the tab indicator. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The dialog's heading. @default "Choose plates" */
  title?: string;
  /** A quiet line under the heading. @default "Fieldline · Issue 14, Tidelines" */
  subtitle?: string;
  /** What one plate is called, in counts and on the Insert button. @default { one: "plate", other: "plates" } */
  itemLabel?: { one: string; other: string };
  /** Dialog height in px; the grid scrolls inside it. @default 540 */
  height?: number;
  /** Whether the library has loaded. @default "ready" */
  status?: PlatePickerStatus;
  /** Try again was pressed after the library failed to load. */
  onReload?: () => void;
  /** Trap Tab inside the dialog and mark it modal; pass it when you render it in an overlay. @default false */
  modal?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string's hash, unsigned, for art drawn from an id or an address. */
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const SCENES: PlateScene[] = ["coast", "dune", "room", "night"];

const artFor = (key: string): PlateArt => {
  const h = hashOf(key);
  return {
    scene: SCENES[h % SCENES.length] ?? "coast",
    seed: h % 100000,
    hue: (h >>> 8) % 360,
  };
};

export const defaultPlateFolders: PlateFolder[] = [
  { id: "coast", name: "Coastline" },
  { id: "rooms", name: "Interiors" },
  { id: "night", name: "Night" },
  { id: "drafts", name: "Drafts" },
];

const plate = (
  id: string,
  name: string,
  folder: string,
  scene: PlateScene,
  seed: number,
  hue: number,
  width = 2400,
  height = 1800,
): PlateAsset => ({
  id,
  name,
  folder,
  width,
  height,
  art: { scene, seed, hue },
});

/**
 * The picture desk's library for Fieldline's issue 14: coastline, interiors
 * and night plates, all drawn in code, one upload that failed, and an empty
 * Drafts folder.
 */
export const defaultPlateAssets: PlateAsset[] = [
  plate("kelp-bed", "Kelp bed, north cove", "coast", "coast", 141, 196),
  plate("salt-flat", "Salt flat at dusk", "coast", "dune", 77, 42),
  plate(
    "breakwater",
    "Breakwater, low tide",
    "coast",
    "coast",
    908,
    210,
    3000,
    2250,
  ),
  plate("gull-rock", "Gull rock", "coast", "coast", 4411, 168),
  plate("dune-grass", "Dune grass", "coast", "dune", 1312, 70),
  plate("estuary", "Estuary mouth", "coast", "coast", 2271, 150, 2048, 1536),
  {
    id: "harbour-wall",
    name: "Harbour wall (raw)",
    folder: "coast",
    status: "error",
    error: "The file is over 20 MB",
    art: { scene: "coast", seed: 51, hue: 205 },
  },
  plate("net-loft", "Net loft", "rooms", "room", 330, 32),
  plate("ferry-cafe", "Ferry café", "rooms", "room", 1784, 18),
  plate("tide-office", "Tide office", "rooms", "room", 662, 210),
  plate("boat-shed", "Boat shed", "rooms", "room", 2950, 92, 1800, 1350),
  plate("lighthouse", "Lighthouse beam", "night", "night", 404, 258),
  plate("pier-lamps", "Pier lamps", "night", "night", 1190, 236),
  plate(
    "ebb-stars",
    "Ebb under stars",
    "night",
    "night",
    3707,
    272,
    3200,
    2400,
  ),
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

const SLOT = 60; // tray thumb (52) + gap (8)
const THUMB_W = 52;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const ordinal = (n: number) => {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
};

const countOf = (n: number, label: { one: string; other: string }) =>
  `${n} ${n === 1 ? label.one : label.other}`;

const reasonOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : "The upload did not finish";

/** "harbour_fog-02.jpg" → "Harbour fog 02". */
const titleOf = (raw: string) => {
  const t = raw
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const sizeOf = (a: PlateAsset) =>
  a.width && a.height ? `${a.width} × ${a.height}` : null;

const ok = (oklch: [number, number, number]) =>
  `oklch(${r2(oklch[0])} ${r2(oklch[1])} ${Math.round(((oklch[2] % 360) + 360) % 360)})`;

/** A soft ridge across the plate: five seeded points joined by curves. */
function ridge(rand: () => number, base: number, amp: number): string {
  const pts = [0, 40, 80, 120, 160].map(
    (x) => [x, Math.round(base + (rand() - 0.5) * amp)] as const,
  );
  const first = pts[0] ?? [0, base];
  let d = `M0 ${first[1]}`;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] ?? first;
    const b = pts[i] ?? first;
    d += ` Q${a[0]} ${a[1]} ${(a[0] + b[0]) / 2} ${r1((a[1] + b[1]) / 2)}`;
  }
  const last = pts[pts.length - 1] ?? first;
  return `${d} T160 ${last[1]} V120 H0 Z`;
}

/**
 * A plate drawn in code: a seeded scene in pigment colours at fixed
 * lightness, so it looks the same on a light page and a dark one, and the
 * server draws exactly what the browser does.
 */
function PlateArtwork({ art }: { art: PlateArt }) {
  const raw = React.useId();
  const id = `pp${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const rand = mulberry32(art.seed);
  const h = art.hue;
  let body: React.ReactNode;
  let sky: [string, string];
  if (art.scene === "dune") {
    sky = [ok([0.86, 0.05, h + 190]), ok([0.94, 0.05, h + 20])];
    const sx = Math.round(30 + rand() * 100);
    body = (
      <>
        <circle cx={sx} cy={56} r={13} fill={ok([0.92, 0.11, h + 10])} />
        <path d={ridge(rand, 66, 22)} fill={ok([0.8, 0.08, h])} />
        <path d={ridge(rand, 84, 18)} fill={ok([0.71, 0.09, h - 8])} />
        <path d={ridge(rand, 102, 14)} fill={ok([0.61, 0.09, h - 16])} />
      </>
    );
  } else if (art.scene === "room") {
    sky = [ok([0.87, 0.02, h]), ok([0.84, 0.025, h + 10])];
    const wx = Math.round(18 + rand() * 70);
    const tx = Math.round(12 + rand() * 90);
    const wall = ok([0.86, 0.02, h]);
    body = (
      <>
        <rect
          x={wx}
          y={16}
          width={58}
          height={54}
          fill={ok([0.92, 0.05, 225])}
        />
        <path
          d={`M${wx} 70 L${wx + 58} 70 L${wx + 84} 120 L${wx - 14} 120 Z`}
          fill={ok([0.97, 0.03, 85])}
          opacity={0.35}
        />
        <path
          d={`M${wx + 29} 16 V70 M${wx} 43 H${wx + 58}`}
          stroke={wall}
          strokeWidth={3}
        />
        <rect
          x={0}
          y={88}
          width={160}
          height={32}
          fill={ok([0.6, 0.05, h + 24])}
        />
        <rect
          x={tx}
          y={76}
          width={44}
          height={6}
          rx={1}
          fill={ok([0.42, 0.04, h + 30])}
        />
        <path
          d={`M${tx + 4} 82 V96 M${tx + 40} 82 V96`}
          stroke={ok([0.42, 0.04, h + 30])}
          strokeWidth={2}
        />
        <path
          d={`M${tx + 22} 0 V54`}
          stroke={ok([0.5, 0.02, h])}
          strokeWidth={0.8}
        />
        <circle cx={tx + 22} cy={60} r={6} fill={ok([0.93, 0.12, 85])} />
      </>
    );
  } else if (art.scene === "night") {
    sky = [ok([0.27, 0.06, h]), ok([0.4, 0.07, h + 24])];
    const mx = Math.round(30 + rand() * 100);
    const stars = Array.from({ length: 16 }, () => ({
      x: Math.round(rand() * 160),
      y: Math.round(rand() * 62),
      r: r1(0.5 + rand() * 0.8),
    }));
    body = (
      <>
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={ok([0.95, 0.02, h])}
          />
        ))}
        <circle cx={mx} cy={30} r={9} fill={ok([0.94, 0.03, 90])} />
        <circle cx={mx + 4} cy={27} r={8} fill={ok([0.3, 0.06, h])} />
        <rect x={0} y={78} width={160} height={42} fill={ok([0.22, 0.05, h])} />
        <path
          d={`M${mx - 3} 82 H${mx + 3} M${mx - 6} 90 H${mx + 5} M${mx - 2} 99 H${mx + 4} M${mx - 7} 109 H${mx + 6}`}
          stroke={ok([0.9, 0.04, 90])}
          strokeWidth={1.4}
          opacity={0.55}
        />
        <path d={ridge(rand, 76, 8)} fill={ok([0.17, 0.03, h])} opacity={0.9} />
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={i}
            cx={Math.round(12 + i * 38 + rand() * 20)}
            cy={Math.round(74 + rand() * 3)}
            r={0.9}
            fill={ok([0.88, 0.13, 80])}
          />
        ))}
      </>
    );
  } else {
    // Three coasts from one scene: a headland under the sun, a rock stack
    // with gulls, or a breakwater running out at low tide.
    const kind = art.seed % 3;
    const horizon = 66 + Math.round(rand() * 10);
    sky = [ok([0.88, 0.04, h]), ok([0.95, 0.03, h + 40])];
    const sx = Math.round(24 + rand() * 110);
    const sea = 205 + Math.round(rand() * 35);
    const rock = ok([0.38, 0.03, h + 150]);
    const rx = Math.round(30 + rand() * 90);
    body = (
      <>
        <circle
          cx={sx}
          cy={Math.round(22 + rand() * 18)}
          r={kind === 2 ? 13 : 10}
          fill={ok([0.97, 0.05, h + 60])}
        />
        {kind !== 1 ? (
          <path
            d={ridge(rand, horizon - 8, 22)}
            fill={ok([0.68, 0.05, h + 120])}
          />
        ) : null}
        <rect
          x={0}
          y={horizon}
          width={160}
          height={120 - horizon}
          fill={ok([0.6, 0.08, sea])}
        />
        <path
          d={`M${Math.round(rand() * 40)} ${horizon + 8} h34 M${Math.round(60 + rand() * 50)} ${horizon + 15} h40 M${Math.round(rand() * 70)} ${horizon + 24} h28`}
          stroke={ok([0.8, 0.05, sea])}
          strokeWidth={0.9}
          strokeLinecap="round"
        />
        {kind === 1 ? (
          <>
            <path
              d={`M${rx - 12} ${horizon + 22} L${rx - 9} ${horizon - 14} L${rx - 2} ${horizon - 22} L${rx + 6} ${horizon - 16} L${rx + 11} ${horizon + 22} Z`}
              fill={rock}
            />
            <path
              d={`M${rx + 18} 24 l3 2 l3 -2 M${rx + 30} 32 l2.5 1.6 l2.5 -1.6 M${rx - 26} 30 l2.5 1.6 l2.5 -1.6`}
              stroke={ok([0.3, 0.02, h])}
              strokeWidth={0.9}
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : kind === 2 ? (
          <>
            <path
              d={`M0 ${horizon + 20} L${rx + 30} ${horizon + 12} L${rx + 30} ${horizon + 15} L0 ${horizon + 25} Z`}
              fill={rock}
            />
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x={Math.round(8 + i * ((rx + 18) / 4))}
                y={horizon + 6 + Math.round(i * -1.5)}
                width={1.6}
                height={9}
                fill={rock}
              />
            ))}
          </>
        ) : null}
        <path d={ridge(rand, 106, 12)} fill={ok([0.8, 0.06, 78])} />
      </>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 block size-full"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width={160} height={120} fill={`url(#${id}-sky)`} />
      {body}
    </svg>
  );
}

function Picture({ asset }: { asset: PlateAsset }) {
  if (asset.src) {
    return (
      // A host image or a local object URL: plain img, sized by its frame.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.src}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-cover"
      />
    );
  }
  return <PlateArtwork art={asset.art ?? artFor(asset.id)} />;
}

/** A number whose digit rolls toward the direction it moved, on snap. */
function Rolling({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const [last, setLast] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (last !== value) {
    setDir(value > last ? 1 : -1);
    setLast(value);
  }
  const text = String(value);
  return (
    <span
      className={cn(
        "relative inline-flex overflow-clip tabular-nums",
        className,
      )}
      style={{
        width: `${text.length}ch`,
        height: "1.25em",
        lineHeight: "1.25em",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block w-full text-center"
          variants={{
            enter: (d: number) => ({
              opacity: 0,
              y: motionSafe ? `${d * 70}%` : 0,
            }),
            shown: { opacity: 1, y: "0%" },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? `${-d * 70}%` : 0,
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
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** The pick number on a tile, in the chosen style. Lands on recoil. */
function Badge({
  n,
  style,
  motionSafe,
}: {
  n: number;
  style: PlateBadgeStyle;
  motionSafe: boolean;
}) {
  const shape =
    style === "disc"
      ? "top-1.5 right-1.5 h-6 min-w-6 rounded-full px-1 shadow-[0_2px_6px_color-mix(in_oklab,black_22%,transparent)] ring-2 ring-white/90"
      : style === "tab"
        ? "top-0 left-0 h-6 min-w-7 rounded-br-3 px-1.5"
        : "bottom-0 left-0 h-6 min-w-6 rounded-tr-2 px-1";
  const origin =
    style === "disc" ? "100% 0%" : style === "tab" ? "0% 0%" : "0% 100%";
  return (
    <motion.span
      aria-hidden
      className={cn(
        "absolute z-[2] inline-flex items-center justify-center bg-(--pp-fill) font-mono text-[11px] font-semibold text-white",
        shape,
      )}
      style={{ transformOrigin: origin }}
      initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.6 : 1,
        transition: exitFor(durations.fast),
      }}
      transition={
        motionSafe
          ? { scale: springs.recoil, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      <Rolling value={n} motionSafe={motionSafe} />
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The tray                                 */
/* ----------------------------------------------------------------------- */

type TrayThumbProps = {
  asset: PlateAsset;
  index: number;
  count: number;
  shift: number;
  flying: boolean;
  dragging: boolean;
  release: { n: number; velocity: number } | null;
  motionSafe: boolean;
  disabled: boolean;
  focusKey: string;
  hintId: string;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, dx: number) => void;
  onDragEnd: (id: string, velocity: number) => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => void;
};

/**
 * One chosen plate in the tray. Its place is carried by a motion value off
 * its slot: neighbours glide aside while another is dragged across them, and
 * when the order commits every thumb re-bases its offset by the slots it moved
 * in the DOM before paint, then glides (or, for the dropped one, snaps with
 * the release velocity) home.
 */
function TrayThumb({
  asset,
  index,
  count,
  shift,
  flying,
  dragging,
  release,
  motionSafe,
  disabled,
  focusKey,
  hintId,
  register,
  onDragStart,
  onDragMove,
  onDragEnd,
  onKey,
}: TrayThumbProps) {
  const x = useMotionValue(0);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const [placed, setPlaced] = React.useState(index);

  // The DOM order changed: keep the thumb where it was on screen, then glide
  // it to where it now belongs. Before paint, so it never blinks.
  React.useLayoutEffect(() => {
    if (placed === index) return;
    const moved = index - placed;
    run.current?.stop();
    x.jump(r2(x.get() - moved * SLOT));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the slot this offset is measured from; read only by the next re-base
    setPlaced(index);
    if (dragging) return;
    if (!motionSafe) x.jump(shift);
    else run.current = animate(x, shift, springs.glide);
  }, [index, placed, x, dragging, motionSafe, shift]);

  // Neighbours make room for a dragged thumb; everyone rests at zero.
  React.useEffect(() => {
    if (dragging) return;
    run.current?.stop();
    if (!motionSafe) {
      x.jump(shift);
      return;
    }
    run.current = animate(x, shift, springs.glide);
    return () => run.current?.stop();
  }, [shift, dragging, motionSafe, x]);

  // The drop: home on snap, carrying the throw.
  React.useEffect(() => {
    if (!release) return;
    run.current?.stop();
    if (!motionSafe) {
      x.jump(0);
      return;
    }
    run.current = animate(x, 0, {
      ...springs.snap,
      velocity: release.velocity,
    });
    return () => run.current?.stop();
  }, [release, motionSafe, x]);

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      run.current?.stop();
      onDragStart(asset.id);
    },
    onMove: ({ offset }) => {
      const lo = -index * SLOT;
      const hi = (count - 1 - index) * SLOT;
      const raw = offset.x;
      const v =
        raw < lo
          ? lo + rubberband(raw - lo, SLOT * 2)
          : raw > hi
            ? hi + rubberband(raw - hi, SLOT * 2)
            : raw;
      x.set(r2(v));
      onDragMove(asset.id, v);
    },
    onEnd: ({ velocity }) => onDragEnd(asset.id, velocity.x),
    onCancel: () => onDragEnd(asset.id, 0),
  });

  const name = `${asset.name}, ${ordinal(index + 1)} of ${count}`;

  return (
    <motion.li
      className="relative shrink-0"
      style={{ x, zIndex: dragging ? 3 : 1 }}
    >
      <button
        ref={(node) => register(asset.id, node)}
        type="button"
        data-focus-key={focusKey}
        aria-label={name}
        aria-describedby={hintId}
        onKeyDown={(event) => onKey(event, asset.id)}
        {...drag}
        className={cn(
          "relative block h-[39px] touch-pan-y overflow-clip rounded-2 bg-surface-2 select-none",
          dragging
            ? "cursor-grabbing shadow-[0_8px_18px_color-mix(in_oklab,black_24%,transparent)]"
            : "cursor-grab shadow-[0_0_0_1px_var(--hairline-strong)]",
          "transition-shadow duration-150",
          flying ? "opacity-0" : "opacity-100",
          FOCUS_RING,
        )}
        style={{ width: THUMB_W }}
      >
        <Picture asset={asset} />
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-[5px] bg-(--pp-fill) px-0.5 font-mono text-[10px] leading-none font-semibold text-white"
        >
          <Rolling value={index + 1} motionSafe={motionSafe} />
        </span>
      </button>
    </motion.li>
  );
}

/**
 * The copy of a picture that flies from its tile into its tray slot on glide.
 * It measures both boxes in its layout effect — after the slot exists, before
 * paint — and animates a transform from the tile's box onto the slot's.
 */
function Flight({
  asset,
  from,
  to,
  host,
  onDone,
}: {
  asset: PlateAsset;
  from: () => HTMLElement | undefined;
  to: () => HTMLElement | undefined;
  host: () => HTMLElement | null;
  onDone: () => void;
}) {
  const left = useMotionValue(0);
  const top = useMotionValue(0);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(0);
  // The boxes are read once, when the flight starts.
  const reads = React.useRef({ from, to, host, onDone });
  React.useEffect(() => {
    reads.current = { from, to, host, onDone };
  });

  React.useLayoutEffect(() => {
    const { from: getA, to: getB, host: getRoot } = reads.current;
    const a = getA();
    const b = getB();
    const root = getRoot();
    if (!a || !b || !root) {
      reads.current.onDone();
      return;
    }
    const scroller = b.closest("ol");
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    left.jump(r2(rb.left - rr.left));
    top.jump(r2(rb.top - rr.top));
    x.jump(r2(ra.left - rb.left));
    y.jump(r2(ra.top - rb.top));
    scale.jump(r2(ra.width / Math.max(1, rb.width)));
    opacity.jump(1);
    const runs = [
      animate(x, 0, springs.glide),
      animate(y, 0, springs.glide),
      animate(scale, 1, {
        ...springs.glide,
        onComplete: () => reads.current.onDone(),
      }),
    ];
    // A re-run (StrictMode) stops this flight; the next run starts it again.
    return () => {
      for (const r of runs) r.stop();
    };
  }, [left, top, x, y, scale, opacity]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-30 overflow-clip rounded-2 shadow-[0_10px_24px_color-mix(in_oklab,black_22%,transparent)]"
      style={{
        left,
        top,
        width: THUMB_W,
        height: 39,
        x,
        y,
        scale,
        opacity,
        transformOrigin: "0% 0%",
      }}
    >
      <Picture asset={asset} />
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The dialog                                */
/* ----------------------------------------------------------------------- */

type Upload = {
  id: string;
  file: File;
  url: string | null;
  name: string;
  folder: string;
  progress: number;
  status: "uploading" | "error" | "ready";
  error?: string;
  width?: number;
  height?: number;
  merge?: Partial<PlateAsset>;
};

type Linked = { asset: PlateAsset };

const TABS: { id: PlateTab; label: string; icon: typeof ImagePlus }[] = [
  { id: "library", label: "Library", icon: ImagePlus },
  { id: "upload", label: "Upload", icon: ImageUp },
  { id: "link", label: "Link", icon: Link2 },
];

/**
 * An asset picker for choosing several images in order. Picking a plate
 * lands a numbered badge on it on recoil while a copy of the picture flies
 * from the tile into its slot in the tray at the foot on glide; dropping #2
 * makes every later badge roll its digit down on snap while the tray closes
 * the gap on glide. The tray reorders by drag — the thumb follows the finger
 * 1:1, neighbours glide aside, the drop snaps home with the release velocity —
 * and the badges in the grid renumber to match.
 *
 * Tabs switch between the library (folder chips over a grid of plates drawn
 * in code), uploads (a drop zone over a real file input; each file becomes a
 * tile whose veil lifts as its progress rises, and a refused one is marked
 * with its reason, Retry and Remove) and links (an address that becomes a
 * linked plate; nothing is fetched). An empty folder invites an upload.
 *
 * It is a `role="dialog"`: the tabs are a tablist, folders a radiogroup, the
 * grid a multiselectable `role="grid"` with one roving cell (arrows, Home/End,
 * Space or Enter to pick), and the tray a list whose thumbs move with Shift
 * and an arrow and leave with Delete. Under reduced motion nothing flies or
 * bounces; badges and thumbs cross-fade, reorders settle at once, and every
 * number still changes.
 */
export function PlatePicker({
  assets = defaultPlateAssets,
  folders = defaultPlateFolders,
  folder,
  defaultFolder = "all",
  onFolderChange,
  selected,
  defaultSelected,
  onSelect,
  max = 6,
  onUpload,
  onLink,
  onInsert,
  onCancel,
  tab,
  defaultTab = "library",
  onTabChange,
  columns = 4,
  badgeStyle = "disc",
  accent = "var(--accent-bright)",
  title = "Choose plates",
  subtitle = "Fieldline · Issue 14, Tidelines",
  itemLabel = { one: "plate", other: "plates" },
  height = 540,
  status = "ready",
  onReload,
  modal = false,
  disabled = false,
  className,
}: PlatePickerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const gridHint = `${uid}-grid-hint`;
  const trayHint = `${uid}-tray-hint`;
  const ready = status === "ready";
  const cols = clamp(Math.round(columns), 2, 8);
  const limit = Math.max(1, Math.round(max));

  /* ------------------------------- state -------------------------------- */

  const [ownTab, setOwnTab] = React.useState<PlateTab>(defaultTab);
  const tabNow = tab ?? ownTab;
  const [ownFolder, setOwnFolder] = React.useState(defaultFolder);
  const folderNow = folder ?? ownFolder;
  const [ownSelected, setOwnSelected] = React.useState<string[]>(
    () => defaultSelected ?? [],
  );
  const chosen = selected ?? ownSelected;

  const [uploads, setUploads] = React.useState<Upload[]>([]);
  const [linked, setLinked] = React.useState<Linked[]>([]);
  const [uploadFolder, setUploadFolder] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  /** Every plate: the host's, the visitor's uploads, and linked ones. */
  const all = React.useMemo<PlateAsset[]>(() => {
    const ups: PlateAsset[] = uploads.map((u) => ({
      id: u.id,
      name: u.name,
      folder: u.folder,
      width: u.width,
      height: u.height,
      src: u.url ?? undefined,
      art: artFor(u.id),
      status: u.status,
      progress: u.progress,
      error: u.error,
      ...(u.merge ?? {}),
    }));
    return [...ups, ...linked.map((l) => l.asset), ...assets];
  }, [assets, uploads, linked]);
  const byId = React.useMemo(() => new Map(all.map((a) => [a.id, a])), [all]);
  const order = chosen.filter((id) => byId.has(id));
  const orderSet = new Set(order);
  const shown =
    folderNow === "all" ? all : all.filter((a) => a.folder === folderNow);
  const folderName = (id: string) =>
    id === "all"
      ? "All plates"
      : (folders.find((f) => f.id === id)?.name ?? id);

  /* ------------------------------ selection ----------------------------- */

  const commit = (ids: string[]) => {
    if (selected === undefined) setOwnSelected(ids);
    onSelect?.(ids);
  };

  const [flights, setFlights] = React.useState<{ key: number; id: string }[]>(
    [],
  );
  const flightKey = React.useRef(0);
  const flying = new Set(flights.map((f) => f.id));

  const toggle = (asset: PlateAsset) => {
    if (disabled || !ready) return;
    if ((asset.status ?? "ready") !== "ready") return;
    if (orderSet.has(asset.id)) {
      const next = order.filter((id) => id !== asset.id);
      commit(next);
      say(`${asset.name} removed. ${countOf(next.length, itemLabel)} chosen.`);
      return;
    }
    if (order.length >= limit) {
      say(`You can choose up to ${countOf(limit, itemLabel)}.`);
      return;
    }
    const next = [...order, asset.id];
    commit(next);
    if (motionSafe) {
      flightKey.current += 1;
      const key = flightKey.current;
      setFlights((f) => [...f, { key, id: asset.id }]);
    }
    say(`${asset.name} chosen, ${ordinal(next.length)} of ${next.length}.`);
  };

  const removeAt = (id: string, refocus: boolean) => {
    const at = order.indexOf(id);
    if (at < 0) return;
    const next = order.filter((x) => x !== id);
    commit(next);
    say(
      `${byId.get(id)?.name ?? "Plate"} removed. ${countOf(next.length, itemLabel)} chosen.`,
    );
    if (refocus) {
      const to = next[Math.min(at, next.length - 1)];
      focusAsk.current = to ? `thumb:${to}` : "grid";
    }
  };

  const move = (id: string, to: number) => {
    const from = order.indexOf(id);
    const dest = clamp(to, 0, order.length - 1);
    if (from < 0 || dest === from) return false;
    const next = [...order];
    next.splice(from, 1);
    next.splice(dest, 0, id);
    commit(next);
    say(`${byId.get(id)?.name ?? "Plate"} moved to ${ordinal(dest + 1)}.`);
    return true;
  };

  /* -------------------------------- drag -------------------------------- */

  const [drag, setDrag] = React.useState<{
    id: string;
    from: number;
    to: number;
  } | null>(null);
  const [release, setRelease] = React.useState<{
    id: string;
    n: number;
    velocity: number;
  } | null>(null);

  const onDragStart = (id: string) => {
    const from = order.indexOf(id);
    if (from < 0) return;
    setDrag({ id, from, to: from });
  };
  const onDragMove = (id: string, dx: number) => {
    setDrag((d) => {
      if (!d || d.id !== id) return d;
      const to = clamp(Math.round(d.from + dx / SLOT), 0, order.length - 1);
      return to === d.to ? d : { ...d, to };
    });
  };
  const onDragEnd = (id: string, velocity: number) => {
    const d = drag;
    setDrag(null);
    if (!d || d.id !== id) return;
    if (d.to !== d.from) move(id, d.to);
    setRelease((r) => ({ id, n: (r?.n ?? 0) + 1, velocity }));
  };

  const shiftOf = (id: string, i: number) => {
    if (!drag || drag.id === id) return 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -SLOT;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return SLOT;
    return 0;
  };

  /* ------------------------------- focus -------------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRoot(node);
  }, []);
  const tileNodes = React.useRef(new Map<string, HTMLElement>());
  const artNodes = React.useRef(new Map<string, HTMLElement>());
  const thumbNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const focusAsk = React.useRef<string | null>(null);

  const registerThumb = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) thumbNodes.current.set(id, node);
      else thumbNodes.current.delete(id);
    },
    [],
  );

  // Focus asked for by a handler is placed once its target has rendered.
  React.useEffect(() => {
    const want = focusAsk.current;
    if (!want) return;
    focusAsk.current = null;
    if (want === "grid") {
      rootRef.current
        ?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')
        ?.focus();
      return;
    }
    if (want.startsWith("thumb:")) {
      thumbNodes.current.get(want.slice(6))?.focus();
      return;
    }
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(want)}"]`)
      ?.focus();
  });

  /* ------------------------------- columns ------------------------------ */

  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (!root) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setNarrow(w > 0 && w < 480);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);
  const colsNow = narrow ? 2 : cols;

  /* -------------------------------- grid -------------------------------- */

  const [active, setActive] = React.useState(0);
  const activeIdx = clamp(active, 0, Math.max(0, shown.length - 1));

  const focusTile = (i: number) => {
    const to = clamp(i, 0, shown.length - 1);
    const a = shown[to];
    if (!a) return;
    setActive(to);
    tileNodes.current.get(a.id)?.focus();
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const from = event.target as HTMLElement;
    if (from.getAttribute("role") !== "gridcell") return;
    const i = activeIdx;
    const c = colsNow;
    const rowStart = i - (i % c);
    const mod = event.ctrlKey || event.metaKey;
    const moves: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + c,
      ArrowUp: i - c,
      Home: mod ? 0 : rowStart,
      End: mod
        ? shown.length - 1
        : Math.min(shown.length - 1, rowStart + c - 1),
    };
    const to = moves[event.key];
    if (to !== undefined) {
      event.preventDefault();
      focusTile(to);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const a = shown[i];
      if (a) toggle(a);
    }
  };

  /* -------------------------------- tray -------------------------------- */

  const onThumbKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const at = order.indexOf(id);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const d = event.key === "ArrowRight" ? 1 : -1;
      if (event.shiftKey || event.altKey) {
        if (move(id, at + d)) focusAsk.current = `thumb:${id}`;
      } else {
        const to = order[clamp(at + d, 0, order.length - 1)];
        if (to) thumbNodes.current.get(to)?.focus();
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const to = event.key === "Home" ? 0 : order.length - 1;
      if (event.shiftKey) {
        if (move(id, to)) focusAsk.current = `thumb:${id}`;
      } else {
        const t = order[to];
        if (t) thumbNodes.current.get(t)?.focus();
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeAt(id, true);
    }
  };

  /* ------------------------------- uploads ------------------------------ */

  const upCount = React.useRef(0);
  const timers = React.useRef(new Set<number>());
  const urls = React.useRef(new Set<string>());
  const alive = React.useRef(false);
  React.useEffect(() => {
    alive.current = true;
    const t = timers.current;
    const u = urls.current;
    return () => {
      alive.current = false;
      for (const id of t) window.clearTimeout(id);
      t.clear();
      for (const url of u) URL.revokeObjectURL(url);
      u.clear();
    };
  }, []);

  const patchUpload = (id: string, patch: Partial<Upload>) => {
    if (!alive.current) return;
    setUploads((list) =>
      list.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    );
  };

  const simulate = (report: (p: number) => void) =>
    new Promise<void>((resolve) => {
      let p = 0;
      const step = () => {
        p = Math.min(1, p + 0.12 + ((p * 7) % 1) * 0.05);
        report(p);
        if (p >= 1) {
          resolve();
          return;
        }
        const t = window.setTimeout(() => {
          timers.current.delete(t);
          step();
        }, 160);
        timers.current.add(t);
      };
      step();
    });

  const sendUpload = (u: Upload) => {
    const report = (p: number) =>
      patchUpload(u.id, { progress: clamp(Number(p) || 0, 0, 1) });
    let job: Promise<void | Partial<PlateAsset>>;
    try {
      job = onUpload
        ? Promise.resolve(onUpload(u.file, report))
        : simulate(report);
    } catch (error) {
      job = Promise.reject(error);
    }
    job.then(
      (merge) => {
        patchUpload(u.id, {
          status: "ready",
          progress: 1,
          merge: merge ?? undefined,
        });
        if (alive.current) say(`${u.name} uploaded.`);
      },
      (error: unknown) => {
        patchUpload(u.id, { status: "error", error: reasonOf(error) });
        if (alive.current) say(`${u.name} did not upload: ${reasonOf(error)}.`);
      },
    );
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || disabled) return;
    const list = Array.from(files).filter(
      (f) => f.type === "" || f.type.startsWith("image/"),
    );
    if (list.length === 0) {
      say("Only images can be added.");
      return;
    }
    const target =
      uploadFolder ??
      (folderNow !== "all"
        ? folderNow
        : (folders[folders.length - 1]?.id ?? "drafts"));
    const made: Upload[] = list.map((file) => {
      upCount.current += 1;
      const id = `${idBase}-up${upCount.current}`;
      let url: string | null = null;
      try {
        url = URL.createObjectURL(file);
        urls.current.add(url);
      } catch {
        url = null;
      }
      return {
        id,
        file,
        url,
        name: titleOf(file.name) || "Untitled plate",
        folder: target,
        progress: 0,
        status: "uploading",
      };
    });
    setUploads((u) => [...made, ...u]);
    for (const u of made) {
      if (u.url) {
        const img = new Image();
        img.onload = () =>
          patchUpload(u.id, {
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        img.src = u.url;
      }
      sendUpload(u);
    }
    goTab("library", false);
    goFolder(target, false);
    setUploadFolder(null);
    say(
      `Uploading ${countOf(made.length, itemLabel)} to ${folderName(target)}.`,
    );
  };

  const retryUpload = (id: string) => {
    const u = uploads.find((x) => x.id === id);
    if (!u) return;
    const fresh: Upload = {
      ...u,
      status: "uploading",
      progress: 0,
      error: undefined,
    };
    patchUpload(id, { status: "uploading", progress: 0, error: undefined });
    say(`Uploading ${u.name} again.`);
    sendUpload(fresh);
  };

  const removeUpload = (id: string) => {
    const u = uploads.find((x) => x.id === id);
    if (u?.url) {
      URL.revokeObjectURL(u.url);
      urls.current.delete(u.url);
    }
    setUploads((list) => list.filter((x) => x.id !== id));
    if (orderSet.has(id)) commit(order.filter((x) => x !== id));
    focusAsk.current = "grid";
    say(`${u?.name ?? "Upload"} removed.`);
  };

  const [over, setOver] = React.useState(false);

  /* -------------------------------- link -------------------------------- */

  const [address, setAddress] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [linking, setLinking] = React.useState(false);

  const addLink = async () => {
    if (disabled || linking) return;
    const text = address.trim();
    let url: URL | null = null;
    try {
      url = new URL(text);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:") {
      setLinkError("Use a full address that starts with https://");
      return;
    }
    if (order.length >= limit) {
      setLinkError(`You can choose up to ${countOf(limit, itemLabel)}.`);
      return;
    }
    setLinking(true);
    try {
      await onLink?.(text);
    } catch (error) {
      setLinking(false);
      setLinkError(reasonOf(error));
      return;
    }
    setLinking(false);
    const last = url.pathname.split("/").filter(Boolean).pop() ?? url.hostname;
    let file = last;
    try {
      file = decodeURIComponent(last);
    } catch {
      // A malformed escape: the raw segment still names the plate.
    }
    const name = titleOf(file) || url.hostname;
    const target =
      folderNow !== "all"
        ? folderNow
        : (folders[folders.length - 1]?.id ?? "drafts");
    const asset: PlateAsset = {
      id: `${idBase}-ln${hashOf(text)}`,
      name,
      folder: target,
      art: artFor(text),
    };
    if (!byId.has(asset.id)) setLinked((l) => [{ asset }, ...l]);
    if (!orderSet.has(asset.id)) commit([...order, asset.id]);
    setAddress("");
    setLinkError(null);
    say(`${asset.name} linked and chosen, ${ordinal(order.length + 1)}.`);
    goTab("library", false);
    goFolder(target, false);
  };

  /* --------------------------- tabs and folders ------------------------- */

  const goTab = (t: PlateTab, focus: boolean) => {
    if (tab === undefined) setOwnTab(t);
    if (t !== tabNow) onTabChange?.(t);
    if (focus) focusAsk.current = `tab:${t}`;
  };
  const goFolder = (f: string, focus: boolean) => {
    if (folder === undefined) setOwnFolder(f);
    if (f !== folderNow) onFolderChange?.(f);
    setActive(0);
    if (focus) focusAsk.current = `folder:${f}`;
  };

  const onTabsKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === tabNow);
    const map: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowLeft: at - 1,
      Home: 0,
      End: TABS.length - 1,
    };
    const to = map[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const t = TABS[(to + TABS.length) % TABS.length];
    if (t) goTab(t.id, true);
  };

  const folderList = [{ id: "all", name: "All" }, ...folders];
  const onFoldersKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = folderList.findIndex((f) => f.id === folderNow);
    const map: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowDown: at + 1,
      ArrowLeft: at - 1,
      ArrowUp: at - 1,
      Home: 0,
      End: folderList.length - 1,
    };
    const to = map[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const f = folderList[(to + folderList.length) % folderList.length];
    if (f) goFolder(f.id, true);
  };

  /* ------------------------------- insert ------------------------------- */

  const [inserted, setInserted] = React.useState(0);
  const insertTimer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(insertTimer.current), []);
  const insert = () => {
    if (disabled || order.length === 0) return;
    const list = order
      .map((id) => byId.get(id))
      .filter((a): a is PlateAsset => a !== undefined);
    onInsert?.(list);
    setInserted((n) => n + 1);
    window.clearTimeout(insertTimer.current);
    insertTimer.current = window.setTimeout(() => setInserted(0), 1600);
    say(`Inserted ${countOf(list.length, itemLabel)}.`);
  };

  /* -------------------------------- keys -------------------------------- */

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (drag) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel?.();
      return;
    }
    if (modal && event.key === "Tab" && root) {
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not([type="file"]), select, [tabindex="0"]',
        ),
      ).filter((el) => el.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  /* ------------------------------- render ------------------------------- */

  const fill = `oklch(from ${accent} 0.58 0.15 h)`;
  const tween = { duration: durations.base, ease: easings.enter };
  const step = cascade(Math.max(1, shown.length));

  const tile = (asset: PlateAsset, i: number) => {
    const pick = order.indexOf(asset.id);
    const isPicked = pick >= 0;
    const st = asset.status ?? "ready";
    const full = !isPicked && order.length >= limit;
    const blocked = st !== "ready" || full;
    const size = sizeOf(asset);
    const label = [
      asset.name,
      size ? size.replace("×", "by") : null,
      st === "uploading"
        ? `uploading, ${Math.round((asset.progress ?? 0) * 100)} percent`
        : st === "error"
          ? `upload failed: ${asset.error ?? "unknown reason"}`
          : isPicked
            ? `chosen ${ordinal(pick + 1)}`
            : full
              ? "the limit is reached"
              : null,
    ]
      .filter(Boolean)
      .join(", ");
    const frame = badgeStyle === "frame";
    return (
      <motion.div
        key={asset.id}
        ref={(node: HTMLDivElement | null) => {
          if (node) tileNodes.current.set(asset.id, node);
          else tileNodes.current.delete(asset.id);
        }}
        role="gridcell"
        aria-selected={isPicked}
        aria-disabled={blocked || disabled || undefined}
        aria-label={label}
        tabIndex={i === activeIdx ? 0 : -1}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setActive(i);
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          setActive(i);
          toggle(asset);
        }}
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          opacity: { ...tween, delay: Math.min(i, 12) * step },
          y: motionSafe
            ? { ...springs.glide, delay: Math.min(i, 12) * step }
            : { duration: 0 },
        }}
        className={cn(
          "group/plate-tile relative flex min-w-0 flex-col gap-1.5 rounded-3 p-1 select-none",
          blocked && st === "ready" ? "cursor-not-allowed" : "cursor-pointer",
          FOCUS_RING,
        )}
      >
        <div
          ref={(node) => {
            if (node) artNodes.current.set(asset.id, node);
            else artNodes.current.delete(asset.id);
          }}
          className={cn(
            "relative aspect-[4/3] overflow-clip rounded-2 bg-surface-2 transition-[box-shadow,opacity,filter] duration-200",
            isPicked
              ? frame
                ? "shadow-[0_0_0_3px_var(--pp-accent)]"
                : "shadow-[0_0_0_2px_var(--pp-accent)]"
              : st === "error"
                ? "shadow-[0_0_0_1.5px_color-mix(in_oklab,var(--danger)_70%,transparent)]"
                : "shadow-[0_0_0_1px_var(--hairline)] group-hover/plate-tile:shadow-[0_0_0_1px_var(--hairline-strong)]",
            full && "opacity-45 saturate-50",
          )}
        >
          <Picture asset={asset} />
          {st === "uploading" ? (
            <UploadVeil
              progress={asset.progress ?? 0}
              motionSafe={motionSafe}
            />
          ) : null}
          {st === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[color-mix(in_oklab,var(--card)_84%,transparent)] p-2 text-center">
              <TriangleAlert
                aria-hidden
                className="size-4 shrink-0 text-danger"
              />
              <span className="line-clamp-2 text-[11px] leading-4 text-danger">
                {asset.error ?? "Upload failed"}
              </span>
              {uploads.some((u) => u.id === asset.id) ? (
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Retry ${asset.name}`}
                    onClick={() => retryUpload(asset.id)}
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-2 border border-hairline bg-card text-foreground hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${asset.name}`}
                    onClick={() => removeUpload(asset.id)}
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-2 border border-hairline bg-card text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                </span>
              ) : null}
            </div>
          ) : null}
          {st === "ready" && !isPicked && badgeStyle === "disc" && !full ? (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-6 rounded-full border-2 border-white/90 bg-[color-mix(in_oklab,black_12%,transparent)] opacity-0 transition-opacity duration-150 group-hover/plate-tile:opacity-100 group-focus-visible/plate-tile:opacity-100"
            />
          ) : null}
          <AnimatePresence initial={false}>
            {isPicked ? (
              <Badge
                key="badge"
                n={pick + 1}
                style={badgeStyle}
                motionSafe={motionSafe}
              />
            ) : null}
          </AnimatePresence>
        </div>
        <div className="flex min-w-0 items-baseline justify-between gap-2 px-0.5">
          <span
            className="min-w-0 truncate text-[12px] font-medium text-foreground"
            title={asset.name}
          >
            {asset.name}
          </span>
          {size ? (
            <span className="hidden shrink-0 font-mono text-[10px] text-ink-3 tabular-nums @min-[36rem]/plate-picker:inline">
              {asset.width}×{asset.height}
            </span>
          ) : null}
        </div>
      </motion.div>
    );
  };

  const rows: PlateAsset[][] = [];
  for (let i = 0; i < shown.length; i += colsNow) {
    rows.push(shown.slice(i, i + colsNow));
  }

  const library = (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="relative shrink-0">
        <div
          role="radiogroup"
          aria-label="Folder"
          onKeyDown={onFoldersKey}
          className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 py-2.5 [contain:inline-size] @min-[30rem]/plate-picker:px-5"
        >
          {folderList.map((f) => {
            const on = f.id === folderNow;
            const n =
              f.id === "all"
                ? all.length
                : all.filter((a) => a.folder === f.id).length;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-focus-key={`folder:${f.id}`}
                onClick={() => goFolder(f.id, false)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors",
                  on
                    ? "border-(--pp-accent) bg-[color-mix(in_oklab,var(--pp-accent)_12%,transparent)] text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {f.name}
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-popover to-transparent @min-[36rem]/plate-picker:hidden"
        />
      </div>
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 pt-1 pb-3 @min-[30rem]/plate-picker:px-4">
        {status === "loading" ? (
          <div
            aria-busy="true"
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${colsNow}, minmax(0, 1fr))`,
            }}
          >
            <span className="sr-only">Loading the library.</span>
            {Array.from({ length: colsNow * 2 }, (_, i) => (
              <div key={i} aria-hidden className="flex flex-col gap-1.5 p-1">
                <span className="aspect-[4/3] rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                <span className="h-2.5 w-2/3 rounded-full bg-surface-2" />
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-[13px] text-foreground">
              The library did not load.
            </p>
            {onReload ? (
              <button
                type="button"
                onClick={onReload}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <svg
              aria-hidden
              viewBox="0 0 96 64"
              className="h-16 w-24 text-ink-3"
            >
              <rect
                x="14"
                y="10"
                width="68"
                height="46"
                rx="5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <path
                d="M24 46 L40 30 L52 40 L60 34 L72 46"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                opacity="0.6"
              />
              <circle
                cx="64"
                cy="22"
                r="4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.6"
              />
            </svg>
            <p className="text-[13px] text-foreground">
              Nothing in {folderName(folderNow)} yet.
            </p>
            <p className="max-w-64 text-[12px] text-ink-3">
              Drop plates here from your desktop, or upload them into this
              folder.
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setUploadFolder(folderNow === "all" ? null : folderNow);
                goTab("upload", false);
                focusAsk.current = "choose";
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <ImageUp aria-hidden className="size-3.5" />
              Upload {itemLabel.other}
            </button>
          </div>
        ) : (
          <div
            role="grid"
            aria-multiselectable
            aria-label={`${folderName(folderNow)}, ${countOf(shown.length, itemLabel)}`}
            aria-describedby={gridHint}
            onKeyDown={onGridKeyDown}
            className="grid gap-1.5 @min-[30rem]/plate-picker:gap-2"
            style={{
              gridTemplateColumns: `repeat(${colsNow}, minmax(0, 1fr))`,
            }}
          >
            {rows.map((row, ri) => (
              <div key={ri} role="row" className="contents">
                {row.map((a, ci) => tile(a, ri * colsNow + ci))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const uploadPanel = (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 @min-[30rem]/plate-picker:p-5">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!over) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-3 rounded-3 border border-dashed p-6 text-center transition-colors",
          over
            ? "border-(--pp-accent) bg-[color-mix(in_oklab,var(--pp-accent)_8%,transparent)]"
            : "border-hairline-strong bg-surface-1",
        )}
      >
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--pp-accent)_12%,transparent)] text-(--pp-accent)"
        >
          <ImageUp className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-foreground">
            Drop {itemLabel.other} here
          </p>
          <p className="text-[12px] text-ink-3">
            PNG or JPEG, up to 20 MB each
          </p>
        </div>
        <label
          className={cn(
            "relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-2 bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring focus-within:outline-solid hover:opacity-90",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          Choose files
          <input
            type="file"
            data-focus-key="choose"
            aria-label={`Choose ${itemLabel.other} to upload`}
            accept="image/*"
            multiple
            disabled={disabled}
            onChange={(event) => {
              const files = event.currentTarget.files;
              const list = files ? Array.from(files) : [];
              event.currentTarget.value = "";
              addFiles(list);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
        Upload into
        <select
          value={
            uploadFolder ??
            (folderNow !== "all"
              ? folderNow
              : (folders[folders.length - 1]?.id ?? ""))
          }
          onChange={(event) => {
            const value = event.currentTarget.value;
            setUploadFolder(value);
          }}
          className={cn(
            "h-8 rounded-2 border border-hairline bg-card px-2 text-[13px] text-foreground",
            FOCUS_RING,
          )}
        >
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const linkPanel = (
    <form
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 @min-[30rem]/plate-picker:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void addLink();
      }}
    >
      <label
        htmlFor={`${uid}-url`}
        className="text-[13px] font-medium text-foreground"
      >
        Image address
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`${uid}-url`}
          type="url"
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          placeholder="https://"
          value={address}
          disabled={disabled}
          aria-invalid={linkError ? true : undefined}
          aria-describedby={linkError ? `${uid}-url-error` : `${uid}-url-note`}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setAddress(value);
            if (linkError) setLinkError(null);
          }}
          className={cn(
            "h-9 min-w-0 flex-1 basis-48 rounded-2 border bg-card px-3 text-[13px] text-foreground placeholder:text-ink-3",
            linkError ? "border-danger" : "border-hairline-strong",
            FOCUS_RING,
          )}
        />
        <button
          type="submit"
          aria-disabled={disabled || linking || !address.trim() || undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity aria-disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          <Link2 aria-hidden className="size-3.5" />
          {linking ? "Adding" : "Add plate"}
        </button>
      </div>
      {linkError ? (
        <p id={`${uid}-url-error`} className="text-[12px] text-danger">
          {linkError}
        </p>
      ) : (
        <p id={`${uid}-url-note`} className="text-[12px] text-ink-3">
          Linked plates are fetched when the issue is laid out. Nothing loads
          here.
        </p>
      )}
    </form>
  );

  const remaining = limit - order.length;
  const button =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3.5 text-[13px] font-medium transition-[background-color,color,opacity]";

  return (
    <div
      ref={bindRoot}
      role="dialog"
      aria-modal={modal || undefined}
      aria-labelledby={titleId}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container/plate-picker relative isolate flex w-full flex-col overflow-clip rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_48px_color-mix(in_oklab,black_16%,transparent)]",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          height,
          "--pp-accent": accent,
          "--pp-fill": fill,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4 @min-[30rem]/plate-picker:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] leading-6 font-semibold">
            {title}
          </h2>
          <p className="truncate text-[12px] text-ink-3" title={subtitle}>
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => onCancel?.()}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>

      <div
        role="tablist"
        aria-label="Source"
        onKeyDown={onTabsKey}
        className="flex shrink-0 gap-1 border-b border-hairline px-3 pt-2 @min-[30rem]/plate-picker:px-4"
      >
        {TABS.map((t) => {
          const on = t.id === tabNow;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              id={`${uid}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              data-focus-key={`tab:${t.id}`}
              onClick={() => goTab(t.id, false)}
              className={cn(
                "relative inline-flex h-9 items-center gap-1.5 rounded-t-2 px-2.5 text-[13px] transition-colors",
                on
                  ? "font-medium text-foreground"
                  : "text-ink-2 hover:text-foreground",
                FOCUS_IN,
              )}
            >
              <Icon aria-hidden className="size-3.5 shrink-0" />
              {t.label}
              {on ? (
                <motion.span
                  layoutId={`${uid}-tab`}
                  aria-hidden
                  className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-(--pp-accent)"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <p id={gridHint} className="sr-only">
        Arrow keys move between plates, Home and End to the ends of a row. Space
        or Enter chooses a plate or puts it back.
      </p>
      <p id={trayHint} className="sr-only">
        Left and Right move between chosen plates. Shift with Left or Right
        moves the plate, Delete removes it.
      </p>

      <div className="relative grid flex-1 overflow-hidden [grid-template-areas:'panel']">
        <AnimatePresence initial={false}>
          <motion.div
            key={tabNow}
            id={`${uid}-panel-${tabNow}`}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${tabNow}`}
            className="flex flex-col overflow-hidden [grid-area:panel]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={tween}
          >
            {tabNow === "library"
              ? library
              : tabNow === "upload"
                ? uploadPanel
                : linkPanel}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-hairline bg-surface-1 px-4 py-2.5 @min-[30rem]/plate-picker:px-5">
        <div className="flex w-14 shrink-0 flex-col @min-[30rem]/plate-picker:w-20">
          <span className="text-[11px] text-ink-3">Order</span>
          <span className="inline-flex items-baseline gap-1 text-[12px] text-foreground">
            <Rolling
              value={order.length}
              motionSafe={motionSafe}
              className="font-mono"
            />
            <span className="text-ink-3">of {limit}</span>
          </span>
        </div>
        <div className="relative min-w-0 flex-1">
          {order.length === 0 ? (
            <p className="flex h-[39px] items-center text-[12px] text-ink-3">
              Choose {itemLabel.other} in the order they run.
            </p>
          ) : (
            <ol
              role="list"
              aria-label={`Chosen ${itemLabel.other}, in order`}
              className="flex h-[47px] [scrollbar-width:none] items-center gap-2 overflow-x-auto px-1 [contain:inline-size]"
            >
              {order.map((id, i) => {
                const a = byId.get(id);
                if (!a) return null;
                return (
                  <TrayThumb
                    key={id}
                    asset={a}
                    index={i}
                    count={order.length}
                    shift={shiftOf(id, i)}
                    flying={flying.has(id)}
                    dragging={drag?.id === id}
                    release={release?.id === id ? release : null}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    focusKey={`thumb:${id}`}
                    hintId={trayHint}
                    register={registerThumb}
                    onDragStart={onDragStart}
                    onDragMove={onDragMove}
                    onDragEnd={onDragEnd}
                    onKey={onThumbKey}
                  />
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline px-4 py-3 @min-[30rem]/plate-picker:px-5">
        <p className="mr-auto hidden text-[12px] text-ink-3 @min-[30rem]/plate-picker:block">
          {remaining > 0
            ? `${countOf(remaining, itemLabel)} left to choose`
            : "That's the limit"}
        </p>
        <button
          type="button"
          onClick={() => onCancel?.()}
          className={cn(
            button,
            "border border-hairline bg-card text-foreground hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={insert}
          aria-disabled={disabled || order.length === 0 || undefined}
          className={cn(
            button,
            "min-w-32 bg-primary text-primary-foreground hover:opacity-90 aria-disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          {inserted > 0 ? (
            <>
              <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
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
              Inserted
            </>
          ) : (
            <>
              <Check aria-hidden className="size-3.5" />
              Insert {order.length > 0 ? `${order.length} ` : ""}
              {order.length === 1 ? itemLabel.one : itemLabel.other}
            </>
          )}
        </button>
      </footer>

      {flights.map((f) => {
        const a = byId.get(f.id);
        if (!a) return null;
        return (
          <Flight
            key={f.key}
            asset={a}
            from={() => artNodes.current.get(f.id)}
            to={() => thumbNodes.current.get(f.id)}
            host={() => rootRef.current}
            onDone={() =>
              setFlights((list) => list.filter((x) => x.key !== f.key))
            }
          />
        );
      })}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** The veil over an uploading plate lifts from the bottom as progress rises. */
function UploadVeil({
  progress,
  motionSafe,
}: {
  progress: number;
  motionSafe: boolean;
}) {
  const p = clamp(progress, 0, 1);
  const lift = useMotionValue(p);
  const veil = useTransform(lift, (v) => r2(1 - v));
  React.useEffect(() => {
    if (!motionSafe) {
      lift.jump(p);
      return;
    }
    const c = animate(lift, p, springs.glide);
    return () => c.stop();
  }, [p, motionSafe, lift]);
  return (
    <>
      <motion.span
        aria-hidden
        className="absolute inset-0 origin-top bg-[color-mix(in_oklab,var(--card)_72%,transparent)]"
        style={{ scaleY: veil }}
      />
      <span
        aria-hidden
        className="absolute inset-x-2 bottom-2 h-1 overflow-clip rounded-full bg-[color-mix(in_oklab,var(--card)_70%,transparent)]"
      >
        <motion.span
          className="absolute inset-0 origin-left rounded-full bg-(--pp-accent)"
          style={{ scaleX: lift }}
        />
      </span>
      <span
        aria-hidden
        className="absolute top-1.5 left-1.5 rounded-1 bg-[color-mix(in_oklab,var(--card)_86%,transparent)] px-1 font-mono text-[10px] text-foreground tabular-nums"
      >
        {Math.round(p * 100)}%
      </span>
    </>
  );
}
