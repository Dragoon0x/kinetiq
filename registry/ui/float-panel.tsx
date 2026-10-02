"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  PictureInPicture2,
  SlidersHorizontal,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FloatPanelSide = "left" | "right";
export type FloatPanelCorner =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Where the panel is. A floating panel's `x` and `y` are shares (0 to 1) of
 * the room it can move in, so a place survives the container being resized.
 */
export type FloatPanelPlacement =
  | { mode: "float"; x: number; y: number; width: number }
  | { mode: "dock"; side: FloatPanelSide; width: number }
  | { mode: "pill"; corner: FloatPanelCorner };

export type FloatPanelProps = {
  /** The title bar's text, the pill's label and the panel's accessible name. @default "Inspector" */
  title?: string;
  /** 16px, drawn in currentColor: in the title bar and on the pill. @default a sliders icon */
  icon?: React.ReactNode;
  /** The inspector's body. */
  children?: React.ReactNode;
  /** What the panel floats over. @default a dotted canvas */
  workspace?: React.ReactNode;
  /** Controlled placement. */
  placement?: FloatPanelPlacement;
  /** Where it starts when uncontrolled (and nothing is remembered). @default floating top right, 280 px */
  defaultPlacement?: FloatPanelPlacement;
  /** Fires from the drag, key or button that moved, docked, collapsed or resized it. */
  onPlacementChange?: (placement: FloatPanelPlacement) => void;
  /** Remember the placement under this key in the browser's storage; each key keeps its own. */
  storageKey?: string;
  /** How close an edge has to come, in px, before the panel snaps flush to it. 0 turns the magnet off. @default 24 */
  magnet?: number;
  /** How close to a corner, in px, a drag has to come to collapse the panel into a pill there. 0 never collapses by drag. @default 64 */
  collapse?: number;
  /** Preset widths a resize springs to: a count spread evenly between min and max (0 resizes freely), or the widths in px. @default 3 */
  widths?: number | number[];
  /** Narrowest the panel can be, in px. @default 220 */
  minWidth?: number;
  /** Widest the panel can be, in px; the container caps it too. @default 380 */
  maxWidth?: number;
  /** How far one arrow key moves the panel, in px; Shift moves four times as far. @default 8 */
  nudge?: number;
  /** A docked panel takes its room from the workspace instead of covering it (when at least 240 px of workspace are left). @default true */
  reserve?: boolean;
  /** Shown on the pill after the title: a count, a dot. */
  badge?: React.ReactNode;
  /** The container's height: px or any CSS length. @default 440 */
  height?: number | string;
  /** The workspace's accessible name. @default "Workspace" */
  label?: string;
  /** The ghosts, guides, grip and readout; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the snaps and the landings. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  fold: number;
};

type Ctx = {
  W: number;
  H: number;
  /** The panel's natural height. */
  nat: number;
  pillW: number;
  lo: number;
  hi: number;
};

type Arm =
  | { kind: "dock"; side: FloatPanelSide }
  | { kind: "pill"; corner: FloatPanelCorner };

type Move = {
  kind: "move";
  pill: boolean;
  startX: number;
  startY: number;
  w: number;
  h: number;
  left: number;
  top: number;
  arm: Arm | null;
  snapX: number | null;
  snapY: number | null;
};

type Resize = {
  kind: "resize";
  edge: FloatPanelSide;
  w0: number;
  /** The edge that stays put. */
  fixed: number;
  nearest: number;
};

/** Inset of a floating panel and a pill from the container's edges. */
const M = 12;
const PILL_H = 36;
const HEAD = 36;
const DOCK_ZONE = 24;
const DOCK_PUSH = 20;
/** Workspace a dock must leave before it takes room rather than covering. */
const ROOM = 240;
const DEFAULT_FLOAT: FloatPanelPlacement = {
  mode: "float",
  x: 1,
  y: 0,
  width: 280,
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const keyOf = (p: FloatPanelPlacement) =>
  p.mode === "float"
    ? `float:${r3(p.x)}:${r3(p.y)}:${Math.round(p.width)}`
    : p.mode === "dock"
      ? `dock:${p.side}:${Math.round(p.width)}`
      : `pill:${p.corner}`;

const CORNERS: FloatPanelCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

function parsePlacement(raw: unknown): FloatPanelPlacement | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  if (p.mode === "float") {
    const x = num(p.x);
    const y = num(p.y);
    const width = num(p.width);
    return x === null || y === null || width === null
      ? null
      : { mode: "float", x: clamp01(x), y: clamp01(y), width };
  }
  if (p.mode === "dock") {
    const width = num(p.width);
    return (p.side === "left" || p.side === "right") && width !== null
      ? { mode: "dock", side: p.side, width }
      : null;
  }
  if (p.mode === "pill") {
    return CORNERS.includes(p.corner as FloatPanelCorner)
      ? { mode: "pill", corner: p.corner as FloatPanelCorner }
      : null;
  }
  return null;
}

type Stored = { p: FloatPanelPlacement; o: FloatPanelPlacement | null };

const STORE = "kinetiq-float-panel:";

function readStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const p = parsePlacement(data.p);
    if (!p) return null;
    const o = parsePlacement(data.o);
    return { p, o: o && o.mode !== "pill" ? o : null };
  } catch {
    return null;
  }
}

/** Placement remembered per key, read the same way on the server (none) and the client. */
function useStored(storageKey: string | undefined): Stored | null {
  const subscribe = React.useCallback((tell: () => void) => {
    if (typeof window === "undefined") return () => {};
    // Another tab that moves a panel under the same key moves this one.
    window.addEventListener("storage", tell);
    return () => window.removeEventListener("storage", tell);
  }, []);
  const raw = React.useSyncExternalStore(
    subscribe,
    () => {
      if (!storageKey) return null;
      try {
        return window.localStorage.getItem(STORE + storageKey);
      } catch {
        return null;
      }
    },
    () => null,
  );
  return React.useMemo(() => readStored(raw), [raw]);
}

function presetsOf(widths: number | number[], lo: number, hi: number) {
  if (Array.isArray(widths)) {
    const list = [
      ...new Set(widths.map((w) => Math.round(clamp(w, lo, hi)))),
    ].sort((a, b) => a - b);
    return list;
  }
  const n = Math.max(0, Math.round(widths));
  if (n === 0 || hi <= lo) return [];
  if (n === 1) return [Math.round((lo + hi) / 2 / 4) * 4];
  return Array.from({ length: n }, (_, i) => {
    const w = lo + ((hi - lo) * i) / (n - 1);
    return i === 0 || i === n - 1 ? Math.round(w) : Math.round(w / 4) * 4;
  });
}

function rectFor(p: FloatPanelPlacement, c: Ctx): Rect {
  if (p.mode === "dock") {
    const w = clamp(p.width, c.lo, c.hi);
    return {
      x: p.side === "left" ? 0 : r2(c.W - w),
      y: 0,
      w,
      h: c.H,
      r: 0,
      fold: 0,
    };
  }
  if (p.mode === "pill") {
    const w = Math.min(c.pillW, c.W - 2 * M);
    const left = p.corner.endsWith("left");
    const top = p.corner.startsWith("top");
    return {
      x: left ? M : r2(c.W - M - w),
      y: top ? M : r2(c.H - M - PILL_H),
      w,
      h: PILL_H,
      r: PILL_H / 2,
      fold: 1,
    };
  }
  const w = clamp(p.width, c.lo, c.hi);
  const h = Math.min(c.nat, c.H - 2 * M);
  return {
    x: r2(M + clamp01(p.x) * Math.max(0, c.W - 2 * M - w)),
    y: r2(M + clamp01(p.y) * Math.max(0, c.H - 2 * M - h)),
    w,
    h,
    r: 12,
    fold: 0,
  };
}

const share = (v: number, room: number) =>
  room <= 0 ? 0 : r3(clamp01((v - M) / room));

const cornerName = (c: FloatPanelCorner) => c.replace("-", " ");

const describe = (p: FloatPanelPlacement) =>
  p.mode === "dock"
    ? `Docked ${p.side}, ${Math.round(p.width)} px.`
    : p.mode === "pill"
      ? `Collapsed to the ${cornerName(p.corner)} corner.`
      : `Floating, ${Math.round(p.width)} px.`;

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const DOTS =
  "bg-[radial-gradient(var(--hairline-strong)_1px,transparent_1px)] bg-[size:16px_16px]";

type Gesture = Move | Resize;

type DragHandlers = ReturnType<typeof useDrag>;

/**
 * A grip is a few px wide and a title bar a few dozen tall, so the
 * pointer's first move can leave it before the drag has travelled far enough
 * to take capture — and then the drag never starts. Until it does, moves anywhere on the page are relayed to it; once it
 * has capture they arrive on the grip itself.
 */
function relayed(handlers: DragHandlers): DragHandlers {
  return {
    ...handlers,
    onPointerDown: (event) => {
      handlers.onPointerDown(event);
      const grip = event.currentTarget as Element;
      const id = event.pointerId;
      const away = (e: PointerEvent) =>
        e.pointerId === id &&
        !(e.target instanceof Node && grip.contains(e.target));
      const move = (e: PointerEvent) => {
        if (away(e)) handlers.onPointerMove(e as unknown as React.PointerEvent);
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        if (away(e)) handlers.onPointerUp(e as unknown as React.PointerEvent);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
  };
}

type Api = {
  place: (p: FloatPanelPlacement, how: "jump" | "glide") => void;
};

/**
 * A floating inspector that docks where you leave it. Drag it by its title
 * bar and it follows 1:1; near an edge a magnet pulls it flush on the flick
 * spring; pushed into the left or right edge it docks there, full height,
 * landing on the snap spring with the throw's velocity while the workspace
 * glides aside to make room; carried into a corner it collapses into a pill
 * that grows back into the panel when pressed. Its side edges resize it 1:1,
 * and a release springs to the preset width the throw was heading for.
 *
 * The panel and its pill are one box whose position, size, corners and fold
 * are motion values, so every change is one continuous morph. With
 * `storageKey` the placement is remembered per key and restored the same way
 * on the server and in the browser. The title bar is a real button: arrows
 * nudge it, Alt with an arrow docks, floats or collapses it, Enter docks or
 * floats it, Escape collapses it; the edge is a separator with arrow keys.
 * Under reduced motion it jumps to each place and cross-fades.
 */
export function FloatPanel({
  title = "Inspector",
  icon = <SlidersHorizontal className="size-4" />,
  children,
  workspace,
  placement,
  defaultPlacement = DEFAULT_FLOAT,
  onPlacementChange,
  storageKey,
  magnet = 24,
  collapse = 64,
  widths = 3,
  minWidth = 220,
  maxWidth = 380,
  nudge = 8,
  reserve = true,
  badge,
  height = 440,
  label = "Workspace",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: FloatPanelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const stored = useStored(storageKey);
  const [own, setOwn] = React.useState<{
    key: string | undefined;
    p: FloatPanelPlacement;
    o: FloatPanelPlacement | null;
  } | null>(null);
  const mine = own && own.key === storageKey ? own : null;
  const controlled = placement !== undefined;
  const current: FloatPanelPlacement =
    placement ?? mine?.p ?? stored?.p ?? defaultPlacement;
  const reopen: FloatPanelPlacement =
    (current.mode !== "pill" ? current : null) ??
    mine?.o ??
    stored?.o ??
    (defaultPlacement.mode !== "pill" ? defaultPlacement : DEFAULT_FLOAT);
  const currentKey = keyOf(current);
  const mode = current.mode;

  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const [contentNode, setContentNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [pillNode, setPillNode] = React.useState<HTMLSpanElement | null>(null);
  const [size, setSize] = React.useState<{ W: number; H: number } | null>(null);
  const [nat, setNat] = React.useState<number | null>(null);
  const [pillW, setPillW] = React.useState(140);
  const [check, setCheck] = React.useState(0);
  const [asked, setAsked] = React.useState<string | null>(null);
  const [seenKey, setSeenKey] = React.useState(currentKey);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [resizing, setResizing] = React.useState<{
    edge: FloatPanelSide;
    fixed: number;
    nearest: number;
  } | null>(null);
  const [arm, setArm] = React.useState<Arm | null>(null);
  const [focusTo, setFocusTo] = React.useState<{
    n: number;
    to: "pill" | "handle";
  } | null>(null);

  if (seenKey !== currentKey) {
    setSeenKey(currentKey);
    // Spoken when the visitor asked for it and the host has answered; a
    // restored or host-driven change is not news.
    if (asked === currentKey) {
      setSaid((s) => ({ n: s.n + 1, text: describe(current) }));
    }
  }

  const ready = size !== null && nat !== null;
  const W = size?.W ?? 0;
  const H = size?.H ?? 0;
  const hi = Math.max(80, Math.min(maxWidth, W - 2 * M));
  const lo = Math.min(Math.max(80, minWidth), hi);
  const presets = React.useMemo(
    () => presetsOf(widths, lo, hi),
    [widths, lo, hi],
  );
  const ctx: Ctx = { W, H, nat: nat ?? 200, pillW, lo, hi };
  const openWidth =
    reopen.mode === "pill" ? 280 : Math.round(clamp(reopen.width, lo, hi));

  const baseX = useMotionValue(0);
  const baseY = useMotionValue(0);
  const blendX = useMotionValue(0);
  const blendY = useMotionValue(0);
  const edgeX = useMotionValue(0);
  const edgeY = useMotionValue(0);
  const bw = useMotionValue(280);
  const bh = useMotionValue(200);
  const rad = useMotionValue(12);
  const fold = useMotionValue(0);
  const lift = useMotionValue(0);
  const appear = useMotionValue(0);
  const room = useMotionValue(0);
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gw = useMotionValue(0);
  const gh = useMotionValue(0);
  const gr = useMotionValue(12);
  const ghost = useMotionValue(0);

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const gesture = React.useRef<Gesture | null>(null);
  const shownKey = React.useRef<string | null>(null);
  const shownGeom = React.useRef("");
  const api = React.useRef<Api | null>(null);
  const handleRef = React.useRef<HTMLButtonElement | null>(null);
  const pillRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLElement | null>(null);

  // Where the magnet holds the panel: the raw position, pulled toward the
  // edge by a blend that the flick spring carries in and out.
  const dispX = useTransform(() =>
    r2(baseX.get() + blendX.get() * (edgeX.get() - baseX.get())),
  );
  const dispY = useTransform(() =>
    r2(baseY.get() + blendY.get() * (edgeY.get() - baseY.get())),
  );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  /** Hands the magnet's pull over to the base position, so nothing jumps. */
  const flatten = () => {
    halt("blendX");
    halt("blendY");
    baseX.jump(dispX.get());
    baseY.jump(dispY.get());
    blendX.jump(0);
    blendY.jump(0);
  };

  const panOf = (x: number) => {
    const rect = rootNode?.getBoundingClientRect();
    return rect ? panFrom(rect.left + x, null) : 0;
  };

  const roomFor = (p: FloatPanelPlacement) =>
    reserve &&
    p.mode === "dock" &&
    ctx.W - clamp(p.width, ctx.lo, ctx.hi) >= ROOM
      ? 1
      : 0;

  /** Moves the box to a placement: jumped, or on a spring with a velocity. */
  const moveTo = (
    p: FloatPanelPlacement,
    how: "jump" | "glide" | "snap",
    velocity: { x: number; y: number; w?: number } = { x: 0, y: 0 },
  ) => {
    const rect = rectFor(p, ctx);
    flatten();
    shownKey.current = keyOf(p);
    const foldTween = {
      duration: durations.base,
      ease: rect.fold > fold.get() ? easings.exit : easings.enter,
    };
    if (how === "jump" || !motionSafe) {
      for (const k of ["x", "y", "w", "h", "r", "room"]) halt(k);
      baseX.jump(rect.x);
      baseY.jump(rect.y);
      bw.jump(rect.w);
      bh.jump(rect.h);
      rad.jump(rect.r);
      room.jump(roomFor(p));
      if (how === "jump") {
        halt("fold");
        fold.jump(rect.fold);
      } else {
        run("fold", animate(fold, rect.fold, foldTween));
      }
      return;
    }
    // A landing (a dock, a preset width) is one spring for position and
    // size alike, so an edge that should stay put does: x and width are
    // linear in the same spring and started from consistent velocities.
    const spring = how === "snap" ? springs.snap : springs.glide;
    run("x", animate(baseX, rect.x, { ...spring, velocity: velocity.x }));
    run("y", animate(baseY, rect.y, { ...spring, velocity: velocity.y }));
    run("w", animate(bw, rect.w, { ...spring, velocity: velocity.w ?? 0 }));
    run("h", animate(bh, rect.h, spring));
    run("r", animate(rad, rect.r, { duration: durations.base }));
    run("fold", animate(fold, rect.fold, foldTween));
    run("room", animate(room, roomFor(p), springs.glide));
  };

  const writeStore = (p: FloatPanelPlacement, o: FloatPanelPlacement) => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(
        STORE + storageKey,
        JSON.stringify({ p, o: o.mode === "pill" ? null : o }),
      );
    } catch {
      // Storage can be full or blocked; the panel still works, unremembered.
    }
  };

  /** Every placement the visitor makes comes through here. */
  const commit = (
    p: FloatPanelPlacement,
    how: "glide" | "snap",
    velocity?: { x: number; y: number; w?: number },
  ) => {
    const o = p.mode === "pill" ? reopen : p;
    const key = keyOf(p);
    // Focus follows a panel that folds into its pill, or a pill that opens.
    const inside = !!panelRef.current?.contains(document.activeElement);
    if (p.mode === "pill" && mode !== "pill" && inside) {
      setFocusTo((f) => ({ n: (f?.n ?? 0) + 1, to: "pill" }));
    } else if (p.mode !== "pill" && mode === "pill" && inside) {
      setFocusTo((f) => ({ n: (f?.n ?? 0) + 1, to: "handle" }));
    }
    setAsked(key);
    moveTo(p, how, velocity);
    if (key === currentKey) return;
    writeStore(p, o);
    if (!controlled) setOwn({ key: storageKey, p, o });
    onPlacementChange?.(p);
    // A controlled host answers in its own time; once it has had its turn, a
    // refusal sends the panel back to where the host says it is.
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
  };

  const place = (p: FloatPanelPlacement, how: "jump" | "glide") => {
    moveTo(p, how);
  };

  React.useLayoutEffect(() => {
    api.current = { place };
  });

  // Size of the container, of the panel's content and of the pill, each
  // observed from the moment its node arrives.
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ W: Math.round(r.width), H: Math.round(r.height) });
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);
  React.useEffect(() => {
    if (!contentNode) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setNat(Math.round(r.height) + HEAD + 2);
    });
    ro.observe(contentNode);
    return () => ro.disconnect();
  }, [contentNode]);
  React.useEffect(() => {
    if (!pillNode) return;
    const ro = new ResizeObserver(() => {
      setPillW(Math.round(pillNode.offsetWidth) + 2);
    });
    ro.observe(pillNode);
    return () => ro.disconnect();
  }, [pillNode]);

  // The placement the host gives (or the one remembered, or a refusal) is
  // shown; a size change re-lays it at once. Before paint, so the first
  // placement never shows a frame elsewhere.
  const geom = `${W}x${H}:${lo}:${hi}`;
  React.useLayoutEffect(() => {
    if (!ready || gesture.current) return;
    const first = shownKey.current === null;
    const resized = shownGeom.current !== geom;
    shownGeom.current = geom;
    if (first || resized) {
      api.current?.place(current, "jump");
      if (first) {
        appear.jump(0);
        run(
          "appear",
          animate(appear, 1, { duration: durations.base, ease: easings.enter }),
        );
      }
      return;
    }
    if (shownKey.current !== currentKey) api.current?.place(current, "glide");
    // The placement is read through its key; the object itself changes
    // identity on every render of a controlled host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, geom, currentKey, check]);

  // The content or the pill changed size: the box follows on glide.
  const natKey = `${nat}:${pillW}`;
  const shownNat = React.useRef(natKey);
  React.useLayoutEffect(() => {
    if (shownNat.current === natKey) return;
    shownNat.current = natKey;
    if (!ready || gesture.current || shownKey.current === null) return;
    api.current?.place(current, "glide");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natKey, ready]);

  // Focus moves once the face it is meant for is live (a controlled host may
  // answer later), and only once per request.
  const focusDone = React.useRef(0);
  React.useEffect(() => {
    if (!focusTo || focusDone.current === focusTo.n) return;
    if ((focusTo.to === "pill") !== (mode === "pill")) return;
    focusDone.current = focusTo.n;
    const target = focusTo.to === "pill" ? pillRef.current : handleRef.current;
    target?.focus({ preventScroll: true });
  }, [focusTo, mode]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // StrictMode's remount stops what was running: finish the move instead of
  // leaving the panel part-way.
  React.useEffect(() => {
    if (shownKey.current !== null && !gesture.current) {
      api.current?.place(current, "glide");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------- moving --------------------------------- */

  const showGhost = (next: Arm | null, w: number) => {
    setArm(next);
    if (!next) {
      run(
        "ghost",
        animate(ghost, 0, { duration: durations.fast, ease: easings.exit }),
      );
      return;
    }
    const rect =
      next.kind === "dock"
        ? rectFor({ mode: "dock", side: next.side, width: w }, ctx)
        : rectFor({ mode: "pill", corner: next.corner }, ctx);
    gx.jump(rect.x);
    gy.jump(rect.y);
    gw.jump(rect.w);
    gh.jump(rect.h);
    gr.jump(next.kind === "pill" ? PILL_H / 2 : 0);
    run(
      "ghost",
      animate(ghost, 1, { duration: durations.fast, ease: easings.enter }),
    );
  };

  const magnetTo = (
    axis: "x" | "y",
    edge: number | null,
    held: number | null,
  ) => {
    if (edge === held) return;
    const blend = axis === "x" ? blendX : blendY;
    const target = axis === "x" ? edgeX : edgeY;
    if (edge !== null) {
      target.jump(edge);
      audio.play("snap", { pitch: 1.1, gain: 0.4, pan: panOf(edge) });
    }
    run(
      axis === "x" ? "blendX" : "blendY",
      motionSafe
        ? animate(blend, edge === null ? 0 : 1, springs.flick)
        : animate(blend, edge === null ? 0 : 1, { duration: 0 }),
    );
  };

  const nearestCorner = (x: number, y: number, w: number, h: number) => {
    const right = x + w / 2 > W / 2;
    const bottom = y + h / 2 > H / 2;
    return `${bottom ? "bottom" : "top"}-${right ? "right" : "left"}` as FloatPanelCorner;
  };

  const move = useDrag({
    threshold: 4,
    disabled,
    // A press on the pill that never became a drag opens it.
    onTap: () => {
      if (mode === "pill") expand();
    },
    onStart: () => {
      const rect = rootNode?.getBoundingClientRect();
      flatten();
      for (const k of ["x", "y"]) halt(k);
      const pill = mode === "pill";
      gesture.current = {
        kind: "move",
        pill,
        startX: baseX.get(),
        startY: baseY.get(),
        w: bw.get(),
        h: pill ? PILL_H : Math.min(ctx.nat, H - 2 * M),
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
        arm: null,
        snapX: null,
        snapY: null,
      };
      if (!pill && mode === "dock" && motionSafe) {
        // Undocking: the finger has it at once; its height and corners come
        // back on glide while it moves.
        run("h", animate(bh, Math.min(ctx.nat, H - 2 * M), springs.glide));
        run("r", animate(rad, 12, { duration: durations.base }));
        run("room", animate(room, 0, springs.glide));
      } else if (!pill && mode === "dock") {
        bh.jump(Math.min(ctx.nat, H - 2 * M));
        rad.jump(12);
        room.jump(0);
      }
      run(
        "lift",
        animate(lift, 1, motionSafe ? springs.flick : { duration: 0 }),
      );
    },
    onMove: ({ offset, point }) => {
      const g = gesture.current;
      if (!g || g.kind !== "move") return;
      const xMax = W - M - g.w;
      const yMax = H - M - g.h;
      const rawX = g.startX + offset.x;
      const rawY = g.startY + offset.y;
      baseX.set(r2(rubberClamp(rawX, M, Math.max(M, xMax), 140)));
      baseY.set(r2(rubberClamp(rawY, M, Math.max(M, yMax), 140)));
      if (g.pill) return;
      const px = point.x - g.left;
      const py = point.y - g.top;
      let next: Arm | null = null;
      const zone = Math.max(0, collapse);
      if (
        zone > 0 &&
        (px < zone || px > W - zone) &&
        (py < zone || py > H - zone)
      ) {
        next = {
          kind: "pill",
          corner: `${py < H / 2 ? "top" : "bottom"}-${px < W / 2 ? "left" : "right"}`,
        };
      } else if (px < DOCK_ZONE || rawX < M - DOCK_PUSH) {
        next = { kind: "dock", side: "left" };
      } else if (px > W - DOCK_ZONE || rawX > xMax + DOCK_PUSH) {
        next = { kind: "dock", side: "right" };
      }
      const same =
        (next === null && g.arm === null) ||
        (next !== null &&
          g.arm !== null &&
          (next.kind === "dock" && g.arm.kind === "dock"
            ? next.side === g.arm.side
            : next.kind === "pill" && g.arm.kind === "pill"
              ? next.corner === g.arm.corner
              : false));
      if (!same) {
        g.arm = next;
        showGhost(next, g.w);
      }
      // The magnet only pulls a panel that is not about to dock or fold.
      const reach = next ? 0 : Math.max(0, magnet);
      const sx =
        reach > 0 && Math.abs(rawX - M) < reach
          ? M
          : reach > 0 && Math.abs(rawX - xMax) < reach
            ? xMax
            : null;
      const sy =
        reach > 0 && Math.abs(rawY - M) < reach
          ? M
          : reach > 0 && Math.abs(rawY - yMax) < reach
            ? yMax
            : null;
      magnetTo("x", sx, g.snapX);
      magnetTo("y", sy, g.snapY);
      g.snapX = sx;
      g.snapY = sy;
    },
    onEnd: ({ velocity }) => {
      const g = gesture.current;
      gesture.current = null;
      run(
        "lift",
        animate(lift, 0, motionSafe ? springs.glide : { duration: 0 }),
      );
      if (!g || g.kind !== "move") return;
      const x = dispX.get();
      const y = dispY.get();
      if (g.pill) {
        const lx = project(x, velocity.x, 0.99);
        const ly = project(y, velocity.y, 0.99);
        const corner = nearestCorner(lx, ly, g.w, g.h);
        audio.play("thock", { pitch: 1.05, gain: 0.5, pan: panOf(lx) });
        commit({ mode: "pill", corner }, "glide", velocity);
        return;
      }
      showGhost(null, g.w);
      if (g.arm?.kind === "dock") {
        audio.play("thock", {
          pitch: 0.95,
          gain: 0.6,
          pan: g.arm.side === "left" ? -0.5 : 0.5,
        });
        commit(
          { mode: "dock", side: g.arm.side, width: g.w },
          "snap",
          velocity,
        );
        return;
      }
      if (g.arm?.kind === "pill") {
        audio.play("thock", { pitch: 1.15, gain: 0.5, pan: panOf(x) });
        commit({ mode: "pill", corner: g.arm.corner }, "glide", velocity);
        return;
      }
      // A throw comes to rest where it would stop on a heavy surface, inside
      // the container, and the magnet takes it if it lands near an edge.
      const xMax = Math.max(M, W - M - g.w);
      const yMax = Math.max(M, H - M - g.h);
      let lx = clamp(project(x, velocity.x, 0.99), M, xMax);
      let ly = clamp(project(y, velocity.y, 0.99), M, yMax);
      const reach = Math.max(0, magnet);
      let caught = false;
      if (reach > 0) {
        if (lx - M < reach) lx = M;
        else if (xMax - lx < reach) lx = xMax;
        if (ly - M < reach) ly = M;
        else if (yMax - ly < reach) ly = yMax;
        caught =
          (lx === M || lx === xMax || ly === M || ly === yMax) &&
          g.snapX === null &&
          g.snapY === null;
      }
      if (caught) audio.play("snap", { pitch: 1, gain: 0.4, pan: panOf(lx) });
      commit(
        {
          mode: "float",
          x: share(lx, W - 2 * M - g.w),
          y: share(ly, H - 2 * M - g.h),
          width: g.w,
        },
        "glide",
        velocity,
      );
    },
    onCancel: () => {
      gesture.current = null;
      showGhost(null, bw.get());
      run("lift", animate(lift, 0, { duration: durations.fast }));
      api.current?.place(current, "glide");
    },
  });

  const moveRelay = relayed(move);

  /* -------------------------------- resizing -------------------------------- */

  const startResize = (edge: FloatPanelSide) => {
    flatten();
    for (const k of ["x", "w"]) halt(k);
    const x = baseX.get();
    const w = bw.get();
    const fixed = edge === "left" ? x + w : x;
    gesture.current = { kind: "resize", edge, w0: w, fixed, nearest: -1 };
    setResizing({ edge, fixed, nearest: -1 });
  };

  const resizeTo = (w: number) => {
    const g = gesture.current;
    if (!g || g.kind !== "resize") return;
    const next = r2(rubberClamp(w, lo, hi, 80));
    bw.set(next);
    if (g.edge === "left") baseX.set(r2(g.fixed - next));
    if (presets.length > 0) {
      let best = 0;
      presets.forEach((p, i) => {
        if (Math.abs(p - next) < Math.abs((presets[best] ?? 0) - next))
          best = i;
      });
      if (best !== g.nearest) {
        g.nearest = best;
        setResizing({ edge: g.edge, fixed: g.fixed, nearest: best });
      }
    }
  };

  const endResize = (v: number) => {
    const g = gesture.current;
    gesture.current = null;
    setResizing(null);
    if (!g || g.kind !== "resize") return;
    const w = bw.get();
    let target = clamp(project(w, v, 0.99), lo, hi);
    let rank = -1;
    if (presets.length > 0) {
      presets.forEach((p, i) => {
        if (
          rank === -1 ||
          Math.abs(p - target) < Math.abs((presets[rank] ?? 0) - target)
        )
          rank = i;
      });
      target = presets[rank] ?? target;
    } else {
      target = Math.round(clamp(w, lo, hi));
    }
    if (rank !== -1) {
      audio.play("snap", {
        pitch: r2(0.85 + (0.4 * rank) / Math.max(1, presets.length - 1)),
        gain: 0.45,
        pan: panOf(g.edge === "left" ? g.fixed - target : g.fixed + target),
      });
    }
    const next: FloatPanelPlacement =
      current.mode === "dock"
        ? { ...current, width: target }
        : current.mode === "float"
          ? {
              ...current,
              width: target,
              x: share(
                g.edge === "left" ? g.fixed - target : g.fixed,
                W - 2 * M - target,
              ),
            }
          : current;
    commit(next, "snap", { x: g.edge === "left" ? -v : 0, y: 0, w: v });
  };

  const resizeLeft = useDrag({
    axis: "x",
    threshold: 2,
    disabled,
    onStart: () => startResize("left"),
    onMove: ({ offset }) => {
      const g = gesture.current;
      if (g?.kind === "resize") resizeTo(g.w0 - offset.x);
    },
    onEnd: ({ velocity }) => endResize(-velocity.x),
    onCancel: () => endResize(0),
  });
  const resizeRight = useDrag({
    axis: "x",
    threshold: 2,
    disabled,
    onStart: () => startResize("right"),
    onMove: ({ offset }) => {
      const g = gesture.current;
      if (g?.kind === "resize") resizeTo(g.w0 + offset.x);
    },
    onEnd: ({ velocity }) => endResize(velocity.x),
    onCancel: () => endResize(0),
  });

  /* -------------------------------- keyboard -------------------------------- */

  const centreRight = () => dispX.get() + bw.get() / 2 > W / 2;

  const dock = (side: FloatPanelSide) => {
    const width = current.mode === "pill" ? openWidth : current.width;
    audio.play("thock", {
      pitch: 0.95,
      gain: 0.6,
      pan: side === "left" ? -0.5 : 0.5,
    });
    commit({ mode: "dock", side, width }, "snap");
  };

  const float = () => {
    const width = current.mode === "pill" ? openWidth : current.width;
    const back =
      reopen.mode === "float"
        ? { ...reopen, width }
        : ({
            mode: "float",
            x: centreRight() ? 1 : 0,
            y: 0,
            width,
          } as FloatPanelPlacement);
    audio.play("thock", { pitch: 1.1, gain: 0.45, pan: panOf(dispX.get()) });
    commit(back, "glide");
  };

  const fold2pill = (corner?: FloatPanelCorner) => {
    const c =
      corner ?? nearestCorner(dispX.get(), dispY.get(), bw.get(), bh.get());
    audio.play("thock", { pitch: 1.15, gain: 0.5, pan: panOf(dispX.get()) });
    commit({ mode: "pill", corner: c }, "glide");
  };

  const expand = () => {
    audio.play("thock", { pitch: 1.2, gain: 0.45, pan: panOf(dispX.get()) });
    commit(reopen.mode === "pill" ? DEFAULT_FLOAT : reopen, "glide");
  };

  const toggleDock = () => {
    if (mode === "dock") float();
    else dock(centreRight() ? "right" : "left");
  };

  const onHandleKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = event.key;
    if (!k.startsWith("Arrow")) return;
    event.preventDefault();
    if (event.altKey) {
      if (k === "ArrowLeft") dock("left");
      else if (k === "ArrowRight") dock("right");
      else if (k === "ArrowUp") float();
      else
        fold2pill(
          `bottom-${centreRight() ? "right" : "left"}` as FloatPanelCorner,
        );
      return;
    }
    if (current.mode === "dock") {
      // An arrow away from the dock lifts it off into a floating panel.
      if (
        (k === "ArrowRight" && current.side === "left") ||
        (k === "ArrowLeft" && current.side === "right")
      ) {
        commit(
          {
            mode: "float",
            x: current.side === "left" ? 0 : 1,
            y: 0,
            width: current.width,
          },
          "glide",
        );
      }
      return;
    }
    if (current.mode !== "float") return;
    const step = Math.max(1, nudge) * (event.shiftKey ? 4 : 1);
    const w = clamp(current.width, lo, hi);
    const h = Math.min(ctx.nat, H - 2 * M);
    const xMax = Math.max(M, W - M - w);
    const yMax = Math.max(M, H - M - h);
    const rect = rectFor(current, ctx);
    const dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0;
    const dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
    let x = clamp(rect.x + dx, M, xMax);
    let y = clamp(rect.y + dy, M, yMax);
    // The magnet catches a nudge heading for an edge, never one leaving it.
    const reach = Math.max(0, magnet);
    if (dx < 0 && x - M < reach) x = M;
    if (dx > 0 && xMax - x < reach) x = xMax;
    if (dy < 0 && y - M < reach) y = M;
    if (dy > 0 && yMax - y < reach) y = yMax;
    if ((x === M || x === xMax) && x !== rect.x && dx !== 0)
      audio.play("snap", { pitch: 1.1, gain: 0.35, pan: panOf(x) });
    if ((y === M || y === yMax) && y !== rect.y && dy !== 0)
      audio.play("snap", { pitch: 1.1, gain: 0.35, pan: panOf(x) });
    commit(
      {
        mode: "float",
        x: share(x, W - 2 * M - w),
        y: share(y, H - 2 * M - h),
        width: current.width,
      },
      "snap",
    );
  };

  const onPillKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (current.mode !== "pill" || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const [v, h] = current.corner.split("-") as [string, string];
    const nv =
      event.key === "ArrowUp"
        ? "top"
        : event.key === "ArrowDown"
          ? "bottom"
          : v;
    const nh =
      event.key === "ArrowLeft"
        ? "left"
        : event.key === "ArrowRight"
          ? "right"
          : h;
    const corner = `${nv}-${nh}` as FloatPanelCorner;
    if (corner === current.corner) return;
    audio.play("thock", {
      pitch: 1.05,
      gain: 0.45,
      pan: nh === "left" ? -0.5 : 0.5,
    });
    commit({ mode: "pill", corner }, "glide");
  };

  const onSeparatorKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (current.mode === "pill") return;
    const w = clamp(current.width, lo, hi);
    // On a left-hand edge, Left widens: the arrow moves the edge.
    const toward = (event.currentTarget.dataset.edge ??
      "right") as FloatPanelSide;
    const grow =
      event.key === "ArrowRight"
        ? toward === "right"
        : event.key === "ArrowLeft"
          ? toward === "left"
          : null;
    let target: number | null = null;
    if (event.key === "Home") target = lo;
    else if (event.key === "End") target = hi;
    else if (grow !== null) {
      if (presets.length > 0) {
        const list = grow ? presets : [...presets].reverse();
        target =
          list.find((p) => (grow ? p > w + 0.5 : p < w - 0.5)) ??
          (grow ? hi : lo);
      } else {
        target = clamp(w + (grow ? 16 : -16), lo, hi);
      }
    }
    if (target === null) return;
    event.preventDefault();
    target = Math.round(clamp(target, lo, hi));
    if (target === Math.round(w)) return;
    const rank = presets.indexOf(target);
    audio.play("snap", {
      pitch: r2(
        rank === -1 ? 1 : 0.85 + (0.4 * rank) / Math.max(1, presets.length - 1),
      ),
      gain: 0.4,
      pan: panOf(dispX.get()),
    });
    const rect = rectFor(current, ctx);
    const left = toward === "left";
    commit(
      current.mode === "dock"
        ? { ...current, width: target }
        : {
            ...current,
            width: target,
            x: share(
              left ? rect.x + rect.w - target : rect.x,
              W - 2 * M - target,
            ),
          },
      "snap",
    );
  };

  /* --------------------------------- drawing --------------------------------- */

  const scale = useTransform(lift, (l) => r3(1 + 0.01 * l));
  const shadow = useTransform(() => {
    const l = lift.get();
    const f = fold.get();
    const k = 0.6 + 0.4 * l;
    return `0 ${r2(4 + 8 * l - 2 * f)}px ${r2(14 + 18 * l)}px color-mix(in oklab, black ${Math.round(18 * k)}%, transparent)`;
  });
  const panelAlpha = useTransform(fold, (f) => r3(clamp01(1 - f * 1.6)));
  const pillAlpha = useTransform(fold, (f) => r3(clamp01((f - 0.4) / 0.6)));
  const insetL = useTransform(() =>
    current.mode === "dock" && current.side === "left"
      ? r2(room.get() * bw.get())
      : 0,
  );
  const insetR = useTransform(() =>
    current.mode === "dock" && current.side === "right"
      ? r2(room.get() * bw.get())
      : 0,
  );
  const readout = useTransform(bw, (w) => `${Math.round(w)} px`);
  const readoutX = useTransform(() => {
    const x = dispX.get();
    const w = bw.get();
    const edgeX2 = resizing?.edge === "left" ? x : x + w;
    return r2(clamp(edgeX2 - 32, 4, Math.max(4, W - 68)));
  });
  const readoutY = useTransform(() => r2(dispY.get() + HEAD + 8));
  const visibleBox = useTransform(appear, (a) => r3(a));

  const separatorEdge: FloatPanelSide =
    mode === "dock"
      ? current.mode === "dock" && current.side === "left"
        ? "right"
        : "left"
      : rectFor(current, ctx).x + rectFor(current, ctx).w / 2 > W / 2
        ? "left"
        : "right";
  const shownWidth = Math.round(
    current.mode === "pill" ? openWidth : clamp(current.width, lo, hi),
  );
  const dockSide: FloatPanelSide =
    current.mode === "dock"
      ? current.side
      : ready && rectFor(current, ctx).x + rectFor(current, ctx).w / 2 > W / 2
        ? "right"
        : current.mode === "float" && current.x >= 0.5
          ? "right"
          : "left";

  const grip = (edge: FloatPanelSide) => {
    const focusable = edge === separatorEdge;
    const handlers = relayed(edge === "left" ? resizeLeft : resizeRight);
    const shown =
      mode === "float" ||
      (mode === "dock" && current.mode === "dock" && current.side !== edge);
    if (!shown) return null;
    return (
      <div
        key={edge}
        role={focusable ? "separator" : undefined}
        aria-hidden={focusable ? undefined : true}
        aria-orientation={focusable ? "vertical" : undefined}
        aria-label={focusable ? `${title} width` : undefined}
        aria-valuenow={focusable ? shownWidth : undefined}
        aria-valuemin={focusable ? Math.round(lo) : undefined}
        aria-valuemax={focusable ? Math.round(hi) : undefined}
        aria-valuetext={focusable ? `${shownWidth} px` : undefined}
        tabIndex={focusable ? 0 : -1}
        data-edge={edge}
        onKeyDown={focusable ? onSeparatorKey : undefined}
        {...handlers}
        className={cn(
          "group/float-panel-grip absolute inset-y-0 z-10 flex w-2.5 cursor-ew-resize touch-pan-y items-center justify-center",
          edge === "left" ? "left-0" : "right-0",
          RING,
        )}
      >
        <span
          aria-hidden
          className="h-8 w-0.5 rounded-full bg-hairline-strong opacity-0 transition-opacity group-hover/float-panel-grip:opacity-100 group-focus-visible/float-panel-grip:opacity-100"
          style={
            resizing?.edge === edge
              ? { opacity: 1, backgroundColor: "var(--float-panel-accent)" }
              : undefined
          }
        />
      </div>
    );
  };

  const guides =
    resizing && presets.length > 0
      ? presets.map((p, i) => {
          const x =
            resizing.edge === "left" ? resizing.fixed - p : resizing.fixed + p;
          if (x < 0 || x > W) return null;
          return (
            <span
              key={p}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-40 w-0 border-l border-dashed transition-colors"
              style={{
                left: r2(x),
                borderColor:
                  i === resizing.nearest
                    ? "var(--float-panel-accent)"
                    : "color-mix(in oklab, var(--float-panel-accent) 35%, transparent)",
              }}
            />
          );
        })
      : null;

  const styleVars = {
    height,
    "--float-panel-accent": accent,
  } as React.CSSProperties;

  return (
    <div
      ref={setRootNode}
      role="region"
      aria-label={label}
      inert={disabled}
      className={cn(
        "relative isolate w-full overflow-clip rounded-3 border border-hairline bg-surface-1 text-foreground select-none",
        disabled && "opacity-60",
        className,
      )}
      style={styleVars}
    >
      <span id={hintId} className="sr-only">
        Arrow keys move it, Alt with an arrow docks it to a side, floats it or
        collapses it, Enter docks or floats it, Escape collapses it.
      </span>

      <motion.div
        className={cn(
          "absolute inset-y-0 overflow-clip",
          workspace ? "" : DOTS,
        )}
        style={{ left: insetL, right: insetR }}
      >
        {workspace}
      </motion.div>

      {/* Where a release would put it: a dock along a side, a pill in a
          corner. Drawn over the panel, which is usually on top of the spot. */}
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-40 border",
          arm?.kind === "pill" ? "border-dashed" : "",
        )}
        style={{
          x: gx,
          y: gy,
          width: gw,
          height: gh,
          borderRadius: gr,
          opacity: ghost,
          borderColor:
            "color-mix(in oklab, var(--float-panel-accent) 55%, transparent)",
          backgroundColor:
            "color-mix(in oklab, var(--float-panel-accent) 12%, transparent)",
        }}
      />

      {guides}

      <motion.section
        ref={panelRef}
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return;
          if (mode === "pill") return;
          // Handled where focus is: the page must not also close on it.
          event.preventDefault();
          fold2pill();
        }}
        className="absolute top-0 left-0 z-30 overflow-clip border border-hairline-strong bg-popover"
        style={{
          x: dispX,
          y: dispY,
          width: bw,
          height: bh,
          borderRadius: rad,
          scale,
          boxShadow: shadow,
          opacity: visibleBox,
        }}
      >
        <motion.div
          inert={mode === "pill"}
          aria-hidden={mode === "pill" || undefined}
          className="flex h-full flex-col"
          style={{
            opacity: panelAlpha,
            width: mode === "pill" ? openWidth : "100%",
          }}
        >
          <div
            className="flex shrink-0 items-center gap-1 border-b border-hairline pr-1.5"
            style={{ height: HEAD }}
          >
            <button
              ref={handleRef}
              type="button"
              aria-label={`Move ${title}`}
              aria-describedby={hintId}
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Escape"
              {...moveRelay}
              onClick={(event) => {
                if (event.detail === 0) toggleDock();
              }}
              onDoubleClick={toggleDock}
              onKeyDown={onHandleKey}
              className={cn(
                "flex h-full min-w-0 flex-1 cursor-grab touch-none items-center gap-2 rounded-2 pl-3 text-left active:cursor-grabbing",
                RING,
              )}
            >
              <span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center text-ink-3"
              >
                {icon}
              </span>
              <span
                id={titleId}
                className="truncate text-[13px] font-medium text-foreground"
              >
                {title}
              </span>
            </button>
            <button
              type="button"
              aria-label={mode === "dock" ? "Float" : `Dock to the ${dockSide}`}
              onClick={toggleDock}
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                RING,
              )}
            >
              {mode === "dock" ? (
                <PictureInPicture2 aria-hidden className="size-4" />
              ) : dockSide === "right" ? (
                <PanelRight aria-hidden className="size-4" />
              ) : (
                <PanelLeft aria-hidden className="size-4" />
              )}
            </button>
            <button
              type="button"
              aria-label="Collapse to a pill"
              onClick={() => fold2pill()}
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                RING,
              )}
            >
              <Minimize2 aria-hidden className="size-4" />
            </button>
          </div>
          <div className="[min-height:0] flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
            <div ref={setContentNode}>
              {children ?? (
                <p className="px-3 py-4 text-xs text-ink-3">
                  Nothing selected.
                </p>
              )}
            </div>
          </div>
        </motion.div>
        {mode !== "pill" ? [grip("left"), grip("right")] : null}

        <motion.div
          inert={mode !== "pill"}
          aria-hidden={mode !== "pill" || undefined}
          className="absolute inset-0"
          style={{ opacity: pillAlpha }}
        >
          <button
            ref={pillRef}
            type="button"
            aria-expanded={false}
            aria-label={`Expand ${title}`}
            {...moveRelay}
            onClick={(event) => {
              if (event.detail === 0) expand();
            }}
            onKeyDown={onPillKey}
            className={cn(
              "flex h-full w-full cursor-pointer touch-none items-center rounded-full",
              RING,
            )}
          >
            <span
              ref={setPillNode}
              className="flex w-max items-center gap-2 pr-3 pl-3"
            >
              <span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center text-ink-3"
              >
                {icon}
              </span>
              <span className="text-[13px] font-medium whitespace-nowrap text-foreground">
                {title}
              </span>
              {badge !== undefined ? (
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  {badge}
                </span>
              ) : null}
              <Maximize2 aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            </span>
          </button>
        </motion.div>
      </motion.section>

      {resizing ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-40 rounded-full border bg-popover px-2 py-0.5 font-mono text-[11px] tabular-nums"
          style={{
            x: readoutX,
            y: readoutY,
            color: "var(--float-panel-accent)",
            borderColor:
              "color-mix(in oklab, var(--float-panel-accent) 45%, transparent)",
          }}
        >
          {readout}
        </motion.span>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
