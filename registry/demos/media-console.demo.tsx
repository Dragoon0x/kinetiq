"use client";

import { MediaConsole } from "@/registry/blocks/media-console/media-console";

export function MediaConsoleDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 py-4">
      <MediaConsole />
      <p className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.08em] uppercase">
        Click the pill to unfold
      </p>
    </div>
  );
}
