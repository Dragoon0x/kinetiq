"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { cn } from "@/registry/lib/utils";

export type CtaPostscriptProps = {
  /** The P.S. itself, one short paragraph. */
  postscript?: string;
  /** Who signs it. */
  signature?: string;
  signatureRole?: string;
  cta?: string;
  onCta?: () => void;
  /** The quiet alternative, as an inline text link. */
  altLabel?: string;
  altHref?: string;
  className?: string;
};

/**
 * The close as a postscript: after the whole page has argued, one short
 * paragraph in the founder's voice — set like the end of a letter, signed,
 * with a single action and one quiet alternative. It works because it drops
 * the register: the page stops presenting and starts talking. Keep it under
 * four sentences or it becomes another section.
 */
export function CtaPostscript({
  postscript = "P.S. — We built Waylight because our own mornings were arguments. If yours are too, the first yard is free, and it takes an afternoon. Worst case, you go back to the radio and you have lost a Tuesday.",
  signature = "M. Aldana",
  signatureRole = "Founder, Waylight",
  cta = "Try a Tuesday",
  onCta,
  altLabel = "or read how a rollout goes",
  altHref = "#rollout",
  className,
}: CtaPostscriptProps) {
  return (
    <section
      aria-label="Postscript"
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-24">
        <p className="text-ink text-lg leading-relaxed sm:text-xl">
          {postscript}
        </p>
        <p className="mt-6">
          <span className="text-ink font-mono text-base italic">{signature}</span>
          <span className="text-ink-3 ml-3 font-mono text-[11px] tracking-[0.08em] uppercase">
            {signatureRole}
          </span>
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <PressureButton size="lg" onClick={onCta}>
            {cta}
            <ArrowRight className="size-4" aria-hidden />
          </PressureButton>
          <a
            href={altHref}
            className="text-ink-2 hover:text-ink text-sm underline underline-offset-4 transition-colors"
          >
            {altLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
