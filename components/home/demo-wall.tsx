import Link from "next/link";

import { demos } from "@/components/docs/demos";
import { SpecimenPlate } from "@/components/lab/specimen-plate";
import { catalogBlocks, catalogComponents } from "@/content/manifest";

/**
 * The exhibit floor: every catalog item with a registered demo, live. Grows
 * automatically as instruments land in the manifest.
 */
export function DemoWall() {
  const items = [...catalogComponents, ...catalogBlocks].filter(
    (item) => demos[item.name],
  );

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {items.map((item) => {
        const Demo = demos[item.name];
        if (!Demo) return null;
        const kind = item.type === "registry:block" ? "blocks" : "components";
        return (
          <div key={item.name} className="group/wall relative">
            <SpecimenPlate
              serial={item.meta?.serial ?? "KQ-000"}
              label={item.name.replace(/-/g, "/").toUpperCase()}
              minHeight={300}
            >
              <Demo />
            </SpecimenPlate>
            <Link
              href={`/${kind}/${item.name}`}
              className="text-ink-3 hover:text-cobalt-bright mt-2 inline-flex items-center gap-1 px-1 font-mono text-[11px] tracking-wide uppercase transition-colors"
            >
              Open specimen →
            </Link>
          </div>
        );
      })}
    </div>
  );
}
