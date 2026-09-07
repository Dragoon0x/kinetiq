"use client";

import * as React from "react";

import { ScrollFrames } from "@/registry/ui/scroll-frames";

const FRAMES = 32;

export function ScrollFramesDemo() {
  const frame = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);

  /** A slab turning on its vertical axis, in weak perspective. No assets. */
  const renderFrame = React.useCallback(
    (
      i: number,
      ctx: CanvasRenderingContext2D,
      size: { w: number; h: number },
    ) => {
      const { w, h } = size;
      const styles = getComputedStyle(ctx.canvas);
      const ink = styles.color;

      const cx = w / 2;
      const cy = h / 2;
      const unit = Math.min(w, h);
      const turn = (i / FRAMES) * Math.PI * 2;
      const halfW = unit * 0.27;
      const halfH = unit * 0.3;
      const depth = unit * 0.05;
      const far = unit * 1.8;

      const at = (x: number, y: number, z: number): [number, number] => {
        const rx = x * Math.cos(turn) + z * Math.sin(turn);
        const rz = -x * Math.sin(turn) + z * Math.cos(turn);
        const scale = far / (far + rz);
        return [cx + rx * scale, cy + y * scale];
      };
      const face = (z: number): [number, number][] => [
        at(-halfW, -halfH, z),
        at(halfW, -halfH, z),
        at(halfW, halfH, z),
        at(-halfW, halfH, z),
      ];
      const trace = (points: [number, number][], close = false) => {
        ctx.beginPath();
        points.forEach(([x, y], k) => {
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        if (close) ctx.closePath();
        ctx.stroke();
      };

      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const back = face(depth);
      const front = face(-depth);
      const bench = cy + unit * 0.44;

      // Far plate, the four edges and the bench line, all held back so the
      // near face reads as the one closest to the reader.
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      trace(back, true);
      back.forEach((corner, k) => trace([corner, front[k] ?? corner]));
      trace([
        [w * 0.08, bench],
        [w * 0.92, bench],
      ]);
      ctx.restore();

      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      trace(front, true);

      // Canvas ignores a colour it cannot parse, so the ink already set stands
      // in if the token is missing.
      const cobalt = styles.getPropertyValue("--accent-bright").trim();
      if (cobalt) ctx.strokeStyle = cobalt;
      ctx.lineWidth = 2;
      trace([
        at(-halfW * 0.55, halfH * 0.42, -depth),
        at(halfW * 0.55, halfH * 0.42, -depth),
      ]);
    },
    [],
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div
        ref={frame}
        tabIndex={0}
        role="region"
        aria-label="Gaugeworks rotor sequence, scroll to scrub"
        className="h-[300px] w-full overflow-y-auto rounded-3 border border-hairline bg-surface-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ScrollFrames
          frames={FRAMES}
          renderFrame={renderFrame}
          container={frame}
          height={900}
          label="Gaugeworks rotor, one turn"
          onFrameChange={setIndex}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Frame <span className="text-signal tabular-nums">{index + 1}</span> of{" "}
        <span className="tabular-nums">{FRAMES}</span>
      </p>
    </div>
  );
}
