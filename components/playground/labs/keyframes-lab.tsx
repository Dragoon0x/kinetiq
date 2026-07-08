"use client";

import { useMemo, useRef, useState } from "react";

import { motion } from "motion/react";

import {
  LabBody,
  LabChips,
  LabSlider,
  LabStage,
  LiveCode,
} from "@/components/playground/lab-primitives";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const DURATION_S = 2;

type TrackName = "x" | "scale" | "rotate" | "opacity";
type Key = { t: number; v: number };
type Tracks = Record<TrackName, Key[]>;

const TRACK_DEFS: {
  name: TrackName;
  min: number;
  max: number;
  step: number;
}[] = [
  { name: "x", min: -80, max: 80, step: 2 },
  { name: "scale", min: 0.5, max: 1.5, step: 0.05 },
  { name: "rotate", min: -180, max: 180, step: 5 },
  { name: "opacity", min: 0, max: 1, step: 0.05 },
];

const PRESETS = ["story", "anticipate", "blink"] as const;
type Preset = (typeof PRESETS)[number];

const PRESET_TRACKS: Record<Preset, Tracks> = {
  // A hold, a move, an arrival — the default narrative.
  story: {
    x: [
      { t: 0, v: 0 },
      { t: 0.25, v: 0 },
      { t: 0.6, v: 60 },
      { t: 1, v: 60 },
    ],
    scale: [
      { t: 0, v: 1 },
      { t: 0.3, v: 1.15 },
      { t: 0.5, v: 1 },
    ],
    rotate: [
      { t: 0, v: 0 },
      { t: 0.5, v: 0 },
      { t: 0.8, v: 90 },
    ],
    opacity: [
      { t: 0, v: 1 },
      { t: 1, v: 1 },
    ],
  },
  // Pull back before launching — the hold creates the anticipation.
  anticipate: {
    x: [
      { t: 0, v: 0 },
      { t: 0.2, v: -16 },
      { t: 0.35, v: -16 },
      { t: 0.7, v: 72 },
      { t: 1, v: 72 },
    ],
    scale: [
      { t: 0, v: 1 },
      { t: 0.2, v: 0.9 },
      { t: 0.35, v: 0.9 },
      { t: 0.55, v: 1.1 },
      { t: 0.8, v: 1 },
    ],
    rotate: [
      { t: 0, v: 0 },
      { t: 1, v: 0 },
    ],
    opacity: [
      { t: 0, v: 1 },
      { t: 1, v: 1 },
    ],
  },
  blink: {
    x: [
      { t: 0, v: 0 },
      { t: 1, v: 0 },
    ],
    scale: [
      { t: 0, v: 1 },
      { t: 0.5, v: 1.05 },
      { t: 1, v: 1 },
    ],
    rotate: [
      { t: 0, v: 0 },
      { t: 1, v: 0 },
    ],
    opacity: [
      { t: 0, v: 1 },
      { t: 0.25, v: 0.3 },
      { t: 0.5, v: 1 },
      { t: 0.75, v: 0.3 },
      { t: 1, v: 1 },
    ],
  },
};

function cloneTracks(tracks: Tracks): Tracks {
  return {
    x: tracks.x.map((k) => ({ ...k })),
    scale: tracks.scale.map((k) => ({ ...k })),
    rotate: tracks.rotate.map((k) => ({ ...k })),
    opacity: tracks.opacity.map((k) => ({ ...k })),
  };
}

/** Linear interpolation across a track's keys at time t. */
function interpolate(keys: Key[], t: number): number {
  const first = keys[0];
  if (!first) return 0;
  if (t <= first.t) return first.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (!a || !b) continue;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.v;
      return a.v + ((t - a.t) / span) * (b.v - a.v);
    }
  }
  const last = keys[keys.length - 1];
  return last ? last.v : 0;
}

export function KeyframesLab() {
  const motionSafe = useMotionSafe();
  const [tracks, setTracks] = useState<Tracks>(() =>
    cloneTracks(PRESET_TRACKS.story),
  );
  const [preset, setPreset] = useState<Preset | null>("story");
  const [selected, setSelected] = useState<{ track: TrackName; index: number }>(
    { track: "x", index: 2 },
  );
  const [playhead, setPlayhead] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [run, setRun] = useState(0);
  const dragRef = useRef<{ track: TrackName; index: number } | null>(null);

  const applyPreset = (name: Preset) => {
    setTracks(cloneTracks(PRESET_TRACKS[name]));
    setPreset(name);
    setSelected({ track: "x", index: 1 });
    setRun((r) => r + 1);
  };

  const updateKey = (track: TrackName, index: number, patch: Partial<Key>) => {
    setTracks((prev) => {
      const next = cloneTracks(prev);
      const keys = next[track];
      const key = keys[index];
      if (!key) return prev;
      if (patch.t !== undefined) {
        const before = keys[index - 1]?.t ?? 0;
        const after = keys[index + 1]?.t ?? 1;
        key.t = Math.min(Math.max(patch.t, before + 0.02), after - 0.02);
        if (index === 0) key.t = 0;
        if (index === keys.length - 1) key.t = Math.max(key.t, after);
      }
      if (patch.v !== undefined) key.v = patch.v;
      return next;
    });
    setPreset(null);
  };

  const addKeyAtPlayhead = () => {
    setTracks((prev) => {
      const next = cloneTracks(prev);
      const keys = next[selected.track];
      const v = interpolate(keys, playhead);
      const insertAt = keys.findIndex((k) => k.t > playhead);
      const key = { t: playhead, v };
      if (insertAt === -1) keys.push(key);
      else keys.splice(insertAt, 0, key);
      return next;
    });
    setPreset(null);
  };

  const deleteSelected = () => {
    setTracks((prev) => {
      const keys = prev[selected.track];
      if (keys.length <= 2) return prev;
      const next = cloneTracks(prev);
      next[selected.track].splice(selected.index, 1);
      return next;
    });
    setSelected((s) => ({ track: s.track, index: Math.max(0, s.index - 1) }));
    setPreset(null);
  };

  const toggleHold = (track: TrackName, index: number) => {
    setTracks((prev) => {
      const next = cloneTracks(prev);
      const keys = next[track];
      const key = keys[index];
      const prevKey = keys[index - 1];
      if (!key || !prevKey) return prev;
      key.v = prevKey.v; // a hold: same value, later time
      return next;
    });
    setPreset(null);
  };

  const pose = useMemo(
    () => ({
      x: interpolate(tracks.x, playhead),
      scale: interpolate(tracks.scale, playhead),
      rotate: interpolate(tracks.rotate, playhead),
      opacity: interpolate(tracks.opacity, playhead),
    }),
    [tracks, playhead],
  );

  const keyframeProps = useMemo(() => {
    const build = (name: TrackName) => ({
      values: tracks[name].map((k) => k.v),
      times: tracks[name].map((k) => k.t),
    });
    return {
      x: build("x"),
      scale: build("scale"),
      rotate: build("rotate"),
      opacity: build("opacity"),
    };
  }, [tracks]);

  const selectedKeys = tracks[selected.track];
  const selectedKey = selectedKeys[selected.index];
  const selectedDef = TRACK_DEFS.find((d) => d.name === selected.track);

  const code = `<motion.div
  animate={{
    x: [${keyframeProps.x.values.map((v) => Math.round(v)).join(", ")}],
    scale: [${keyframeProps.scale.values.map((v) => v.toFixed(2)).join(", ")}],
    rotate: [${keyframeProps.rotate.values.map((v) => Math.round(v)).join(", ")}],
    opacity: [${keyframeProps.opacity.values.map((v) => v.toFixed(2)).join(", ")}],
  }}
  transition={{
    duration: ${DURATION_S},
    times: { /* per property, from the dopesheet */ },
    ease: [${easings.move.join(", ")}],
  }}
/>
// a doubled key = a hold — and holds create anticipation`;

  return (
    <LabBody
      controls={
        <>
          <LabChips
            label="Presets"
            options={PRESETS}
            value={preset}
            onChange={applyPreset}
          />
          {selectedKey && selectedDef ? (
            <LabSlider
              label={`Selected key · ${selected.track}`}
              value={selectedKey.v}
              min={selectedDef.min}
              max={selectedDef.max}
              step={selectedDef.step}
              format={(v) =>
                selectedDef.step < 1 ? v.toFixed(2) : String(Math.round(v))
              }
              onChange={(v) => updateKey(selected.track, selected.index, { v })}
              hint={`Key ${selected.index + 1} of ${selectedKeys.length} at t=${selectedKey.t.toFixed(2)}`}
            />
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addKeyAtPlayhead}
              className="border-hairline text-ink-2 hover:text-ink rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors"
            >
              Add key at playhead
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={selectedKeys.length <= 2}
              className="border-hairline text-ink-2 hover:text-ink rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40"
            >
              Delete key
            </button>
          </div>
          <p className="text-ink-3 font-mono text-[10px] tracking-wide uppercase">
            DOUBLE-CLICK A KEY = HOLD · DRAG KEYS ALONG TIME
          </p>
        </>
      }
      stage={
        <LabStage
          label="KL-04 · DOPESHEET"
          onReplay={() => {
            setScrubbing(false);
            setRun((r) => r + 1);
          }}
          className="flex-col gap-6 p-6"
          minHeight={400}
        >
          {/* the performer */}
          <div className="flex h-24 w-full max-w-[520px] items-center justify-center">
            {scrubbing ? (
              <div
                className="bg-cobalt size-10 rounded-2"
                style={{
                  transform: `translateX(${pose.x}px) scale(${pose.scale}) rotate(${pose.rotate}deg)`,
                  opacity: pose.opacity,
                }}
              />
            ) : (
              <motion.div
                key={run}
                aria-hidden
                initial={false}
                animate={
                  motionSafe
                    ? {
                        x: keyframeProps.x.values,
                        scale: keyframeProps.scale.values,
                        rotate: keyframeProps.rotate.values,
                        opacity: keyframeProps.opacity.values,
                      }
                    : {
                        x: keyframeProps.x.values.at(-1),
                        scale: keyframeProps.scale.values.at(-1),
                        rotate: keyframeProps.rotate.values.at(-1),
                        opacity: keyframeProps.opacity.values.at(-1),
                      }
                }
                transition={
                  motionSafe
                    ? {
                        duration: DURATION_S,
                        ease: easings.move,
                        x: { times: keyframeProps.x.times, duration: DURATION_S },
                        scale: {
                          times: keyframeProps.scale.times,
                          duration: DURATION_S,
                        },
                        rotate: {
                          times: keyframeProps.rotate.times,
                          duration: DURATION_S,
                        },
                        opacity: {
                          times: keyframeProps.opacity.times,
                          duration: DURATION_S,
                        },
                      }
                    : { duration: 0 }
                }
                className="bg-cobalt size-10 rounded-2"
              />
            )}
          </div>

          {/* playhead */}
          <label className="w-full max-w-[520px]">
            <span className="text-label text-ink-3 flex justify-between">
              <span>PLAYHEAD · SCRUB TO POSE</span>
              <span className="tabular-nums">
                {(playhead * DURATION_S).toFixed(2)}s
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={playhead}
              aria-label="Playhead"
              onChange={(e) => {
                setScrubbing(true);
                setPlayhead(Number(e.target.value));
              }}
              className="accent-cobalt-bright mt-1 block w-full"
            />
          </label>

          {/* the dopesheet */}
          <div className="w-full max-w-[520px] space-y-1.5">
            {TRACK_DEFS.map((def) => (
              <div key={def.name} className="flex items-center gap-3">
                <span className="text-ink-3 w-14 shrink-0 text-right font-mono text-[10px] uppercase">
                  {def.name}
                </span>
                <div className="border-hairline bg-surface-0 relative h-7 flex-1 rounded-1 border">
                  {/* playhead line */}
                  <span
                    aria-hidden
                    className="bg-cobalt/50 absolute top-0 bottom-0 w-px"
                    style={{ left: `${playhead * 100}%` }}
                  />
                  {tracks[def.name].map((key, index) => {
                    const isSelected =
                      selected.track === def.name && selected.index === index;
                    const held =
                      index > 0 && tracks[def.name][index - 1]?.v === key.v;
                    return (
                      <button
                        key={index}
                        type="button"
                        aria-label={`${def.name} key ${index + 1} at ${(key.t * DURATION_S).toFixed(2)} seconds, value ${key.v.toFixed(2)}${held ? ", hold" : ""}`}
                        onPointerDown={(e) => {
                          dragRef.current = { track: def.name, index };
                          e.currentTarget.setPointerCapture(e.pointerId);
                          setSelected({ track: def.name, index });
                        }}
                        onPointerMove={(e) => {
                          const drag = dragRef.current;
                          if (
                            !drag ||
                            drag.track !== def.name ||
                            drag.index !== index
                          )
                            return;
                          const rail =
                            e.currentTarget.parentElement?.getBoundingClientRect();
                          if (!rail) return;
                          updateKey(def.name, index, {
                            t: (e.clientX - rail.left) / rail.width,
                          });
                        }}
                        onPointerUp={() => {
                          dragRef.current = null;
                        }}
                        onDoubleClick={() => toggleHold(def.name, index)}
                        onKeyDown={(e) => {
                          const nudge = e.shiftKey ? 0.05 : 0.01;
                          if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            updateKey(def.name, index, { t: key.t - nudge });
                          }
                          if (e.key === "ArrowRight") {
                            e.preventDefault();
                            updateKey(def.name, index, { t: key.t + nudge });
                          }
                        }}
                        className={cn(
                          "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border transition-colors",
                          isSelected
                            ? "bg-cobalt border-cobalt-bright"
                            : held
                              ? "bg-surface-2 border-hairline-strong"
                              : "bg-surface-1 border-hairline-strong hover:border-cobalt",
                        )}
                        style={{ left: `${key.t * 100}%` }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="text-ink-3 flex justify-between pl-[68px] font-mono text-[9px]">
              <span>0s</span>
              <span>0.5s</span>
              <span>1s</span>
              <span>1.5s</span>
              <span>2s</span>
            </div>
          </div>
        </LabStage>
      }
      code={
        <LiveCode
          code={code}
          values={[`[${keyframeProps.x.values.map((v) => Math.round(v)).join(", ")}]`]}
        />
      }
    />
  );
}
