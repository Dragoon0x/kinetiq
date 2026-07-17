"use client";

import { RedactReveal } from "@/registry/ui/redact-reveal";

export function RedactRevealDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <p className="text-base leading-relaxed">
        The bearing tolerance holds inside{" "}
        <RedactReveal revealOn="hover" className="font-semibold">
          a tenth of a millimetre
        </RedactReveal>
        , and the press runs at{" "}
        <RedactReveal revealOn="press" className="font-semibold">
          nine tonnes
        </RedactReveal>
        .
      </p>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Hover the first, tap the second
      </p>
    </div>
  );
}
