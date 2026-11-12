export const CLOUD_SERVICE = 'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/ABIGC_Last_24hr/ImageServer';
export const CLOUD_BOUNDS: [number, number, number, number] = [-151.4587, -76.49, 1.4903, 76.4588];
export const WEATHER_MAX_AGE = 90 * 60000;
export type RainFrame = { time: number; tiles: string; coverage: string };
export type CloudFrame = { time: number; tiles: string };
export function parseRainFrame(raw: unknown, now = Date.now()): RainFrame {
  const data = raw as { host?: string; radar?: { past?: { time: number; path: string }[] } };
  if (data?.host !== 'https://tilecache.rainviewer.com' || !Array.isArray(data.radar?.past)) throw new Error('Precipitação indisponível.');
  const frame = data.radar.past.filter(f => f && Number.isFinite(f.time) && f.time * 1000 <= now + 300000 && f.time * 1000 >= now - WEATHER_MAX_AGE && /^\/v2\/radar\/[a-zA-Z0-9_-]+$/.test(f.path)).sort((a, b) => b.time - a.time)[0];
  if (!frame) throw new Error('Sem composição recente de precipitação.');
  return { time: frame.time * 1000, tiles: `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_0.png`, coverage: `${data.host}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png` };
}
export function parseCloudFrame(raw: unknown, now = Date.now()): CloudFrame {
  const data = raw as { features?: { attributes: { objectid: number; start_time: number } }[] };
  const row = data?.features?.[0]?.attributes;
  if (!row || !Number.isInteger(row.objectid) || row.objectid < 1 || !Number.isFinite(row.start_time) || row.start_time < now - WEATHER_MAX_AGE || row.start_time > now + 300000) throw new Error('Sem imagem recente de nuvens.');
  const params = new URLSearchParams({ bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', f: 'image',
    mosaicRule: JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [row.objectid], mosaicOperation: 'MT_FIRST' }) });
  return { time: row.start_time, tiles: `${CLOUD_SERVICE}/exportImage?${params}&bbox={bbox-epsg-3857}` };
}
export function cloudMetadataURL() {
  return `${CLOUD_SERVICE}/query?${new URLSearchParams({ f: 'json', where: '1=1', outFields: 'objectid,start_time', orderByFields: 'start_time DESC', resultRecordCount: '1', returnGeometry: 'false' })}`;
}
