export function PanelMoveHandle({ panel, label }: { panel: string; label: string }) {
  return <button type="button" className="panel-move-handle" data-panel-drag={panel} aria-label={label} title="Arraste para mover. Setas movem; Home restaura a posição."><svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">{[4, 9, 14].map(y => <g key={y}><circle cx="4" cy={y} r="1.2"/><circle cx="10" cy={y} r="1.2"/></g>)}</svg></button>;
}
