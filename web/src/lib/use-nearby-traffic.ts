import { useEffect, useState } from 'react';
import { nearbyAircraft, type Observer, type NearbyAircraft } from './nearby-radar';

export function useNearbyTraffic(origin: Observer | null, radius: number) {
  const [data, setData] = useState<{ aircraft: NearbyAircraft[]; time: number; message: string }>({ aircraft: [], time: 0, message: '' });
  useEffect(() => {
    setData({ aircraft: [], time: 0, message: origin ? 'Consultando tráfego próximo…' : '' });
    if (!origin) return;
    const controller = new AbortController(); let pending = false, retryAt = 0;
    const load = async () => {
      if (pending || document.hidden || Date.now() < retryAt) return;
      pending = true;
      try {
        const response = await fetch(`https://proxy.cors.dev/https://api.adsb.lol/v2/point/${origin.latitude.toFixed(5)}/${origin.longitude.toFixed(5)}/${Math.ceil(radius / 1.852)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (response.status === 429) {
          const after = response.headers.get('Retry-After') || '';
          retryAt = Math.max(Date.now() + 60000, /^\d+$/.test(after) ? Date.now() + Number(after) * 1000 : Date.parse(after) || 0);
        }
        if (!response.ok) throw new Error();
        const json = await response.json();
        if (!Array.isArray(json.ac) || !Number.isFinite(json.now) || Date.now() - json.now > 60000 || json.now - Date.now() > 60000) throw new Error();
        if (!controller.signal.aborted) setData({ aircraft: nearbyAircraft(json.ac, origin, radius), time: Date.now(), message: '' });
      } catch { if (!controller.signal.aborted) setData(previous => ({ ...previous, message: Date.now() < retryAt ? 'Limite da fonte atingido. Aguardando nova tentativa.' : 'Tráfego indisponível. Tentando novamente automaticamente…' })); }
      finally { pending = false; }
    };
    void load(); const timer = setInterval(() => void load(), 20000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [origin, radius]);
  return data;
}

