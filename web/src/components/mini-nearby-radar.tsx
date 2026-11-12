import { useState } from 'react';
import { useCurrentLocation, getCameraOrigin, setCameraOrigin } from '@/lib/use-current-location';
import { useNearbyTraffic } from '@/lib/use-nearby-traffic';
import { WeatherTrafficMap } from './weather-traffic-map';

export function MiniNearbyRadar() {
  const { origin, locating, locate, error, now } = useCurrentLocation(getCameraOrigin());
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState('');
  const feed = useNearbyTraffic(expanded ? origin : null, 20);
  const aircraft = feed.time && now - feed.time <= 60000 ? feed.aircraft : [];
  const current = aircraft.find(a => a.hex === selected);
  const openRadar = () => { setCameraOrigin(origin); window.dispatchEvent(new Event('airviewer:open-nearby')); };
  return <section className="mini-nearby" aria-label="Radar compacto perto de mim">
    <header><h2>Perto de mim</h2><button aria-label={expanded ? 'Recolher radar compacto' : 'Expandir radar compacto'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Recolher' : 'Expandir'}</button></header>
    {expanded && <>
      {!origin && <p>Veja aviões, nuvens e chuva em até 20 km de você.</p>}
      {origin && <><WeatherTrafficMap compact origin={origin} radius={20} aircraft={aircraft} selected={selected} onSelect={setSelected} now={now} />
        <p className="mini-nearby-status" role="status">{feed.message || (!feed.time ? 'Consultando tráfego…' : now - feed.time > 60000 ? 'Aguardando posições recentes.' : `${aircraft.length} ${aircraft.length === 1 ? 'aeronave' : 'aeronaves'} · ${new Date(feed.time).toLocaleTimeString('pt-BR')}`)}</p>
        {current && <p>{current.flight} · {current.distance.toFixed(1)} km</p>}
      </>}
      {error && <p role="alert">{error}</p>}
      <div className="mini-nearby-actions"><button onClick={locate} disabled={locating}>{locating ? 'Localizando…' : origin ? 'Atualizar posição' : 'Ativar radar local'}</button><button onClick={openRadar}>Abrir completo</button></div>
      {!origin && <small>Sua localização não será salva no perfil.</small>}
    </>}
  </section>;
}
