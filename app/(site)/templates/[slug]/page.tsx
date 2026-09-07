import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComponentDocPage } from "@/components/docs/component-page";
import { catalogTemplates, itemBySlug } from "@/content/manifest";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, softwareLd } from "@/lib/structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogTemplates.map((template) => ({ slug: template.name }));
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
    path: `/templates/${slug}`,
    keywords: [item.meta?.serial ?? "", ...item.keywords].filter(Boolean),
  });
}

export default async function TemplateDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  if (!item || !catalogTemplates.some((t) => t.name === slug) || item.draft) {
    notFound();
  }
  return (
    <>
      <JsonLd
        data={[
          softwareLd(item, "templates"),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Templates", path: "/templates" },
            { name: item.title, path: `/templates/${slug}` },
          ]),
        ]}
      />
      <ComponentDocPage item={item} kind="templates" />
    </>
  );
}
