import { notFound } from "next/navigation";

import { PreviewHeightReporter } from "@/components/sections/preview-height-reporter";
import { demos } from "@/components/docs/demos";
import { catalogPages } from "@/content/manifest";

import type { Metadata } from "next";

/**
 * The bare stage for a whole page composition — the same contract as the
 * block preview, one segment over. A page is already full-bleed, so this adds
 * nothing but the height reporter the framing harness listens to.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogPages.map((page) => ({ slug: page.name }));
}

export const metadata: Metadata = {
  // The framed stage is not a destination.
  robots: { index: false, follow: false },
};

export default async function PagePreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = catalogPages.find((page) => page.name === slug);
  const Demo = demos[slug];
  if (!item || !Demo) notFound();

  return (
    <div className="min-h-screen bg-surface-0">
      <PreviewHeightReporter slug={slug} />
      <Demo />
    </div>
  );
}
