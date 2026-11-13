import type { Map, RasterTileSource, ErrorEvent } from 'maplibre-gl';
import { CLOUD_BOUNDS, WEATHER_MAX_AGE, cloudMetadataURL, parseCloudFrame, parseRainFrame, type CloudFrame, type RainFrame } from './weather-layers';

export function startExploreMap(map: Map) {
  const controller = new AbortController();
  const input = (key: string) => document.getElementById(`explore-${key}`) as HTMLInputElement;
  const status = (key: string, text: string) => { document.getElementById(`explore-${key}-status`)!.textContent = text; };
  const refresh = document.getElementById('explore-refresh') as HTMLButtonElement;
  let rain: RainFrame | null = null, cloud: CloudFrame | null = null;
  let loading = false, styleReady = false;
  const errors = new Set<string>();
  const stamp = (time: number) => new Date(time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const fresh = (frame: RainFrame | CloudFrame | null) => !!frame && Date.now() - frame.time <= WEATHER_MAX_AGE;
  function apply() {
    if (!styleReady || controller.signal.aborted) return;
    const terrain = input('terrain').checked && !errors.has('terrain');
    if (terrain && !map.getSource('explore-terrain')) map.addSource('explore-terrain', {
      type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium', tileSize: 256, maxzoom: 15,
      attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen terrain</a>',
    });
    if (terrain && !map.getTerrain()) map.setTerrain({ source: 'explore-terrain', exaggeration: 1 });
    else if (!terrain && map.getTerrain()) map.setTerrain(null);
    map.getContainer().dataset.terrain = String(terrain);
    // Keep airport geometry, aircraft and labels above the weather imagery.
    const before = map.getStyle().layers?.find(layer => layer.type === 'symbol' || layer.id.startsWith('airport-') || layer.id.startsWith('aircraft-'))?.id;
    const raster = (key: string, tiles: string | undefined, active: boolean, opacity: number, attribution: string, bounds?: [number, number, number, number]) => {
      const id = `explore-${key}`;
      if (tiles && active && !map.getSource(id)) {
        map.addSource(id, { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom: 7, attribution, ...(bounds ? { bounds } : {}) });
        map.addLayer({ id, source: id, type: 'raster', paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } }, before);
      } else if (tiles && active) {
        const source = map.getSource(id) as RasterTileSource;
        if (source?.tiles?.[0] !== tiles) source.setTiles([tiles]);
      }
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', active ? 'visible' : 'none');
        map.setPaintProperty(id, 'raster-opacity', opacity);
        map.moveLayer(id, before);
      }
      map.getContainer().dataset[key] = String(active);
    };
    const center = map.getCenter();
    const inCloudArea = center.lng >= CLOUD_BOUNDS[0] && center.lng <= CLOUD_BOUNDS[2] && center.lat >= CLOUD_BOUNDS[1] && center.lat <= CLOUD_BOUNDS[3];
    const showRain = input('rain').checked && fresh(rain) && !errors.has('rain') && !errors.has('coverage');
    const showCloud = input('cloud').checked && fresh(cloud) && inCloudArea && !errors.has('cloud');
    const opacity = Number(input('opacity').value);
    raster('cloud', cloud?.tiles, showCloud, opacity, 'Satélite: NOAA GOES-East', CLOUD_BOUNDS);
    raster('rain', rain?.tiles, showRain, opacity, 'Weather data by RainViewer');
    raster('coverage', rain?.coverage, showRain, .35, 'Cobertura: RainViewer');
    if (input('cloud').checked && !inCloudArea) status('cloud', 'Esta região está fora da cobertura GOES-East.');
    else if (input('cloud').checked && fresh(cloud) && !errors.has('cloud')) status('cloud', `Captura às ${stamp(cloud!.time)} · horário local`);
    if (input('rain').checked && fresh(rain) && !errors.has('rain') && !errors.has('coverage')) status('rain', `Composição às ${stamp(rain!.time)} · horário local`);
    for (const key of ['rain', 'cloud']) {
      if (!input(key).checked) status(key, '');
      else if (!loading && !fresh(key === 'rain' ? rain : cloud) && !errors.has(key)) status(key, 'Sem imagem recente. Atualize as imagens.');
    }
  }
  async function load() {
    if (loading || controller.signal.aborted || document.hidden) return;
    const keys = ['rain', 'cloud'].filter(key => input(key).checked);
    if (!keys.length) return;
    loading = true; refresh.disabled = true;
    refresh.textContent = 'Atualizando…';
    await Promise.allSettled(keys.map(async key => {
      errors.delete(key); if (key === 'rain') errors.delete('coverage');
      status(key, 'Buscando imagem recente…');
      try {
        const response = await fetch(key === 'rain' ? 'https://api.rainviewer.com/public/weather-maps.json' : cloudMetadataURL(), { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (key === 'rain') rain = parseRainFrame(data); else cloud = parseCloudFrame(data);
        // Reset failed tiles even when the latest timestamp has not changed.
        for (const id of key === 'rain' ? ['rain', 'coverage'] : ['cloud']) {
          const source = map.getSource(`explore-${id}`) as RasterTileSource | undefined;
          if (source?.tiles) source.setTiles(source.tiles);
        }
      } catch {
        if (controller.signal.aborted) return;
        errors.add(key);
        if (key === 'rain') rain = null; else cloud = null;
        status(key, 'Imagem indisponível. Tente atualizar.');
      }
    }));
    if (controller.signal.aborted) return;
    loading = false; refresh.disabled = false; refresh.textContent = 'Atualizar imagens'; apply();
    // A second layer may have been enabled while the first was loading.
    if (['rain', 'cloud'].some(key => input(key).checked && !keys.includes(key))) void load();
  }
  for (const key of ['terrain', 'rain', 'cloud']) input(key).addEventListener('change', () => {
    errors.delete(key);
    if (key === 'terrain') {
      status(key, input(key).checked ? 'Relevo em escala real · incline o mapa para explorar.' : '');
      if (input(key).checked && map.getPitch() < 30) map.easeTo({ pitch: 55, duration: 500 });
    }
    apply();
    if (key !== 'terrain' && input(key).checked) void load();
  }, { signal: controller.signal });
  input('opacity').addEventListener('input', apply, { signal: controller.signal });
  refresh.addEventListener('click', () => { void load(); }, { signal: controller.signal });
  const onStyle = () => { styleReady = true; apply(); };
  const onStyleLoading = () => { styleReady = false; };
  const onError = (event: ErrorEvent) => {
    const id = (event as ErrorEvent & { sourceId?: string }).sourceId;
    if (!id?.startsWith('explore-')) return;
    const key = id.slice(8); errors.add(key);
    status(key === 'coverage' ? 'rain' : key, 'Camada indisponível. Desative e ative para tentar novamente.'); apply();
    if (key === 'terrain' && map.getSource('explore-terrain')) { map.setTerrain(null); map.removeSource('explore-terrain'); }
  };
  map.on('styledataloading', onStyleLoading);
  map.on('style.load', onStyle);
  map.on('moveend', apply);
  map.on('error', onError);
  const timer = setInterval(() => { apply(); void load(); }, 5 * 60000);
  return () => { controller.abort(); clearInterval(timer); map.off('styledataloading', onStyleLoading); map.off('style.load', onStyle); map.off('moveend', apply); map.off('error', onError); };
}
