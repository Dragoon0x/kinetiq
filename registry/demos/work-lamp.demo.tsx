"use client";

import { WorkLamp } from "@/registry/ui/work-lamp";

export function WorkLampDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <WorkLamp label="Cutting the board" face="grid" />
      <WorkLamp label="Reading tide tables" face="dots" showElapsed={false} />
      <WorkLamp label="Scoring stock risk" face="orbit" showElapsed={false} />
      <WorkLamp label="Drafting handovers" face="sweep" showElapsed={false} />
    </div>
  );
}
