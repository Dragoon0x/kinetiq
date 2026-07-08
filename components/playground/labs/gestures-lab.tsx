"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { animate, motion, useMotionValue } from "motion/react";

import {
  LabBody,
  LabChips,
  LabSlider,
  LabStage,
  LiveCode,
} from "@/components/playground/lab-primitives";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const PUCK = 56;
const LANDING_SPRINGS = ["glide", "drift", "snap"] as const;
const SNAP_MODES = ["off", "corners"] as const;

type LandingSpring = (typeof LANDING_SPRINGS)[number];
type SnapMode = (typeof SNAP_MODES)[number];

/** Corner docks in arena-relative coordinates (set once measured). */
function cornerDocks(w: number, h: number) {
  const inset = 12;
  return [
    { id: "NW", x: inset, y: inset },
    { id: "NE", x: w - PUCK - inset, y: inset },
    { id: "SW", x: inset, y: h - PUCK - inset },
    { id: "SE", x: w - PUCK - inset, y: h - PUCK - inset },
  ];
}

export function GesturesLab() {
  const motionSafe = useMotionSafe();
  const arenaRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const [timeConstant, setTimeConstant] = useState(0.35);
  const [elastic, setElastic] = useState(0.2);
  const [snapMode, setSnapMode] = useState<SnapMode>("off");
  const [landing, setLanding] = useState<LandingSpring>("glide");

  const [dragging, setDragging] = useState(false);
  const [arena, setArena] = useState({ w: 480, h: 320 });
  const [reading, setReading] = useState({ speed: 0, distance: 0 });

  useEffect(() => {
    const node = arenaRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setArena({
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [vector, setVector] = useState({ angle: 0, length: 0 });
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [lastLanding, setLastLanding] = useState("—");
  const lastArrow = useRef({ dx: 1, dy: 0 });
  const throttleRef = useRef(0);

  const arenaSize = () => {
    const rect = arenaRef.current?.getBoundingClientRect();
    return { w: rect?.width ?? 480, h: rect?.height ?? 320 };
  };

  const clampToArena = useCallback((px: number, py: number) => {
    const { w, h } = arenaSize();
    return {
      x: Math.min(Math.max(px, 0), w - PUCK),
      y: Math.min(Math.max(py, 0), h - PUCK),
    };
  }, []);

  const project = useCallback(() => {
    const vx = x.getVelocity();
    const vy = y.getVelocity();
    const raw = {
      x: x.get() + vx * timeConstant,
      y: y.get() + vy * timeConstant,
    };
    const clamped = clampToArena(raw.x, raw.y);
    return { ...clamped, vx, vy };
  }, [clampToArena, timeConstant, x, y]);

  const onDrag = useCallback(() => {
    const now = performance.now();
    if (now - throttleRef.current < 60) return;
    throttleRef.current = now;
    const { x: px, y: py, vx, vy } = project();
    const speed = Math.hypot(vx, vy);
    setReading({
      speed: Math.round(speed),
      distance: Math.round(Math.hypot(px - x.get(), py - y.get())),
    });
    setVector({
      angle: (Math.atan2(vy, vx) * 180) / Math.PI,
      length: Math.min(120, speed / 12),
    });
    if (motionSafe) setGhost({ x: px, y: py });
  }, [motionSafe, project, x, y]);

  const landAt = useCallback(
    (tx: number, ty: number, label: string) => {
      const transition = motionSafe ? springs[landing] : { duration: 0 };
      animate(x, tx, transition);
      animate(y, ty, transition);
      setLastLanding(label);
      setGhost(null);
      setVector({ angle: 0, length: 0 });
    },
    [landing, motionSafe, x, y],
  );

  const onDragEnd = useCallback(() => {
    setDragging(false);
    const { x: px, y: py } = project();
    if (snapMode === "corners") {
      const { w, h } = arenaSize();
      const docks = cornerDocks(w, h);
      let best = docks[0];
      let bestDist = Infinity;
      for (const dock of docks) {
        const d = Math.hypot(dock.x - px, dock.y - py);
        if (d < bestDist && dock) {
          best = dock;
          bestDist = d;
        }
      }
      if (best) landAt(best.x, best.y, `dock ${best.id}`);
      return;
    }
    if (motionSafe) {
      landAt(px, py, "free");
    } else {
      // Reduced motion: the puck stays exactly where it was dropped.
      setLastLanding("dropped in place");
      setGhost(null);
    }
  }, [landAt, motionSafe, project, snapMode]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 24 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const [dx, dy] = move;
      lastArrow.current = { dx: Math.sign(dx) || 0, dy: Math.sign(dy) || 0 };
      const next = clampToArena(x.get() + dx, y.get() + dy);
      x.set(next.x);
      y.set(next.y);
      setLastLanding("keyboard move");
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const power = 320;
      const { dx, dy } = lastArrow.current;
      const target = clampToArena(x.get() + dx * power, y.get() + dy * power);
      landAt(target.x, target.y, "keyboard fling");
    }
  };

  const code = `// Project the release: where was the gesture going?
const vx = x.getVelocity();
const target = x.get() + vx * ${timeConstant.toFixed(2)};

// Animate to the projection, not the drop point
animate(x, clamp(target), springs.${landing});`;

  return (
    <LabBody
      controls={
        <>
          <LabSlider
            label="Power (time constant)"
            value={timeConstant}
            min={0.1}
            max={0.8}
            step={0.05}
            format={(v) => `${v.toFixed(2)}s`}
            onChange={setTimeConstant}
            hint="How far the velocity carries: target = x + v × tc."
          />
          <LabSlider
            label="Edge elasticity"
            value={elastic}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={setElastic}
            hint="Give at the arena walls while dragging."
          />
          <LabChips
            label="Snap points"
            options={SNAP_MODES}
            value={snapMode}
            onChange={setSnapMode}
          />
          <LabChips
            label="Landing spring"
            options={LANDING_SPRINGS}
            value={landing}
            onChange={setLanding}
          />
          <div className="border-hairline rounded-2 border p-3">
            <p className="text-label text-ink-3">READING</p>
            <dl className="mt-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-3">velocity</dt>
                <dd className="text-ink tabular-nums">{reading.speed} px/s</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">projection</dt>
                <dd className="text-ink tabular-nums">{reading.distance} px</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">last landing</dt>
                <dd className="text-cobalt-bright">{lastLanding}</dd>
              </div>
            </dl>
          </div>
        </>
      }
      stage={
        <LabStage
          label="KL-05 · ARENA"
          onReplay={() => {
            x.set(0);
            y.set(0);
            setLastLanding("reset");
            setGhost(null);
          }}
          className="p-4"
          minHeight={360}
        >
          <div
            ref={arenaRef}
            className="bg-grid border-hairline relative h-[320px] w-full overflow-hidden rounded-2 border"
          >
            {cornerDocks(arena.w, arena.h).map((dock) => (
              <span
                key={dock.id}
                aria-hidden
                className={cn(
                  "text-hairline-strong absolute font-mono text-[10px]",
                  snapMode === "corners" ? "opacity-100" : "opacity-30",
                )}
                style={{ left: dock.x + PUCK / 2 - 8, top: dock.y + PUCK / 2 - 8 }}
              >
                ✛
              </span>
            ))}

            {ghost && dragging ? (
              <span
                aria-hidden
                className="border-cobalt/60 absolute rounded-3 border-2 border-dashed"
                style={{ left: ghost.x, top: ghost.y, width: PUCK, height: PUCK }}
              />
            ) : null}

            {dragging && vector.length > 4 ? (
              <span
                aria-hidden
                className="absolute h-0.5 origin-left rounded-full"
                style={{
                  left: x.get() + PUCK / 2,
                  top: y.get() + PUCK / 2,
                  width: vector.length,
                  background: "var(--signal)",
                  transform: `rotate(${vector.angle}deg)`,
                }}
              />
            ) : null}

            <motion.div
              role="application"
              aria-label="Draggable puck. Arrow keys move, Shift for larger steps, Enter flings in the last direction."
              tabIndex={0}
              drag
              dragConstraints={arenaRef}
              dragElastic={elastic}
              dragMomentum={false}
              onDragStart={() => setDragging(true)}
              onDrag={onDrag}
              onDragEnd={onDragEnd}
              onKeyDown={onKeyDown}
              style={{ x, y, width: PUCK, height: PUCK }}
              className="bg-cobalt absolute top-0 left-0 cursor-grab rounded-3 shadow-[0_0_20px_var(--accent-wash)] active:cursor-grabbing"
            />
            <span role="status" className="sr-only">
              {lastLanding === "—" ? "" : `Landed: ${lastLanding}`}
            </span>
          </div>
        </LabStage>
      }
      code={
        <LiveCode
          code={code}
          values={[timeConstant.toFixed(2), `springs.${landing}`]}
        />
      }
    />
  );
}
