"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { GifLoop, type GifClip } from "@/registry/ui/gif-loop";

const CLIPS: GifClip[] = [
  {
    id: "c1",
    from: "peer",
    title: "Bay 3 door cycle",
    seed: 4471,
    frames: 12,
    time: "07:04",
  },
  {
    id: "c2",
    from: "me",
    title: "Yard gate, 07:12",
    seed: 8123,
    frames: 10,
    time: "07:13",
    delivery: "read",
  },
  {
    id: "c3",
    from: "peer",
    title: "Belt run, north line",
    seed: 2907,
    frames: 14,
    time: "07:20",
  },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function GifLoopDemo() {
  const motionSafe = useMotionSafe();
  const viewport = React.useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = React.useState<string[]>([]);
  const [frames, setFrames] = React.useState<Record<string, number>>({});
  const [loops, setLoops] = React.useState<Record<string, number>>({});
  const [inView, setInView] = React.useState<Record<string, boolean>>({});

  const scroll = (to: "top" | "end") => {
    const node = viewport.current;
    if (!node) return;
    node.scrollTo({
      top: to === "top" ? 0 : node.scrollHeight,
      behavior: motionSafe ? "smooth" : "auto",
    });
  };

  // The clip the status line speaks for: the one actually running, or the
  // first in the thread while everything is held.
  const current =
    CLIPS.find((clip) => inView[clip.id] && !paused.includes(clip.id)) ??
    CLIPS[0];
  const id = current?.id ?? "";
  const state = paused.includes(id)
    ? "paused by hand"
    : inView[id] === false
      ? "paused, out of view"
      : motionSafe
        ? "playing"
        : "held, reduced motion";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GifLoop
        label="Coldbrook depot clips"
        peerName="Rui"
        clips={CLIPS}
        viewportRef={viewport}
        paused={paused}
        onPausedChange={(clipId, next) =>
          setPaused((prev) =>
            next ? [...prev, clipId] : prev.filter((item) => item !== clipId),
          )
        }
        onFrameChange={(clipId, frame) =>
          setFrames((prev) => ({ ...prev, [clipId]: frame }))
        }
        onLoop={(clipId, count) =>
          setLoops((prev) => ({ ...prev, [clipId]: count }))
        }
        onInViewChange={(clipId, next) =>
          setInView((prev) => ({ ...prev, [clipId]: next }))
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip} onClick={() => scroll("top")}>
          Scroll to top
        </button>
        <button type="button" className={chip} onClick={() => scroll("end")}>
          Scroll to end
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {current?.title ?? "No clips"} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">{state}</span> ·
        frame {String((frames[id] ?? 0) + 1).padStart(2, "0")} ·{" "}
        {loops[id] ?? 0} loops
      </p>
    </div>
  );
}
