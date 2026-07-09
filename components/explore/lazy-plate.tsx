"use client";

import { Play } from "lucide-react";
import { useRef, useState } from "react";

import { demos } from "@/components/docs/demos";
import { SpecimenPlate } from "@/components/lab/specimen-plate";

/**
 * A specimen plate that renders its chrome immediately but mounts the live
 * demo only on intent — hover-with-dwell, click/tap, or keyboard activation.
 * Sweeping the pointer across the grid never wakes a demo (120ms dwell), so
 * the number of simultaneously running showpieces stays bounded to what the
 * visitor actually reaches for.
 */
export function LazyPlate({
  slug,
  serial,
  label,
  tagline,
  minHeight = 280,
}: {
  slug: string;
  serial: string;
  label: string;
  tagline: string;
  minHeight?: number;
}) {
  const [active, setActive] = useState(false);
  const timer = useRef<number | null>(null);
  const Demo = demos[slug];

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const activate = () => {
    clearTimer();
    setActive(true);
  };
  const hoverIn = () => {
    if (active) return;
    clearTimer();
    timer.current = window.setTimeout(() => setActive(true), 120);
  };

  return (
    <div onPointerEnter={hoverIn} onPointerLeave={clearTimer} className="h-full">
      <SpecimenPlate
        serial={serial}
        label={label}
        minHeight={minHeight}
        className="h-full"
      >
        {active && Demo ? (
          <Demo />
        ) : (
          <button
            type="button"
            onClick={activate}
            aria-label={`Run the ${label} specimen`}
            className="group/run text-ink-3 flex w-full flex-col items-center justify-center gap-3 py-4 text-center"
          >
            <span className="border-hairline group-hover/run:border-cobalt-bright group-hover/run:text-cobalt-bright flex size-10 items-center justify-center rounded-full border transition-colors">
              <Play className="size-4" aria-hidden />
            </span>
            <span className="text-ink-2 max-w-[26ch] text-sm">{tagline}</span>
            <span className="text-label text-ink-3 group-hover/run:text-ink-2 transition-colors">
              Run specimen
            </span>
          </button>
        )}
      </SpecimenPlate>
    </div>
  );
}
