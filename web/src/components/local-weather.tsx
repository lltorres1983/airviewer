import { useEffect, useState } from 'react';
import type { Observer } from '@/lib/nearby-radar';
import { LOCAL_WEATHER_FIELDS, parseLocalWeather, weatherDescription, type LocalWeather as Weather } from '@/lib/local-weather';
const value = (n: number | null, unit: string) => n === null ? 'Não informado' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit}`;
export function LocalWeather({ origin, now }: { origin: Observer; now: number }) {
  const [data, setData] = useState<Weather | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    setData(null); setError('');
    const load = async () => {
      if (pending || document.hidden) return;
      pending = true; setLoading(true);
      try {
        const params = new URLSearchParams({ latitude: origin.latitude.toFixed(3), longitude: origin.longitude.toFixed(3), current: LOCAL_WEATHER_FIELDS.join(','), timeformat: 'unixtime', wind_speed_unit: 'kmh', timezone: 'auto' });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error();
        const next = parseLocalWeather(await response.json());
        if (next.time * 1000 > Date.now() + 15 * 60000) throw new Error();
        if (!controller.signal.aborted) { setData(next); setError(''); }
      } catch { if (!controller.signal.aborted) setError('Meteorologia indisponível. Tente atualizar novamente.'); }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void load(); const timer = setInterval(() => void load(), 10 * 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [origin.latitude, origin.longitude, revision]);
  return <section className="local-weather" aria-label="Meteorologia da localização atual">
    <div className="local-weather-heading"><h3>Meteorologia local</h3><button type="button" disabled={loading} onClick={() => setRevision(n => n + 1)}>{loading ? 'Atualizando…' : 'Atualizar tempo'}</button></div>
    {loading && !data && <p role="status">Consultando as condições da sua região…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <div className="local-weather-summary"><strong>{value(data.temperature_2m, ' °C')}</strong><span>{weatherDescription(data.weather_code)}<small>Sensação de {value(data.apparent_temperature, ' °C')}</small></span></div>
      {now - data.time * 1000 > 90 * 60000 && <p className="local-weather-stale" role="status">Dados desatualizados: confira o horário abaixo.</p>}
      <dl className="local-weather-details">
        <div><dt>Vento</dt><dd>{value(data.wind_speed_10m, ' km/h')}{data.wind_direction_10m !== null && ` · de ${Math.round(data.wind_direction_10m)}°`}</dd></div>
        <div><dt>Rajadas</dt><dd>{value(data.wind_gusts_10m, ' km/h')}</dd></div>
        <div><dt>Nebulosidade</dt><dd>{value(data.cloud_cover, '%')}</dd></div>
        <div><dt>Umidade</dt><dd>{value(data.relative_humidity_2m, '%')}</dd></div>
        <div><dt>Precipitação · intervalo de {Math.round(data.interval / 60)} min</dt><dd>{value(data.precipitation, ' mm')}</dd></div>
      </dl>
      <p className="observatory-note">Horário dos dados: {new Date(data.time * 1000).toLocaleString('pt-BR')} (horário deste dispositivo).</p>
    </>}
    <p className="observatory-note">Estimativa por modelos meteorológicos · <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>. Não é uma medição de radar de chuva nem um boletim METAR.</p>
  </section>;
}
