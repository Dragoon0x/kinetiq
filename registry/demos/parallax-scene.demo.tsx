"use client";

import { ParallaxLayer, ParallaxScene } from "@/registry/ui/parallax-scene";

export function ParallaxSceneDemo() {
  return (
    <ParallaxScene
      aria-label="Instrument bay diorama"
      className="border-border bg-surface-1 rounded-4 h-72 w-full max-w-md border"
    >
      {/* Far: engineering grid and concentric rings backdrop. */}
      <ParallaxLayer
        depth={0.15}
        className="pointer-events-none absolute inset-0"
      >
        <svg
          aria-hidden
          viewBox="0 0 400 288"
          className="text-ink-3 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern
              id="parallax-grid"
              width={24}
              height={24}
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M24 0H0V24"
                fill="none"
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.4}
              />
            </pattern>
          </defs>
          <rect width={400} height={288} fill="url(#parallax-grid)" />
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth={0.75}
            opacity={0.5}
          >
            <circle cx={200} cy={144} r={48} />
            <circle cx={200} cy={144} r={84} />
            <circle cx={200} cy={144} r={120} />
          </g>
        </svg>
      </ParallaxLayer>

      {/* Mid: framed gauge card with a mono readout. */}
      <ParallaxLayer
        depth={0.5}
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="border-hairline bg-surface-2/80 rounded-2 flex w-44 flex-col gap-2 border p-3 backdrop-blur-sm">
          <div className="text-ink-3 flex items-center justify-between font-mono text-[10px] tracking-[0.08em] uppercase">
            <span>Bay 04</span>
            <span>kPa</span>
          </div>
          <div className="text-foreground font-mono text-2xl tabular-nums">
            128.6
          </div>
          <div className="border-border h-1 overflow-hidden rounded-full border">
            <div
              className="h-full rounded-full"
              style={{
                width: "64%",
                backgroundColor: "var(--signal, var(--primary))",
              }}
            />
          </div>
        </div>
      </ParallaxLayer>

      {/* Near: floating signal chip with a caption. */}
      <ParallaxLayer
        depth={0.9}
        className="pointer-events-none absolute top-6 right-6 flex items-center gap-2"
      >
        <span className="border-hairline bg-surface-2/90 text-ink-2 rounded-1 inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] tracking-[0.08em] uppercase backdrop-blur-sm">
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: "var(--signal, var(--primary))" }}
          />
          Live
        </span>
      </ParallaxLayer>

      {/* Pinned hint (moves with the deep field, stays legible). */}
      <ParallaxLayer
        depth={0.15}
        className="text-ink-3 pointer-events-none absolute bottom-4 left-4 font-mono text-label"
      >
        Move the pointer — depth responds.
      </ParallaxLayer>
    </ParallaxScene>
  );
}
