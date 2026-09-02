"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/registry/lib/utils";

/**
 * The specimen plate: every live demo on the site sits in one. A mono serial
 * tag, a status readout that flips to LIVE while the specimen is energized
 * (hover/focus), and a bottom dimension line that reports the plate's true
 * rendered width — the site measures itself.
 */
export function SpecimenPlate({
  serial,
  label,
  children,
  className,
  contentClassName,
  minHeight = 320,
}: {
  /** e.g. "KQ-001" */
  serial: string;
  /** e.g. "PRESSURE/BUTTON" */
  label: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  minHeight?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      data-live={live || undefined}
      onPointerEnter={() => setLive(true)}
      onPointerLeave={() => setLive(false)}
      onFocus={() => setLive(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setLive(false);
        }
      }}
      className={cn(
        "group relative rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      {/* header rail */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-3">
        <span className="min-w-0 text-label text-ink-3 select-none">
          {serial} · {label}
        </span>
        <span
          className={cn(
            "ml-auto flex items-center gap-1.5 text-label transition-colors select-none",
            live ? "text-signal" : "text-ink-3",
          )}
          aria-hidden
        >
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              live ? "bg-signal" : "bg-ink-3",
            )}
          />
          {live ? "LIVE" : "CALIBRATED"}
        </span>
      </div>

      {/* stage — wide specimens scroll inside the plate, never the page */}
      <div
        data-specimen-stage=""
        className={cn(
          "flex max-w-full items-center justify-center overflow-x-auto px-4 py-10 sm:px-8",
          contentClassName,
        )}
        style={{ minHeight }}
      >
        {children}
      </div>

      {/* dimension rail */}
      <div
        className="flex items-center gap-2 px-4 pb-3 text-label text-ink-3 select-none"
        aria-hidden
      >
        <span className="h-px flex-1 bg-hairline" />
        <span className="tabular-nums">↔ {width ?? "—"}</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>
    </div>
  );
}
