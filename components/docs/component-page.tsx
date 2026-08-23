import Link from "next/link";

import { sources } from "@/.generated/sources";
import { CodeBlock } from "@/components/docs/code-block";
import { demos } from "@/components/docs/demos";
import { DocTabs } from "@/components/docs/doc-tabs";
import { InstallCommand } from "@/components/docs/install-command";
import { PropTable } from "@/components/docs/prop-table";
import { SpecimenPlate } from "@/components/lab/specimen-plate";
import { SectionFrame } from "@/components/sections/section-frame";
import { isSection } from "@/content/block-categories";
import { categoryBySlug, categoryOf } from "@/content/categories";
import type { KinetiqItem } from "@/content/manifest/types";

/**
 * The docs template every catalog item renders through. All code shown here
 * comes from .generated/sources.ts — the same bytes the registry publishes.
 */
export function ComponentDocPage({
  item,
  kind,
}: {
  item: KinetiqItem;
  kind: "components" | "blocks" | "pages";
}) {
  const Demo = demos[item.name];
  const plateLabel = item.name.replace(/-/g, "/").toUpperCase();
  const serial = item.meta?.serial ?? "KQ-000";
  const category =
    kind === "components" ? categoryBySlug(categoryOf(item)) : undefined;
  const demoPath = `registry/demos/${item.name}.demo.tsx`;
  const demoSource = sources[demoPath];

  // Sections and whole pages both need the frame: the doc column is 768px and
  // breakpoints answer to the window, so a plate can neither seat nor honestly
  // preview anything full-bleed.
  const framed = kind === "pages" || (kind === "blocks" && isSection(item));
  const preview = framed ? (
    <SectionFrame
      serial={serial}
      label={plateLabel}
      slug={item.name}
      base={kind === "pages" ? "pages" : "blocks"}
    />
  ) : (
    <SpecimenPlate serial={serial} label={plateLabel} minHeight={380}>
      {Demo ? (
        <Demo />
      ) : (
        <p className="font-mono text-xs text-ink-3">PREVIEW PENDING</p>
      )}
    </SpecimenPlate>
  );

  const usage = (
    <div className="space-y-6">
      {demoSource ? (
        <CodeBlock code={demoSource} filename={`${item.name}.demo.tsx`} />
      ) : null}
      {item.usageNotes && item.usageNotes.length > 0 ? (
        <ul className="space-y-2">
          {item.usageNotes.map((note) => (
            <li key={note} className="flex gap-2.5 text-sm text-ink-2">
              <span aria-hidden className="text-cobalt-bright select-none">
                —
              </span>
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  const code = (
    <div className="space-y-4">
      {item.files.map((file) => (
        <CodeBlock
          key={file.path}
          code={sources[file.path] ?? "// source unavailable"}
          filename={file.path.split("/").pop()}
        />
      ))}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm text-ink-3">
        <Link
          href={`/${kind}`}
          className="capitalize transition-colors hover:text-ink"
        >
          {kind}
        </Link>
        <span aria-hidden>/</span>
        {category ? (
          <>
            <Link
              href={`/components/category/${category.slug}`}
              className="transition-colors hover:text-ink"
            >
              {category.label}
            </Link>
            <span aria-hidden>/</span>
          </>
        ) : null}
        <span className="text-ink-2">{item.title}</span>
      </nav>

      <p className="mt-8 text-label text-ink-3">
        {serial} · {plateLabel}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {item.title}
      </h1>
      <p className="mt-3 max-w-xl text-base text-ink-2">{item.description}</p>

      <DocTabs
        className="mt-8"
        tabs={[
          { label: "Preview", content: preview },
          { label: "Usage", content: usage },
          { label: "Code", content: code },
        ]}
      />

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Install</h2>
        <p className="mt-2 text-sm text-ink-2">
          One command — the source lands in your repo. Or copy it from the Code
          tab.
        </p>
        <InstallCommand slug={item.name} className="mt-4" />
      </section>

      {item.props && item.props.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Props</h2>
          <div className="mt-4">
            <PropTable props={item.props} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
