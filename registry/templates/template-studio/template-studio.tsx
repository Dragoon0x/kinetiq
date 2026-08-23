"use client";

import * as React from "react";

import { NavAtlasPanel } from "@/registry/blocks/nav-atlas-panel/nav-atlas-panel";
import { HeroGalleryWall } from "@/registry/blocks/hero-gallery-wall/hero-gallery-wall";
import { GalleryContactSheet } from "@/registry/blocks/gallery-contact-sheet/gallery-contact-sheet";
import { ContentMarginNotes } from "@/registry/blocks/content-margin-notes/content-margin-notes";
import { GalleryCoverShelf } from "@/registry/blocks/gallery-cover-shelf/gallery-cover-shelf";
import { TestimonialTwoDates } from "@/registry/blocks/testimonial-two-dates/testimonial-two-dates";
import { ContactOpenHours } from "@/registry/blocks/contact-open-hours/contact-open-hours";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type TemplateStudioProps = {
  /**
   * One product name for the whole page. Nav, hero, and footer all read
   * from it — a template whose logo and copy disagree is not one site.
   */
  brand?: string;
  className?: string;
};

/**
 * Image-first, where the work has to carry the page: a bleeding wall, a
 * contact sheet showing the frames nobody chose, and one written passage in
 * between. The copy is deliberately sparse — on a page selling images, prose
 * competing with the images is prose in the way, and the one passage that
 * survives should be about the work rather than the studio.
 */
export function TemplateStudio({
  brand = "Fernworks",
  className,
}: TemplateStudioProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavAtlasPanel
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
      />
      <main>
        <HeroGalleryWall eyebrow={`${brand} · plate archive`} />
        <GalleryContactSheet eyebrow={`${brand} · sheet 14`} />
        <ContentMarginNotes
          eyebrow={`${brand} · on the work`}
          headline="Eleven years photographing places that do not pose."
          standfirst="Why the archive is printed as shot, and what gets left in."
          passages={[
            {
              id: "p1",
              text: "Working ports do not hold still and do not care that you are there. Every plate in this archive was made in whatever light and weather the morning supplied, and printed without retouching.",
              note: {
                label: "Printed as shot",
                body: "No dodging, no compositing, no removing the crane that was in the way.",
              },
            },
            {
              id: "p2",
              text: "The contact sheets stay published alongside the selects. A frame that did not make it still tells you what the morning looked like, and often more honestly than the one that did.",
              note: {
                label: "The rejects stay up",
                body: "Roughly nine frames in ten. They are the reason the tenth is worth anything.",
              },
            },
            {
              id: "p3",
              text: "Prints are editioned, numbered, and dated to the morning they were taken rather than the day they were printed. The date is part of the record, not part of the marketing.",
            },
          ]}
          signature="Fernworks — studio"
        />
        <GalleryCoverShelf eyebrow={`${brand} · back issues`} />
        <TestimonialTwoDates
          eyebrow={`${brand} · then and now`}
          headline="What they said at the commission, and what they say now."
          quotes={[
            {
              id: "q1",
              name: "R. Okafor",
              role: "Curator, harbour museum",
              early: {
                date: "At commission",
                quote:
                  "I asked for twelve clean frames and was told I would get the whole roll. I did not think that was what I wanted.",
              },
              later: {
                date: "Two years on",
                quote:
                  "The sheets are what people stand in front of. The selects sell; the rejects are what they talk about afterwards.",
              },
            },
            {
              id: "q2",
              name: "S. Okonkwo",
              role: "Editor, quarterly",
              early: {
                date: "First edit",
                quote:
                  "Half of these are technically wrong. Flare, motion, a crane through the frame.",
              },
              later: {
                date: "Eighteen months on",
                quote:
                  "The technically wrong ones ran. They were the only pictures that looked like a working morning.",
              },
            },
          ]}
        />
        <ContactOpenHours eyebrow={`${brand} · open hours`} />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        fineprint="© 2026 Fernworks"
      />
    </div>
  );
}
