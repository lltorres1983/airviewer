import { useId, useState } from 'react';
import type { NearbyAircraft } from '@/lib/nearby-radar';
const point = (degrees: number, radius: number) => ({ x: 180 + Math.sin(degrees * Math.PI / 180) * radius, y: 180 - Math.cos(degrees * Math.PI / 180) * radius });
export function RadarScope({ aircraft, radius, selected, onSelect, fresh }: { aircraft: NearbyAircraft[]; radius: number; selected: string; onSelect: (hex: string) => void; fresh: boolean }) {
  const gradient = useId();
  const [sweeping, setSweeping] = useState(true);
  return <div className="radar-scope">
    <div className="radar-scope-readout"><strong>{fresh ? 'TRÁFEGO ADS-B' : 'AGUARDANDO SINAL'}</strong><span>{aircraft.length} {aircraft.length === 1 ? 'aeronave' : 'aeronaves'} · {radius} km</span></div>
    <svg className="nearby-radar radar-scope-screen" viewBox="0 0 360 360" role="group" aria-label={`Radar com norte no topo, raio de ${radius} quilômetros`}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#65eda3" stopOpacity="0" /><stop offset="100%" stopColor="#65eda3" stopOpacity=".23" /></linearGradient></defs>
      <circle cx="180" cy="180" r="153" fill="#061b12" stroke="#498d68" />
      {[1, 2, 3, 4].map(n => <circle key={n} cx="180" cy="180" r={n * 37.5} fill="none" stroke="#367c55" strokeWidth={n === 4 ? 1.5 : .8} />)}
      {[0, 45, 90, 135].map(angle => { const a = point(angle, 150), b = point(angle + 180, 150); return <line key={angle} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#296044" strokeWidth=".8" />; })}
      {Array.from({ length: 72 }, (_, index) => { const angle = index * 5, a = point(angle, 153), b = point(angle, index % 6 === 0 ? 161 : 157); return <line key={angle} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={index % 6 === 0 ? '#b2edcc' : '#498d68'} />; })}
      {Array.from({ length: 12 }, (_, index) => { const angle = index * 30, p = point(angle, 172); return <text key={angle} x={p.x} y={p.y + 4} textAnchor="middle" className="radar-bearing-label">{({ 0: 'N', 90: 'L', 180: 'S', 270: 'O' } as Record<number, string>)[angle] || `${angle}°`}</text>; })}
      <g className="radar-sweep" data-running={sweeping && fresh} aria-hidden="true"><path d="M180 180 L180 30 A150 150 0 0 1 286.066 73.934 Z" fill={`url(#${gradient})`} /><path d="M180 180 L286.066 73.934" stroke="#82efb1" strokeWidth="1" opacity=".7" /></g>
      {[1, 2, 3, 4].map(n => <text key={n} x="185" y={180 + n * 37.5 - 5} className="radar-range-label">{(radius * n / 4).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km</text>)}
      <path d="M174 180h12M180 174v12" stroke="#fbbf67" strokeWidth="2" aria-hidden="true" /><circle cx="180" cy="180" r="2" fill="#fbbf67" />
      {aircraft.map((a, index) => { const p = point(a.bearing, a.distance / radius * 150); return <g key={a.hex} transform={`translate(${p.x},${p.y})`} className="radar-target" role="button" tabIndex={0} aria-label={`Ver ${a.flight}`} aria-pressed={selected === a.hex} onClick={() => onSelect(a.hex)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(a.hex); } }}>
        <title>{a.flight} · {a.distance.toFixed(1)} km</title><circle className="radar-target-hit" r="14" fill="transparent" />
        <circle className="radar-target-ring" r="9" fill="none" />
        <path d="M0-5L5 0L0 5L-5 0Z" className="radar-target-echo" />
        <text x="11" y="-8" className="radar-target-label">{index + 1}</text>
      </g>; })}
    </svg>
    <div className="radar-scope-footer"><span>Você no centro · norte fixo</span><button type="button" aria-pressed={sweeping} onClick={() => setSweeping(!sweeping)}>{sweeping ? 'Pausar varredura' : 'Animar varredura'}</button></div>
    <p className="radar-scope-note">Varredura ilustrativa. As posições vêm do ADS-B, não de um sensor de radar no celular.</p>
  </div>;
}
