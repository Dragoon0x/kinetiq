"use client";

import { EmberColumn } from "@/registry/ui/ember-column";

const EMBERS = 90;
/** DRAFT reads steady in the bezel; EmberColumn's own sr-only region carries
 *  the live bent/steady state as the pointer actually moves the stream. */
const STATE = "STEADY";

/**
 * KQ-133: the ember column in its forge-flue bezel. The pointer bends the
 * rising stream toward it — move across the flue and the embers lean.
 */
export function EmberColumnDemo() {
  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">FORGE FLUE &middot; 90 EMBERS</p>
          <p className="text-label text-ink-3">KQ-133</p>
        </div>
        <EmberColumn count={EMBERS} height={300} aria-label="Ember column" />
        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          DRAFT &middot; <span className="text-cobalt-bright">{STATE}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Move across the flue - the embers lean toward you.
        </p>
      </div>
    </div>
  );
}
