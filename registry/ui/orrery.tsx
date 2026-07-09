"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { djb2, mapRange, orbitPoint } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Only the first 8 items join the constellation. */
const MAX_BODIES = 8;
/** Body disc diameter, px — the orbit geometry is sized around this face. */
const BODY = 40;
/** Hub plate diameter, px — a step larger than the bodies it anchors. */
const HUB = 60;
/** Scale a captured body flies to — the translateZ-equivalent "forward". */
const FOCUS_SCALE = 1.6;
/** Uncaptured bodies dim to this while one is forward. */
const DIM_OPACITY = 0.3;
/** Staggered ring factors — up to three radii derived from `radius`. */
const RING_FACTORS = [1, 0.78, 0.58] as const;
/** Depth z-bands: far bodies behind the hub, near bodies in front of it. */
const Z_FAR = 0;
const Z_HUB = 5;
const Z_NEAR = 10;
const Z_FOCUS = 30;
/** Vertical room reserved under the orbit band for the detail card. */
const CARD_RESERVE = 104;
/** Detail card width, px (w-44) — centered on the focus slot. */
const CARD_W = 176;

/** Fixed per-body accents, indexed — mid-lightness oklch reads on both themes. */
const ACCENTS = [
  "oklch(0.68 0.16 262)",
  "oklch(0.7 0.14 162)",
  "oklch(0.7 0.14 52)",
  "oklch(0.68 0.16 350)",
  "oklch(0.72 0.13 86)",
  "oklch(0.68 0.12 205)",
  "oklch(0.66 0.14 300)",
  "oklch(0.64 0.15 25)",
] as const;

export type OrreryItem = {
  /** Stable identity — also the value reported by `onFocusChange`. */
  id: string;
  /** Accessible name; the default disc face mints its initials. */
  label: string;
  /** Custom body face, replacing the default minted disc. */
  node?: React.ReactNode;
};

export type OrreryProps = {
  /** Bodies in orbit; the first 8 are used. */
  items: OrreryItem[];
  /** The center piece, rendered on the hub plate. */
  hub: React.ReactNode;
  /** Focus card content for a captured body. @default the item's label */
  detail?: (item: OrreryItem) => React.ReactNode;
  /** Outer orbit radius, px — inner rings stagger down from it. @default 120 */
  radius?: number;
  /** Orbital plane incline toward the viewer, degrees. @default 24 */
  inclineDeg?: number;
  /** Seconds per outer revolution — slow, ambient. Inner rings run faster. @default 36 */
  period?: number;
  /** Fires with a body's id when it is captured, null when released. */
  onFocusChange?: (id: string | null) => void;
  className?: string;
  "aria-label"?: string;
};

type BodyPose = {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  z: number;
};

type BodyMotionSet = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  opacity: MotionValue<number>;
  z: MotionValue<number>;
};

type BodyConfig = {
  item: OrreryItem;
  ringRadius: number;
  /** Seconds per revolution on this ring — Kepler-scaled from the outer period. */
  period: number;
  /** Fixed angle offset, degrees — evenly spaced with djb2 jitter. */
  phase: number;
  accent: string;
  initials: string;
};

/** Mints up to two initials from a label; never empty. */
const initialsOf = (label: string): string => {
  const words = label.trim().split(/\s+/);
  const first = words[0]?.charAt(0) ?? "";
  const second = words[1]?.charAt(0) ?? words[0]?.charAt(1) ?? "";
  const minted = (first + second).toUpperCase();
  return minted === "" ? "·" : minted;
};

/** True when `el` gained focus via the keyboard; pauses on the safe side. */
const isKeyboardFocus = (el: HTMLElement): boolean => {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
};

/**
 * Items orbit a hub on inclined 3D paths; click a body to fly it forward into
 * focus.
 *
 * The ambient motion is one clock-driven rAF loop: it advances a time ref and
 * writes every body's translate/scale/opacity/z straight into motion values —
 * no React state per frame. Each body's angle is phase + t·(360/period), with
 * phases deterministic (evenly spaced + djb2 jitter, no Math.random) and
 * periods scaling by ring-radius^1.5 so inner bodies honestly orbit faster.
 * Positions come from orbitPoint(); its depth maps to scale (.82–1.08),
 * opacity (.55–1) and a z band on either side of the hub plate. The paths
 * themselves are faint hairline ellipses (rotateX-inclined rings).
 *
 * Loop discipline mirrors Wavefield: the loop pauses while the document is
 * hidden, the stage is offscreen (IntersectionObserver + visibilitychange),
 * any body holds keyboard focus, or a body is captured/returning — rebasing
 * its clock on every resume so the constellation continues rather than jumps —
 * and fully stops on unmount.
 *
 * Capture: click/Enter pauses the orbit and flies the body to a focus slot
 * below the hub on `springs.glide` (scale 1.6, front z) while the others dim
 * on a base tween; the detail card fades in under it. Escape, clicking the
 * body again, or clicking the hub releases — the body glides home, the card
 * fades out, and the orbit resumes from where it froze. Exactly one body is
 * forward at a time; captures announce through an sr-only polite region
 * ("<label> in focus" / "Released") and report via `onFocusChange`.
 *
 * Reduced motion: no orbit — the constellation rests at its phase-0
 * composition on the inclined ellipses; capture is an instant swap with the
 * card at duration-fast, same announcements, same keyboard paths.
 */
export function Orrery({
  items,
  hub,
  detail,
  radius = 120,
  inclineDeg = 24,
  period = 36,
  onFocusChange,
  className,
  "aria-label": ariaLabel = "Orrery",
}: OrreryProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  // Per-body orbit parameters — pure and deterministic from props.
  const bodies = React.useMemo<BodyConfig[]>(() => {
    const roster = items.slice(0, MAX_BODIES);
    const count = Math.max(roster.length, 1);
    return roster.map((item, index) => {
      const factor = RING_FACTORS[index % RING_FACTORS.length] ?? 1;
      // djb2 jitter (±15°) keeps the spacing organic yet identical every visit.
      const jitter = (djb2(`${item.id}:${index}`) / 4294967296) * 30 - 15;
      return {
        item,
        ringRadius: radius * factor,
        // Kepler-ish: period ∝ radius^1.5, so inner rings visibly run faster.
        period: period * Math.pow(factor, 1.5),
        phase: (360 / count) * index + jitter,
        accent: ACCENTS[index % ACCENTS.length] ?? "oklch(0.68 0.16 262)",
        initials: initialsOf(item.label),
      };
    });
  }, [items, radius, period]);

  /** A body's orbital pose at clock time `t` — the single geometry source. */
  const poseAt = React.useCallback(
    (cfg: BodyConfig, t: number): BodyPose => {
      const angle = cfg.phase + (t * 360) / cfg.period;
      const point = orbitPoint(cfg.ringRadius, angle, inclineDeg);
      return {
        x: point.x,
        y: point.y,
        scale: mapRange(point.depth, -1, 1, 0.82, 1.08),
        opacity: mapRange(point.depth, -1, 1, 0.55, 1),
        z: point.depth >= 0 ? Z_NEAR : Z_FAR,
      };
    },
    [inclineDeg],
  );

  // Stage geometry: the ellipse band plus reserved room for the focus slot.
  const ellipseHalf = radius * Math.sin((inclineDeg * Math.PI) / 180);
  const slotY = ellipseHalf + 48;
  const topH = ellipseHalf + 30;
  const stageW = radius * 2 + BODY + 16;
  const stageH = topH + slotY + (BODY * FOCUS_SCALE) / 2 + 8 + CARD_RESERVE;

  // React state carries only what the DOM tree needs: the captured id (card,
  // aria-pressed) and the polite announcement. Both set from handlers only.
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  /** Registered motion values per body id — written by the loop and flights. */
  const mvsRef = React.useRef<Map<string, BodyMotionSet>>(new Map());
  /** The orbit clock, seconds. Frozen across pauses, never jumps. */
  const tRef = React.useRef(0);
  const focusedRef = React.useRef<string | null>(null);
  /** Body currently forward OR flying home — the loop stays paused meanwhile. */
  const detachedRef = React.useRef<string | null>(null);
  /** True while any body holds keyboard focus (focus-within pause). */
  const focusPauseRef = React.useRef(false);
  /** The loop's gate re-check, exposed to event handlers. */
  const syncRef = React.useRef<(() => void) | null>(null);
  /** In-flight capture/release animations, stopped on unmount. */
  const flightsRef = React.useRef<Set<ReturnType<typeof animate>>>(new Set());

  const register = React.useCallback(
    (id: string, set: BodyMotionSet | null) => {
      if (set) mvsRef.current.set(id, set);
      else mvsRef.current.delete(id);
    },
    [],
  );

  /** Keep a flight until it settles (or is stopped) so unmount can stop it. */
  const track = (flight: ReturnType<typeof animate>) => {
    const flights = flightsRef.current;
    flights.add(flight);
    const untrack = () => {
      flights.delete(flight);
    };
    flight.then(untrack, untrack);
    return flight;
  };

  /** Release the captured body: glide home, un-dim the rest, resume rebased. */
  const releaseBody = () => {
    const id = focusedRef.current;
    if (id === null) return;
    focusedRef.current = null;
    setFocusedId(null);
    setAnnouncement("Released");
    onFocusChange?.(null);

    const cfg = bodies.find((body) => body.item.id === id);
    const mvs = mvsRef.current.get(id);
    if (!cfg || !mvs) {
      detachedRef.current = null;
      syncRef.current?.();
      return;
    }

    // The orbit froze at capture, so the frozen clock is still its home.
    const home = poseAt(cfg, tRef.current);
    if (motionSafe) {
      track(animate(mvs.x, home.x, springs.glide));
      track(animate(mvs.y, home.y, springs.glide));
      track(
        animate(mvs.opacity, home.opacity, {
          duration: durations.base,
          ease: easings.move,
        }),
      );
      const landing = track(animate(mvs.scale, home.scale, springs.glide));
      landing.then(() => {
        // A re-capture mid-flight owns the pause now — leave it in place.
        if (detachedRef.current !== id || focusedRef.current !== null) return;
        detachedRef.current = null;
        mvs.z.set(home.z);
        syncRef.current?.();
      });
    } else {
      // Reduced motion: instant swap back to the static composition.
      mvs.x.set(home.x);
      mvs.y.set(home.y);
      mvs.scale.set(home.scale);
      mvs.opacity.set(home.opacity);
      mvs.z.set(home.z);
      detachedRef.current = null;
      syncRef.current?.();
    }

    for (const other of bodies) {
      if (other.item.id === id) continue;
      const om = mvsRef.current.get(other.item.id);
      if (!om) continue;
      const otherHome = poseAt(other, tRef.current);
      if (motionSafe) {
        track(
          animate(om.opacity, otherHome.opacity, {
            duration: durations.base,
            ease: easings.move,
          }),
        );
      } else {
        om.opacity.set(otherHome.opacity);
      }
    }
  };

  /** Capture a body: pause the orbit and fly it forward to the focus slot. */
  const captureBody = (cfg: BodyConfig) => {
    const id = cfg.item.id;
    if (focusedRef.current === id) {
      releaseBody();
      return;
    }
    const prevId = focusedRef.current;
    focusedRef.current = id;
    detachedRef.current = id;
    setFocusedId(id);
    setAnnouncement(`${cfg.item.label} in focus`);
    onFocusChange?.(id);
    // The gate sees the detached body and freezes the clock where it is.
    syncRef.current?.();

    const mvs = mvsRef.current.get(id);
    if (mvs) {
      mvs.z.set(Z_FOCUS);
      if (motionSafe) {
        track(animate(mvs.x, 0, springs.glide));
        track(animate(mvs.y, slotY, springs.glide));
        track(animate(mvs.scale, FOCUS_SCALE, springs.glide));
        track(
          animate(mvs.opacity, 1, {
            duration: durations.base,
            ease: easings.move,
          }),
        );
      } else {
        mvs.x.set(0);
        mvs.y.set(slotY);
        mvs.scale.set(FOCUS_SCALE);
        mvs.opacity.set(1);
      }
    }

    for (const other of bodies) {
      if (other.item.id === id) continue;
      const om = mvsRef.current.get(other.item.id);
      if (!om) continue;
      // A body handing focus over glides straight home from the slot.
      if (other.item.id === prevId) {
        const home = poseAt(other, tRef.current);
        om.z.set(home.z);
        if (motionSafe) {
          track(animate(om.x, home.x, springs.glide));
          track(animate(om.y, home.y, springs.glide));
          track(animate(om.scale, home.scale, springs.glide));
        } else {
          om.x.set(home.x);
          om.y.set(home.y);
          om.scale.set(home.scale);
        }
      }
      if (motionSafe) {
        track(
          animate(om.opacity, DIM_OPACITY, {
            duration: durations.base,
            ease: easings.move,
          }),
        );
      } else {
        om.opacity.set(DIM_OPACITY);
      }
    }
  };

  // Escape releases from anywhere — pointer captures don't need DOM focus.
  const releaseRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    releaseRef.current = releaseBody;
  });
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || focusedRef.current === null) return;
      releaseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A flight in progress must never outlive the component.
  React.useEffect(() => {
    const flights = flightsRef.current;
    return () => {
      flights.forEach((flight) => flight.stop());
      flights.clear();
    };
  }, []);

  // The one rAF loop: advance the clock, write poses, gate on every pause
  // source. Also runs a single synchronous write pass so prop changes (and
  // the reduced-motion static composition) land without a running loop.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    // Reduced motion rests at phase 0 — the designed static composition.
    if (!motionSafe) tRef.current = 0;

    const writePoses = (t: number) => {
      const captured = focusedRef.current;
      for (const cfg of bodies) {
        const id = cfg.item.id;
        // A body flying home owns its own values until it lands.
        if (id === detachedRef.current && id !== captured) continue;
        const mvs = mvsRef.current.get(id);
        if (!mvs) continue;
        if (id === captured) {
          mvs.x.set(0);
          mvs.y.set(slotY);
          mvs.scale.set(FOCUS_SCALE);
          mvs.opacity.set(1);
          mvs.z.set(Z_FOCUS);
          continue;
        }
        const pose = poseAt(cfg, t);
        mvs.x.set(pose.x);
        mvs.y.set(pose.y);
        mvs.scale.set(pose.scale);
        mvs.opacity.set(captured !== null ? DIM_OPACITY : pose.opacity);
        mvs.z.set(pose.z);
      }
    };

    // Settle current geometry immediately (covers prop changes mid-session).
    writePoses(tRef.current);

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;
    const baseT = tRef.current;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const t = baseT + (now - started) / 1000;
      tRef.current = t;
      writePoses(t);
    };

    const syncLoop = () => {
      const shouldRun =
        motionSafe &&
        inView &&
        !document.hidden &&
        detachedRef.current === null &&
        !focusPauseRef.current;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the orbit resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };
    syncRef.current = syncLoop;

    // Under reduced motion the loop never starts — no gates to watch.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(stage);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(raf);
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      syncRef.current = null;
    };
  }, [motionSafe, bodies, poseAt, slotY]);

  const focusedBody =
    focusedId === null
      ? undefined
      : bodies.find((body) => body.item.id === focusedId);
  const ringRadii = Array.from(new Set(bodies.map((body) => body.ringRadius)));

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label={ariaLabel}
      className={cn("relative select-none", className)}
      style={{ width: stageW, height: stageH }}
      // Keyboard focus anywhere inside holds the orbit still for targeting.
      // Pointer-driven focus (a clicked hub or body) must not — capture has
      // its own pause, and a released orbit has to resume under the cursor.
      onFocus={(event) => {
        focusPauseRef.current = isKeyboardFocus(event.target as HTMLElement);
        syncRef.current?.();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        focusPauseRef.current = false;
        syncRef.current?.();
      }}
    >
      {/* Zero-size anchor at the orbit center; everything hangs off it. */}
      <div className="absolute" style={{ left: stageW / 2, top: topH }}>
        {/* Orbit paths: hairline rings squashed to the incline. */}
        {ringRadii.map((ring) => (
          <div
            key={ring}
            aria-hidden
            className="pointer-events-none absolute rounded-full border border-hairline"
            style={{
              width: ring * 2,
              height: ring * 2,
              left: -ring,
              top: -ring,
              transform: `rotateX(${90 - inclineDeg}deg)`,
            }}
          />
        ))}

        {/* Hub plate — mid z, so far bodies pass behind and near in front. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Release focus"
          onClick={releaseBody}
          className={cn(
            "absolute flex items-center justify-center rounded-full border border-hairline-strong bg-surface-2",
            focusedId !== null && "cursor-pointer",
          )}
          style={{
            width: HUB,
            height: HUB,
            left: -HUB / 2,
            top: -HUB / 2,
            zIndex: Z_HUB,
          }}
        >
          <span className="pointer-events-none">{hub}</span>
        </button>

        {bodies.map((cfg) => (
          <OrreryBody
            key={cfg.item.id}
            cfg={cfg}
            initialPose={poseAt(cfg, 0)}
            captured={focusedId === cfg.item.id}
            motionSafe={motionSafe}
            onActivate={() => captureBody(cfg)}
            register={register}
          />
        ))}

        {/* Detail card, docked under the focus slot with the flown body. */}
        <AnimatePresence mode="wait">
          {focusedBody ? (
            <motion.div
              key={focusedBody.item.id}
              className="absolute w-44 rounded-3 border border-hairline bg-surface-2 p-3 shadow-[var(--shadow-raised)]"
              style={{
                left: -CARD_W / 2,
                top: slotY + (BODY * FOCUS_SCALE) / 2 + 10,
                zIndex: Z_FOCUS,
              }}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  opacity: {
                    duration: motionSafe ? durations.base : durations.fast,
                    ease: easings.enter,
                  },
                  y: motionSafe ? springs.glide : { duration: 0 },
                },
              }}
              exit={{
                opacity: 0,
                transition: exitFor(
                  motionSafe ? durations.base : durations.fast,
                ),
              }}
            >
              {detail ? (
                detail(focusedBody.item)
              ) : (
                <p className="text-center text-sm text-ink">
                  {focusedBody.item.label}
                </p>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Polite announcer for capture and release. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type OrreryBodyProps = {
  cfg: BodyConfig;
  initialPose: BodyPose;
  captured: boolean;
  motionSafe: boolean;
  onActivate: () => void;
  register: (id: string, set: BodyMotionSet | null) => void;
};

/**
 * One orbiting body. It owns its motion values (translate/scale/opacity/z)
 * and registers them with the parent loop; the button itself carries the
 * accessible name, toggles capture, and keeps its focus-visible ring.
 */
function OrreryBody({
  cfg,
  initialPose,
  captured,
  motionSafe,
  onActivate,
  register,
}: OrreryBodyProps) {
  const x = useMotionValue(initialPose.x);
  const y = useMotionValue(initialPose.y);
  const scale = useMotionValue(initialPose.scale);
  const opacity = useMotionValue(initialPose.opacity);
  const z = useMotionValue(initialPose.z);

  React.useEffect(() => {
    register(cfg.item.id, { x, y, scale, opacity, z });
    return () => register(cfg.item.id, null);
  }, [register, cfg.item.id, x, y, scale, opacity, z]);

  return (
    <motion.button
      type="button"
      aria-pressed={captured}
      aria-label={cfg.item.label}
      onClick={onActivate}
      className={cn(
        "absolute flex cursor-pointer items-center justify-center rounded-full",
        "transition-colors",
        motionSafe ? "duration-200" : "duration-0",
        cfg.item.node
          ? "bg-transparent"
          : cn(
              "border bg-surface-2 text-ink-2 hover:text-ink",
              captured
                ? "border-[var(--accent-bright)] text-ink"
                : "border-hairline-strong",
            ),
      )}
      style={{
        width: BODY,
        height: BODY,
        left: -BODY / 2,
        top: -BODY / 2,
        x,
        y,
        scale,
        opacity,
        zIndex: z,
      }}
    >
      {cfg.item.node ?? (
        <span className="pointer-events-none flex flex-col items-center gap-[3px] leading-none">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em]">
            {cfg.initials}
          </span>
          <span
            aria-hidden
            className="size-1 rounded-full"
            style={{ background: cfg.accent }}
          />
        </span>
      )}
    </motion.button>
  );
}
