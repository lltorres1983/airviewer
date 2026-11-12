import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, RasterTileSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createAircraftMapIcon } from '@/lib/aircraft-icons';
import { CLOUD_BOUNDS, CLOUD_SERVICE, WEATHER_MAX_AGE, cloudMetadataURL, parseCloudFrame, parseRainFrame, type CloudFrame, type RainFrame } from '@/lib/weather-layers';
import type { NearbyAircraft, Observer } from '@/lib/nearby-radar';
maplibregl.setWorkerUrl(workerUrl);
function trafficGeo(aircraft: NearbyAircraft[], selected: string): FeatureCollection {
  return { type: 'FeatureCollection', features: aircraft.map(a => ({ type: 'Feature', properties: { hex: a.hex, label: a.flight, track: a.track ?? null, selected: a.hex === selected }, geometry: { type: 'Point', coordinates: [a.longitude, a.latitude] } })) };
}
function ringGeo(origin: Observer, radius: number): FeatureCollection {
  const coordinates = Array.from({ length: 73 }, (_, i) => {
    const angle = i * 5 * Math.PI / 180, lat = origin.latitude * Math.PI / 180, lon = origin.longitude * Math.PI / 180, arc = radius / 6371;
    const y = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(angle));
    const x = lon + Math.atan2(Math.sin(angle) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(y));
    return [x * 180 / Math.PI, y * 180 / Math.PI];
  });
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }, { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [origin.longitude, origin.latitude] } }] };
}
export function WeatherTrafficMap({ origin, aircraft, radius, selected, onSelect, now }: { origin: Observer; aircraft: NearbyAircraft[]; radius: number; selected: string; onSelect: (hex: string) => void; now: number }) {
  const container = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map | null>(null);
  const latest = useRef({ origin, aircraft, radius, selected, onSelect }); latest.current = { origin, aircraft, radius, selected, onSelect };
  const [ready, setReady] = useState(false), [mapError, setMapError] = useState('');
  const [rain, setRain] = useState<RainFrame | null>(null), [cloud, setCloud] = useState<CloudFrame | null>(null);
  const [rainError, setRainError] = useState(''), [cloudError, setCloudError] = useState('');
  const [tileErrors, setTileErrors] = useState<Record<string, boolean>>({});
  const [showRain, setShowRain] = useState(true), [showCloud, setShowCloud] = useState(true), [showCoverage, setShowCoverage] = useState(true);
  const [cloudOpacity, setCloudOpacity] = useState(.6), [rainOpacity, setRainOpacity] = useState(.8);
  const [revision, setRevision] = useState(0), [loading, setLoading] = useState(false);
  const inCloudArea = origin.longitude >= CLOUD_BOUNDS[0] && origin.longitude <= CLOUD_BOUNDS[2] && origin.latitude >= CLOUD_BOUNDS[1] && origin.latitude <= CLOUD_BOUNDS[3];
  const freshRain = rain && now - rain.time <= WEATHER_MAX_AGE ? rain : null;
  const freshCloud = cloud && inCloudArea && now - cloud.time <= WEATHER_MAX_AGE ? cloud : null;
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const load = async () => {
      if (pending || document.hidden) return; pending = true; setLoading(true);
      const json = async (url: string) => { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }); if (!r.ok) throw new Error(); return r.json(); };
      const results = await Promise.allSettled([json('https://api.rainviewer.com/public/weather-maps.json').then(parseRainFrame), json(cloudMetadataURL()).then(parseCloudFrame)]);
      if (!controller.signal.aborted) {
        const [r, c] = results;
        if (r.status === 'fulfilled') { setRain(r.value); setRainError(''); } else { setRain(null); setRainError('Camada de precipitação indisponível ou sem dados recentes.'); }
        if (c.status === 'fulfilled') { setCloud(c.value); setCloudError(''); } else { setCloud(null); setCloudError('Camada de nuvens indisponível ou sem imagem recente.'); }
        for (const id of ['weather-cloud', 'weather-rain', 'weather-coverage']) {
          const source = map.current?.getSource(id) as RasterTileSource | undefined;
          if (source?.tiles) source.setTiles(source.tiles);
        }
        setTileErrors({}); setLoading(false);
      }
      pending = false;
    };
    void load(); const timer = setInterval(() => void load(), 5 * 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [revision]);
  useEffect(() => {
    if (!container.current) return;
    if (Math.abs(origin.latitude) > 85) { setMapError('Mapa indisponível nesta latitude. Consulte a lista de aeronaves.'); return; }
    let instance: maplibregl.Map;
    try { instance = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/dark', center: [origin.longitude, origin.latitude], zoom: 9, maxZoom: 14, dragRotate: false, pitchWithRotate: false, attributionControl: { compact: true } }); }
    catch { setMapError('Não foi possível abrir o mapa. Consulte a lista de aeronaves.'); return; }
    map.current = instance; instance.touchZoomRotate.disableRotation();
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    instance.on('error', event => {
      const id = (event as unknown as { sourceId?: string }).sourceId;
      if (id && ['weather-cloud', 'weather-rain', 'weather-coverage'].includes(id)) setTileErrors(previous => ({ ...previous, [id]: true }));
      else if (!instance.isStyleLoaded()) setMapError('Não foi possível carregar o mapa-base. Tente reabrir o radar.');
    });
    instance.on('load', () => {
      instance.addSource('coverage-rings', { type: 'geojson', data: ringGeo(latest.current.origin, latest.current.radius) });
      instance.addLayer({ id: 'coverage-rings', type: 'line', source: 'coverage-rings', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#7ee8ff', 'line-width': 2, 'line-dasharray': [3, 3] } });
      instance.addLayer({ id: 'observer', type: 'circle', source: 'coverage-rings', filter: ['==', '$type', 'Point'], paint: { 'circle-color': '#fbbf67', 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#102334' } });
      instance.addSource('nearby-aircraft', { type: 'geojson', data: trafficGeo(latest.current.aircraft, latest.current.selected), attribution: 'Aeronaves: <a href="https://www.adsb.lol/">ADSB.lol</a> · ODbL' });
      instance.addImage('plane', createAircraftMapIcon('#7ee8ff', '#071521'), { pixelRatio: 2 });
      instance.addLayer({ id: 'aircraft-selection', type: 'circle', source: 'nearby-aircraft', filter: ['==', ['get', 'selected'], true], paint: { 'circle-radius': 17, 'circle-color': 'transparent', 'circle-stroke-width': 2, 'circle-stroke-color': '#fbbf67' } });
      instance.addLayer({ id: 'aircraft-symbols', type: 'symbol', source: 'nearby-aircraft', filter: ['!=', ['get', 'track'], null], layout: { 'icon-image': 'plane', 'icon-rotate': ['coalesce', ['get', 'track'], 0], 'icon-rotation-alignment': 'map', 'icon-size': .9, 'icon-allow-overlap': true } });
      instance.addLayer({ id: 'aircraft-unknown-heading', type: 'circle', source: 'nearby-aircraft', filter: ['==', ['get', 'track'], null], paint: { 'circle-radius': 6, 'circle-color': '#7ee8ff', 'circle-stroke-width': 2, 'circle-stroke-color': '#071521' } });
      instance.on('click', 'aircraft-unknown-heading', event => { const hex = event.features?.[0]?.properties?.hex; if (typeof hex === 'string') latest.current.onSelect(hex); });
      instance.addLayer({ id: 'aircraft-labels', type: 'symbol', source: 'nearby-aircraft', layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.8] }, paint: { 'text-color': '#fff', 'text-halo-color': '#071521', 'text-halo-width': 2 } });
      instance.on('click', 'aircraft-symbols', event => { const hex = event.features?.[0]?.properties?.hex; if (typeof hex === 'string') latest.current.onSelect(hex); });
      setReady(true);
    });
    const resize = new ResizeObserver(() => instance.resize()); resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; setReady(false); };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource('nearby-aircraft') as GeoJSONSource).setData(trafficGeo(aircraft, selected));
  }, [aircraft, selected, ready]);
  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource('coverage-rings') as GeoJSONSource).setData(ringGeo(origin, radius));
    const delta = radius / 111.32, horizontal = delta / Math.max(.09, Math.cos(origin.latitude * Math.PI / 180));
    map.current.fitBounds([[origin.longitude - horizontal, origin.latitude - delta], [origin.longitude + horizontal, origin.latitude + delta]], { padding: 35, duration: 0, maxZoom: 12 });
  }, [ready, radius, origin.latitude, origin.longitude]);
  useEffect(() => {
    const instance = map.current; if (!ready || !instance) return;
    const before = 'coverage-rings';
    const layer = (id: string, tiles: string | null, visible: boolean, opacity: number, attribution: string, bounds?: [number, number, number, number]) => {
      if (tiles && !instance.getSource(id)) {
        instance.addSource(id, { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom: 7, attribution, ...(bounds ? { bounds } : {}) });
        instance.addLayer({ id, source: id, type: 'raster', paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } }, before);
      } else if (tiles) {
        const source = instance.getSource(id) as RasterTileSource;
        if (source.tiles?.[0] !== tiles) source.setTiles([tiles]);
      }
      if (instance.getLayer(id)) {
        instance.setLayoutProperty(id, 'visibility', tiles && visible && !tileErrors[id] ? 'visible' : 'none');
        instance.setPaintProperty(id, 'raster-opacity', opacity);
      }
    };
    layer('weather-cloud', freshCloud?.tiles || null, showCloud, cloudOpacity, 'Satélite: <a href="https://www.star.nesdis.noaa.gov/">NOAA GOES-East</a> · GeoColor', CLOUD_BOUNDS);
    layer('weather-rain', freshRain?.tiles || null, showRain, rainOpacity, 'Weather data by <a href="https://www.rainviewer.com/">RainViewer</a>');
    layer('weather-coverage', freshRain?.coverage || null, showCoverage && showRain, .45, 'Cobertura: RainViewer');
    for (const id of ['weather-cloud', 'weather-rain', 'weather-coverage']) if (instance.getLayer(id)) instance.moveLayer(id, before);
  }, [ready, freshRain, freshCloud, showCloud, showRain, showCoverage, cloudOpacity, rainOpacity, tileErrors]);
  const stamp = (time: number) => new Date(time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return <section className="weather-traffic" aria-label="Radar meteorológico e aeronaves">
    <div className="weather-layer-controls"><label><input type="checkbox" checked={showCloud} onChange={e => setShowCloud(e.target.checked)} />Nuvens · satélite</label><label><input type="checkbox" checked={showRain} onChange={e => setShowRain(e.target.checked)} />Precipitação</label><label><input type="checkbox" checked={showCoverage} onChange={e => setShowCoverage(e.target.checked)} />Limites de cobertura</label></div>
    <div ref={container} className="weather-traffic-map" aria-label="Mapa de nuvens, precipitação e aeronaves" data-clouds={showCloud && !!freshCloud && !tileErrors['weather-cloud']} data-rain={showRain && !!freshRain && !tileErrors['weather-rain']} />
    {mapError && <p role="alert">{mapError}</p>}
    <div className="weather-opacity"><label>Opacidade das nuvens<input aria-label="Opacidade das nuvens" type="range" min="0" max="1" step=".1" value={cloudOpacity} onChange={e => setCloudOpacity(Number(e.target.value))} /></label><label>Opacidade da precipitação<input aria-label="Opacidade da precipitação" type="range" min="0" max="1" step=".1" value={rainOpacity} onChange={e => setRainOpacity(Number(e.target.value))} /></label></div>
    <div className="weather-layer-times"><p>{freshCloud ? `Satélite · captura ${stamp(freshCloud.time)}` : !inCloudArea ? 'GOES-East não cobre esta localização.' : cloudError || (loading ? 'Consultando satélite…' : 'Sem imagem recente de nuvens.')}</p><p>{freshRain ? `Precipitação · composição ${stamp(freshRain.time)}` : rainError || (loading ? 'Consultando precipitação…' : 'Sem composição recente de precipitação.')}</p><button disabled={loading} onClick={() => setRevision(n => n + 1)}>{loading ? 'Atualizando camadas…' : 'Atualizar camadas'}</button></div>
    {Object.keys(tileErrors).length > 0 && <p role="alert">Não foi possível carregar uma camada de imagem. Use “Atualizar camadas” para tentar novamente.</p>}
    <div className="precipitation-legend" aria-label="Legenda de refletividade da precipitação em dBZ"><span>Refletividade (dBZ)</span>{[[15, '#88ddee'], [20, '#00a3e0'], [30, '#005588'], [35, '#ffee00'], [40, '#ffaa00'], [45, '#ff4400']].map(([number, color]) => <span key={number}><i style={{ background: String(color) }} />{number}</span>)}</div>
    <p className="observatory-note">Horários do dispositivo. Nuvens: imagem GeoColor de satélite, que também mostra a superfície. Áreas escurecidas: fora da cobertura de precipitação. Sem manchas não garante ausência de chuva. As camadas têm resolução regional; ampliar não acrescenta detalhes meteorológicos. Aeronaves atualizadas separadamente dentro do círculo de {radius} km.</p>
    <p className="observatory-note">Fontes: <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a> · <a href={CLOUD_SERVICE} target="_blank" rel="noopener noreferrer">NOAA GOES-East</a>.</p>
  </section>;
}
