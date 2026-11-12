import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from './ui/button';
import { LocalWeather } from './local-weather';
import { WeatherTrafficMap } from './weather-traffic-map';
import { useNearbyTraffic } from '@/lib/use-nearby-traffic';
import { useCurrentLocation, getCameraOrigin, setCameraOrigin } from '@/lib/use-current-location';

export function NearbyRadar() {
  const [open, setOpen] = useState(window.location.hash === '#/radar');
  useEffect(() => { const show = () => { window.location.hash = '/radar'; setOpen(true); }; window.addEventListener('airviewer:open-nearby', show); return () => window.removeEventListener('airviewer:open-nearby', show); }, []);
  const trigger = useRef<HTMLButtonElement>(null);
  return <Dialog.Root open={open} onOpenChange={next => { setOpen(next); if (!next && window.location.hash === '#/radar') window.location.hash = '/'; }}>
    <Dialog.Trigger asChild><Button ref={trigger} variant="secondary">Radar perto de mim</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="observatory-overlay" /><Dialog.Content className="observatory-panel nearby-panel" onCloseAutoFocus={event => {
      event.preventDefault(); (trigger.current?.getClientRects().length ? trigger.current : document.querySelector<HTMLButtonElement>('#mobile-menu-toggle'))?.focus();
    }}><div className="observatory-header"><div><Dialog.Title>Radar perto de mim</Dialog.Title><Dialog.Description>Aeronaves, nuvens e precipitação no mesmo mapa.</Dialog.Description></div><Dialog.Close asChild><button aria-label="Fechar radar perto de mim">Fechar</button></Dialog.Close></div>
      <NearbyRadarContent />
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
function NearbyRadarContent() {
  const { origin, locating, error: locationError, now, locate } = useCurrentLocation(window.location.hash === '#/radar' ? getCameraOrigin() : null);
  const [radius, setRadius] = useState(20);
  const [selected, setSelected] = useState('');
  const feed = useNearbyTraffic(origin, radius);
  const aircraft = feed.time && now - feed.time <= 60000 ? feed.aircraft : [];
  const current = aircraft.find(a => a.hex === selected);
  const signal = feed.message || (!feed.time ? 'Consultando tráfego…' : now - feed.time > 60000 ? 'Sinal desatualizado. Aguardando posições recentes.' : `Atualizado às ${new Date(feed.time).toLocaleTimeString('pt-BR')}`);
  return <>
    <section className="nearby-location-bar" aria-label="Localização e alcance">
      <div><h3>Sua localização</h3><p>{origin ? `Precisão de ${Math.round(origin.accuracy)} m · obtida às ${new Date(origin.time).toLocaleTimeString('pt-BR')}` : 'Ative a localização para acompanhar o céu ao seu redor.'}</p></div>
      <div className="nearby-location-actions"><label>Alcance<select aria-label="Raio do radar" value={radius} onChange={e => { setRadius(Number(e.target.value)); setSelected(''); }}><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option></select></label><button onClick={locate} disabled={locating}>{locating ? 'Obtendo localização…' : origin ? 'Atualizar minha localização' : 'Usar localização agora'}</button></div>
      {locationError && <p className="nearby-location-error" role="alert">{locationError}</p>}
    </section>
    <div className="nearby-dashboard">
      <section className="nearby-map-card" aria-label="Radar da localização atual">
        <div className="nearby-card-heading"><div><h3>Visão do radar</h3><p>Nuvens, precipitação e tráfego aéreo</p></div><span className="nearby-range-label">Raio de {radius} km</span></div>
        {origin ? <WeatherTrafficMap origin={origin} aircraft={aircraft} radius={radius} selected={selected} onSelect={setSelected} now={now} /> : <div className="nearby-map-empty"><h3>O radar começa por você</h3><p>Use sua localização para carregar o mapa, as condições do tempo e os aviões próximos.</p><p className="observatory-note">Sem login. Seu endereço de casa não será alterado.</p></div>}
      </section>
      <aside className="nearby-dashboard-sidebar" aria-label="Informações do radar">
        {origin ? <LocalWeather origin={origin} now={now} /> : <section className="nearby-dashboard-card"><h3>Meteorologia local</h3><p>Temperatura, vento e condições da região aparecerão após obter sua localização.</p></section>}
        <section className="nearby-dashboard-card nearby-traffic-card" aria-label="Aeronaves próximas">
          <div className="nearby-card-heading"><h3>Aeronaves próximas</h3><span className="nearby-traffic-count">{origin && feed.time && now - feed.time <= 60000 ? aircraft.length : '—'}</span></div>
          {origin && <p className="nearby-feed-status" role="status">{signal}</p>}
          {current && <div className="nearby-selection"><strong>{current.flight}</strong><span>{current.registration || current.hex} · {current.type || 'Modelo não informado'}</span><small>{current.distance.toFixed(1)} km · direção {Math.round(current.bearing)}°</small></div>}
          {origin && <ol className="nearby-flights">{aircraft.map(a => <li key={a.hex}><button aria-label={`Ver ${a.flight}`} aria-pressed={a.hex === selected} onClick={() => setSelected(a.hex)}><span><strong>{a.flight}</strong><small>{a.altitude === null ? 'Altitude indisponível' : `${Math.round(a.altitude).toLocaleString('pt-BR')} pés`}</small></span><span className="nearby-flight-distance">{a.distance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</span></button></li>)}</ol>}
          {(!origin || (feed.time > 0 && aircraft.length === 0)) && <p className="nearby-empty-copy">{!origin ? 'Aguardando sua localização.' : now - feed.time > 60000 ? 'Aguardando posições recentes.' : 'Nenhuma aeronave encontrada neste alcance.'}</p>}
          <p className="observatory-note">Posições <a href="https://www.adsb.lol/" target="_blank" rel="noopener noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>. Nem toda aeronave estará disponível.</p>
        </section>
        <section className="nearby-dashboard-card nearby-camera-card"><h3>Explore pela câmera</h3><p>Aponte o iPhone para o céu e consulte possíveis voos naquela direção.</p><a className="nearby-page-link" href="#/camera" onClick={() => setCameraOrigin(origin)}>Abrir página da câmera <span aria-hidden="true">→</span></a></section>
      </aside>
    </div>
    <details className="nearby-privacy"><summary>Sobre sua localização e as fontes de dados</summary><p>Use onde você estiver, sem entrar na conta nem alterar o endereço de casa. Para buscar os voos, as coordenadas são enviadas à fonte ADS-B pelo proxy e à Open-Meteo; o mapa consulta imagens meteorológicas da NOAA e RainViewer. Atualize sua localização se você se deslocar.</p></details>
  </>;
}
