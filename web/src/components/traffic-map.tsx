import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { FOCUS_AIRPORTS } from '@/lib/comparison-feed';
import { RUNWAYS } from '@/lib/airport-operations';
import { createAircraftMapIcon } from '@/lib/aircraft-icons';
import type { FocusAirport } from '@/lib/traffic-recording';
import type { TrafficAircraft } from '@/lib/types';
maplibregl.setWorkerUrl(workerUrl);
function geo(aircraft: TrafficAircraft[]) {
  return { type: 'FeatureCollection' as const, features: aircraft.map(a => ({ type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] }, properties: { heading: a.track, label: a.flight || a.registration || a.hex } })) };
}
export function TrafficMap({ airport, aircraft }: { airport: FocusAirport; aircraft: TrafficAircraft[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const latest = useRef(aircraft); latest.current = aircraft;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/dark',
        center: FOCUS_AIRPORTS[airport].center, zoom: 10.3, pitch: 40, attributionControl: { compact: true } });
    } catch { setFailed(true); return; }
    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl(), 'top-right');
    instance.on('load', () => {
      instance.addImage('aircraft', createAircraftMapIcon('#7ee8ff', '#102334'), { pixelRatio: 2 });
      instance.addSource('traffic', { type: 'geojson', data: geo(latest.current), attribution: 'Tráfego: <a href="https://www.adsb.lol/" target="_blank" rel="noopener">ADSB.lol</a> · ODbL' });
      instance.addLayer({ id: 'aircraft', type: 'symbol', source: 'traffic', layout: { 'icon-image': 'aircraft', 'icon-size': .8,
        'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true } });
      instance.addLayer({ id: 'labels', type: 'symbol', source: 'traffic', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 2] }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#102334', 'text-halo-width': 2 } });
      instance.addSource('runways', { type: 'geojson', data: { type: 'FeatureCollection', features: RUNWAYS.filter(r => r.airport === airport).map(r => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.coordinates } })) } });
      instance.addLayer({ id: 'runways', type: 'line', source: 'runways', paint: { 'line-color': '#fbbf67', 'line-width': 4 } });
    });
    const resize = new ResizeObserver(() => instance.resize()); resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  }, [airport]);
  useEffect(() => { (map.current?.getSource('traffic') as GeoJSONSource | undefined)?.setData(geo(aircraft)); }, [aircraft]);
  return <div className="observatory-map" ref={container} aria-label={`Mapa de tráfego ${airport}`}>{failed && <p role="alert">Mapa indisponível neste navegador. Consulte os voos na lista.</p>}</div>;
}
