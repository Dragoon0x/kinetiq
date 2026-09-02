"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { SurfacePaint, useSurface } from "@/registry/ui/surface-paint";

/** How much smaller the contact print is than the interface it paints. */
const PRINT_SCALE = 0.42;

/**
 * A contact print of the texture, pinned to the corner — what every effect
 * in the wing sees. Copies the painted canvas on each completed paint and
 * stamps the version, so the demo shows the painter keeping up as you type
 * or focus a control.
 */
function ContactPrint() {
  const surface = useSurface();
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    const src = surface.canvas;
    if (!el || !src || surface.version === 0) return;
    const width = Math.max(1, Math.round(src.width * PRINT_SCALE));
    const height = Math.max(1, Math.round(src.height * PRINT_SCALE));
    if (el.width !== width) el.width = width;
    if (el.height !== height) el.height = height;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(src, 0, 0, width, height);
  }, [surface.canvas, surface.version]);

  if (!surface.active) return null;

  return (
    <div className="absolute right-3 bottom-3 flex flex-col items-end gap-1">
      <canvas
        ref={ref}
        data-paint-print
        data-paint-scale={PRINT_SCALE}
        className="rounded-2 border border-hairline-strong bg-surface-0 shadow-raised"
        style={{
          width: surface.width * PRINT_SCALE,
          height: surface.height * PRINT_SCALE,
        }}
      />
      <span className="rounded-1 bg-surface-0/90 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        what effects see · v{surface.version}
        {surface.native ? " · native" : ""}
      </span>
    </div>
  );
}

/** A small, real interface — heading, prose, a swatch, a field, a button — so the print has something worth reading. */
export function SurfacePaintDemo() {
  const [note, setNote] = React.useState("");
  return (
    <div className="flex w-full justify-center">
      <SurfacePaint
        mode="overlay"
        effect={<ContactPrint />}
        className="w-full max-w-lg rounded-4 border border-hairline bg-surface-1"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-3">
            <span
              data-paint-swatch
              aria-hidden
              className="size-10 shrink-0 rounded-2"
              style={{ background: "var(--primary)" }}
            />
            <div className="min-w-0">
              <p className="text-label text-ink-3">Waylight · morning board</p>
              <h2
                data-paint-heading
                className="text-xl font-semibold tracking-tight text-ink"
              >
                Berth 4 clears at 06:10
              </h2>
            </div>
            <StatusSeal variant="success" className="ml-auto">
              painted
            </StatusSeal>
          </div>
          <p className="text-sm leading-relaxed text-ink-2">
            Everything on this card is real DOM. The print in the corner is the
            painter reading it back — type in the field or tab to the button and
            watch the version climb.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-label text-ink-3">Note for the crew</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Lines doubled on the north face"
              className="rounded-2 border border-hairline bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex items-center gap-3">
            <PressureButton variant="solid">Post to the board</PressureButton>
            <span className="font-mono text-[11px] text-ink-3">
              berth 4 · 06:10
            </span>
          </div>
        </div>
      </SurfacePaint>
    </div>
  );
}
