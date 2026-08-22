"use client";

import { FooterTerrace } from "@/registry/blocks/footer-terrace/footer-terrace";

export function FooterTerraceDemo() {
  return (
    <div className="flex w-full flex-col">
      <div className="mx-auto w-full max-w-7xl px-6 pt-20 pb-16">
        <p className="text-ink-3 max-w-md text-sm leading-relaxed">
          The page above ends here. Everything below is the footer&apos;s ground.
        </p>
      </div>
      <FooterTerrace onSubscribe={() => undefined} />
    </div>
  );
}
