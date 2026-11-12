import { useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from './ui/button';
import { LocalWeather } from './local-weather';
import { WeatherTrafficMap } from './weather-traffic-map';
import { useNearbyTraffic } from '@/lib/use-nearby-traffic';
import { useCurrentLocation, getCameraOrigin, setCameraOrigin } from '@/lib/use-current-location';

export function NearbyRadar() {
  const [open, setOpen] = useState(window.location.hash === '#/radar');
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
  return <>
    <p>Use onde você estiver, sem entrar na conta nem alterar o endereço de casa. Para buscar os voos, as coordenadas são enviadas à fonte ADS-B pelo proxy e à Open-Meteo; o mapa consulta imagens meteorológicas da NOAA e RainViewer.</p>
    <div className="observatory-toolbar"><button onClick={locate} disabled={locating}>{locating ? 'Obtendo localização…' : origin ? 'Atualizar minha localização' : 'Usar localização agora'}</button><label>Raio <select aria-label="Raio do radar" value={radius} onChange={e => { setRadius(Number(e.target.value)); setSelected(''); }}><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option></select></label><a className="nearby-page-link" href="#/camera" onClick={() => setCameraOrigin(origin)}>Abrir página da câmera</a></div>
    {locationError && <p role="alert">{locationError}</p>}
    {origin && <>
      <p>Posição obtida às {new Date(origin.time).toLocaleTimeString('pt-BR')} · precisão de aproximadamente {Math.round(origin.accuracy)} m. Atualize se você se deslocar.</p>
      <div className="nearby-layout"><section aria-label="Radar da localização atual">
        <WeatherTrafficMap origin={origin} aircraft={aircraft} radius={radius} selected={selected} onSelect={setSelected} now={now} />
        <p role="status">{feed.message || (!feed.time ? 'Consultando tráfego…' : now - feed.time > 60000 ? 'Sinal desatualizado. Aguardando posições recentes.' : `${aircraft.length} aeronaves próximas · atualização ${new Date(feed.time).toLocaleTimeString('pt-BR')}`)}</p>
        {current && <p className="nearby-selection"><strong>{current.flight}</strong> · {current.registration || current.hex} · {current.type || 'Modelo não informado'} · {current.distance.toFixed(1)} km · direção {Math.round(current.bearing)}°</p>}
        <ol className="nearby-flights">{aircraft.map(a => <li key={a.hex}><button aria-label={`Ver ${a.flight}`} aria-pressed={a.hex === selected} onClick={() => setSelected(a.hex)}>{a.flight} · {a.distance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km <small>{a.altitude === null ? 'Altitude indisponível' : `${Math.round(a.altitude).toLocaleString('pt-BR')} pés`}</small></button></li>)}</ol>
        <p className="observatory-note">Posições <a href="https://www.adsb.lol/" target="_blank" rel="noopener noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>. Nem toda aeronave estará disponível.</p>
      </section><div><LocalWeather origin={origin} now={now} /></div></div>
    </>}
  </>;
}
