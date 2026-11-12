import { bearing, distanceKm } from './airport-operations';
import type { AdsbAircraft } from './types';
export type Observer = { latitude: number; longitude: number; accuracy: number; time: number };
export type NearbyAircraft = { hex: string; flight: string; registration: string; type: string; latitude: number; longitude: number; altitude: number | null; track?: number | null; distance: number; bearing: number };
export const angleDifference = (a: number, b: number) => ((a - b + 540) % 360) - 180;
export function nearbyAircraft(raw: AdsbAircraft[], origin: Observer, radius: number): NearbyAircraft[] {
  const unique = new Map<string, NearbyAircraft>();
  for (const a of raw) {
    if (!a || !a.hex || typeof a.lat !== 'number' || typeof a.lon !== 'number' || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || Math.abs(a.lat) > 90 || Math.abs(a.lon) > 180 ||
      (a.seen_pos ?? Infinity) > 30 || String(a.alt_baro).toLowerCase() === 'ground') continue;
    const distance = distanceKm([origin.longitude, origin.latitude], [a.lon, a.lat]);
    if (distance > radius) continue;
    const altitude = typeof a.alt_baro === 'number' ? a.alt_baro : typeof a.alt_geom === 'number' ? a.alt_geom : null;
    unique.set(a.hex, { hex: a.hex, flight: String(a.flight || a.r || a.hex).trim(), registration: String(a.r || ''), type: String(a.t || ''), latitude: a.lat, longitude: a.lon,
      track: typeof a.track === 'number' && Number.isFinite(a.track) ? ((a.track % 360) + 360) % 360 : null,
      altitude: altitude !== null && Number.isFinite(altitude) ? altitude : null, distance, bearing: bearing([origin.longitude, origin.latitude], [a.lon, a.lat]) });
  }
  return [...unique.values()].sort((a, b) => a.distance - b.distance).slice(0, 150);
}
export type CompassEvent = { alpha: number | null; beta: number | null; gamma: number | null; absolute: boolean; webkitCompassHeading?: number; webkitCompassAccuracy?: number };
export function cameraHeading(event: CompassEvent): number | null {
  const { alpha, beta, gamma, webkitCompassHeading: ios, webkitCompassAccuracy: accuracy } = event;
  // This initial camera guide is portrait-only; do not guess in landscape/flat poses.
  if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma) || beta < 35 || beta > 155 || Math.abs(gamma) > 25) return null;
  if (typeof ios === 'number' && Number.isFinite(ios) && ios >= 0 && ios < 360) {
    if (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 25)) return null;
    return ios;
  }
  if (!event.absolute || alpha === null || !Number.isFinite(alpha)) return null;
  // W3C orientation-event A.1: horizontal projection of the rear camera's -Z axis.
  const rad = Math.PI / 180, a = alpha * rad, b = beta * rad, g = gamma * rad;
  const east = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
  const north = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
  if (Math.hypot(east, north) < .2) return null;
  return (Math.atan2(east, north) / rad + 360) % 360;
}
export function directionCandidates(aircraft: NearbyAircraft[], heading: number | null) {
  return heading === null ? [] : aircraft.filter(a => Math.abs(angleDifference(a.bearing, heading)) <= 20)
    .sort((a, b) => Math.abs(angleDifference(a.bearing, heading)) - Math.abs(angleDifference(b.bearing, heading)) || a.distance - b.distance).slice(0, 3);
}
