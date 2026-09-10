"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LocationDelivery = "sent" | "delivered" | "read";

export type LocationPlace = {
  id: string;
  /** Own cards sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  /** The place, named in every sentence. */
  name: string;
  /** One line under the name. */
  address: string;
  /** Any integer; the streets are drawn from it, so a place keeps its map. */
  seed: number;
  /** Distance from the reader, in metres. */
  metres: number;
  /** Printed under the card, already formatted. */
  time?: string;
  /** Read for own cards only. @default "sent" */
  delivery?: LocationDelivery;
};

export type LocationPinProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  places: LocationPlace[];
  /** Controlled id of the expanded card. */
  openId?: string | null;
  /** Initial expanded card for uncontrolled usage. @default null */
  defaultOpenId?: string | null;
  /** Fires from the press or key that expands or collapses a card. */
  onOpenChange?: (id: string | null) => void;
  /** Fires from the expanded card's Open control, so the host can take the place. */
  onOpenPlace?: (id: string) => void;
  /** How far the map grows when a card expands. @default 1.9 */
  zoom?: number;
  /** Formats the distance chip. @default metres under a kilometre, one decimal above */
  format?: (metres: number) => string;
  /** Names the other side in sentences. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

/** The map's own units; every drawn coordinate lives inside this box, whose
 *  2:1 shape matches the card's picture frame so nothing letterboxes. */
const MAP_W = 120;
const MAP_H = 60;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** For controls flush with a clipped card's edge: an offset ring would be cut
 *  off by the card's own `overflow-hidden`, so those draw theirs inside. */
const focusRingInset =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * A 32-bit integer hash. No trigonometry, so the drawn street grid is identical
 * on the server and in the browser and the card hydrates against its own markup.
 */
const hash = (a: number, b: number): number => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  x = x ^ (x >>> 13);
  x = Math.imul(x, 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Every number that reaches an attribute or a motion value is rounded first. */
const round3 = (value: number): number => Number(value.toFixed(3));

type Plan = {
  roads: { x: number; y: number; w: number; h: number }[];
  lanes: { x: number; y: number; w: number; h: number }[];
  blocks: { x: number; y: number; w: number; h: number }[];
  park: { x: number; y: number; w: number; h: number };
  water: string;
  pin: { x: number; y: number };
};

/**
 * The street plan, drawn from the seed: two majors each way, a run of lanes
 * between them, blocks in the gaps, one park and one water bend. Roads are
 * rects rather than strokes so their ends stay square where they meet.
 */
const planFor = (seed: number): Plan => {
  const vx = [round3(20 + hash(seed, 1) * 12), round3(70 + hash(seed, 2) * 16)];
  const hy = [round3(12 + hash(seed, 3) * 6), round3(34 + hash(seed, 4) * 8)];

  const roads = [
    { x: vx[0] ?? 26, y: 0, w: 5, h: MAP_H },
    { x: vx[1] ?? 78, y: 0, w: 5, h: MAP_H },
    { x: 0, y: hy[0] ?? 15, w: MAP_W, h: 5 },
    { x: 0, y: hy[1] ?? 38, w: MAP_W, h: 5 },
  ];

  const lanes = Array.from({ length: 5 }, (_, i) => {
    const vertical = i % 2 === 0;
    const at = round3(6 + hash(seed, i + 11) * (vertical ? 106 : 46));
    return vertical
      ? { x: at, y: 0, w: 2, h: MAP_H }
      : { x: 0, y: at, w: MAP_W, h: 2 };
  });

  const blocks = Array.from({ length: 8 }, (_, i) => {
    const w = round3(9 + hash(seed, i + 21) * 12);
    const h = round3(6 + hash(seed, i + 31) * 7);
    return {
      x: round3(4 + hash(seed, i + 41) * (MAP_W - w - 8)),
      y: round3(3 + hash(seed, i + 51) * (MAP_H - h - 6)),
      w,
      h,
    };
  });

  const park = {
    x: round3(6 + hash(seed, 61) * 18),
    y: round3(6 + hash(seed, 62) * 8),
    w: round3(22 + hash(seed, 63) * 14),
    h: round3(9 + hash(seed, 64) * 5),
  };

  const wy = round3(46 + hash(seed, 71) * 7);
  const water = `M0 ${round3(wy + 6)} L${round3(MAP_W * 0.35)} ${wy} L${round3(MAP_W * 0.7)} ${round3(wy + 5)} L${MAP_W} ${round3(wy - 2)}`;

  return {
    roads,
    lanes,
    blocks,
    park,
    water,
    pin: {
      x: round3(42 + hash(seed, 81) * 34),
      y: round3(20 + hash(seed, 82) * 14),
    },
  };
};

/** An invented reading, stable per seed; no real place is named or located. */
const coordsFor = (seed: number): string => {
  const lat = round3(41 + hash(seed, 91) * 9);
  const lon = round3(hash(seed, 92) * 6);
  return `${lat.toFixed(3)} N · ${lon.toFixed(3)} W`;
};

const defaultFormat = (metres: number): string =>
  metres < 1000
    ? `${Math.round(metres)} m`
    : `${(Math.round(metres / 100) / 10).toFixed(1)} km`;

const distanceWords = (metres: number): string =>
  metres < 1000
    ? `${Math.round(metres)} metres`
    : `${(Math.round(metres / 100) / 10).toFixed(1)} kilometres`;

const deliverySentence = (delivery: LocationDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

/** A teardrop and its eye: one static path, so nothing interpolates a `d`. */
const PIN =
  "M0 0c-3.6-5.4-5.6-8.6-5.6-11.4a5.6 5.6 0 0 1 11.2 0C5.6-8.6 3.6-5.4 0 0z";
const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";
const CHEVRON = "M4 6.5 8 10.5 12 6.5";

type MapDrawingProps = {
  seed: number;
  open: boolean;
  zoom: number;
  motionSafe: boolean;
};

/**
 * The map. Everything but the pin lives in one group that scales toward the
 * pin's point on `glide`, so expanding grows the streets around the place
 * rather than sliding the picture; the lanes come up out of the wash at the
 * larger zoom because that is what more room buys you.
 */
function MapDrawing({ seed, open, zoom, motionSafe }: MapDrawingProps) {
  const plan = React.useMemo(() => planFor(seed), [seed]);
  const z = open ? zoom : 1;
  // Origin sits at the group's top-left, so the pin is held still by hand:
  // a point p lands at (1 - z)·pin + z·p, which is p itself when p is the pin.
  const shift = {
    x: round3((1 - z) * plan.pin.x),
    y: round3((1 - z) * plan.pin.y),
  };
  const grow = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      aria-hidden
      className="absolute inset-0 size-full"
    >
      <motion.g
        style={{ originX: 0, originY: 0 }}
        initial={false}
        animate={{ scale: z, x: shift.x, y: shift.y }}
        transition={grow}
      >
        <rect
          x={0}
          y={0}
          width={MAP_W}
          height={MAP_H}
          className="text-ink"
          fill="currentColor"
          fillOpacity={0.1}
        />
        <rect
          x={plan.park.x}
          y={plan.park.y}
          width={plan.park.w}
          height={plan.park.h}
          rx={2}
          className="text-success"
          fill="currentColor"
          fillOpacity={0.3}
        />
        <path
          d={plan.water}
          className="text-cobalt-bright"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={7}
          strokeLinecap="round"
        />
        {plan.blocks.map((block, index) => (
          <rect
            key={index}
            x={block.x}
            y={block.y}
            width={block.w}
            height={block.h}
            rx={1}
            className="text-ink"
            fill="currentColor"
            fillOpacity={0.16}
          />
        ))}
        {/* Roads take the page's own background colour, so the plan reads the
            same way in both themes without a single fixed hex. */}
        <motion.g
          className="text-background"
          initial={false}
          animate={{ opacity: open ? 1 : 0.55 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {plan.lanes.map((lane, index) => (
            <rect
              key={index}
              x={lane.x}
              y={lane.y}
              width={lane.w}
              height={lane.h}
              fill="currentColor"
            />
          ))}
        </motion.g>
        {plan.roads.map((road, index) => (
          <rect
            key={index}
            x={road.x}
            y={road.y}
            width={road.w}
            height={road.h}
            className="text-background"
            fill="currentColor"
          />
        ))}
      </motion.g>

      {/* The pin sits outside the zoom, so it keeps its size while the streets
          grow under it — and the drop is the one beat here worth bouncing. */}
      <g transform={`translate(${plan.pin.x} ${plan.pin.y})`}>
        <motion.ellipse
          cx={0}
          cy={1}
          rx={4}
          ry={1.6}
          className="text-ink"
          fill="currentColor"
          fillOpacity={0.25}
          style={{ originX: 0.5, originY: 0.5 }}
          initial={motionSafe ? { scale: 0.4, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { ...springs.recoil, opacity: { duration: durations.fast } }
              : { duration: 0 }
          }
        />
        <motion.g
          initial={
            motionSafe
              ? // The shift, in the map's own units: half of it, because the
                // map draws at roughly twice its coordinate scale.
                { y: -distances.shift * 0.5, opacity: 0 }
              : false
          }
          animate={{ y: 0, opacity: 1 }}
          transition={
            motionSafe
              ? { ...springs.recoil, opacity: { duration: durations.fast } }
              : { duration: 0 }
          }
        >
          <path d={PIN} className="text-danger" fill="currentColor" />
          <circle
            cx={0}
            cy={-11.4}
            r={2}
            className="text-background"
            fill="currentColor"
          />
        </motion.g>
      </g>
    </svg>
  );
}

type PlaceCardProps = {
  place: LocationPlace;
  open: boolean;
  zoom: number;
  format: (metres: number) => string;
  motionSafe: boolean;
  peerName: string;
  onToggle: (place: LocationPlace, open: boolean) => void;
  onOpenPlace?: (id: string) => void;
};

/** One location card: the map, the name row, and the detail that opens in flow. */
function PlaceCard({
  place,
  open,
  zoom,
  format,
  motionSafe,
  peerName,
  onToggle,
  onOpenPlace,
}: PlaceCardProps) {
  const detailId = React.useId();
  const toggleRef = React.useRef<HTMLButtonElement | null>(null);
  // setState from useState is a stable function, so using it as the ref
  // callback binds the observer when the node arrives without re-attaching.
  const [detailNode, setDetailNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [detailHeight, setDetailHeight] = React.useState(0);

  React.useEffect(() => {
    if (!detailNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setDetailHeight(
        Math.round(box ? box.blockSize : detailNode.offsetHeight),
      );
    });
    observer.observe(detailNode);
    return () => observer.disconnect();
  }, [detailNode]);

  const own = place.from === "me";
  const delivery = place.delivery ?? "sent";
  const grow = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  const escape = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    onToggle(place, false);
    toggleRef.current?.focus();
  };

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={{ duration: durations.base, ease: easings.enter }}
      className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "w-full max-w-[92%] overflow-hidden rounded-3 border border-hairline",
          own
            ? "rounded-br-1 bg-primary text-primary-foreground"
            : "rounded-bl-1 bg-surface-2 text-foreground",
        )}
      >
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          aria-label={`${own ? "Your location" : `Location from ${peerName}`}: ${place.name}, ${place.address}, ${distanceWords(place.metres)} away. ${open ? "Collapse the map." : "Expand the map."}`}
          onClick={() => onToggle(place, !open)}
          onKeyDown={escape}
          className={cn("block w-full text-left", focusRingInset)}
        >
          <span className="relative block aspect-[2/1] w-full overflow-hidden bg-surface-1">
            <MapDrawing
              seed={place.seed}
              open={open}
              zoom={zoom}
              motionSafe={motionSafe}
            />
          </span>
          <span className="flex items-center gap-2 px-2.5 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] leading-4 font-medium">
                {place.name}
              </span>
              <span className="truncate text-[11px] leading-4 opacity-70">
                {place.address}
              </span>
            </span>
            <span
              aria-hidden
              className="shrink-0 font-mono text-[10px] tabular-nums opacity-80"
            >
              {format(place.metres)}
            </span>
            <motion.svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0"
              initial={false}
              animate={{ rotate: motionSafe && open ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <path d={CHEVRON} />
            </motion.svg>
          </span>
        </button>

        {/* The detail opens in flow at a measured height: floating it over the
            card would cover whatever the host wrote under the thread. */}
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{ height: open ? detailHeight : 0 }}
          transition={grow}
        >
          <div
            ref={setDetailNode}
            id={detailId}
            inert={!open || undefined}
            onKeyDown={escape}
            className="flex flex-col gap-2 border-t border-current/15 px-2.5 py-2.5"
          >
            <span className="flex items-center justify-between gap-2 text-[11px]">
              <span className="opacity-70">Distance</span>
              <span className="font-mono tabular-nums">
                {format(place.metres)}
              </span>
            </span>
            <span className="flex items-center justify-between gap-2 text-[11px]">
              <span className="opacity-70">Reading</span>
              <span className="truncate font-mono tabular-nums">
                {coordsFor(place.seed)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onOpenPlace?.(place.id)}
              className={cn(
                "flex h-8 items-center justify-center rounded-2 bg-current/15 px-3 text-xs font-medium transition-colors hover:bg-current/25",
                focusRing,
              )}
            >
              Open in maps
            </button>
          </div>
        </motion.div>
      </div>

      <span className="flex items-center gap-1.5 px-1">
        {place.time ? (
          <span className="text-[11px] text-ink-3 tabular-nums">
            {place.time}
          </span>
        ) : null}
        {own ? (
          <span
            role="img"
            aria-label={deliverySentence(delivery, peerName)}
            className={cn(
              "inline-flex size-3.5 items-center justify-center",
              delivery === "read" ? "text-cobalt-bright" : "text-ink-3",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <path d={CHECK} />
              {delivery === "sent" ? null : <path d={CHECK_TRAIL} />}
            </svg>
          </span>
        ) : null}
      </span>
    </motion.li>
  );
}

/**
 * A place, sent as a card. The map is drawn rather than fetched: a seeded hash
 * lays out two major roads each way, the lanes between them, blocks, a park and
 * a water bend, all rounded before they reach an attribute. The pin drops as the
 * card arrives — the 16px shift, in the map's own units, landing on `recoil`,
 * ζ0.53, the two bounces of something arriving — while its shadow scales up on
 * the same spring.
 *
 * Pressing expands the card in flow: the street group scales toward the pin's
 * own point on `glide`, so the map grows around the place instead of sliding,
 * the lanes come up out of the wash, and the detail region animates to a
 * ResizeObserver-measured height inside the card's own box, because a panel
 * floated over the component would cover whatever the host wrote beneath it.
 *
 * The toggle is a `<button aria-expanded>` whose name is a sentence carrying the
 * place, the address and the distance; Escape collapses and leaves focus on the
 * toggle, and the detail is `inert` while closed so nothing hidden is tabbable.
 * Under reduced motion the pin appears at its point instead of dropping and the
 * height and zoom swap on a tween.
 */
export function LocationPin({
  ref,
  places,
  openId,
  defaultOpenId = null,
  onOpenChange,
  onOpenPlace,
  zoom = 1.9,
  format = defaultFormat,
  peerName = "Them",
  label,
  className,
}: LocationPinProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultOpenId,
  );
  const [say, setSay] = React.useState("");
  const current = openId === undefined ? uncontrolled : openId;

  const toggle = (place: LocationPlace, next: boolean) => {
    const value = next ? place.id : null;
    if (openId === undefined) setUncontrolled(value);
    onOpenChange?.(value);
    // The sentence is frozen at the change rather than read back from a prop.
    setSay(
      next
        ? `${place.name} expanded, ${distanceWords(place.metres)} away`
        : `${place.name} collapsed`,
    );
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-3">
        {places.map((place) => (
          <PlaceCard
            key={place.id}
            place={place}
            open={current === place.id}
            zoom={zoom}
            format={format}
            motionSafe={motionSafe}
            peerName={peerName}
            onToggle={toggle}
            onOpenPlace={onOpenPlace}
          />
        ))}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {say}
      </span>
    </div>
  );
}
