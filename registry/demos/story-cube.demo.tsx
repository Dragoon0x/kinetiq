"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  StoryCube,
  type StoryCubePerson,
  type StoryCubeValue,
} from "@/registry/ui/story-cube";

export const tweaks = defineTweaks({
  duration: {
    kind: "range",
    label: "Duration",
    default: 5,
    min: 2,
    max: 10,
    step: 1,
    unit: "s",
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.1,
  },
  bars: {
    kind: "choice",
    label: "Bars",
    default: "split",
    options: ["split", "single", "ring"],
    names: { split: "Split", single: "Single", ring: "Ring" },
  },
  autoplay: { kind: "toggle", label: "Autoplay", default: true },
});

// Photos drawn from the theme's own colours, darkened or washed in oklab so
// a dusk sky stays a dusk sky on a light page and a dark one.
const dark = (token: string, pct: number) =>
  `color-mix(in oklab, var(--${token}) ${pct}%, black)`;
const pale = (token: string, pct: number) =>
  `color-mix(in oklab, var(--${token}) ${pct}%, white)`;
const blend = (a: string, b: string, pct: number) =>
  `color-mix(in oklab, var(--${a}) ${pct}%, var(--${b}))`;
const sky = (...stops: string[]) =>
  `linear-gradient(to bottom, ${stops.join(", ")})`;

function Photo({
  background,
  children,
}: {
  background: string;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0" style={{ background }}>
      <svg
        aria-hidden
        viewBox="0 0 90 160"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        {children}
      </svg>
    </div>
  );
}

const RidgeDawn = () => (
  <Photo
    background={sky(
      dark("accent", 55),
      `${blend("accent", "warn", 45)} 58%`,
      `${pale("warn", 80)} 80%`,
    )}
  >
    <circle cx={58} cy={94} r={9} fill={pale("warn", 70)} />
    <path
      d="M0 100 L14 88 L26 95 L40 80 L55 92 L70 84 L90 96 V160 H0Z"
      fill={dark("accent", 48)}
    />
    <path
      d="M0 116 L18 104 L34 112 L50 98 L66 110 L90 102 V160 H0Z"
      fill={dark("accent", 32)}
    />
    <path
      d="M0 136 L22 122 L44 131 L62 120 L90 133 V160 H0Z"
      fill={dark("accent", 18)}
    />
  </Photo>
);

const Tarn = () => (
  <Photo background={sky(pale("accent", 45), pale("signal", 35))}>
    <path
      d="M0 98 L24 60 L40 84 L58 54 L90 94 V160 H0Z"
      fill={dark("accent", 45)}
    />
    <path d="M24 60 L19 68 L24 66 L29 69Z" fill="white" opacity={0.85} />
    <path d="M58 54 L52 63 L58 61 L64 64Z" fill="white" opacity={0.85} />
    <ellipse cx={45} cy={118} rx={40} ry={11} fill={dark("signal", 50)} />
    <rect x={22} y={114} width={20} height={1} fill="white" opacity={0.35} />
    <rect x={48} y={119} width={16} height={1} fill="white" opacity={0.3} />
    <path
      d="M0 130 Q22 121 45 131 T90 127 V160 H0Z"
      fill={dark("success", 35)}
    />
  </Photo>
);

const Cairn = () => (
  <Photo background={sky(dark("accent", 70), pale("accent", 55))}>
    <ellipse cx={20} cy={46} rx={14} ry={4} fill="white" opacity={0.45} />
    <ellipse cx={66} cy={34} rx={11} ry={3} fill="white" opacity={0.35} />
    <path d="M0 160 V128 L45 97 L90 124 V160Z" fill={dark("accent", 24)} />
    <ellipse cx={45} cy={94} rx={6} ry={2.6} fill={dark("ink-3", 70)} />
    <ellipse cx={45} cy={89.5} rx={4.6} ry={2.2} fill={dark("ink-3", 80)} />
    <ellipse cx={45} cy={85.5} rx={3.2} ry={1.8} fill={dark("ink-3", 70)} />
  </Photo>
);

const HarbourNoon = () => (
  <Photo background={sky(pale("accent", 55), `${pale("signal", 30)} 62%`)}>
    <rect x={0} y={100} width={90} height={60} fill={dark("accent", 70)} />
    <rect x={0} y={108} width={90} height={2} fill="white" opacity={0.18} />
    <rect x={0} y={122} width={90} height={2} fill="white" opacity={0.12} />
    <rect x={0} y={111} width={32} height={3} fill={dark("warn", 35)} />
    <rect x={8} y={114} width={2} height={10} fill={dark("warn", 30)} />
    <rect x={24} y={114} width={2} height={10} fill={dark("warn", 30)} />
    <path d="M44 110 H62 L59 115 H47Z" fill="white" />
    <path d="M53 109 V90 L63 108Z" fill="white" opacity={0.92} />
    <path d="M68 118 H78 L76 121 H70Z" fill="white" />
    <path d="M73 117 V106 L79 116Z" fill={pale("danger", 20)} />
  </Photo>
);

const Lighthouse = () => (
  <Photo
    background={sky(dark("accent", 40), `${blend("danger", "warn", 40)} 70%`)}
  >
    <path d="M66 75 L0 58 L0 72Z" fill={pale("warn", 70)} opacity={0.35} />
    <rect x={0} y={118} width={90} height={42} fill={dark("accent", 35)} />
    <rect x={40} y={114} width={50} height={6} fill={dark("ink-3", 45)} />
    <path d="M60 116 L63 78 L69 78 L72 116Z" fill="white" />
    <rect x={61.5} y={88} width={9} height={5} fill={dark("danger", 85)} />
    <rect x={60.8} y={102} width={10.4} height={5} fill={dark("danger", 85)} />
    <circle cx={66} cy={75} r={3.2} fill={pale("warn", 88)} />
  </Photo>
);

const Lanterns = () => (
  <Photo background={sky(dark("accent", 22), dark("accent", 12))}>
    <rect x={0} y={60} width={18} height={100} fill={dark("accent", 30)} />
    <rect x={72} y={70} width={18} height={90} fill={dark("accent", 30)} />
    <path
      d="M0 52 Q45 74 90 50"
      fill="none"
      stroke="white"
      strokeOpacity={0.4}
      strokeWidth={0.6}
    />
    {[
      [14, 58, "danger"],
      [30, 64, "warn"],
      [45, 66, "danger"],
      [60, 64, "warn"],
      [76, 57, "danger"],
    ].map(([x, y, tone]) => (
      <g key={String(x)}>
        <circle
          cx={Number(x)}
          cy={Number(y) + 4}
          r={6}
          fill={`var(--${tone})`}
          opacity={0.22}
        />
        <ellipse
          cx={Number(x)}
          cy={Number(y) + 4}
          rx={3}
          ry={3.8}
          fill={pale(String(tone), 20)}
        />
      </g>
    ))}
    <rect x={0} y={140} width={90} height={20} fill={dark("warn", 22)} />
  </Photo>
);

const NoodleStall = () => (
  <Photo background={sky(dark("accent", 18), dark("accent", 28))}>
    <path
      d="M36 70 Q32 62 37 55 T36 42"
      fill="none"
      stroke="white"
      strokeOpacity={0.45}
      strokeWidth={1.2}
    />
    <path
      d="M47 70 Q43 60 48 52 T46 38"
      fill="none"
      stroke="white"
      strokeOpacity={0.35}
      strokeWidth={1.2}
    />
    <rect x={14} y={96} width={62} height={46} fill={dark("warn", 38)} />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect
        key={i}
        x={10 + i * 12}
        y={84}
        width={12}
        height={10}
        fill={i % 2 ? "white" : dark("danger", 90)}
      />
    ))}
    <rect x={10} y={94} width={70} height={3} fill={dark("danger", 60)} />
    <ellipse cx={34} cy={96} rx={7} ry={2.4} fill="white" />
    <ellipse cx={52} cy={96} rx={7} ry={2.4} fill="white" />
    <rect
      x={20}
      y={104}
      width={50}
      height={2}
      fill={pale("warn", 60)}
      opacity={0.5}
    />
  </Photo>
);

const LastTram = () => (
  <Photo background={sky(dark("accent", 35), dark("accent", 20))}>
    <path d="M0 58 H90" stroke="white" strokeOpacity={0.35} strokeWidth={0.5} />
    <path
      d="M40 58 L46 74 M52 58 L46 74"
      stroke="white"
      strokeOpacity={0.4}
      strokeWidth={0.6}
    />
    <rect x={10} y={74} width={70} height={46} rx={6} fill={dark("warn", 78)} />
    {[0, 1, 2, 3].map((i) => (
      <rect
        key={i}
        x={16 + i * 15.5}
        y={82}
        width={11}
        height={14}
        rx={1.5}
        fill={pale("warn", 82)}
      />
    ))}
    <rect x={10} y={106} width={70} height={3} fill={dark("danger", 70)} />
    <rect x={0} y={126} width={90} height={1.4} fill="white" opacity={0.4} />
    <rect x={0} y={134} width={90} height={1.4} fill="white" opacity={0.3} />
  </Photo>
);

const Rooftops = () => (
  <Photo background={sky(dark("accent", 15), dark("accent", 35))}>
    <circle cx={66} cy={36} r={8} fill={pale("warn", 25)} />
    <path
      d="M0 160 V104 H12 V92 H22 V110 H34 V86 H44 V100 H56 V80 H66 V98 H78 V90 H90 V160Z"
      fill={dark("accent", 12)}
    />
    {[
      [14, 98],
      [37, 92],
      [39, 104],
      [59, 88],
      [61, 100],
      [81, 96],
      [24, 116],
      [70, 108],
    ].map(([x, y]) => (
      <rect
        key={`${x}-${y}`}
        x={x}
        y={y}
        width={2.4}
        height={3}
        fill={pale("warn", 55)}
      />
    ))}
  </Photo>
);

const DesertRoad = () => (
  <Photo background={sky(pale("accent", 50), `${pale("warn", 55)} 60%`)}>
    <path d="M0 100 Q24 90 50 98 T90 94 V160 H0Z" fill={dark("warn", 72)} />
    <path d="M0 112 Q30 102 58 112 T90 108 V160 H0Z" fill={dark("warn", 58)} />
    <path d="M36 160 L44 98 L46 98 L54 160Z" fill={dark("ink-3", 45)} />
    {[102, 112, 126, 144].map((y, i) => (
      <rect
        key={y}
        x={44.7 - i * 0.2}
        y={y}
        width={0.6 + i * 0.4}
        height={2 + i * 2}
        fill="white"
        opacity={0.8}
      />
    ))}
  </Photo>
);

const SaltPan = () => (
  <Photo
    background={sky(blend("danger", "warn", 50), `${pale("warn", 60)} 64%`)}
  >
    <circle cx={30} cy={98} r={7} fill={pale("warn", 80)} />
    <rect x={0} y={100} width={90} height={4} fill={dark("danger", 40)} />
    <rect x={0} y={104} width={90} height={56} fill={pale("accent", 12)} />
    <path
      d="M8 118 L20 112 L32 120 L46 113 L60 121 L74 114 L88 120 M14 136 L28 128 L42 138 L58 130 L72 140 L86 132"
      fill="none"
      stroke="white"
      strokeWidth={0.7}
    />
  </Photo>
);

const PEOPLE: StoryCubePerson[] = [
  {
    id: "mara",
    name: "Mara",
    posted: "2h",
    stories: [
      {
        id: "ridge",
        label: "Ridge at first light",
        caption: "Up before the sun on Coldbrook ridge.",
        content: <RidgeDawn />,
      },
      {
        id: "tarn",
        label: "Tarn below the col",
        caption: "Lunch stop. The water is very cold.",
        content: <Tarn />,
      },
      {
        id: "cairn",
        label: "Summit cairn",
        caption: "Added a stone to the pile.",
        content: <Cairn />,
      },
    ],
  },
  {
    id: "ines",
    name: "Ines",
    posted: "5h",
    stories: [
      {
        id: "harbour",
        label: "Harbour at noon",
        caption: "Ferry to the islands leaves at one.",
        content: <HarbourNoon />,
      },
      {
        id: "lighthouse",
        label: "Lighthouse on the mole",
        caption: "Walked out to the light at dusk.",
        content: <Lighthouse />,
      },
    ],
  },
  {
    id: "tomas",
    name: "Tomas",
    posted: "9h",
    stories: [
      {
        id: "lanterns",
        label: "Lanterns on Ferry Lane",
        caption: "The night market opens at eight.",
        content: <Lanterns />,
      },
      {
        id: "noodles",
        label: "Noodle stall",
        caption: "Third bowl. No regrets.",
        content: <NoodleStall />,
      },
      {
        id: "tram",
        label: "Last tram home",
        content: <LastTram />,
      },
      {
        id: "rooftops",
        label: "Rooftops at midnight",
        caption: "View from the hostel roof.",
        content: <Rooftops />,
      },
    ],
  },
  {
    id: "oskar",
    name: "Oskar",
    posted: "1d",
    stories: [
      {
        id: "road",
        label: "Road to Basin Flats",
        caption: "Two hundred kilometres, one bend.",
        content: <DesertRoad />,
      },
      {
        id: "salt",
        label: "Salt pan at dusk",
        caption: "The flats go pink after six.",
        content: <SaltPan />,
      },
    ],
  },
];

const TRIPS = [
  {
    title: "Coldbrook ridge loop",
    meta: "3 days · 42 km",
    art: `linear-gradient(to bottom, ${dark("accent", 50)}, ${pale("warn", 70)})`,
  },
  {
    title: "Island ferries, south",
    meta: "5 days · 4 islands",
    art: `linear-gradient(to bottom, ${pale("accent", 50)}, ${dark("accent", 60)})`,
  },
  {
    title: "Night markets by tram",
    meta: "2 nights · 6 stops",
    art: `linear-gradient(to bottom, ${dark("accent", 25)}, ${dark("warn", 70)})`,
  },
] as const;

/** The Waylight feed under the tray, drawn as a sketch. */
function TripFeed() {
  return (
    <div aria-hidden className="flex flex-col gap-2.5 p-3">
      {TRIPS.map((t) => (
        <div
          key={t.title}
          className="flex items-center gap-2.5 rounded-2 border border-hairline bg-card p-2"
        >
          <span
            className="size-10 shrink-0 rounded-1"
            style={{ background: t.art }}
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-xs text-foreground">{t.title}</span>
            <span className="truncate font-mono text-[10px] text-ink-3">
              {t.meta}
            </span>
          </span>
        </div>
      ))}
      <span className="h-2 w-4/5 rounded-1 bg-ink/8" />
      <span className="h-2 w-3/5 rounded-1 bg-ink/8" />
    </div>
  );
}

/**
 * Waylight, a travel app: four friends' trip stories on a cube. Tap through
 * them, hold to look, swipe sideways to the next friend, swipe down to put
 * them away; the faces in the tray bring them back.
 */
export function StoryCubeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(true);
  const [at, setAt] = React.useState<StoryCubeValue>({
    person: "mara",
    story: 0,
  });
  const person = PEOPLE.find((p) => p.id === at.person) ?? PEOPLE[0];

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <StoryCube
        className="w-full max-w-64 self-center"
        people={PEOPLE}
        value={at}
        onValueChange={setAt}
        open={open}
        onOpenChange={setOpen}
        label="Waylight · Trips"
        sound={sound}
        {...values}
      >
        <TripFeed />
      </StoryCube>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {open && person ? (
            <>
              <span className="text-signal">
                watching {person.name.toLowerCase()}
              </span>
              {` · ${at.story + 1} of ${person.stories.length} · tap or swipe`}
            </>
          ) : (
            <>
              <span className="text-signal">stories closed</span> · tap a face
              to watch
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
