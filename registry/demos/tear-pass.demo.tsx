"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TearPass } from "@/registry/ui/tear-pass";

export const tweaks = defineTweaks({
  perforation: {
    kind: "choice",
    label: "Perforation",
    default: "round",
    options: ["round", "slot"],
    names: { round: "Round", slot: "Slot" },
  },
  paper: {
    kind: "choice",
    label: "Paper",
    default: "white",
    options: ["white", "sky", "sand"],
    names: { white: "White", sky: "Sky", sand: "Sand" },
  },
  flip: { kind: "toggle", label: "Flip", default: true },
});

/** Where Waylight Air sends WL 214 as the morning goes on. */
const GATES = ["B12", "C4", "A7", "D21"];
const SEAT = "14C";
const CODE = "K7Q2MX";

const button =
  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

/**
 * A Waylight Air boarding pass on the morning flight from Coldbrook to
 * Fernhill. In the gallery the gate changes once while it is on screen, and
 * a torn pass is reissued a few seconds later so it can be torn again.
 */
export function TearPassDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [gateIndex, setGateIndex] = React.useState(0);
  const [torn, setTorn] = React.useState(false);
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const gate = GATES[gateIndex % GATES.length] ?? "B12";

  // One gate change a few seconds after the card is seen, so the split-flap
  // tiles roll for someone who only looks.
  React.useEffect(() => {
    if (chrome || !node) return;
    let seen = false;
    let done = false;
    let timer = 0;
    const sync = () => {
      window.clearTimeout(timer);
      timer = 0;
      if (seen && !done && !document.hidden) {
        timer = window.setTimeout(() => {
          done = true;
          setGateIndex((i) => i + 1);
        }, 3200);
      }
    };
    const watcher = new IntersectionObserver((entries) => {
      seen = Boolean(entries[entries.length - 1]?.isIntersecting);
      sync();
    });
    watcher.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timer);
      watcher.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [chrome, node]);

  React.useEffect(() => {
    if (chrome || !torn) return;
    const timer = window.setTimeout(() => setTorn(false), 6000);
    return () => window.clearTimeout(timer);
  }, [chrome, torn]);

  return (
    <div
      ref={setNode}
      className="flex w-full max-w-[40rem] flex-col items-center gap-4"
    >
      <TearPass
        carrier="Waylight Air"
        flight="WL 214"
        passenger="Mira Okafor"
        from={{ code: "CBK", city: "Coldbrook" }}
        to={{ code: "FRN", city: "Fernhill" }}
        date="07 Oct"
        boards="08:15"
        gate={gate}
        seat={SEAT}
        zone="2"
        code={CODE}
        torn={torn}
        onTornChange={setTorn}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className={button}
              onClick={() => setGateIndex((i) => i + 1)}
            >
              Gate change
            </button>
            <button
              type="button"
              className={button}
              disabled={!torn}
              onClick={() => setTorn(false)}
            >
              New pass
            </button>
          </div>
          <p
            role="status"
            className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {torn ? (
              <>
                <span className="text-signal">boarded</span> · stub kept · code{" "}
                {CODE}
              </>
            ) : (
              <>
                <span className="text-signal">gate {gate}</span> · seat {SEAT} ·
                tear here to board
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
