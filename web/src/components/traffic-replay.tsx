import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { clearRecording, frameAt, getRecording, subscribeRecording, type FocusAirport } from '@/lib/traffic-recording';
import { TrafficMap } from './traffic-map';
const timeLabel = (time: number) => new Date(time).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
export function TrafficReplay() {
  const recording = useSyncExternalStore(subscribeRecording, getRecording);
  const [airport, setAirport] = useState<FocusAirport>('GRU');
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [error, setError] = useState('');
  const frames = useMemo(() => recording.frames.filter(f => f.airport === airport), [recording.frames, airport]);
  const first = frames[0]?.time || 0, last = frames[frames.length - 1]?.time || 0;
  const position = cursor === null ? last : Math.min(last, Math.max(first, cursor));
  const current = frameAt(frames, position);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setCursor(previous => {
      const next = Math.max(first, previous ?? first) + speed * 500;
      if (next >= last) { setPlaying(false); return last; }
      return next;
    }), 500);
    return () => clearInterval(timer);
  }, [playing, speed, first, last]);
  return <section aria-label="Replay do tráfego">
    <div className="observatory-toolbar"><label>Aeroporto <select aria-label="Aeroporto" value={airport} onChange={e => { setAirport(e.target.value as FocusAirport); setCursor(null); setPlaying(false); }}><option>GRU</option><option>GIG</option></select></label>
      <span>Última hora recebida · horário de Brasília</span></div>
    <p>Gravado neste navegador enquanto o aplicativo recebe tráfego. Abra GRU × GIG para registrar os dois aeroportos.</p>
    {!recording.persistent && <p role="status">Armazenamento indisponível. O replay dura apenas esta visita.</p>}
    {frames.length ? <>
      <TrafficMap key={airport} airport={airport} aircraft={current?.aircraft || []} />
      <div className="observatory-toolbar">
        <button disabled={first === last} onClick={() => { if (!playing && position >= last) setCursor(first); else setCursor(position); setPlaying(!playing); }}>{playing ? 'Pausar' : 'Reproduzir'}</button>
        <button onClick={() => { setPlaying(false); setCursor(last); }}>Último registro</button>
        <label>Velocidade <select aria-label="Velocidade" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[1, 5, 10, 30].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
        <output>{timeLabel(position)}</output>
      </div>
      <input className="replay-slider" type="range" aria-label="Horário do replay" min={first} max={last} step={1000} value={position} disabled={first === last} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false); }} />
      <div className="observatory-toolbar"><span>{timeLabel(first)}</span><span>{timeLabel(last)}</span></div>
      <p role="status">{current ? `${current.aircraft.length} aeronaves · recebido às ${timeLabel(current.time)}` : 'Sem sinal registrado neste intervalo.'}</p>
      {current && <ul className="observatory-flight-list">{current.aircraft.slice(0, 12).map(a => <li key={a.hex}>{a.flight} · {a.registration || a.hex} · {a.altitude.toLocaleString('pt-BR')} pés</li>)}</ul>}
      <button onClick={() => { if (!window.confirm('Apagar o histórico de replay deste dispositivo?')) return; void clearRecording().then(() => { setCursor(null); setPlaying(false); }).catch(() => setError('Não foi possível apagar o histórico.')); }}>Apagar histórico</button>
    </> : <p role="status">{recording.loaded ? 'Ainda não há posições gravadas para este aeroporto.' : 'Carregando gravações…'}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
