"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { motion } from "motion/react";

import {
  LabBody,
  LabChips,
  LabStage,
  LiveCode,
} from "@/components/playground/lab-primitives";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const CARDS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const LAYOUTS = ["list", "grid"] as const;
const SPRINGS = ["glide", "snap", "drift"] as const;
const TOGGLE = ["on", "off"] as const;

type LayoutMode = (typeof LAYOUTS)[number];
type SpringChoice = (typeof SPRINGS)[number];
type Toggle = (typeof TOGGLE)[number];

type Box = { x: number; y: number; w: number; h: number };
type Ghost = Box & {
  id: string;
  moved: boolean;
  cx: number;
  cy: number;
  nx: number;
  ny: number;
};

/** Deterministic Fisher–Yates driven by a tiny LCG — same seed, same order. */
function lcgShuffle(input: readonly string[], seed: number): string[] {
  const result = [...input];
  let s = (seed * 9301 + 49297) % 233280;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a !== undefined && b !== undefined) {
      result[i] = b;
      result[j] = a;
    }
  }
  return result;
}

/** SSR-safe layout effect (labs render on the server once). */
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function LayoutLab() {
  const motionSafe = useMotionSafe();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [spring, setSpring] = useState<SpringChoice>("glide");
  const [xray, setXray] = useState<Toggle>("off");
  const [animateLayout, setAnimateLayout] = useState<Toggle>("on");
  const [shuffleCount, setShuffleCount] = useState(0);
  const [featured, setFeatured] = useState<string | null>(null);
  const [changeCount, setChangeCount] = useState(0);
  const [lastTransition, setLastTransition] = useState("—");
  const [movedCount, setMovedCount] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [batch, setBatch] = useState<{ key: number; ghosts: Ghost[] } | null>(
    null,
  );

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const snapshotRef = useRef<Map<string, Box> | null>(null);

  // Order is derived, not stored: replay every shuffle from its seed.
  const order = useMemo(() => {
    let arr: string[] = [...CARDS];
    for (let round = 1; round <= shuffleCount; round++) {
      arr = lcgShuffle(arr, round * 7919);
    }
    return arr;
  }, [shuffleCount]);

  const flipEnabled = animateLayout === "on" && motionSafe;

  /**
   * The FLIP "measure" step: snapshot every card's visual box (viewport
   * rects, wrapper-relative) BEFORE the state change re-flows the layout.
   */
  const commit = (label: string, apply: () => void) => {
    const wrapper = wrapperRef.current;
    if (wrapper) {
      const origin = wrapper.getBoundingClientRect();
      const snap = new Map<string, Box>();
      for (const [id, el] of cardRefs.current) {
        const rect = el.getBoundingClientRect();
        snap.set(id, {
          x: rect.left - origin.left,
          y: rect.top - origin.top,
          w: rect.width,
          h: rect.height,
        });
      }
      snapshotRef.current = snap;
    }
    setLastTransition(label);
    apply();
    setChangeCount((c) => c + 1);
  };

  // After the re-flow: diff old boxes against the new layout positions.
  // offsetLeft/Top ignore transforms, so motion's inversion can't fool us.
  useIsoLayoutEffect(() => {
    const snap = snapshotRef.current;
    snapshotRef.current = null;
    if (!snap) return;
    const ghosts: Ghost[] = [];
    let moved = 0;
    for (const [id, el] of cardRefs.current) {
      const prev = snap.get(id);
      if (!prev) continue;
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      const nx = el.offsetLeft + el.offsetWidth / 2;
      const ny = el.offsetTop + el.offsetHeight / 2;
      const didMove =
        Math.abs(nx - cx) > 1 ||
        Math.abs(ny - cy) > 1 ||
        Math.abs(el.offsetWidth - prev.w) > 1 ||
        Math.abs(el.offsetHeight - prev.h) > 1;
      if (didMove) moved += 1;
      ghosts.push({ id, ...prev, moved: didMove, cx, cy, nx, ny });
    }
    setMovedCount(moved);
    if (xray === "on") setBatch({ key: changeCount, ghosts });
  }, [changeCount, xray]);

  // Ghost overlays fade over ~600ms, then leave the DOM.
  useEffect(() => {
    if (!batch) return;
    const timer = setTimeout(() => setBatch(null), 900);
    return () => clearTimeout(timer);
  }, [batch]);

  const setLayout = (next: LayoutMode) => {
    if (next === layoutMode) return;
    commit(`${layoutMode} → ${next}`, () => setLayoutMode(next));
  };

  const shuffle = () =>
    commit(`shuffle #${shuffleCount + 1}`, () => setShuffleCount((c) => c + 1));

  const toggleFeatured = (id: string) => {
    const releasing = featured === id;
    commit(releasing ? `${id} released` : `${id} featured`, () =>
      setFeatured(releasing ? null : id),
    );
    setAnnounce(releasing ? `Card ${id} released` : `Card ${id} featured`);
  };

  const layoutToken = animateLayout === "on" ? "layout" : "layout={false}";
  const code = `import { motion } from "motion/react";
import { springs } from "@/lib/motion";

<motion.div ${layoutToken} transition={springs.${spring}} />

// FLIP: measure → invert → play. The card's width is set
// by CSS; the motion is scale/translate impersonating it.`;

  return (
    <LabBody
      controls={
        <>
          <LabChips
            label="Layout"
            options={LAYOUTS}
            value={layoutMode}
            onChange={setLayout}
          />
          <button
            type="button"
            onClick={shuffle}
            className="border-hairline text-ink-2 hover:border-hairline-strong hover:text-ink w-full rounded-1 border px-2 py-1.5 font-mono text-xs transition-colors"
          >
            SHUFFLE · SEED {String(shuffleCount).padStart(2, "0")}
          </button>
          <LabChips
            label="Spring"
            options={SPRINGS}
            value={spring}
            onChange={setSpring}
          />
          <LabChips
            label="X-ray · show FLIP boxes"
            options={TOGGLE}
            value={xray}
            onChange={setXray}
          />
          <LabChips
            label="Animate layout"
            options={TOGGLE}
            value={animateLayout}
            onChange={setAnimateLayout}
          />
          <div className="border-hairline rounded-2 border p-3">
            <p className="text-label text-ink-3">READING</p>
            <dl className="mt-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">last transition</dt>
                <dd className="text-ink text-right">{lastTransition}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">cards moved</dt>
                <dd className="text-ink tabular-nums">
                  {movedCount}/{CARDS.length}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">spring</dt>
                <dd className="text-cobalt-bright">
                  {flipEnabled ? spring : "off · instant"}
                </dd>
              </div>
            </dl>
            <p className="text-label text-ink-3 mt-3">
              TRANSFORMS ONLY · WIDTH NEVER ANIMATES
            </p>
          </div>
        </>
      }
      stage={
        <LabStage
          label="KL-06 · FLIP RIG"
          className="flex-col justify-start"
          minHeight={480}
        >
          <div ref={wrapperRef} className="relative w-full max-w-[560px]">
            <div
              className={cn(
                "w-full gap-2",
                layoutMode === "list" ? "flex flex-col" : "grid grid-cols-4",
              )}
            >
              {order.map((id, index) => {
                const isFeatured = featured === id;
                return (
                  <motion.button
                    key={id}
                    ref={(node) => {
                      if (node) cardRefs.current.set(id, node);
                      else cardRefs.current.delete(id);
                    }}
                    type="button"
                    layout={flipEnabled}
                    transition={springs[spring]}
                    style={{ borderRadius: 6, order: isFeatured ? -1 : 0 }}
                    onClick={() => toggleFeatured(id)}
                    aria-pressed={isFeatured}
                    aria-label={
                      isFeatured
                        ? `Card ${id}, featured. Press to release.`
                        : `Card ${id}. Press to feature.`
                    }
                    className={cn(
                      "bg-surface-2 border-hairline text-ink flex cursor-pointer items-center border font-mono text-sm",
                      isFeatured
                        ? "col-span-full h-24 justify-start gap-4 px-5"
                        : layoutMode === "list"
                          ? "h-12 justify-start gap-3 px-4"
                          : "aspect-square justify-center",
                    )}
                  >
                    <motion.span
                      layout={flipEnabled ? "position" : false}
                      className={
                        isFeatured ? "text-cobalt-bright text-xl" : undefined
                      }
                    >
                      {id}
                    </motion.span>
                    {!isFeatured && layoutMode === "list" ? (
                      <span className="text-ink-3 text-[10px] tracking-wider">
                        SLOT {String(index).padStart(2, "0")}
                      </span>
                    ) : null}
                    {isFeatured ? (
                      <motion.span
                        layout={flipEnabled ? "position" : false}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.24 }}
                        className="min-w-0 text-left"
                      >
                        <span className="text-label text-cobalt-bright block">
                          FEATURED · FULL-WIDTH SLOT
                        </span>
                        <span className="text-ink-3 mt-1 block text-xs">
                          Same element, new box — measured, inverted, played.
                        </span>
                      </motion.span>
                    ) : null}
                  </motion.button>
                );
              })}
            </div>

            {/* X-ray: old boxes (dashed) + old→new center lines, fading out. */}
            {batch ? (
              <motion.svg
                key={batch.key}
                aria-hidden
                className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.6, delay: 0.15, ease: "linear" }}
              >
                {batch.ghosts.map((g) => (
                  <g key={g.id}>
                    <rect
                      x={g.x}
                      y={g.y}
                      width={g.w}
                      height={g.h}
                      rx={6}
                      fill="none"
                      stroke="var(--hairline-strong)"
                      strokeDasharray="4 4"
                    />
                    {g.moved ? (
                      <>
                        <line
                          x1={g.cx}
                          y1={g.cy}
                          x2={g.nx}
                          y2={g.ny}
                          stroke="var(--signal)"
                          strokeWidth={1}
                          opacity={0.8}
                        />
                        <circle cx={g.nx} cy={g.ny} r={2.5} fill="var(--signal)" />
                      </>
                    ) : null}
                  </g>
                ))}
              </motion.svg>
            ) : null}
          </div>
          <p role="status" className="sr-only">
            {announce}
          </p>
        </LabStage>
      }
      code={<LiveCode code={code} values={[layoutToken, `springs.${spring}`]} />}
    />
  );
}
