import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LabShell } from "@/components/playground/lab-shell";
import { labComponents } from "@/components/playground/lab-map";
import { labBySlug, labs } from "@/content/labs";

export const dynamicParams = false;

export function generateStaticParams() {
  return labs
    .filter((lab) => labComponents[lab.slug])
    .map((lab) => ({ lab: lab.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lab: string }>;
}): Promise<Metadata> {
  const { lab: slug } = await params;
  const lab = labBySlug(slug);
  if (!lab) return {};
  return { title: `${lab.title} · Playground`, description: lab.tagline };
}

export default async function LabPage({
  params,
}: {
  params: Promise<{ lab: string }>;
}) {
  const { lab: slug } = await params;
  const lab = labBySlug(slug);
  const Lab = labComponents[slug];
  if (!lab || !Lab) notFound();
  return (
    <LabShell slug={slug}>
      <Lab />
    </LabShell>
  );
}
