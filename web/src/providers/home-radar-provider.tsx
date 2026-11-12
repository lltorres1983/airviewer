import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAccount } from './account-provider';
import { supabase, requestOwnProfile } from '@/lib/supabase';
import { homeFromProfile, missingHomeTable } from '@/lib/home-radar-storage';
import type { HomeRadar } from '@/lib/database.types';
import { getRadarOrigin, setRadarOrigin, subscribeRadarOrigin } from '@/lib/home-radar';

type HomeInput = Pick<HomeRadar, 'address' | 'latitude' | 'longitude' | 'radius_km'>;
type RadarContext = {
  home: HomeRadar | null;
  loading: boolean;
  busy: boolean;
  error: string;
  active: boolean;
  save: (input: HomeInput) => Promise<boolean>;
  remove: () => Promise<boolean>;
  activate: () => void;
  deactivate: () => void;
  reload: () => void;
};
const Context = createContext<RadarContext | null>(null);

export function HomeRadarProvider({ children }: { children: ReactNode }) {
  const { session } = useAccount();
  const userId = session?.user.id;
  const [home, setHome] = useState<HomeRadar | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const generation = useRef(0);
  const pending = useRef(false);
  const storage = useRef<'table' | 'profile'>('table');
  const active = Boolean(useSyncExternalStore(subscribeRadarOrigin, getRadarOrigin));

  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    pending.current = false;
    storage.current = 'table';
    setHome(null);
    setBusy(false);
    setError('');
    setLoading(Boolean(userId && supabase));
    setRadarOrigin(null);
    if (userId && session && supabase) {
      void (async () => {
        try {
          const { data, error: failure } = await supabase.from('home_radar')
            .select('*').eq('user_id', userId).abortSignal(controller.signal).maybeSingle();
          if (controller.signal.aborted || generation.current !== request || currentUser.current !== userId) return;
          if (failure && !missingHomeTable(failure)) throw failure;
          if (data) setHome(data);
          else {
            const profile = await requestOwnProfile(session, undefined, controller.signal);
            if (controller.signal.aborted || generation.current !== request || currentUser.current !== userId) return;
            const saved = homeFromProfile(profile);
            storage.current = failure || saved ? 'profile' : 'table';
            setHome(saved);
          }
        } catch {
          if (!controller.signal.aborted && currentUser.current === userId)
            setError('Não foi possível carregar sua localização. Tente novamente.');
        } finally {
          if (!controller.signal.aborted && currentUser.current === userId) setLoading(false);
        }
      })();
    }
    return () => { controller.abort(); generation.current++; setRadarOrigin(null); };
  }, [userId, revision]);

  async function mutate(input: HomeInput | null) {
    if (!supabase || !session || !userId || pending.current || loading) return false;
    const owner = userId;
    const request = generation.current;
    pending.current = true;
    setBusy(true);
    setError('');
    const isCurrent = () => generation.current === request && currentUser.current === owner;
    try {
      const saved = input ? { ...input, address: input.address.trim(), updated_at: new Date().toISOString() } : null;
      if (saved && (!saved.address || saved.address.length > 300 ||
          !Number.isFinite(saved.latitude) || Math.abs(saved.latitude) > 85 ||
          !Number.isFinite(saved.longitude) || Math.abs(saved.longitude) > 180 ||
          ![5, 10, 20].includes(saved.radius_km))) throw new Error('invalid');
      let nextHome: HomeRadar | null = null;
      if (storage.current === 'table') {
        if (saved) {
          const { data, error: failure } = await supabase.from('home_radar')
            .upsert({ ...saved, user_id: owner }, { onConflict: 'user_id' }).select('*').single();
          if (!isCurrent()) return false;
          if (failure && !missingHomeTable(failure)) throw failure;
          if (failure) storage.current = 'profile';
          else if (!data) throw new Error('empty');
          else nextHome = data;
        } else {
          const { error: failure } = await supabase.from('home_radar').delete().eq('user_id', owner);
          if (!isCurrent()) return false;
          if (failure && !missingHomeTable(failure)) throw failure;
          if (failure) storage.current = 'profile';
        }
      }
      if (storage.current === 'profile') {
        const profile = await requestOwnProfile(session, { home_radar: saved });
        if (!isCurrent()) return false;
        nextHome = homeFromProfile(profile);
        // Confirm persistence from the authenticated server response.
        if (saved ? !nextHome || nextHome.address !== saved.address || nextHome.latitude !== saved.latitude ||
          nextHome.longitude !== saved.longitude || nextHome.radius_km !== saved.radius_km : nextHome !== null)
          throw new Error('Profile was not saved');
      }
      if (!isCurrent()) return false;
      setHome(nextHome);
      if (!nextHome || getRadarOrigin()) setRadarOrigin(nextHome);
      return true;
    } catch {
      if (isCurrent()) setError(input ? 'Não foi possível salvar sua localização. Confira os dados e tente novamente.' : 'Não foi possível excluir sua localização. Tente novamente.');
      return false;
    } finally {
      if (isCurrent()) { pending.current = false; setBusy(false); }
    }
  }
  const ownedHome = home?.user_id === userId ? home : null;
  return <Context.Provider value={{ home: ownedHome, loading, busy, error, active,
    save: input => mutate(input), remove: () => mutate(null),
    activate: () => { if (ownedHome) setRadarOrigin(ownedHome); },
    deactivate: () => setRadarOrigin(null), reload: () => setRevision(value => value + 1),
  }}>{children}</Context.Provider>;
}
export function useHomeRadar() {
  const context = useContext(Context);
  if (!context) throw new Error('HomeRadarProvider missing');
  return context;
}
