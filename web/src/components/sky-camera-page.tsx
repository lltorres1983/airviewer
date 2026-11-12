import { useEffect } from 'react';
import { SkyCamera } from './sky-camera';
import { useCurrentLocation, getCameraOrigin, setCameraOrigin } from '@/lib/use-current-location';
import { useNearbyTraffic } from '@/lib/use-nearby-traffic';
export function SkyCameraPage() {
  const { origin, locate, locating, error, now } = useCurrentLocation(getCameraOrigin());
  const feed = useNearbyTraffic(origin, 20);
  const aircraft = feed.time && now - feed.time <= 60000 ? feed.aircraft : [];
  const locationFresh = Boolean(origin && now - origin.time <= 120000 && origin.accuracy <= 100);
  useEffect(() => { setCameraOrigin(origin); }, [origin]);
  useEffect(() => { const title = document.title; document.title = 'Câmera do céu · AirViewer'; return () => { document.title = title; }; }, []);
  return <main className="observatory-panel sky-camera-page" aria-label="Câmera do céu">
    <header className="observatory-header"><div><h1>Câmera do céu</h1><p>Identifique possíveis voos pela direção do seu iPhone.</p></div><a className="nearby-page-link" href="#/radar">Voltar ao radar</a></header>
    <div className="camera-page-content"><p>A câmera permanece no aparelho. Sua posição é usada para consultar os voos ADS-B próximos, sem alterar o endereço de casa.</p>
      <button disabled={locating} onClick={locate}>{locating ? 'Obtendo localização…' : origin ? 'Atualizar minha localização' : 'Usar localização agora'}</button>
      {error && <p role="alert">{error}</p>}
      {origin && <><p>Precisão de aproximadamente {Math.round(origin.accuracy)} m · posição obtida às {new Date(origin.time).toLocaleTimeString('pt-BR')}.</p>
        {!locationFresh && <p role="status">Atualize a localização em uma área aberta (posição recente e precisão de até 100 m).</p>}
        {feed.message && <p role="status">{feed.message}</p>}
        <SkyCamera aircraft={aircraft} locationFresh={locationFresh} now={now} />
        <p className="observatory-note">Voos em até 20 km · dados <a href="https://www.adsb.lol/" target="_blank" rel="noopener noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>. Sem bússola ou sinal recente, não são sugeridas identificações.</p>
      </>}
    </div>
  </main>;
}
