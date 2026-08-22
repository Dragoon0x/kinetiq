import { notFound } from "next/navigation";

import { PreviewHeightReporter } from "@/components/sections/preview-height-reporter";
import { demos } from "@/components/docs/demos";
import { catalogBlocks } from "@/content/manifest";

import type { Metadata } from "next";

/**
 * The bare stage an iframe points at: one block, full bleed, no site chrome.
 * Lives outside the (site) segment so neither the header/footer nor the docs
 * shell wraps it; the root layout still runs the pre-paint theme script, and
 * a same-origin frame shares localStorage — so the frame always paints in the
 * viewer's theme with no handshake.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogBlocks.map((block) => ({ slug: block.name }));
}

export const metadata: Metadata = {
  // The framed stage is not a destination.
  robots: { index: false, follow: false },
};

export default async function BlockPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = catalogBlocks.find((block) => block.name === slug);
  const Demo = demos[slug];
  if (!item || !Demo) notFound();

  return (
    <div className="bg-surface-0 min-h-screen">
      <PreviewHeightReporter slug={slug} />
      <Demo />
    </div>
  );
}
