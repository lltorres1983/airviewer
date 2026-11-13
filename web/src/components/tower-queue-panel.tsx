import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { RUNWAYS, airportCommand, approachQueue, getAirportSnapshot, subscribeAirportSnapshot } from '@/lib/airport-operations';
import { PanelMoveHandle } from './panel-move-handle';
import { VisualApproachQueue } from './visual-approach-queue';

export function TowerQueuePanel() {
  const snapshot = useSyncExternalStore(subscribeAirportSnapshot, getAirportSnapshot);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const supported = ['GRU', 'GIG'].includes(snapshot.code);
  const stale = !snapshot.receivedAt || now - snapshot.receivedAt > 60000;
  const queue = useMemo(() => approachQueue(snapshot.code, snapshot.traffic, snapshot.elevation), [snapshot]);
  return <section className="tower-compact" aria-label="Torre e spotting compacto">
    <header className="tower-compact-heading" data-panel-drag=".arrivals-panel"><PanelMoveHandle panel=".arrivals-panel" label="Mover torre e spotting" /><h2>Torre e spotting <span>{snapshot.code}</span></h2><button title="Meteorologia e alertas de spotting" onClick={() => window.dispatchEvent(new Event('airviewer:open-spotting'))}>Mais</button></header>
    <div className="tower-compact-controls"><div aria-label="Aeroporto da fila">{(['GRU', 'GIG'] as const).map(code => <button key={code} aria-label={`Selecionar ${code} na fila`} aria-pressed={snapshot.code === code} onClick={() => airportCommand({ type: 'airport', code })}>{code}</button>)}</div>
      {supported && <select aria-label="Pista da torre compacta" value={snapshot.towerRunway || ''} onChange={event => airportCommand({ type: 'tower', runway: event.target.value || null })}><option value="">Visão geral</option>{RUNWAYS.filter(r => r.airport === snapshot.code).map(r => <option key={r.ends.join('/')} value={r.ends.join('/')}>Torre · {r.ends.join(' / ')}</option>)}</select>}
    </div>
    <div className="tower-queue-heading"><h3>Fila de aproximação</h3><span>{!stale && supported ? `${queue.length} ${queue.length === 1 ? 'voo' : 'voos'}` : '—'}</span></div>
    <div className="tower-queue-content">{!supported ? <p role="status">Selecione GRU ou GIG para acompanhar as aproximações.</p> : stale ? <p role="status">{snapshot.message || 'Aguardando posições ADS-B recentes.'}</p> : <VisualApproachQueue airport={snapshot.code} queue={queue.slice(0, 12)} onSelect={({ aircraft }) => airportCommand({ type: 'aircraft', hex: aircraft.hex })} />}</div>
    <p className="tower-queue-note">{!stale && `Atualizado às ${new Date(snapshot.receivedAt).toLocaleTimeString('pt-BR')} · `}Ordem estimada por distância, sem autorização de pouso.</p>
  </section>;
}
