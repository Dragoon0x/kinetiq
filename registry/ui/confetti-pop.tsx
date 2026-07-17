"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type ConfettiPopProps = {
  /** Bits per burst. @default 70 */
  count?: number;
  onPop?: () => void;
  /** Panel height in px. @default 220 */
  height?: number;
  /** The button face. @default "Pop" */
  children?: React.ReactNode;
  className?: string;
};

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  born: number;
};

const PALETTE_VARS = ["--primary", "--success", "--warn", "--accent-bright", "--signal"];
const LIFESPAN = 1.8;
const GRAVITY = 900;

/**
 * A burst of confetti with real fall to it. Each bit is thrown from the press
 * point with a seeded spread, then it is pulled down by gravity, slowed by drag,
 * spun on its own axis, and faded as it ages — so the spray arcs up and rains
 * back rather than puffing away. The colours are read from the theme, and the
 * whole thing is deterministic: no `Math.random`, so the same press throws the
 * same shape.
 *
 * The canvas is capped to 2x density, resized by a ResizeObserver, gated by an
 * IntersectionObserver and tab visibility, and it idle-stops the instant the last
 * bit has fallen — the loop only runs while confetti is in the air. The trigger
 * is a real button, so it fires on Enter and Space and announces nothing it
 * should not; the canvas is decorative and aria-hidden. Under reduced motion a
 * press lays a single still spray instead of raining.
 */
export function ConfettiPop({
  count = 70,
  onPop,
  height = 220,
  children = "Pop",
  className,
}: ConfettiPopProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const bitsRef = React.useRef<Bit[]>([]);
  const burstRef = React.useRef(0);
  const fireRef = React.useRef<((x: number, y: number) => void) | null>(null);
  const onPopRef = React.useRef(onPop);
  React.useEffect(() => {
    onPopRef.current = onPop;
  });

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let heightPx = 0;
    let palette = ["#5b7cfa"];

    const resolvePalette = () => {
      const styles = getComputedStyle(container);
      palette = PALETTE_VARS.map(
        (name) => styles.getPropertyValue(name).trim() || "#5b7cfa",
      );
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      heightPx = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(heightPx * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    let clock = 0;
    let last = 0;
    let raf = 0;
    let running = false;
    let inView = true;

    const drawBit = (bit: Bit, alpha: number) => {
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate(bit.rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = bit.color;
      ctx.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2);
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      clock += dt;
      ctx.clearRect(0, 0, width, heightPx);
      const bits = bitsRef.current;
      for (let i = bits.length - 1; i >= 0; i -= 1) {
        const bit = bits[i];
        if (!bit) continue;
        const age = clock - bit.born;
        const alpha = 1 - age / LIFESPAN;
        if (alpha <= 0) {
          bits.splice(i, 1);
          continue;
        }
        bit.vy += GRAVITY * dt;
        bit.vx *= 0.99;
        bit.x += bit.vx * dt;
        bit.y += bit.vy * dt;
        bit.rot += bit.vrot * dt;
        drawBit(bit, alpha);
      }
      ctx.globalAlpha = 1;
      if (bits.length > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    };

    const wake = () => {
      if (running || !inView || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const spawn = (originX: number, originY: number) => {
      burstRef.current += 1;
      const rng = seeded(djb2(`confetti:${burstRef.current}`));
      const bits = bitsRef.current;
      for (let i = 0; i < count; i += 1) {
        const angle = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 0.9;
        const speed = 260 + rng() * 340;
        bits.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: rng() * Math.PI,
          vrot: (rng() - 0.5) * 14,
          size: 5 + rng() * 5,
          color: palette[Math.floor(rng() * palette.length)] ?? palette[0] ?? "#5b7cfa",
          born: motionSafe ? clock : 0,
        });
      }
      onPopRef.current?.();

      if (!motionSafe) {
        // One still spray: advance each bit to a settled spread, paint once.
        ctx.clearRect(0, 0, width, heightPx);
        for (const bit of bits) {
          bit.x += bit.vx * 0.25;
          bit.y += bit.vy * 0.25 + 60;
          bit.rot += bit.vrot * 0.25;
          drawBit(bit, 0.9);
        }
        ctx.globalAlpha = 1;
        bits.length = 0;
        return;
      }
      wake();
    };

    fireRef.current = spawn;

    resize();
    resolvePalette();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        if (inView && bitsRef.current.length > 0) wake();
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(container);

    const onVisibility = () => {
      if (!document.hidden && bitsRef.current.length > 0) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const themeObserver = new MutationObserver(resolvePalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      fireRef.current = null;
    };
  }, [count, motionSafe]);

  const pop = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Keyboard activation reports (0,0); burst from the button centre then.
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const x = fromKeyboard ? rect.width / 2 : event.clientX - rect.left;
    const y = fromKeyboard ? rect.height / 2 : event.clientY - rect.top;
    fireRef.current?.(x, y);
  };

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-0 relative w-full overflow-hidden rounded-3 border",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <button
        type="button"
        onClick={pop}
        className="bg-primary text-primary-foreground hover:bg-primary/90 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {children}
      </button>
    </div>
  );
}
