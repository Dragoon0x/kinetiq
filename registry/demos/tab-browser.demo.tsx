"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TabBrowser, type TabBrowserPage } from "@/registry/ui/tab-browser";

export const tweaks = defineTweaks({
  tabs: {
    kind: "range",
    label: "Tabs",
    default: 3,
    min: 1,
    max: 4,
    step: 1,
  },
  skin: {
    kind: "choice",
    label: "Skin",
    default: "glass",
    options: ["light", "dark", "glass"],
    names: { light: "Light", dark: "Dark", glass: "Glass" },
  },
  loading: { kind: "toggle", label: "Loading", default: true },
});

const LINK =
  "inline-flex h-7 items-center rounded-2 px-3 text-[11px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const TEXT_LINK =
  "text-cobalt-bright underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Line colours are the railway's own: fixed pigments, the same in either theme. */
const ROUTES = [
  {
    id: "coast",
    name: "Coast Line",
    span: "Harbour – Northgate",
    status: "On time",
    hue: "oklch(0.7 0.14 230)",
  },
  {
    id: "valley",
    name: "Valley Line",
    span: "Coldbrook – Basin Quay",
    status: "4 min late",
    hue: "oklch(0.72 0.15 150)",
  },
  {
    id: "ridge",
    name: "Ridge Line",
    span: "Fernworks Halt – Waylight Junction",
    status: "On time",
    hue: "oklch(0.74 0.14 70)",
  },
  {
    id: "night",
    name: "Night Shuttle",
    span: "Harbour – Coldbrook",
    status: "From 23:10",
    hue: "oklch(0.62 0.15 300)",
  },
];

const FARES = [
  { ticket: "Single", peak: "£4.20", off: "£3.10" },
  { ticket: "Return", peak: "£7.80", off: "£5.60" },
  { ticket: "Week", peak: "£31.00", off: "£31.00" },
];

function Home() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1 rounded-3 bg-cobalt-wash px-4 py-3">
        <p className="text-[10px] font-medium tracking-[0.08em] text-cobalt-bright uppercase">
          Fieldline Rail
        </p>
        <p className="text-base leading-tight font-semibold text-foreground">
          Every train, on time.
        </p>
        <p className="text-xs text-ink-2">
          Live departures for 42 stations along the coast.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <a
            href="fieldline.app/routes"
            className={`${LINK} bg-primary text-primary-foreground`}
          >
            See routes
          </a>
          <a
            href="fieldline.app/fares"
            className={`${LINK} border border-hairline-strong text-foreground`}
          >
            Fares
          </a>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {[
          ["On time", "98.4%"],
          ["Stations", "42"],
          ["Lines", "4"],
        ].map(([k, v]) => (
          <div
            key={k}
            className="flex flex-col gap-0.5 rounded-2 border border-hairline px-3 py-2"
          >
            <dt className="text-[10px] text-ink-3">{k}</dt>
            <dd className="font-mono text-sm text-foreground tabular-nums">
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Routes() {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-sm font-semibold text-foreground">Routes</p>
      <ul role="list" className="flex flex-col">
        {ROUTES.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 border-b border-hairline py-2 last:border-b-0"
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: r.hue }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground">
                {r.name}
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {r.span}
              </span>
            </span>
            <span
              className={
                r.status.includes("late")
                  ? "shrink-0 text-[11px] text-warn"
                  : "shrink-0 text-[11px] text-ink-2"
              }
            >
              {r.status}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-3">
        Tickets are on the{" "}
        <a href="fieldline.app/fares" className={TEXT_LINK}>
          fares page
        </a>
        .
      </p>
    </div>
  );
}

function Fares() {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-sm font-semibold text-foreground">Fares</p>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-hairline text-[10px] text-ink-3">
            <th scope="col" className="py-1.5 font-medium">
              Ticket
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Peak
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Off-peak
            </th>
          </tr>
        </thead>
        <tbody>
          {FARES.map((f) => (
            <tr key={f.ticket} className="border-b border-hairline">
              <th scope="row" className="py-1.5 font-medium text-foreground">
                {f.ticket}
              </th>
              <td className="py-1.5 text-right font-mono text-foreground tabular-nums">
                {f.peak}
              </td>
              <td className="py-1.5 text-right font-mono text-ink-2 tabular-nums">
                {f.off}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-ink-3">
        Questions? Try{" "}
        <a href="fieldline.app/help" className={TEXT_LINK}>
          help
        </a>
        .
      </p>
    </div>
  );
}

function Help() {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-sm font-semibold text-foreground">Help</p>
      <ul role="list" className="flex flex-col gap-1.5 text-xs text-ink-2">
        <li>
          <a href="fieldline.app/routes" className={TEXT_LINK}>
            Which line goes to Basin Quay?
          </a>
        </li>
        <li>
          <a href="fieldline.app/fares" className={TEXT_LINK}>
            Is a week ticket worth it?
          </a>
        </li>
        <li>
          <a href="fieldline.app/lost-property" className={TEXT_LINK}>
            I left my bag on a train
          </a>
        </li>
      </ul>
      <p className="text-[11px] text-ink-3">
        Back to{" "}
        <a href="fieldline.app" className={TEXT_LINK}>
          Fieldline Rail
        </a>
        .
      </p>
    </div>
  );
}

const PAGES: TabBrowserPage[] = [
  { url: "fieldline.app", title: "Fieldline Rail", content: <Home /> },
  { url: "fieldline.app/routes", title: "Routes", content: <Routes /> },
  { url: "fieldline.app/fares", title: "Fares", content: <Fares /> },
  { url: "fieldline.app/help", title: "Help", content: <Help /> },
];

/**
 * The Fieldline Rail website in a browser: switch and drag the tabs, follow
 * the links (Ctrl or Cmd for a new tab), go back and forward, type an address.
 */
export function TabBrowserDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [url, setUrl] = React.useState("fieldline.app");
  const page = PAGES.find((p) => p.url === url);

  const browser = (
    <TabBrowser
      label="Fieldline Rail website"
      pages={PAGES}
      value={url}
      onValueChange={setUrl}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[540px]">{browser}</div>;
  }

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-4">
      {browser}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{url}</span> ·{" "}
        {page ? page.title : "nothing at this address"}
      </p>
    </div>
  );
}
