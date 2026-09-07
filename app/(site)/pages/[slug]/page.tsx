import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComponentDocPage } from "@/components/docs/component-page";
import { catalogPages, itemBySlug } from "@/content/manifest";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, softwareLd } from "@/lib/structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogPages.map((page) => ({ slug: page.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = itemBySlug(slug);
  if (!item) return {};
  return pageMeta({
    title: item.title,
    description: item.description,
    path: `/pages/${slug}`,
    keywords: [item.meta?.serial ?? "", ...item.keywords].filter(Boolean),
  });
}

export default async function PageDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  if (!item || item.type !== "registry:page" || item.draft) notFound();
  return (
    <>
      <JsonLd
        data={[
          softwareLd(item, "pages"),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Pages", path: "/pages" },
            { name: item.title, path: `/pages/${slug}` },
          ]),
        ]}
      />
      <ComponentDocPage item={item} kind="pages" />
    </>
  );
}
