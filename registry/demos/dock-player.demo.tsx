"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { DockPlayer, type DockPlayerState } from "@/registry/ui/dock-player";

const BODY = [
  "The vane on bay 4 had been reading long since the spring service, and nobody could say by how much until the rig was stripped.",
  "What the tape shows is the third sweep, where the gauge drifts a full two degrees before it settles back against the stop.",
  "Fieldline's fix was unglamorous: retorque to 18 Nm, log the drift, and hand the bay over with the numbers written down.",
  "Six weeks on, the same sweep reads flat. The tape stays in the archive as the reference the next shift measures against.",
];

export function DockPlayerDemo() {
  const motionSafe = useMotionSafe();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<DockPlayerState>("inline");

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div
        ref={scrollRef}
        className="h-[300px] w-full overflow-y-auto rounded-3 border border-border bg-surface-1"
      >
        <div className="p-4">
          <h3 className="text-sm font-semibold">The long calibration</h3>
          <p className="mt-0.5 mb-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight · Fieldline archive
          </p>

          <DockPlayer
            container={scrollRef}
            title="Bay 4 calibration"
            onStateChange={setPlace}
          >
            {/* Procedural footage: a gradient sweeping under a scan grille. */}
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-linear-to-br from-cobalt via-signal to-cobalt-wash bg-[length:220%_220%]"
              animate={
                motionSafe
                  ? { backgroundPosition: ["0% 0%", "100% 100%"] }
                  : undefined
              }
              transition={{
                duration: 14,
                ease: easings.linear,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, var(--hairline-strong) 0 1px, transparent 1px 4px)",
              }}
            />
          </DockPlayer>

          {BODY.map((line) => (
            <p key={line} className="mt-3 text-xs leading-relaxed text-ink-2">
              {line}
            </p>
          ))}
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Player <span className="text-signal">{place}</span> · scroll the article
      </p>
    </div>
  );
}
