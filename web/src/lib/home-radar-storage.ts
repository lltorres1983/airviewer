import type { User } from '@supabase/supabase-js';
import type { HomeRadar } from './database.types';

export function missingHomeTable(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === 'PGRST205' || error.code === '42P01';
}

export function homeFromProfile(user: User): HomeRadar | null {
  const home = user.user_metadata.home_radar;
  if (home == null) return null;
  if (typeof home !== 'object' || typeof home.address !== 'string' || !home.address.trim() || home.address.length > 300 ||
      typeof home.latitude !== 'number' || !Number.isFinite(home.latitude) || Math.abs(home.latitude) > 85 ||
      typeof home.longitude !== 'number' || !Number.isFinite(home.longitude) || Math.abs(home.longitude) > 180 ||
      ![5, 10, 20].includes(home.radius_km) || typeof home.updated_at !== 'string' || !Number.isFinite(Date.parse(home.updated_at)))
    throw new Error('Invalid saved home');
  return { user_id: user.id, address: home.address, latitude: home.latitude, longitude: home.longitude,
    radius_km: home.radius_km, updated_at: home.updated_at };
}
