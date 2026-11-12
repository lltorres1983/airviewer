import type { HomeRadar } from './database.types';

export type RadarOrigin = Pick<HomeRadar, 'latitude' | 'longitude' | 'radius_km'>;
let origin: RadarOrigin | null = null;
const listeners = new Set<() => void>();
export const getRadarOrigin = () => origin;
export function setRadarOrigin(next: RadarOrigin | null) {
  if (!next && !origin) return;
  origin = next ? { latitude: next.latitude, longitude: next.longitude, radius_km: next.radius_km } : null;
  listeners.forEach(listener => listener());
}
export function subscribeRadarOrigin(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
