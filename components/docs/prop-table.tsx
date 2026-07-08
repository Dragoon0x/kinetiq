import type { PropRow } from "@/content/manifest/types";

export function PropTable({ props }: { props: PropRow[] }) {
  return (
    <div className="border-hairline overflow-x-auto rounded-3 border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-hairline bg-surface-1 border-b">
            <th className="text-label text-ink-3 px-4 py-2.5 text-left">
              Prop
            </th>
            <th className="text-label text-ink-3 px-4 py-2.5 text-left">
              Type
            </th>
            <th className="text-label text-ink-3 px-4 py-2.5 text-left">
              Default
            </th>
            <th className="text-label text-ink-3 px-4 py-2.5 text-left">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr key={prop.name} className="border-hairline border-b last:border-0">
              <td className="px-4 py-2.5 align-top font-mono text-[13px]">
                {prop.name}
              </td>
              <td className="text-cobalt-bright px-4 py-2.5 align-top font-mono text-[13px]">
                {prop.type}
              </td>
              <td className="text-ink-3 px-4 py-2.5 align-top font-mono text-[13px]">
                {prop.defaultValue ?? "—"}
              </td>
              <td className="text-ink-2 px-4 py-2.5 align-top">
                {prop.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
