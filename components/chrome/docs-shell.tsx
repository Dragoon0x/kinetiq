import {
  DocsSidebar,
  type SidebarSection,
} from "@/components/chrome/docs-sidebar";
import { catalogBlocks, catalogComponents } from "@/content/manifest";

function catalogSections(): SidebarSection[] {
  return [
    {
      heading: "COMPONENTS",
      items: catalogComponents.map((c) => ({
        href: `/components/${c.name}`,
        label: c.title,
        serial: c.meta?.serial,
      })),
    },
    {
      heading: "BLOCKS",
      items: catalogBlocks.map((b) => ({
        href: `/blocks/${b.name}`,
        label: b.title,
        serial: b.meta?.serial,
      })),
    },
  ];
}

/** Sidebar + content shell shared by the components and blocks sections. */
export function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl px-6">
      <DocsSidebar sections={catalogSections()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
