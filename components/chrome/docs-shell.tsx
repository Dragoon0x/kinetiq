import {
  DocsSidebar,
  type SidebarGroup,
} from "@/components/chrome/docs-sidebar";
import { itemsByCategory } from "@/content/categories";
import { catalogBlocks, catalogComponents } from "@/content/manifest";

function catalogGroups(): SidebarGroup[] {
  const componentGroups: SidebarGroup[] = itemsByCategory(catalogComponents).map(
    ({ category, items }) => ({
      heading: category.label,
      href: `/components/category/${category.slug}`,
      items: items.map((c) => ({
        href: `/components/${c.name}`,
        label: c.title,
        serial: c.meta?.serial,
      })),
    }),
  );

  const blocksGroup: SidebarGroup = {
    heading: "Blocks",
    href: "/blocks",
    items: catalogBlocks.map((b) => ({
      href: `/blocks/${b.name}`,
      label: b.title,
      serial: b.meta?.serial,
    })),
  };

  return [...componentGroups, blocksGroup];
}

/** Sidebar + content shell shared by the components and blocks sections. */
export function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl px-6">
      <DocsSidebar groups={catalogGroups()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
