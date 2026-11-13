import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('../web/public/weather.json', import.meta.url);
async function get(kind) {
  const response = await fetch(`https://aviationweather.gov/api/data/${kind}?ids=SBGR,SBGL,SBRJ&format=json`, {
    headers: { 'User-Agent': 'Airviewer/1.0 (GRU-GIG-SDU airport spotting)' }, signal: AbortSignal.timeout(20000),
  });
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Resposta inválida');
  return data.filter(row => ['SBGR', 'SBGL', 'SBRJ'].includes(row.icaoId));
}
const results = await Promise.allSettled([get('metar'), get('taf')]);
const data = { generatedAt: new Date().toISOString(), source: 'NOAA/AWC',
  metars: results[0].status === 'fulfilled' ? results[0].value : [],
  tafs: results[1].status === 'fulfilled' ? results[1].value : [] };
for (const [index, result] of results.entries()) if (result.status === 'rejected') console.warn(`Meteorologia ${index === 0 ? 'METAR' : 'TAF'} indisponível: ${result.reason.message}`);
// Missing products remain explicitly unavailable rather than retaining a stale file.
await mkdir(new URL('../web/public/', import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify(data));
console.log(`Meteorologia: ${data.metars.length} METAR e ${data.tafs.length} TAF.`);
