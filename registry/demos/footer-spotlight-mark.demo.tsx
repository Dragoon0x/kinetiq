"use client";

import { FooterSpotlightMark } from "@/registry/blocks/footer-spotlight-mark/footer-spotlight-mark";

export function FooterSpotlightMarkDemo() {
  return (
    <div className="flex w-full flex-col">
      <div className="mx-auto w-full max-w-7xl px-6 pt-20 pb-10">
        <p className="max-w-md text-sm leading-relaxed text-ink-3">
          The page above ends here — then the mark waits, hollow, for a cursor
          to fill it in.
        </p>
      </div>
      <FooterSpotlightMark />
    </div>
  );
}
