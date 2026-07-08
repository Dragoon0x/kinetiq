"use client";

import * as React from "react";

import { TickerTape } from "@/registry/ui/ticker-tape";

const PARTNERS = [
  "OSCILLOSOFT",
  "NORTHBEAM",
  "HELIX LABS",
  "PARSEC",
  "FOUNDRY 9",
  "CAMBER",
  "QUARTZWORKS",
  "VECTORFIELD",
];

const GLYPHS = [
  "· KQ ·",
  "CALIBRATED",
  "· 60 FPS ·",
  "ζ 0.83",
  "· KQ ·",
  "TENSION 640",
  "· 120 HZ ·",
  "BENCH 04",
];

export function TickerTapeDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <TickerTape speed={50} gap={12}>
        {PARTNERS.map((name) => (
          <span
            key={name}
            className="border-border text-muted-foreground rounded-1 border px-3 py-1.5 font-mono text-xs tracking-wider whitespace-nowrap"
          >
            {name}
          </span>
        ))}
      </TickerTape>
      <TickerTape speed={30} direction="right" gap={20}>
        {GLYPHS.map((glyph, index) => (
          <span
            key={index}
            className="text-muted-foreground/70 font-mono text-[10px] tracking-[0.2em] whitespace-nowrap"
          >
            {glyph}
          </span>
        ))}
      </TickerTape>
      <p className="text-muted-foreground text-center font-mono text-xs">
        Hover to slow · grab and fling
      </p>
    </div>
  );
}
