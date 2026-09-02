"use client";

import { ElasticType } from "@/registry/ui/elastic-type";

export function ElasticTypeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-4 py-6">
      <div className="flex w-full max-w-lg flex-col items-center gap-2 rounded-4 border border-hairline bg-surface-1 px-6 py-10">
        <ElasticType
          text="404"
          className="font-mono text-[9rem] leading-none font-bold text-ink"
        />
        <ElasticType
          text="berth not found"
          as="p"
          className="font-mono text-[3rem] leading-none font-bold text-ink"
        />
      </div>

      <p className="text-center text-label text-ink-3">
        run the cursor across it
      </p>
    </div>
  );
}
