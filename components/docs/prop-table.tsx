import type { PropRow } from "@/content/manifest/types";

export function PropTable({ props }: { props: PropRow[] }) {
  return (
    <div className="overflow-hidden rounded-3 border border-hairline">
      {/* Narrow screens: one stacked entry per prop, so nothing has to
          scroll sideways to be read. */}
      <dl className="sm:hidden">
        {props.map((prop) => (
          <div
            key={prop.name}
            className="flex flex-col gap-1.5 border-b border-hairline px-4 py-3 last:border-0"
          >
            <dt className="font-mono text-[13px]">{prop.name}</dt>
            <dd className="font-mono text-[13px] break-words text-cobalt-bright">
              {prop.type}
            </dd>
            <dd className="font-mono text-[13px] text-ink-3">
              default {prop.defaultValue ?? "\u2014"}
            </dd>
            <dd className="text-sm text-ink-2">{prop.description}</dd>
          </div>
        ))}
      </dl>
      <table className="hidden w-full border-collapse text-sm sm:table">
        <thead>
          <tr className="border-b border-hairline bg-surface-1">
            <th className="px-4 py-2.5 text-left text-label text-ink-3">
              Prop
            </th>
            <th className="px-4 py-2.5 text-left text-label text-ink-3">
              Type
            </th>
            <th className="px-4 py-2.5 text-left text-label text-ink-3">
              Default
            </th>
            <th className="px-4 py-2.5 text-left text-label text-ink-3">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr
              key={prop.name}
              className="border-b border-hairline last:border-0"
            >
              <td className="px-4 py-2.5 align-top font-mono text-[13px]">
                {prop.name}
              </td>
              <td className="px-4 py-2.5 align-top font-mono text-[13px] text-cobalt-bright">
                {prop.type}
              </td>
              <td className="px-4 py-2.5 align-top font-mono text-[13px] text-ink-3">
                {prop.defaultValue ?? "—"}
              </td>
              <td className="px-4 py-2.5 align-top text-ink-2">
                {prop.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
