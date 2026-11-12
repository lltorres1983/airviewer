import { useEffect, useRef, useState } from 'react';
import type { Observer } from './nearby-radar';
let cameraOrigin: Observer | null = null;
export const getCameraOrigin = () => cameraOrigin;
export const setCameraOrigin = (origin: Observer | null) => { cameraOrigin = origin; };
export function useCurrentLocation(initial: Observer | null = null) {
  const [origin, setOrigin] = useState(initial);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const request = useRef(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => { request.current++; clearInterval(timer); }; }, []);
  const locate = () => {
    if (!navigator.geolocation) { setError('Localização indisponível neste navegador.'); return; }
    const version = ++request.current; setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(position => {
      if (request.current !== version) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0) { setError('O celular não forneceu uma localização válida. Tente novamente.'); setLocating(false); return; }
      setOrigin({ latitude, longitude, accuracy, time: Date.now() }); setLocating(false);
    }, failure => {
      if (request.current !== version) return;
      setLocating(false); setError(failure.code === 1 ? 'Acesso à localização negado. Libere a permissão nas configurações do navegador e tente novamente.' : 'Não foi possível obter sua posição. Vá para uma área aberta e tente novamente.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  };
  return { origin, locating, error, now, locate };
}
