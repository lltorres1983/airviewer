export type Conditions = { wdir?: number | string | null; wspd?: number | null; wgst?: number | null; visib?: string | number | null; wxString?: string | null; clouds?: { cover: string; base?: number | null }[] };
export type Metar = Conditions & { icaoId: string; obsTime: number; rawOb: string; temp?: number | null; altim?: number | null };
export type Forecast = Conditions & { timeFrom: number; timeTo: number; timeBec?: number | null; fcstChange?: string | null; probability?: number | null };
export type Taf = { icaoId: string; issueTime: string; validTimeFrom: number; validTimeTo: number; rawTAF: string; fcsts: Forecast[] };
export type WeatherData = { generatedAt: string; metars: Metar[]; tafs: Taf[] };
export function windText(c: Conditions) {
  if (c.wspd == null || !Number.isFinite(c.wspd)) return 'Vento não informado';
  if (c.wspd === 0) return 'Vento calmo';
  const direction = typeof c.wdir === 'number' ? `de ${c.wdir}°` : 'variável';
  return `Vento ${direction}, ${c.wspd} nós${c.wgst != null ? `; rajadas de ${c.wgst} nós` : ''}`;
}
export function visibilityText(c: Conditions, raw = '') {
  if (/\b(CAVOK|9999)\b/.test(raw) || c.visib === '6+') return 'Visibilidade de 10 km ou mais';
  if (c.visib == null || c.visib === '') return 'Visibilidade não informada';
  const miles = Number(c.visib);
  return Number.isFinite(miles) ? `Visibilidade de ${(miles * 1.609344).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `Visibilidade: ${c.visib}`;
}
export function conditionsText(c: Conditions, raw = '') {
  if (/\bCAVOK\b/.test(raw)) return 'Sem tempo significativo; sem nuvens relevantes abaixo de 5.000 pés ou da altitude mínima de setor, se maior';
  const weather: Record<string, string> = { RA: 'chuva', DZ: 'garoa', TS: 'trovoadas', SH: 'pancadas', FG: 'nevoeiro', BR: 'névoa úmida', HZ: 'névoa seca', SN: 'neve', GR: 'granizo', VC: 'nas proximidades', NSW: 'sem tempo significativo' };
  const phenomena = (c.wxString || '').split(/\s+/).filter(Boolean).map(token => {
    const intensity = token[0] === '+' ? 'forte: ' : token[0] === '-' ? 'fraca: ' : '';
    const code = token.replace(/^[+-]/, '');
    if (weather[code]) return intensity + weather[code];
    const parts = code.match(/.{1,2}/g) || [];
    return parts.every(part => weather[part]) ? intensity + parts.map(part => weather[part]).join(', ') : token;
  });
  const covers: Record<string, string> = { FEW: 'Poucas nuvens', SCT: 'Nuvens dispersas', BKN: 'Muito nublado', OVC: 'Encoberto', VV: 'Visibilidade vertical', CLR: 'Céu limpo', SKC: 'Céu limpo', NSC: 'Sem nuvens significativas' };
  const clouds = (c.clouds || []).map(cloud => `${covers[cloud.cover] || cloud.cover}${cloud.base != null ? ` a ${cloud.base.toLocaleString('pt-BR')} pés` : ''}`);
  return [...phenomena, ...clouds].join(' · ') || 'Condições adicionais não informadas';
}
function validConditions(value: Conditions) {
  if (!value || typeof value !== 'object') return false;
  const finiteOrMissing = (item: unknown) => item == null || (typeof item === 'number' && Number.isFinite(item));
  return finiteOrMissing(value.wspd) && finiteOrMissing(value.wgst) &&
    (value.wdir == null || value.wdir === 'VRB' || (typeof value.wdir === 'number' && Number.isFinite(value.wdir) && value.wdir >= 0 && value.wdir <= 360)) &&
    (value.visib == null || typeof value.visib === 'string' || (typeof value.visib === 'number' && Number.isFinite(value.visib))) &&
    (value.wxString == null || typeof value.wxString === 'string') &&
    (value.clouds == null || (Array.isArray(value.clouds) && value.clouds.every(cloud => cloud && typeof cloud.cover === 'string' && finiteOrMissing(cloud.base))));
}
export function validWeatherData(value: unknown): value is WeatherData {
  const data = value as WeatherData;
  return Boolean(data && typeof data.generatedAt === 'string' && Number.isFinite(Date.parse(data.generatedAt)) && Array.isArray(data.metars) && Array.isArray(data.tafs) &&
    data.metars.every(m => validConditions(m) && typeof m.icaoId === 'string' && Number.isFinite(m.obsTime) && typeof m.rawOb === 'string') &&
    data.tafs.every(t => t && typeof t.icaoId === 'string' && typeof t.rawTAF === 'string' && Number.isFinite(Date.parse(t.issueTime)) &&
      Number.isFinite(t.validTimeFrom) && Number.isFinite(t.validTimeTo) && t.validTimeTo > t.validTimeFrom && Array.isArray(t.fcsts) &&
      t.fcsts.every(f => validConditions(f) && Number.isFinite(f.timeFrom) && Number.isFinite(f.timeTo) && f.timeTo > f.timeFrom)));
}
