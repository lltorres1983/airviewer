/** Delegation also covers aircraft details mounted after selecting a flight. */
export function startPanelDragging() {
  const lifecycle = new AbortController();
  const floated = new Set<HTMLElement>();
  let drag: { panel: HTMLElement; handle: HTMLElement; id: number; x: number; y: number; left: number; top: number } | null = null;
  const place = (panel: HTMLElement, left: number, top: number) => {
    const rect = panel.getBoundingClientRect();
    const bottom = window.innerWidth <= 900 ? 88 : 12;
    panel.style.setProperty('--floating-left', `${Math.max(12, Math.min(left, window.innerWidth - rect.width - 12))}px`);
    panel.style.setProperty('--floating-top', `${Math.max(12, Math.min(top, window.innerHeight - rect.height - bottom))}px`);
  };
  const reset = (panel: HTMLElement) => {
    panel.classList.remove('movable-floating');
    for (const key of ['--floating-left', '--floating-top', '--floating-width', '--floating-height']) panel.style.removeProperty(key);
    floated.delete(panel); observer.unobserve(panel);
  };
  const fit = () => { for (const panel of floated) { if (!panel.isConnected) { reset(panel); continue; } if (panel.getClientRects().length) { const rect = panel.getBoundingClientRect(); place(panel, rect.left, rect.top); } } };
  const observer = new ResizeObserver(fit);
  const lift = (panel: HTMLElement) => {
    const rect = panel.getBoundingClientRect();
    if (!floated.has(panel)) {
      panel.style.setProperty('--floating-width', `${rect.width}px`);
      panel.style.setProperty('--floating-height', `${rect.height}px`);
      panel.classList.add('movable-floating'); floated.add(panel); observer.observe(panel);
    }
    place(panel, rect.left, rect.top);
    return rect;
  };
  const resolve = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null;
    const handle = target.closest<HTMLElement>('[data-panel-drag]');
    if (!handle) return null;
    const interactive = target.closest('button, a, input, select, textarea, summary');
    if (interactive && interactive !== handle) return null;
    const panel = handle.closest<HTMLElement>(handle.dataset.panelDrag!);
    return panel ? { handle, panel } : null;
  };
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const match = resolve(event.target); if (!match) return;
    const rect = match.panel.getBoundingClientRect();
    drag = { ...match, id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    match.handle.setPointerCapture(event.pointerId);
  }, { signal: lifecycle.signal });
  document.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3 && !floated.has(drag.panel)) return;
    if (!floated.has(drag.panel)) lift(drag.panel);
    place(drag.panel, drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
  }, { signal: lifecycle.signal });
  const stop = () => { drag = null; };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(name, stop, { signal: lifecycle.signal });
  document.addEventListener('keydown', event => {
    const match = resolve(event.target); if (!match) return;
    if (event.key === 'Home') { event.preventDefault(); reset(match.panel); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const rect = lift(match.panel), step = event.shiftKey ? 40 : 16;
    place(match.panel, rect.left + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), rect.top + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0));
  }, { signal: lifecycle.signal });
  window.addEventListener('resize', fit, { signal: lifecycle.signal });
  return () => { lifecycle.abort(); drag = null; for (const panel of floated) reset(panel); observer.disconnect(); };
}
