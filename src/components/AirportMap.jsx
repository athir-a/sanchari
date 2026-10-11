// A schematic of the arrivals side of Cochin Airport, showing where each rider is
// based on what they've told Sanchari. It is a diagram, not GPS.

const ZONES = [
  { id: 'air', label: 'In the air', x: 52, y: 30 },
  { id: 'gate', label: 'Arrival gate', x: 72, y: 104 },
  { id: 'baggage', label: 'Baggage hall', x: 160, y: 104 },
  { id: 'walk', label: 'Walkway', x: 240, y: 104 },
  { id: 'pickup', label: 'Pickup', x: 312, y: 104 },
];

export const ZONE_FOR_STATUS = {
  not_landed: 'air',
  delayed: 'air',
  landed: 'gate',
  collecting_luggage: 'baggage',
  walking: 'walk',
  at_pickup: 'pickup',
  departed: 'pickup',
};

// Spread several riders in one zone so their dots don't overlap.
const SPREAD = [[0, 0], [-15, 17], [15, 17], [0, -19]];

export function AirportMap({ members }) {
  const byZone = {};
  const placed = members
    .filter((m) => ZONE_FOR_STATUS[m.pickupStatus])
    .map((m) => {
      const zone = ZONE_FOR_STATUS[m.pickupStatus];
      const i = (byZone[zone] = (byZone[zone] ?? -1) + 1);
      const z = ZONES.find((q) => q.id === zone);
      const [dx, dy] = SPREAD[i % SPREAD.length];
      return { m, x: z.x + dx, y: z.y + dy };
    });

  const summary = members.map((m) => `${m.isMe ? 'You' : m.displayName}: ${ZONES.find((z) => z.id === ZONE_FOR_STATUS[m.pickupStatus])?.label ?? 'left the ride'}`).join('. ');

  return (
    <figure className="airport-map">
      <svg viewBox="0 0 360 172" role="img" aria-label={`Where everyone is. ${summary}.`}>
        {/* sky + flight path */}
        <path d="M14 40 C 70 6, 120 40, 150 62" fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
        {/* terminal */}
        <rect x="24" y="66" width="250" height="78" rx="10" fill="var(--soft)" stroke="var(--result-line)" />
        <line x1="116" y1="74" x2="116" y2="136" stroke="var(--result-line)" strokeDasharray="3 4" />
        <line x1="204" y1="74" x2="204" y2="136" stroke="var(--result-line)" strokeDasharray="3 4" />
        {/* pickup bay + road */}
        <rect x="280" y="66" width="66" height="78" rx="10" fill="var(--brand)" opacity="0.35" />
        <rect x="24" y="150" width="322" height="14" rx="4" fill="var(--line)" />
        <line x1="34" y1="157" x2="336" y2="157" stroke="var(--paper)" strokeWidth="1.5" strokeDasharray="8 6" />
        {ZONES.slice(1).map((z) => (
          <text key={z.id} x={z.x} y="140" textAnchor="middle" className="map-label">{z.label}</text>
        ))}
        <text x="96" y="24" className="map-label">In the air</text>

        {placed.map(({ m, x, y }) => (
          <g key={m.id} className={`map-dot${m.isMe ? ' me' : ''}${m.pickupStatus === 'delayed' ? ' late' : ''}`}>
            <circle cx={x} cy={y} r="11" />
            <text x={x} y={y + 4} textAnchor="middle">{m.displayName?.[0]?.toUpperCase()}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
