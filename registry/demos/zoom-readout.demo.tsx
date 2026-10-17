"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultZoomReadoutTools,
  ZoomReadout,
  type ZoomReadoutFit,
  type ZoomReadoutHandle,
} from "@/registry/ui/zoom-readout";

export const tweaks = defineTweaks({
  toolSize: {
    kind: "range",
    label: "Tool size",
    default: 32,
    min: 28,
    max: 40,
    step: 2,
    unit: "px",
  },
  readoutStyle: {
    kind: "choice",
    label: "Readout",
    default: "roll",
    options: ["roll", "tiles", "meter"],
    names: { roll: "Roll", tiles: "Tiles", meter: "Meter" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/**
 * Fernworks' Q4 launch board, opened at 50% with the pricing note selected.
 * The gallery card fits the selection once it has been seen, so the readout
 * glides to the fitted zoom with the brackets closing in.
 */
export function ZoomReadoutDemo({
  chrome = true,
  // The strip is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const board = React.useRef<ZoomReadoutHandle | null>(null);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const [run, setRun] = React.useState(0);
  const [tool, setTool] = React.useState("select");
  const [zoom, setZoom] = React.useState(50);
  const [picked, setPicked] = React.useState(1);
  const [lastFit, setLastFit] = React.useState<ZoomReadoutFit | null>(null);

  React.useEffect(() => {
    const node = frame.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          board.current?.fit("selection");
        }, 1100);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  const strip = (
    <ZoomReadout
      key={run}
      ref={board}
      onToolChange={setTool}
      onZoomChange={(z) => {
        setZoom(z);
        setLastFit(null);
      }}
      onSelectionChange={(ids) => {
        setPicked(ids.length);
        setLastFit(null);
      }}
      onFit={(fit) => {
        setZoom(fit.zoom);
        setLastFit(fit);
      }}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={frame} className="w-full max-w-3xl">
        {strip}
      </div>
    );
  }

  const toolLabel =
    defaultZoomReadoutTools.find((t) => t.id === tool)?.label ?? tool;
  const fitNote = lastFit
    ? `fitted ${lastFit.target === "all" ? "board" : "selection"} at ${lastFit.zoom}%`
    : picked > 0
      ? "fit ready"
      : "nothing to fit";

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {strip}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRun((n) => n + 1);
            setTool("select");
            setZoom(50);
            setPicked(1);
            setLastFit(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <span className="text-xs text-ink-3">
          V, H or 1–8 pick a tool · ⌘ or Ctrl with = and − zoom · ⇧1 fits
        </span>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{`${toolLabel} · ${zoom}%`}</span>
        {` · ${picked} selected · ${fitNote}`}
      </p>
    </div>
  );
}
