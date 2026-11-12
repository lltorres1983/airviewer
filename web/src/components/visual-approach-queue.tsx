import type { Approach } from '@/lib/airport-operations';

/** A schematic ordered by distance, never an ATC landing clearance or map scale. */
export function VisualApproachQueue({ airport, queue, onSelect, action = 'Acompanhar' }: {
  airport: string; queue: Approach[]; onSelect: (item: Approach) => void; action?: 'Acompanhar' | 'Registrar';
}) {
  if (!queue.length) return <p role="status">Nenhuma aproximação identificada agora.</p>;
  return <div className="visual-approaches">
    <div className="approach-destination">
      <svg className="approach-runway" viewBox="0 0 44 76" aria-hidden="true">
        <rect x="5" y="2" width="34" height="72" rx="2" fill="#263c4e" stroke="currentColor" />
        <path d="M12 8v12m6-12v12m8-12v12m6-12v12M12 56v12m6-12v12m8-12v12m6-12v12" stroke="currentColor" strokeWidth="3" />
        <path d="M22 28v6m0 8v6" stroke="currentColor" strokeWidth="2" />
      </svg>
      <div><strong>Chegadas · {airport}</strong><span>Mais perto da pista primeiro</span><small>Diagrama sem escala · ordem estimada</small></div>
    </div>
    <ol className="approach-queue visual-approach-list" aria-label={`Fila visual de aproximação ${airport}`}>
      {queue.map((item, index) => <li key={item.aircraft.hex}>
        <button type="button" className="visual-approach-flight" onClick={() => onSelect(item)} aria-label={`${action} ${item.aircraft.flight || item.aircraft.hex}${action === 'Registrar' ? ' no diário' : ''}`}>
          <span className="approach-plane" aria-hidden="true"><svg viewBox="0 0 56 56"><path d="M28 4 L32 23 L50 34 L50 38 L32 33 L30 44 L38 49 L38 52 L28 48 L18 52 L18 49 L26 44 L24 33 L6 38 L6 34 L24 23 Z" fill="currentColor" /></svg></span>
          <span className="approach-flight-info">
            <span className="approach-flight-title"><strong><span className="approach-position">{index + 1}.</span> {item.aircraft.flight || item.aircraft.hex}</strong><span className="approach-eta">{item.minutes !== null ? `~${item.minutes} min` : 'Tempo indeterminado'}</span></span>
            <span className="approach-flight-metrics">{item.distance.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km · {Math.round(item.aircraft.altitude).toLocaleString('pt-BR')} pés</span>
            <small>{item.aircraft.type || 'Modelo não informado'} · {item.runway ? `Pista provável ${item.runway}` : 'Pista indeterminada'}</small>
            <span className="approach-flight-action">{action === 'Registrar' ? 'Registrar no diário' : 'Acompanhar no mapa'}</span>
          </span>
        </button>
      </li>)}
    </ol>
  </div>;
}
