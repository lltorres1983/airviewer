import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAccount } from './account-provider';
import { supabase } from '@/lib/supabase';
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
  const active = Boolean(useSyncExternalStore(subscribeRadarOrigin, getRadarOrigin));

  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    pending.current = false;
    setHome(null);
    setBusy(false);
    setError('');
    setLoading(Boolean(userId && supabase));
    setRadarOrigin(null);
    if (userId && supabase) {
      void (async () => {
        try {
          const { data, error: failure } = await supabase.from('home_radar')
            .select('*').eq('user_id', userId).abortSignal(controller.signal).maybeSingle();
          if (controller.signal.aborted || generation.current !== request || currentUser.current !== userId) return;
          if (failure) throw failure;
          setHome(data);
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
    if (!supabase || !userId || pending.current || loading) return false;
    const owner = userId;
    const request = generation.current;
    pending.current = true;
    setBusy(true);
    setError('');
    const isCurrent = () => generation.current === request && currentUser.current === owner;
    try {
      if (input) {
        if (!input.address.trim() || input.address.trim().length > 300 ||
            !Number.isFinite(input.latitude) || Math.abs(input.latitude) > 85 ||
            !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180 ||
            ![5, 10, 20].includes(input.radius_km)) throw new Error('invalid');
        const { data, error: failure } = await supabase.from('home_radar')
          .upsert({ ...input, address: input.address.trim(), user_id: owner, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
          .select('*').single();
        if (failure || !data) throw failure || new Error('empty');
        if (!isCurrent()) return false;
        setHome(data);
        if (getRadarOrigin()) setRadarOrigin(data);
      } else {
        const { error: failure } = await supabase.from('home_radar').delete().eq('user_id', owner);
        if (failure) throw failure;
        if (!isCurrent()) return false;
        setHome(null);
        setRadarOrigin(null);
      }
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
