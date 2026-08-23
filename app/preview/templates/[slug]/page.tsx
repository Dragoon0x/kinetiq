import { notFound } from "next/navigation";

import { PreviewHeightReporter } from "@/components/sections/preview-height-reporter";
import { demos } from "@/components/docs/demos";
import { catalogTemplates } from "@/content/manifest";

import type { Metadata } from "next";

/**
 * The bare stage for a complete landing site — the same contract as the block
 * and page previews, one segment over. A template is already full-bleed, so
 * this adds nothing but the height reporter the framing harness listens to.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogTemplates.map((template) => ({ slug: template.name }));
}

export const metadata: Metadata = {
  // The framed stage is not a destination.
  robots: { index: false, follow: false },
};

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = catalogTemplates.find((template) => template.name === slug);
  const Demo = demos[slug];
  if (!item || !Demo) notFound();

  return (
    <div className="min-h-screen bg-surface-0">
      <PreviewHeightReporter slug={slug} />
      <Demo />
    </div>
  );
}
