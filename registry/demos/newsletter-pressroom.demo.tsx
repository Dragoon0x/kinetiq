"use client";

import { NewsletterPressroom } from "@/registry/blocks/newsletter-pressroom/newsletter-pressroom";

/** The section at its own scale — full width, default narrative. */
export function NewsletterPressroomDemo() {
  return (
    <div className="w-full">
      <NewsletterPressroom />
    </div>
  );
}
