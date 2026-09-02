"use client";

import { EchoType } from "@/registry/ui/echo-type";

export function EchoTypeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-6 py-6">
      <EchoType
        text="404"
        echoes={6}
        className="font-mono text-[9rem] leading-none font-bold text-ink"
      />
      <EchoType
        text="echo"
        as="h2"
        mode="always"
        spread={{ x: 12, y: 10 }}
        className="text-[3.5rem] leading-none font-bold text-ink"
      />
      <p className="text-label text-ink-3">hover to fan</p>
    </div>
  );
}
