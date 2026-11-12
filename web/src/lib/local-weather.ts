export const LOCAL_WEATHER_FIELDS = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation', 'weather_code', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'] as const;
type WeatherField = typeof LOCAL_WEATHER_FIELDS[number];
export type LocalWeather = { time: number; interval: number } & Record<WeatherField, number | null>;
export function parseLocalWeather(value: unknown): LocalWeather {
  const data = value as { current?: Record<string, unknown>; current_units?: Record<string, unknown> };
  const c = data?.current;
  if (!c || !Number.isFinite(c.time) || !Number.isFinite(c.interval) || Number(c.interval) <= 0 || Number(c.interval) > 86400 ||
    LOCAL_WEATHER_FIELDS.some(field => c[field] !== null && (typeof c[field] !== 'number' || !Number.isFinite(c[field]))) ||
    data.current_units?.temperature_2m !== '°C' || data.current_units?.wind_speed_10m !== 'km/h' || data.current_units?.precipitation !== 'mm') throw new Error('Resposta meteorológica inválida.');
  for (const field of ['relative_humidity_2m', 'cloud_cover'] as const) if (c[field] !== null && (Number(c[field]) < 0 || Number(c[field]) > 100)) throw new Error('Percentual inválido.');
  if (c.wind_direction_10m !== null && (Number(c.wind_direction_10m) < 0 || Number(c.wind_direction_10m) > 360)) throw new Error('Direção inválida.');
  for (const field of ['precipitation', 'wind_speed_10m', 'wind_gusts_10m'] as const) if (c[field] !== null && Number(c[field]) < 0) throw new Error('Valor inválido.');
  return Object.fromEntries(['time', 'interval', ...LOCAL_WEATHER_FIELDS].map(field => [field, c[field]])) as LocalWeather;
}
export function weatherDescription(code: number | null) {
  const descriptions: Record<number, string> = { 0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Encoberto', 45: 'Nevoeiro', 48: 'Nevoeiro com formação de gelo', 51: 'Garoa fraca', 53: 'Garoa moderada', 55: 'Garoa intensa', 56: 'Garoa congelante fraca', 57: 'Garoa congelante intensa', 61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva intensa', 66: 'Chuva congelante fraca', 67: 'Chuva congelante intensa', 71: 'Neve fraca', 73: 'Neve moderada', 75: 'Neve intensa', 77: 'Grãos de neve', 80: 'Pancadas fracas de chuva', 81: 'Pancadas moderadas de chuva', 82: 'Pancadas intensas de chuva', 85: 'Pancadas fracas de neve', 86: 'Pancadas intensas de neve', 95: 'Trovoadas', 96: 'Trovoadas com granizo', 99: 'Trovoadas com granizo forte' };
  return code === null ? 'Condição não informada' : descriptions[code] || 'Condição não classificada';
}
