import { useEffect, useState } from 'react';
import { fetchAircraftPhoto, type AircraftPhoto } from '@/lib/aircraft-data';
import type { NearbyAircraft } from '@/lib/nearby-radar';

const photos = new Map<string, { photo: AircraftPhoto | null; expires: number }>();
function cache(registration: string, photo: AircraftPhoto | null) {
  if (photos.size >= 60) photos.delete(photos.keys().next().value!);
  photos.set(registration, { photo, expires: Date.now() + (photo ? 15 * 60000 : 60000) });
}
export function SkyCandidate({ aircraft }: { aircraft: NearbyAircraft }) {
  const registration = aircraft.registration.trim().toUpperCase();
  const [photo, setPhoto] = useState<AircraftPhoto | null>(null);
  const [loading, setLoading] = useState(Boolean(registration));
  useEffect(() => {
    const controller = new AbortController();
    setPhoto(null);
    if (!registration) { setLoading(false); return; }
    const saved = photos.get(registration);
    if (saved && saved.expires > Date.now()) { setPhoto(saved.photo); setLoading(false); return; }
    setLoading(true);
    void fetchAircraftPhoto(registration, controller.signal, 'small').then(result => {
      if (!controller.signal.aborted) { cache(registration, result); setPhoto(result); }
    }).catch(() => { if (!controller.signal.aborted) cache(registration, null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [registration]);
  return <div className="sky-candidate">
    {photo ? <a className="sky-candidate-photo" href={photo.link} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto de ${registration} no Planespotters`}>
      <img src={photo.src} alt={`Foto de ${registration}`} width="80" height="60" decoding="async" onError={() => { cache(registration, null); setPhoto(null); }} />
    </a> : <div className="sky-candidate-photo sky-candidate-photo-empty">{loading ? 'Buscando foto…' : 'Sem foto'}</div>}
    <div className="sky-candidate-info"><p><strong>{aircraft.flight}</strong> · {aircraft.type || registration || aircraft.hex}<br />
      {aircraft.distance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km · direção {Math.round(aircraft.bearing)}°</p>
      {photo && <small>Foto: {photo.photographer} · Planespotters</small>}
    </div>
  </div>;
}
