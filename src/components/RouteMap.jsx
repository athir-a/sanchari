import { useState } from 'react';
import { ExternalLink, Navigation, Route, MapPin, TrainFront } from 'lucide-react';
import { googleMapsDirectionsUrl, googleMapsSearchUrl } from '../utils/geo.js';

const pt = (p) => encodeURIComponent(`${p.lat},${p.lng}`);

/** Google Maps embed (no API key): driving directions through each point in order. */
function directionsEmbed(origin, points) {
  return `https://maps.google.com/maps?saddr=${pt(origin)}&daddr=${points.map(pt).join('+to:')}&output=embed`;
}
const placeEmbed = (q) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;

/**
 * The cab's route in an embedded Google Map, with a few ways to look at it:
 * the whole shared route, just your part, or the pickup point at the airport.
 */
export function RouteMap({ airport, stops, myStop, myDestination }) {
  const points = stops.filter((s) => s.lat != null && s.lng != null);
  const views = [
    points.length > 0 && { id: 'route', label: 'Whole route', icon: Route },
    myStop?.lat != null && { id: 'mine', label: 'My drop-off', icon: Navigation },
    { id: 'pickup', label: 'Pickup point', icon: MapPin },
  ].filter(Boolean);
  const [view, setView] = useState(views[0].id);

  const pickupQuery = `${airport.name} arrivals taxi pickup`;
  const src =
    view === 'route' ? directionsEmbed(airport, points)
    : view === 'mine' ? directionsEmbed(airport, [myStop])
    : placeEmbed(pickupQuery);

  const fullRouteUrl = points.length
    ? googleMapsDirectionsUrl({ origin: airport, destination: points[points.length - 1], waypoints: points.slice(0, -1) })
    : null;
  const myTransitUrl = myStop && myDestination && (Math.abs(myStop.lat - myDestination.lat) > 0.005 || Math.abs(myStop.lng - myDestination.lng) > 0.005)
    ? googleMapsDirectionsUrl({ origin: myStop, destination: myDestination, mode: 'transit' })
    : null;

  return (
    <div className="route-map">
      <div className="segmented route-tabs" role="group" aria-label="Map view">
        {views.map((v) => (
          <button key={v.id} type="button" className="button secondary" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            <v.icon size={15} aria-hidden /> {v.label}
          </button>
        ))}
      </div>
      <div className="map-frame">
        <iframe key={src} title={`Google Map: ${views.find((v) => v.id === view).label}`} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      </div>
      <div className="route-links">
        {fullRouteUrl && (
          <a className="text-button" href={fullRouteUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden /> Open the cab route in Google Maps</a>
        )}
        {myTransitUrl && (
          <a className="text-button" href={myTransitUrl} target="_blank" rel="noreferrer"><TrainFront size={15} aria-hidden /> Your onward trip by bus or metro</a>
        )}
        <a className="text-button" href={googleMapsSearchUrl(pickupQuery)} target="_blank" rel="noreferrer"><MapPin size={15} aria-hidden /> Find the pickup point</a>
      </div>
    </div>
  );
}
