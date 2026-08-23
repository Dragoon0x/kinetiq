"use client";

import { NewsletterLedgerNote } from "@/registry/blocks/newsletter-ledger-note/newsletter-ledger-note";

/** The section at its own scale — full width, default narrative. */
export function NewsletterLedgerNoteDemo() {
  return (
    <div className="w-full">
      <NewsletterLedgerNote />
    </div>
  );
}
