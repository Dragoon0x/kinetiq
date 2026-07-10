"use client";

import * as React from "react";

import { RainPane } from "@/registry/ui/rain-pane";

/**
 * RainPane dressed as a bench instrument: a bezel plate with two corner
 * registration ticks and a mono spec header (serial KQ-135), the pane filling
 * the stage, and a status line mirroring the last splash reported through
 * onSplash. Tap or drag across the pane and it splashes where you touch.
 */
export function RainPaneDemo() {
  const [drop, setDrop] = React.useState("NONE");

  const handleSplash = ({ x, y }: { x: number; y: number }) => {
    setDrop(`${Math.round(x)}, ${Math.round(y)}`);
  };

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
          <p className="text-label text-ink-3">WINDOW PANE &middot; 02 DEPTHS</p>
          <p className="text-label text-ink-3">KQ-135</p>
        </div>
        <RainPane
          height={300}
          onSplash={handleSplash}
          className="rounded-2"
          aria-label="Rain streaks falling on a glass pane"
        />
        <p className="border-hairline text-label text-ink-3 mt-3 border-t pt-3">
          LAST DROP &middot; <span className="text-cobalt-bright">{drop}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Tap the pane - the rain splashes where you touch.
        </p>
      </div>
    </div>
  );
}
