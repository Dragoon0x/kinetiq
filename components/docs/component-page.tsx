import Link from "next/link";

import { sources } from "@/.generated/sources";
import { CodeBlock } from "@/components/docs/code-block";
import { demos } from "@/components/docs/demos";
import { DocTabs } from "@/components/docs/doc-tabs";
import { InstallCommand } from "@/components/docs/install-command";
import { PropTable } from "@/components/docs/prop-table";
import { SpecimenPlate } from "@/components/lab/specimen-plate";
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
  kind: "components" | "blocks";
}) {
  const Demo = demos[item.name];
  const plateLabel = item.name.replace(/-/g, "/").toUpperCase();
  const serial = item.meta?.serial ?? "KQ-000";
  const demoPath = `registry/demos/${item.name}.demo.tsx`;
  const demoSource = sources[demoPath];

  const preview = (
    <SpecimenPlate serial={serial} label={plateLabel} minHeight={380}>
      {Demo ? (
        <Demo />
      ) : (
        <p className="text-ink-3 font-mono text-xs">PREVIEW PENDING</p>
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
            <li key={note} className="text-ink-2 flex gap-2.5 text-sm">
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
    <article className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav aria-label="Breadcrumb" className="text-ink-3 flex gap-2 text-sm">
        <Link
          href={`/${kind}`}
          className="hover:text-ink capitalize transition-colors"
        >
          {kind}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{item.title}</span>
      </nav>

      <p className="text-label text-ink-3 mt-8">
        {serial} · {plateLabel}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {item.title}
      </h1>
      <p className="text-ink-2 mt-3 max-w-xl text-base">{item.description}</p>

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
        <p className="text-ink-2 mt-2 text-sm">
          One command — the source lands in your repo. Or copy it from the
          Code tab.
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
    </article>
  );
}
