import { useEffect, useRef, useState, type ReactNode } from 'react';

function LayersIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></svg>;
}
function useDismiss(ref: React.RefObject<HTMLDetailsElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      const node = ref.current;
      if (!node?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        node.open = false; node.querySelector('summary')?.focus();
      } else if (!node.contains(event.target as Node)) node.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, [ref, enabled]);
}
export function ExploreControls() {
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref);
  return <details className="explore-controls" ref={ref}>
    <summary><LayersIcon /><span>Explorar</span></summary>
    <section className="explore-menu" aria-label="Camadas do mapa">
      <h2>O céu e o terreno</h2><p>Combine as camadas no mapa principal.</p>
      <label className="explore-option"><span><strong>Relevo 3D</strong><small>Montanhas e vales, em escala real</small></span><input id="explore-terrain" type="checkbox" /></label>
      <p id="explore-terrain-status" className="explore-status" role="status" />
      <label className="explore-option"><span><strong>Chuva</strong><small>Precipitação observada por radar</small></span><input id="explore-rain" type="checkbox" /></label>
      <p id="explore-rain-status" className="explore-status" role="status" />
      <label className="explore-option"><span><strong>Nuvens</strong><small>Imagem de satélite GOES-East</small></span><input id="explore-cloud" type="checkbox" /></label>
      <p id="explore-cloud-status" className="explore-status" role="status" />
      <label className="explore-opacity">Intensidade das imagens<input id="explore-opacity" type="range" min="0.1" max="1" step="0.1" defaultValue="0.6" /></label>
      <button id="explore-refresh" type="button">Atualizar imagens</button>
      <div className="explore-legend" aria-label="Refletividade da chuva em dBZ"><span>Radar · dBZ</span>{[[15, '#88ddee'], [30, '#005588'], [40, '#ffaa00'], [45, '#ff4400']].map(([value, color]) => <span key={value}><i style={{ background: String(color) }} />{value}</span>)}</div>
      <p className="explore-footnote">Imagens observadas, sem previsão. O satélite também mostra a superfície. Áreas escuras estão fora da cobertura do radar; sem manchas não garante ausência de chuva.</p>
      <p className="explore-footnote">Relevo: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Mapzen</a> · Chuva: <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a> · Nuvens: <a href="https://www.star.nesdis.noaa.gov/" target="_blank" rel="noreferrer">NOAA</a></p>
    </section>
  </details>;
}
export function MoreControls({ children }: { children: ReactNode }) {
  const [fullscreen, setFullscreen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  useDismiss(ref, fullscreen);
  useEffect(() => {
    const viewport = window.matchMedia('(min-width: 901px)');
    const update = () => {
      const compact = Boolean(document.fullscreenElement) && viewport.matches;
      setFullscreen(compact); if (ref.current) ref.current.open = !compact;
    };
    update(); document.addEventListener('fullscreenchange', update); viewport.addEventListener('change', update);
    return () => { document.removeEventListener('fullscreenchange', update); viewport.removeEventListener('change', update); };
  }, []);
  return <details className={`more-controls${fullscreen ? ' is-fullscreen' : ''}`} ref={ref} open={!fullscreen || undefined}>
    <summary><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6m8 4v6" /></svg>Mais controles</summary>
    <div className="more-controls-content">{children}</div>
  </details>;
}
