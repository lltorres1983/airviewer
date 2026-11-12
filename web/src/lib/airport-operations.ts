import type { TrafficAircraft } from './types';

export type Runway = { airport: string; ends: [string, string]; coordinates: [[number, number], [number, number]] };
// Same visual runway references used by the airport map; not an operational chart.
export const RUNWAYS: Runway[] = [
  { airport: 'GRU', ends: ['10L', '28R'], coordinates: [[-46.482548, -23.434059], [-46.449203, -23.425043]] },
  { airport: 'GRU', ends: ['10R', '28L'], coordinates: [[-46.487, -23.438801], [-46.4589, -23.4312]] },
  { airport: 'GIG', ends: ['10', '28'], coordinates: [[-43.255199, -22.8018], [-43.217701, -22.7922]] },
  { airport: 'GIG', ends: ['15', '33'], coordinates: [[-43.263699, -22.812401], [-43.238499, -22.8291]] },
  { airport: 'SDU', ends: ['02L', '20R'], coordinates: [[-43.163333, -22.915833], [-43.163889, -22.904722]] },
  { airport: 'SDU', ends: ['02R', '20L'], coordinates: [[-43.1625, -22.916389], [-43.163333, -22.904722]] },
];
const rad = (value: number) => value * Math.PI / 180;
export function distanceKm(a: [number, number], b: [number, number]) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function bearing(a: [number, number], b: [number, number]) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const difference = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
export type Approach = { aircraft: TrafficAircraft; runway: string | null; distance: number; minutes: number | null };
export function approachQueue(airport: string, traffic: TrafficAircraft[], elevation: number): Approach[] {
  if (!['GRU', 'GIG'].includes(airport)) return [];
  return traffic.filter(a => !a.onGround && a.distance <= 60 && a.headingDifference < 60 &&
    a.altitude < elevation + 12000 && a.verticalRate <= 500 && a.groundSpeed >= 60)
    .map(aircraft => {
      const position: [number, number] = [aircraft.lon, aircraft.lat];
      const candidates = RUNWAYS.filter(r => r.airport === airport).flatMap(r => r.ends.map((name, i) => {
        const threshold = r.coordinates[i], opposite = r.coordinates[1 - i];
        const axis = bearing(threshold, opposite), toThreshold = bearing(position, threshold);
        const distance = distanceKm(position, threshold);
        const crossTrack = Math.abs(Math.sin(rad(difference(toThreshold, axis))) * distance);
        return { name, distance, crossTrack, alignment: difference(aircraft.track, axis), inbound: difference(toThreshold, axis) };
      })).filter(r => r.alignment <= 25 && r.inbound <= 20 && r.crossTrack < 1 && r.distance <= 35)
        .sort((a, b) => a.crossTrack - b.crossTrack);
      const best = candidates[0];
      // Parallel runways are ambiguous until the lateral position distinguishes them.
      const ambiguous = candidates[1] && Math.abs(candidates[1].crossTrack - best.crossTrack) < 0.15;
      const distance = best?.distance ?? aircraft.distance;
      const closingSpeed = aircraft.groundSpeed * 1.852 * Math.cos(rad(aircraft.headingDifference));
      return { aircraft, runway: best && !ambiguous ? best.name : null, distance,
        minutes: closingSpeed > 60 ? Math.max(1, Math.round(distance / closingSpeed * 60)) : null };
    }).sort((a, b) => a.distance - b.distance);
}

export type AirportSnapshot = {
  code: string; name: string; elevation: number; traffic: TrafficAircraft[];
  receivedAt: number; message: string; towerRunway: string | null;
};
let snapshot: AirportSnapshot = { code: 'GRU', name: 'Guarulhos', elevation: 2459, traffic: [], receivedAt: 0, message: 'Carregando tráfego…', towerRunway: null };
const listeners = new Set<() => void>();
export const getAirportSnapshot = () => snapshot;
export function publishAirportSnapshot(next: AirportSnapshot) { snapshot = next; listeners.forEach(fn => fn()); }
export function subscribeAirportSnapshot(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export type AirportCommand = { type: 'airport'; code: 'GRU' | 'GIG' } | { type: 'tower'; runway: string | null } | { type: 'aircraft'; hex: string };
const commands = new Set<(command: AirportCommand) => void>();
export function airportCommand(command: AirportCommand) { commands.forEach(fn => fn(command)); }
export function subscribeAirportCommands(fn: (command: AirportCommand) => void) { commands.add(fn); return () => { commands.delete(fn); }; }

export type SpottingRule = { enabled: boolean; models: string[]; registrations: string[]; radius: number; favorites: string[] };
export class SpottingTracker {
  private seen = new Map<string, number>();
  detect(snapshot: AirportSnapshot, rule: SpottingRule, now = Date.now()) {
    if (!rule.enabled || !['GRU', 'GIG'].includes(snapshot.code) || !snapshot.receivedAt || now - snapshot.receivedAt > 60000) return [];
    for (const [key, lastSeen] of this.seen) if (now - lastSeen > 15 * 60000) this.seen.delete(key);
    const matches = snapshot.traffic.filter(a => a.distance <= rule.radius &&
      (rule.models.includes(a.type.toUpperCase()) || rule.registrations.includes(a.registration.toUpperCase()) || rule.favorites.includes(a.hex.toLowerCase())));
    const alerts = matches.filter(a => !this.seen.has(`${snapshot.code}:${a.hex}`));
    matches.forEach(a => this.seen.set(`${snapshot.code}:${a.hex}`, now));
    return alerts;
  }
}
