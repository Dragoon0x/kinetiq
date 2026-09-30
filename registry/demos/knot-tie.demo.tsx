"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { KnotTie } from "@/registry/ui/knot-tie";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  knot: {
    kind: "choice",
    label: "Knot",
    default: "overhand",
    options: ["overhand", "bow", "figure"],
    names: { overhand: "Overhand", bow: "Bow", figure: "Figure eight" },
  },
  rope: {
    kind: "choice",
    label: "Rope",
    default: "jute",
    options: ["jute", "nylon", "silk"],
    names: { jute: "Jute", nylon: "Nylon", silk: "Silk" },
  },
});

/** Packing one order, start to finish, in ms. */
const PACK_MS = 5000;
const TICK_MS = 100;

/**
 * Fieldline Goods packing an order: the knot ties itself while the order is
 * packed, and the next parcel in the list waits with a small one. In chrome,
 * Pack runs a real determinate job through `progress`.
 */
export function KnotTieDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [job, setJob] = React.useState<"idle" | "running" | "done">("idle");
  const [share, setShare] = React.useState(0);

  React.useEffect(() => {
    if (job !== "running") return;
    let done = 0;
    const id = window.setInterval(() => {
      done = Math.min(1, Number((done + TICK_MS / PACK_MS).toFixed(4)));
      setShare(done);
      if (done >= 1) setJob("done");
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [job]);

  const start = () => {
    setShare(0);
    setJob("running");
  };

  const label =
    job === "running"
      ? "Tying up order 2041"
      : job === "done"
        ? "Order 2041 packed"
        : "Packing your order";

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center gap-4 self-center">
        <KnotTie
          label={label}
          size={48}
          progress={job === "idle" ? undefined : share}
          className="text-sm text-foreground"
          sound={sound}
          {...values}
        />
        <div className="flex w-64 max-w-full items-center justify-between gap-3 rounded-3 border border-hairline bg-card px-3 py-2 text-xs">
          <span className="truncate text-foreground">Parcel 2 of 3</span>
          <KnotTie
            label="Tying up"
            size={16}
            speed={values.speed}
            knot={values.knot}
            rope={values.rope}
            className="shrink-0 text-ink-3"
          />
        </div>
      </div>
      {chrome ? (
        <>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={start}
              disabled={job === "running"}
              className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50"
            >
              {job === "done" ? "Pack another" : "Pack the order"}
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {job === "running" ? (
              <>
                <span className="text-signal">tying</span> ·{" "}
                {Math.round(share * 100)}%
              </>
            ) : job === "done" ? (
              <>
                <span className="text-signal">packed</span> · ready for pickup
              </>
            ) : (
              <>
                <span className="text-signal">packing</span> · tug the rope to
                cinch it
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
