import { useEffect, useState } from 'react';
import { bearing, distanceKm, getAirportSnapshot, type AirportSnapshot } from './airport-operations';
import { recordAirportSnapshot, type FocusAirport } from './traffic-recording';
import type { AdsbAircraft, TrafficAircraft } from './types';
export const FOCUS_AIRPORTS = {
  GRU: { name: 'Guarulhos', center: [-46.4731, -23.4356] as [number, number], elevation: 2459, station: 'SBGR' },
  GIG: { name: 'Galeão', center: [-43.2506, -22.809] as [number, number], elevation: 28, station: 'SBGL' },
};
export function normalizeRegionalTraffic(raw: AdsbAircraft[], airport: FocusAirport): TrafficAircraft[] {
  const field = FOCUS_AIRPORTS[airport];
  return raw.filter(a => a.hex && a.lat != null && a.lon != null && (a.seen_pos ?? 0) <= 60).map(a => {
    const lat = Number(a.lat), lon = Number(a.lon), track = Number(a.track ?? a.calc_track ?? a.true_heading);
    const onGround = String(a.alt_baro).toLowerCase() === 'ground';
    const altitude = onGround ? field.elevation : Number(a.alt_baro ?? a.alt_geom);
    const airportBearing = bearing([lon, lat], field.center);
    const headingDifference = Math.abs(((track - airportBearing + 540) % 360) - 180);
    return { hex: String(a.hex).toLowerCase(), registration: String(a.r || '').trim().toUpperCase(), flight: String(a.flight || a.r || a.hex).trim(),
      type: String(a.t || '').trim().toUpperCase(), lat, lon, track, altitude, onGround, airportBearing, headingDifference,
      distance: distanceKm([lon, lat], field.center), verticalRate: Number(a.baro_rate ?? a.geom_rate ?? 0), groundSpeed: Number(a.gs ?? 0),
      movement: headingDifference <= 70 ? 'arrival' : headingDifference >= 110 ? 'departure' : 'nearby' };
  }).filter(a => [a.lat, a.lon, a.track, a.altitude, a.distance, a.groundSpeed, a.verticalRate].every(Number.isFinite) && Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180 &&
    a.distance <= 45 * 1.852 && a.altitude <= 25000 && a.altitude >= field.elevation - 200 &&
    (a.onGround ? a.distance <= 8 && a.groundSpeed >= 15 : a.groundSpeed >= 60) && !/^(H|R22|R44|R66)/.test(a.type))
    .sort((a, b) => a.distance - b.distance);
}
export function useComparisonFeed(airport: FocusAirport) {
  const field = FOCUS_AIRPORTS[airport];
  const [snapshot, setSnapshot] = useState<AirportSnapshot>({ code: airport, name: field.name, elevation: field.elevation, traffic: [], receivedAt: 0, message: 'Carregando tráfego…', towerRunway: null });
  useEffect(() => {
    const controller = new AbortController();
    let pending = false, retryAt = 0;
    const load = async () => {
      if (pending || document.hidden || Date.now() < retryAt) return;
      const primary = getAirportSnapshot();
      if (primary.code === airport && primary.receivedAt && Date.now() - primary.receivedAt < 20000) { setSnapshot(primary); recordAirportSnapshot(primary); return; }
      pending = true;
      try {
        const response = await fetch(`https://proxy.cors.dev/https://api.adsb.lol/v2/point/${field.center[1]}/${field.center[0]}/45`, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (response.status === 429) {
          const after = response.headers.get('Retry-After') || '';
          retryAt = Math.max(Date.now() + 60000, /^\d+$/.test(after) ? Date.now() + Number(after) * 1000 : Date.parse(after) || 0);
        }
        if (!response.ok) throw new Error('feed');
        const data = await response.json();
        if (!Array.isArray(data.ac) || (data.now && Date.now() - data.now > 90000)) throw new Error('feed');
        if (controller.signal.aborted) return;
        const next: AirportSnapshot = { code: airport, name: field.name, elevation: field.elevation,
          traffic: normalizeRegionalTraffic(data.ac, airport), receivedAt: Date.now(), message: '', towerRunway: null };
        setSnapshot(next); recordAirportSnapshot(next);
      } catch {
        if (!controller.signal.aborted) setSnapshot(previous => ({ ...previous, message: Date.now() < retryAt ? 'Limite da fonte atingido. Aguardando nova tentativa.' : 'ADS-B temporariamente indisponível.' }));
      } finally { pending = false; }
    };
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [airport, field]);
  return snapshot;
}
