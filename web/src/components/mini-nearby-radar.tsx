import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useCurrentLocation, getCameraOrigin, setCameraOrigin } from '@/lib/use-current-location';
import { useNearbyTraffic } from '@/lib/use-nearby-traffic';
import { WeatherTrafficMap } from './weather-traffic-map';

export function MiniNearbyRadar() {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const resizing = useRef<{ id: number; x: number; y: number; width: number; mapHeight: number } | null>(null);
  const [size, setSize] = useState<{ width: number; mapHeight: number } | null>(null);
  const resize = (width: number, mapHeight: number) => {
    const rect = panel.current!.getBoundingClientRect();
    const map = panel.current!.querySelector<HTMLElement>('.weather-traffic-map');
    const chrome = rect.height - (map?.offsetHeight || 240);
    const bottom = window.innerWidth <= 900 ? 88 : 12;
    setSize({ width: Math.max(220, Math.min(width, window.innerWidth - rect.left - 12)), mapHeight: Math.max(120, Math.min(mapHeight, window.innerHeight - rect.top - bottom - chrome)) });
  };
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const constrain = (left: number, top: number) => {
    const rect = panel.current?.getBoundingClientRect();
    const bottom = window.innerWidth <= 900 ? 88 : 12;
    return { left: Math.max(12, Math.min(left, window.innerWidth - (rect?.width || 300) - 12)), top: Math.max(12, Math.min(top, window.innerHeight - (rect?.height || 200) - bottom)) };
  };
  useEffect(() => {
    const fit = () => setPosition(previous => previous ? constrain(previous.left, previous.top) : null);
    window.addEventListener('resize', fit);
    const observer = new ResizeObserver(fit);
    if (panel.current) observer.observe(panel.current);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  const { origin, locating, locate, error, now } = useCurrentLocation(getCameraOrigin());
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState('');
  const feed = useNearbyTraffic(expanded ? origin : null, 20);
  const aircraft = feed.time && now - feed.time <= 60000 ? feed.aircraft : [];
  const current = aircraft.find(a => a.hex === selected);
  const openRadar = () => { setCameraOrigin(origin); window.dispatchEvent(new Event('airviewer:open-nearby')); };
  return <section ref={panel} style={{ ...position, ...(size ? { width: size.width, '--mini-map-height': `${size.mapHeight}px` } : {}) } as CSSProperties} className="mini-nearby" aria-label="Radar compacto perto de mim">
    <header><h2><button className="mini-radar-drag" aria-label="Mover radar compacto" title="Arraste para mover. Use as setas do teclado; Home restaura a posição."
      onPointerDown={event => { if (event.button !== 0 || !event.isPrimary) return; const rect = panel.current!.getBoundingClientRect(); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const start = drag.current; if (start?.id === event.pointerId) setPosition(constrain(start.left + event.clientX - start.x, start.top + event.clientY - start.y)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => { if (event.key === 'Home') { event.preventDefault(); setPosition(null); return; } if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const rect = panel.current!.getBoundingClientRect(); const step = event.shiftKey ? 40 : 16; setPosition(constrain(rect.left + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), rect.top + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))); }}>
      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1"/><circle cx="9" cy="3" r="1"/><circle cx="3" cy="8" r="1"/><circle cx="9" cy="8" r="1"/><circle cx="3" cy="13" r="1"/><circle cx="9" cy="13" r="1"/></svg>Perto de mim</button></h2><button className="mini-radar-collapse" aria-label={expanded ? 'Recolher radar compacto' : 'Expandir radar compacto'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 7h10"/>{!expanded && <path d="M7 2v10"/>}</svg></button></header>
    {expanded && <>
      {!origin && <p>Veja aviões, nuvens e chuva em até 20 km de você.</p>}
      {origin && <><WeatherTrafficMap compact origin={origin} radius={20} aircraft={aircraft} selected={selected} onSelect={setSelected} now={now} />
        <p className="mini-nearby-status" role="status">{feed.message || (!feed.time ? 'Consultando tráfego…' : now - feed.time > 60000 ? 'Aguardando posições recentes.' : `${aircraft.length} ${aircraft.length === 1 ? 'aeronave' : 'aeronaves'} · ${new Date(feed.time).toLocaleTimeString('pt-BR')}`)}</p>
        {current && <p className="mini-selected">{current.flight} · {current.distance.toFixed(1)} km</p>}
      </>}
      {error && <p role="alert">{error}</p>}
      <div className="mini-nearby-actions"><button aria-label={origin ? 'Atualizar posição' : 'Ativar radar local'} title={origin ? 'Atualizar posição' : 'Ativar radar local'} onClick={locate} disabled={locating}>{origin ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M13 6a5 5 0 1 0 0 4M13 2v4H9"/></svg> : locating ? 'Localizando…' : 'Ativar radar local'}</button><button aria-label="Abrir completo" title="Abrir radar completo" onClick={openRadar}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 2h5v5M14 2 7 9M6 3H2v11h11v-4"/></svg></button>{origin && <button className="mini-radar-resize" aria-label="Redimensionar radar" title="Arraste para redimensionar. Setas ajustam; Home restaura o tamanho."
        onPointerDown={event => { if (event.button !== 0 || !event.isPrimary) return; const rect = panel.current!.getBoundingClientRect(); const map = panel.current!.querySelector<HTMLElement>('.weather-traffic-map')!; resizing.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, mapHeight: map.offsetHeight }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { const start = resizing.current; if (start?.id === event.pointerId) resize(start.width + event.clientX - start.x, start.mapHeight + event.clientY - start.y); }}
        onPointerUp={() => { resizing.current = null; }} onPointerCancel={() => { resizing.current = null; }} onLostPointerCapture={() => { resizing.current = null; }}
        onKeyDown={event => { if (event.key === 'Home') { event.preventDefault(); setSize(null); return; } if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const rect = panel.current!.getBoundingClientRect(); const map = panel.current!.querySelector<HTMLElement>('.weather-traffic-map')!; const step = event.shiftKey ? 40 : 16; resize(rect.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), map.offsetHeight + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)); }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 13 13 3M8 13l5-5"/></svg></button>}</div>
      {!origin && <small>Sua localização não será salva no perfil.</small>}
    </>}
  </section>;
}
