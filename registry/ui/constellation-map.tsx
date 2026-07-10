"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Reduced motion draws exactly one static frame at these angles — chosen for pose. */
const STATIC_YAW = 0.5;
const STATIC_PITCH = -0.28;
/** Release momentum bleeds off over this timescale, back to a full stop. */
const MOMENTUM_TAU = 0.7;
/** Below this angular speed (rad/s) the cloud is considered at rest. */
const REST_EPSILON = 0.004;
/** Pointer travel (px) before a press becomes a spin — protects click/pin. */
const DRAG_THRESHOLD = 3;
/** Angular velocity is clamped to a believable throw (rad/s). */
const MAX_SPIN = 8;
/** Pitch is bounded so the poles never cross the camera and invert. */
const MAX_PITCH = 1.15;
/** px→radians on drag: a full stage width spins roughly this many turns. */
const DRAG_TO_YAW = 0.008;
const DRAG_TO_PITCH = 0.0065;
/** Fraction of the stage's short side used as the sphere's screen radius. */
const SPHERE_FRACTION = 0.42;
/** Cursor-proximity link radius, as a fraction of the sphere's screen radius. */
const LINK_FRACTION = 0.3;
/** Only points within this factor of the link radius are ever tested — keeps
 * the near-cursor candidate scan cheap regardless of total star count. */
const CANDIDATE_FRACTION = 1.15;
/** Click/tap hit radius around a named star's projected position, px. */
const PIN_HIT_RADIUS = 14;
/** Seconds for a pin-triggered orbit to ease the star toward front. */
const PIN_EASE_S = 0.6;
const DEFAULT_EXTRA = 60;

export type Star = { id: string; label: string };

export type ConstellationMapProps = {
  /** Named, pinnable, labelled stars. */
  stars: Star[];
  /** Unlabelled filler stars added for cloud density. @default 60 */
  extra?: number;
  /** Fires the pinned star's id, or `null` on unpin. Deduped. */
  onPin?: (id: string | null) => void;
  /** px stage height. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** A star resolved onto the unit sphere plus its stable identity. */
type Point = {
  x: number;
  y: number;
  z: number;
  /** Index into `stars` if named, else -1 for a filler point. */
  starIndex: number;
};

/** Deterministic uniform point on the unit sphere from a seed stream. */
const seedPoint = (rand: () => number): { x: number; y: number; z: number } => {
  const z = rand() * 2 - 1;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const theta = rand() * TAU;
  return { x: Math.cos(theta) * r, y: Math.sin(theta) * r, z };
};

/** Named stars + deterministic filler, seeded off djb2/seeded — no Math.random. */
const buildPoints = (stars: Star[], extraCount: number): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i < stars.length; i += 1) {
    const star = stars[i];
    if (!star) continue;
    const rand = seeded(djb2(`constellation-map:star:${star.id}`));
    // Named stars sit on a slightly inner shell so their ring and label
    // callout never clip the sphere's silhouette edge.
    const p = seedPoint(rand);
    points.push({ x: p.x * 0.92, y: p.y * 0.92, z: p.z * 0.92, starIndex: i });
  }
  for (let i = 0; i < extraCount; i += 1) {
    const rand = seeded(djb2(`constellation-map:filler:${i}`));
    const p = seedPoint(rand);
    points.push({ x: p.x, y: p.y, z: p.z, starIndex: -1 });
  }
  return points;
};

/** Shortest signed delta (radians) so an eased yaw never spins the long way. */
const angleDeltaRad = (target: number, from: number): number => {
  let delta = (target - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
};

/**
 * A rotatable 3D star cloud. Named stars plus deterministic filler stars sit
 * on a seeded unit sphere; dragging orbits the whole cloud in yaw/pitch with
 * a short release inertia that decays to a full stop, at which point the
 * render loop idles; stars whose projected positions land near the cursor
 * link into a faint live constellation; clicking near a named star pins it —
 * a ring, a label callout, and a short orbit that eases it toward the front.
 * The same named stars are reachable as a real button list beside the
 * canvas: a click (or Enter/Space via native button activation) pins exactly
 * like clicking the star itself.
 *
 * Mirrors the canvas discipline of PointGlobe/Wavefield: DPR-aware (capped
 * at 2), sized by a ResizeObserver via setTransform; colors resolve from CSS
 * variables once per mount and re-resolve on theme flips (MutationObserver);
 * the single rAF loop is gated by IntersectionObserver + visibilitychange
 * with a rebased clock, and — beyond those gates — a `dirty` flag stops the
 * loop the instant the cloud is both undragged and at rest (velocity under
 * `REST_EPSILON`, no pin-orbit in flight), so a parked map costs nothing.
 * Rotation, drag, velocity and cursor all live in refs/closures; nothing
 * here touches React state on a per-frame basis — only the pin id/label
 * (once, on an actual pin/unpin event) ever calls setState.
 *
 * Reduced motion: a static projected cloud at a fixed pose — the loop never
 * starts and drag never rotates it. Cursor-proximity links still form on
 * hover, and pins still work, each via a single direct canvas repaint rather
 * than a loop.
 */
export function ConstellationMap({
  stars,
  extra = DEFAULT_EXTRA,
  onPin,
  height = 300,
  className,
  "aria-label": ariaLabel,
}: ConstellationMapProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const [pinnedLabel, setPinnedLabel] = React.useState<string | null>(null);

  // Latest-ref pattern: values the imperative effect needs but that change
  // across renders. Always written in an effect, never during render.
  const starsRef = React.useRef(stars);
  React.useEffect(() => {
    starsRef.current = stars;
  });
  const onPinRef = React.useRef(onPin);
  React.useEffect(() => {
    onPinRef.current = onPin;
  });
  const pinnedIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    pinnedIdRef.current = pinnedId;
  });

  // Imperative entry point for the keyboard button list — assigned inside
  // the canvas effect below (it closes over the geometry/rotation state) and
  // invoked from the button `onClick`s, never called during render.
  const pinByIndexRef = React.useRef<(starIndex: number) => void>(() => {});

  const extraCount = clamp(Math.round(extra), 0, 400);

  // All canvas work lives here: sizing, theming, geometry, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const points = buildPoints(starsRef.current, extraCount);
    const count = points.length;
    const sphere = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const p = points[i];
      if (!p) continue;
      sphere[i * 3] = p.x;
      sphere[i * 3 + 1] = p.y;
      sphere[i * 3 + 2] = p.z;
    }
    // Deterministic per-point grain (size) and twinkle phase — djb2, no Math.random.
    const grain = new Float32Array(count);
    const twinklePhase = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      grain[i] = 0.78 + (djb2(`constellation-map:grain:${i}`) / 4294967296) * 0.4;
      twinklePhase[i] =
        (djb2(`constellation-map:twinkle:${i}`) / 4294967296) * TAU;
    }

    // Per-frame projection scratch — allocated once, filled every repaint.
    const projX = new Float32Array(count);
    const projY = new Float32Array(count);
    const depth = new Float32Array(count);
    const order = new Int32Array(count);
    for (let i = 0; i < count; i += 1) order[i] = i;
    // Near-cursor link candidates — reused every frame, sized to fit worst case.
    const candidateIdx = new Int32Array(count);

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let inkBright = "";
    let ink2 = "";
    let ink3 = "";
    let signal = "";
    let accentBright = "";
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      inkBright = read("--ink", "#f1f2f4");
      ink2 = read("--ink-2", "#b6bac2");
      ink3 = read("--ink-3", "#8a8f9b");
      signal = read("--signal", read("--primary", "#6478f0"));
      accentBright = read("--accent-bright", read("--primary", "#6478f0"));
    };
    resolveColors();

    // --- rotation + drag + pointer state, all imperative -------------------
    const rotation = { yaw: STATIC_YAW, pitch: STATIC_PITCH };
    const velocity = { yaw: 0, pitch: 0 };
    const drag = {
      id: -1,
      active: false,
      engaged: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      lastT: 0,
      vYaw: 0,
      vPitch: 0,
    };
    // Cursor position in canvas-local px, or null when the pointer is away.
    let cursor: { x: number; y: number } | null = null;
    // Pin-orbit: while non-null, the loop eases rotation toward this target
    // so the pinned star turns to face the camera; cleared on arrival or the
    // instant the cloud is grabbed again.
    let pinTarget: { yaw: number; pitch: number } | null = null;
    let pinEaseT = 0;

    // --- stage metrics: recomputed only in the ResizeObserver callback ----
    let width = 0;
    let stageHeight = 0;
    let cx = 0;
    let cy = 0;
    let radius = 0;

    const drawFrame = () => {
      if (width <= 0 || stageHeight <= 0 || radius <= 0) return;
      ctx.clearRect(0, 0, width, stageHeight);

      const cosY = Math.cos(rotation.yaw);
      const sinY = Math.sin(rotation.yaw);
      const cosP = Math.cos(rotation.pitch);
      const sinP = Math.sin(rotation.pitch);

      for (let i = 0; i < count; i += 1) {
        const x0 = sphere[i * 3] ?? 0;
        const y0 = sphere[i * 3 + 1] ?? 0;
        const z0 = sphere[i * 3 + 2] ?? 0;
        const xz = x0 * cosY + z0 * sinY;
        const zz = -x0 * sinY + z0 * cosY;
        const yz = y0 * cosP - zz * sinP;
        const zRot = y0 * sinP + zz * cosP;
        depth[i] = zRot;
        projX[i] = cx + xz * radius;
        projY[i] = cy - yz * radius;
      }

      // Depth sort back-to-front (insertion sort — `order` stays nearly
      // sorted frame to frame under a slow orbit, so this stays near O(n)).
      for (let a = 1; a < count; a += 1) {
        const key = order[a] ?? 0;
        const kd = depth[key] ?? 0;
        let b = a - 1;
        while (b >= 0 && (depth[order[b] ?? 0] ?? 0) > kd) {
          order[b + 1] = order[b] ?? 0;
          b -= 1;
        }
        order[b + 1] = key;
      }

      // --- cursor-proximity links: gather nearby candidates, then test only
      // pairs within that small set — cheap regardless of total star count.
      const linkRadius = radius * LINK_FRACTION;
      let candidateCount = 0;
      if (cursor) {
        const reach = linkRadius * CANDIDATE_FRACTION;
        for (let i = 0; i < count; i += 1) {
          const px = projX[i] ?? 0;
          const py = projY[i] ?? 0;
          if (Math.hypot(px - cursor.x, py - cursor.y) <= reach) {
            candidateIdx[candidateCount] = i;
            candidateCount += 1;
          }
        }
      }
      if (candidateCount > 1) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = signal;
        for (let a = 0; a < candidateCount; a += 1) {
          const ia = candidateIdx[a] ?? 0;
          const ax = projX[ia] ?? 0;
          const ay = projY[ia] ?? 0;
          for (let b = a + 1; b < candidateCount; b += 1) {
            const ib = candidateIdx[b] ?? 0;
            const bx = projX[ib] ?? 0;
            const by = projY[ib] ?? 0;
            const d = Math.hypot(ax - bx, ay - by);
            if (d > linkRadius) continue;
            ctx.globalAlpha = 0.5 * (1 - d / linkRadius);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      // Draw far→near. Radius/alpha scale with rotated z (front = bigger,
      // brighter); named stars draw larger and step up to full ink.
      const activeStars = starsRef.current;
      const pinnedNow = pinnedIdRef.current;
      let pinnedProjX = 0;
      let pinnedProjY = 0;
      let pinnedFound = false;
      for (let k = 0; k < count; k += 1) {
        const i = order[k] ?? 0;
        const point = points[i];
        if (!point) continue;
        const z = depth[i] ?? 0;
        const f = z * 0.5 + 0.5; // [-1,1] → [0,1], 0 far, 1 near
        const named = point.starIndex >= 0;
        const star = named ? activeStars[point.starIndex] : undefined;
        const isPinned = named && star !== undefined && star.id === pinnedNow;
        const twinkle =
          0.88 + 0.12 * Math.sin((twinklePhase[i] ?? 0) + f * 3.4);
        const baseRad = named ? 1.1 + f * f * 2.3 : 0.6 + f * f * 1.7;
        const rad = baseRad * (grain[i] ?? 1) * twinkle;
        const px = projX[i] ?? 0;
        const py = projY[i] ?? 0;
        ctx.globalAlpha = (named ? 0.3 : 0.14) + f * 0.7;
        ctx.fillStyle = named
          ? f > 0.55
            ? inkBright
            : ink2
          : f > 0.6
            ? ink2
            : ink3;
        if (rad <= 1) {
          ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, TAU);
          ctx.fill();
        }
        if (isPinned) {
          pinnedProjX = px;
          pinnedProjY = py;
          pinnedFound = true;
        }
      }
      ctx.globalAlpha = 1;

      // Pinned ring, drawn last so it always sits on top.
      if (pinnedFound) {
        ctx.strokeStyle = accentBright;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(pinnedProjX, pinnedProjY, 7, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };

    // --- the one rAF loop, gated on visibility, intersection, and rest ----
    // `dirty` means "something changed since the last paint that needs
    // another frame"; the loop reschedules itself only while dirty, and a
    // fresh gesture (drag/pin) flips it back on and restarts the loop.
    let raf = 0;
    let last: number | null = null;
    let inView = false;
    let dirty = true;

    const frame = (now: number) => {
      if (last === null) {
        last = now;
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;

      let inMotion = false;

      if (pinTarget) {
        pinEaseT = Math.min(1, pinEaseT + dt / PIN_EASE_S);
        const eased = 1 - (1 - pinEaseT) * (1 - pinEaseT); // ease-out quad
        rotation.yaw += (pinTarget.yaw - rotation.yaw) * eased * 0.35;
        rotation.pitch = clamp(
          rotation.pitch + (pinTarget.pitch - rotation.pitch) * eased * 0.35,
          -MAX_PITCH,
          MAX_PITCH,
        );
        inMotion = true;
        if (pinEaseT >= 1) pinTarget = null;
      } else if (!drag.active) {
        // Exponential decay of release momentum back toward zero.
        const decay = 1 - Math.exp(-dt / MOMENTUM_TAU);
        velocity.yaw += (0 - velocity.yaw) * decay;
        velocity.pitch += (0 - velocity.pitch) * decay;
        if (
          Math.abs(velocity.yaw) > REST_EPSILON ||
          Math.abs(velocity.pitch) > REST_EPSILON
        ) {
          rotation.yaw += velocity.yaw * dt;
          rotation.pitch = clamp(
            rotation.pitch + velocity.pitch * dt,
            -MAX_PITCH,
            MAX_PITCH,
          );
          inMotion = true;
        } else {
          velocity.yaw = 0;
          velocity.pitch = 0;
        }
      } else {
        // While dragging, rotation is written directly by the move handler;
        // the loop only needs to keep repainting.
        inMotion = true;
      }

      drawFrame();
      dirty = inMotion;
      if (dirty) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        last = null;
      }
    };

    // Starts the loop if it isn't running and something needs to animate;
    // called from every gesture handler instead of a per-frame poll.
    const wake = () => {
      dirty = true;
      if (raf === 0 && motionSafe && inView && !document.hidden) {
        raf = requestAnimationFrame(frame);
      }
    };
    const syncGates = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = null;
      } else if (shouldRun && dirty && raf === 0) {
        raf = requestAnimationFrame(frame);
      }
    };

    // Sizing — DPR-aware (capped at 2); stage metrics recompute here only.
    const measure = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cssW;
      stageHeight = cssH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // setTransform, not scale — idempotent across repeated measures.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = width / 2;
      cy = stageHeight / 2;
      radius = Math.min(width, stageHeight) * SPHERE_FRACTION;
      drawFrame();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors and repaint immediately either way.
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      drawFrame();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // --- hit testing: nearest named star within PIN_HIT_RADIUS of a point -
    const hitTestStar = (x: number, y: number): number => {
      let bestIndex = -1;
      let bestDist = PIN_HIT_RADIUS;
      for (let i = 0; i < count; i += 1) {
        const point = points[i];
        if (!point || point.starIndex < 0) continue;
        const px = projX[i] ?? 0;
        const py = projY[i] ?? 0;
        const d = Math.hypot(px - x, py - y);
        if (d <= bestDist) {
          bestDist = d;
          bestIndex = point.starIndex;
        }
      }
      return bestIndex;
    };

    const applyPin = (id: string | null, label: string | null) => {
      if (pinnedIdRef.current === id) return;
      pinnedIdRef.current = id;
      setPinnedId(id);
      setPinnedLabel(label);
      onPinRef.current?.(id);
    };

    // Pins (or unpins, for -1) a star by its index into `stars`, and — when
    // motion is safe — eases the cloud so the pinned point turns to front.
    const pinByIndex = (starIndex: number) => {
      const star = starIndex >= 0 ? starsRef.current[starIndex] : undefined;
      if (!star) {
        applyPin(null, null);
        pinTarget = null;
        drawFrame();
        return;
      }
      applyPin(star.id, star.label);
      if (motionSafe) {
        const point = points.find((p) => p.starIndex === starIndex);
        if (point) {
          // Solve the yaw that puts the point on the camera-facing meridian
          // (+z after rotation) and a pitch that lifts it toward the equator.
          const targetYaw =
            rotation.yaw + angleDeltaRad(Math.atan2(point.x, point.z), rotation.yaw);
          const targetPitch = clamp(
            -Math.asin(clamp(point.y, -1, 1)) * 0.6,
            -MAX_PITCH,
            MAX_PITCH,
          );
          pinTarget = { yaw: targetYaw, pitch: targetPitch };
          pinEaseT = 0;
          wake();
        }
      } else {
        drawFrame();
      }
    };
    pinByIndexRef.current = pinByIndex;

    // --- pointer -------------------------------------------------------
    // Under reduced motion the cloud never rotates: pointerdown/move only
    // track the cursor (for hover links) and a plain click pins/unpins.
    // Full motion adds grab-and-spin with release momentum on top.
    const onPointerDown = (event: PointerEvent) => {
      if (!motionSafe) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      drag.id = event.pointerId;
      drag.active = true;
      drag.engaged = false;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastT = event.timeStamp;
      drag.vYaw = 0;
      drag.vPitch = 0;
      velocity.yaw = 0;
      velocity.pitch = 0;
      pinTarget = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (motionSafe && drag.active && event.pointerId === drag.id) {
        const totalDx = event.clientX - drag.startX;
        const totalDy = event.clientY - drag.startY;
        if (!drag.engaged && Math.hypot(totalDx, totalDy) >= DRAG_THRESHOLD) {
          drag.engaged = true;
          container.setPointerCapture(event.pointerId);
        }
        if (drag.engaged) {
          const dx = event.clientX - drag.lastX;
          const dy = event.clientY - drag.lastY;
          const dt = (event.timeStamp - drag.lastT) / 1000;
          const dYaw = dx * DRAG_TO_YAW;
          const dPitch = dy * DRAG_TO_PITCH;
          rotation.yaw += dYaw;
          rotation.pitch = clamp(rotation.pitch + dPitch, -MAX_PITCH, MAX_PITCH);
          if (dt > 0) {
            drag.vYaw = drag.vYaw * 0.4 + (dYaw / dt) * 0.6;
            drag.vPitch = drag.vPitch * 0.4 + (dPitch / dt) * 0.6;
          }
          drag.lastX = event.clientX;
          drag.lastY = event.clientY;
          drag.lastT = event.timeStamp;
        }
      }

      if (motionSafe) wake();
      else drawFrame();
    };

    const onPointerLeave = () => {
      cursor = null;
      if (motionSafe) wake();
      else drawFrame();
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!motionSafe) return;
      if (event.pointerId !== drag.id) return;
      const wasEngaged = drag.engaged;
      drag.active = false;
      drag.engaged = false;
      drag.id = -1;
      if (container.hasPointerCapture?.(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
      if (!wasEngaged) {
        // A tap/click, not a spin — hit-test for a pin toggle.
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const hit = hitTestStar(x, y);
        const hitStar = hit >= 0 ? starsRef.current[hit] : undefined;
        pinByIndex(hitStar && hitStar.id === pinnedIdRef.current ? -1 : hit);
        return;
      }
      velocity.yaw = clamp(drag.vYaw, -MAX_SPIN, MAX_SPIN);
      velocity.pitch = clamp(drag.vPitch, -MAX_SPIN, MAX_SPIN);
      wake();
    };

    // Reduced motion has no drag to disambiguate from a tap — a plain click
    // hit-tests and pins/unpins directly.
    const onClick = (event: MouseEvent) => {
      if (motionSafe) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = hitTestStar(x, y);
      const hitStar = hit >= 0 ? starsRef.current[hit] : undefined;
      pinByIndex(hitStar && hitStar.id === pinnedIdRef.current ? -1 : hit);
    };

    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncGates();
    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) inView = lastEntry.isIntersecting;
        syncGates();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
    } else {
      // One static frame; measure() may already have run before colors
      // settled, so draw again once resolveColors() has definitely run.
      drawFrame();
    }

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("pointerup", onPointerEnd);
    container.addEventListener("pointercancel", onPointerEnd);
    container.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointerup", onPointerEnd);
      container.removeEventListener("pointercancel", onPointerEnd);
      container.removeEventListener("click", onClick);
      pinByIndexRef.current = () => {};
    };
  }, [extraCount, motionSafe]);

  // Mirrors the canvas's click-to-toggle: activating the already-pinned
  // star's button unpins it, same as clicking empty space would.
  const handleKeyboardPin = (index: number) => {
    const star = stars[index];
    pinByIndexRef.current(star && star.id === pinnedId ? -1 : index);
  };

  const hudText = pinnedLabel ? `PINNED · ${pinnedLabel}` : "SCANNING";

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={containerRef}
        className={cn(
          "relative touch-none select-none",
          motionSafe && "cursor-grab active:cursor-grabbing",
        )}
        style={{ height }}
      >
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
      </div>

      <p className="text-label text-ink-3 mt-2 font-mono">{hudText}</p>

      <div
        role="group"
        aria-label={ariaLabel ?? "Named stars"}
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {stars.map((star, index) => {
          const isPinned = star.id === pinnedId;
          return (
            <button
              key={star.id}
              type="button"
              aria-pressed={isPinned}
              className={cn(
                "text-label rounded-1 border px-1.5 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cobalt-bright/40",
                isPinned
                  ? "border-hairline-strong text-cobalt-bright"
                  : "border-hairline text-ink-3 hover:text-ink-2",
              )}
              style={{
                backgroundColor: isPinned ? "var(--accent-wash)" : "transparent",
              }}
              onFocus={() => handleKeyboardPin(index)}
              onClick={() => handleKeyboardPin(index)}
            >
              {star.label}
            </button>
          );
        })}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {pinnedLabel ? `Pinned ${pinnedLabel}` : "No star pinned"}
      </span>
    </div>
  );
}
