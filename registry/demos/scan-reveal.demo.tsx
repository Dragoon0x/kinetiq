"use client";

import * as React from "react";

import { Gauge, Timer, Waves } from "lucide-react";

import { ScanReveal } from "@/registry/ui/scan-reveal";

const FEATURES = [
  {
    icon: Gauge,
    title: "Spring calibration",
    copy: "All five springs re-measured against the ζ reference set.",
  },
  {
    icon: Timer,
    title: "Settle times",
    copy: "Flick lands at 118ms, two under budget on the bench.",
  },
  {
    icon: Waves,
    title: "Overshoot audit",
    copy: "Recoil holds two visible bounces across every viewport.",
  },
];

const STATS = [
  { value: "512", label: "runs" },
  { value: "99.2%", label: "pass" },
  { value: "0.4ms", label: "drift" },
];

export function ScanRevealDemo() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div
        ref={scrollRef}
        className="border-border bg-card h-[340px] w-full overflow-y-auto rounded-3 border"
      >
        <div className="flex h-[300px] items-end justify-center pb-6">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.2em] uppercase">
            Scroll ↓
          </span>
        </div>
        <ScanReveal containerRef={scrollRef} className="px-5 pb-12">
          <div className="flex min-h-[560px] flex-col gap-6">
            <div>
              <p className="text-muted-foreground font-mono text-[10px] tracking-[0.2em] uppercase">
                Kinetiq Lab
              </p>
              <h3 className="mt-1 text-xl font-semibold">Bench report — Q3</h3>
            </div>
            <div className="flex flex-col gap-5">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="flex items-start gap-3">
                  <span className="border-border text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-2 border">
                    <feature.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{feature.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {feature.copy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-border grid grid-cols-3 gap-3 border-t pt-5">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <p className="font-mono text-lg font-semibold tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-muted-foreground font-mono text-[10px] tracking-[0.15em] uppercase">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </ScanReveal>
      </div>
      <p className="text-muted-foreground text-center font-mono text-xs">
        Scroll the panel
      </p>
    </div>
  );
}
