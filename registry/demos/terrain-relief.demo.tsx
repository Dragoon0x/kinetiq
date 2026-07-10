"use client";

import * as React from "react";

import { TerrainRelief, type TerrainProbe } from "@/registry/ui/terrain-relief";

const ROWS = 12;
const COLS = 12;

/**
 * A rolling ridge-and-valley survey — a pure sum of a few sines/cosines over
 * row/col, no randomness. Two long ridges run diagonally across the grid,
 * broken by a shorter cross-wave so the relief reads as terrain rather than
 * a smooth dome. Same formula every render, every visit.
 */
function buildSurveyData(): number[][] {
  const data: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const u = r / (ROWS - 1);
      const v = c / (COLS - 1);
      const ridge = Math.sin(u * Math.PI * 1.6 + v * Math.PI * 0.6) * 26;
      const valley = Math.cos(v * Math.PI * 2.2 - u * Math.PI * 0.4) * 14;
      const swell = Math.sin((u + v) * Math.PI * 0.9) * 9;
      row.push(Math.round((ridge + valley + swell) * 10) / 10);
    }
    data.push(row);
  }
  return data;
}

const SURVEY_DATA = buildSurveyData();

export function TerrainReliefDemo() {
  const [probe, setProbe] = React.useState<TerrainProbe | null>(null);

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
          <p className="text-label text-ink-3">RELIEF SURVEY &middot; 12x12 GRID</p>
          <p className="text-label text-ink-3">KQ-141</p>
        </div>

        <TerrainRelief
          data={SURVEY_DATA}
          onProbe={setProbe}
          height={300}
          aria-label="Ridge and valley relief survey"
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          ELEVATION &middot;{" "}
          <span className="text-cobalt-bright">
            {probe ? probe.value + "m" : "SWEEP TO READ"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Drag to orbit the relief - hover a node to read its elevation.
        </p>
      </div>
    </div>
  );
}
