"use client";

import { FooterDriftMark } from "@/registry/blocks/footer-drift-mark/footer-drift-mark";

export function FooterDriftMarkDemo() {
  return (
    <div className="flex w-full flex-col">
      <div className="mx-auto w-full max-w-7xl px-6 pt-20 pb-10">
        <p className="text-ink-3 max-w-md text-sm leading-relaxed">
          The page above ends here — then the wordmark takes the floor.
        </p>
      </div>
      <FooterDriftMark />
    </div>
  );
}
