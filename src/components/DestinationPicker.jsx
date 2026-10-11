import { getDistrict, districtStops } from '../data/airports.js';

/**
 * The road from the airport to a district, as a line of stops you can be dropped at,
 * then other places in that district.
 */
export function DestinationPicker({ district, value, onChange }) {
  const d = getDistrict(district);
  if (!d) return null;
  const { route, more } = districtStops(district);
  const stop = (p) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === p.id}
      className="route-stop"
      onClick={() => onChange(p.id)}
    >
      <span className="route-name">{p.name}</span>
      {p.district !== district && <span className="route-district">{getDistrict(p.district)?.name}</span>}
    </button>
  );

  return (
    <div className="field">
      <span className="label" id="dest-label">Where should we drop you?</span>
      <div role="radiogroup" aria-labelledby="dest-label" className="route-picker">
        <p className="route-origin">Cochin Airport</p>
        <ol className="route-line">
          {route.map((p) => <li key={p.id}>{stop(p)}</li>)}
        </ol>
        {more.length > 0 && (
          <>
            <p className="route-more-label">Elsewhere in {d.name}</p>
            <div className="route-more">
              {more.map((p) => <span key={p.id}>{stop(p)}</span>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
