import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from './ui/button';
import { useAccount } from '@/providers/account-provider';
import { RUNWAYS, airportCommand, approachQueue, getAirportSnapshot, subscribeAirportSnapshot, SpottingTracker } from '@/lib/airport-operations';
import { conditionsText, validWeatherData, visibilityText, windText, type WeatherData } from '@/lib/airport-weather';

const clock = (value: number | string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const tokens = (value: string) => value.toUpperCase().split(/[\s,;]+/).filter(token => /^[A-Z0-9-]{2,12}$/.test(token)).slice(0, 30);
type Preferences = { enabled: boolean; models: string; registrations: string; radius: number; favorites: boolean };
const defaults: Preferences = { enabled: false, models: '', registrations: '', radius: 40, favorites: true };
function readPreferences(key: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (!value) return defaults;
    return { enabled: value.enabled === true, models: typeof value.models === 'string' ? value.models.slice(0, 300) : '',
      registrations: typeof value.registrations === 'string' ? value.registrations.slice(0, 300) : '',
      radius: [20, 40, 80].includes(value.radius) ? value.radius : 40, favorites: value.favorites !== false };
  } catch { return defaults; }
}

export function AirportSpotting() {
  const account = useAccount();
  return <SpottingPanel key={account.session?.user.id || 'guest'} storageKey={`airviewer:spotting:${account.session?.user.id || 'guest'}`} />;
}
function SpottingPanel({ storageKey }: { storageKey: string }) {
  const account = useAccount();
  const snapshot = useSyncExternalStore(subscribeAirportSnapshot, getAirportSnapshot);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [preferences, setPreferences] = useState(() => readPreferences(storageKey));
  const [alerts, setAlerts] = useState<{ key: string; text: string; hex: string; airport: string }[]>([]);
  const tracker = useRef(new SpottingTracker());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherRevision, setWeatherRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* Settings still work for this visit. */ } }, [storageKey, preferences]);
  const favoriteHexes = preferences.favorites ? account.favorites.map(row => row.aircraft_hex) : [];
  const favoritesKey = favoriteHexes.join(',');
  useEffect(() => {
    const matches = tracker.current.detect(snapshot, { ...preferences, models: tokens(preferences.models), registrations: tokens(preferences.registrations), favorites: favoritesKey.split(',') });
    if (!matches.length) return;
    setAlerts(previous => [...matches.map(aircraft => ({ key: `${snapshot.code}:${aircraft.hex}:${snapshot.receivedAt}`,
      text: `${snapshot.code} · ${aircraft.registration || aircraft.flight} · ${aircraft.type} a ${aircraft.distance.toFixed(1).replace('.', ',')} km`, hex: aircraft.hex, airport: snapshot.code })), ...previous].slice(0, 8));
  }, [snapshot, preferences, favoritesKey]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      setWeatherLoading(true);
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}weather.json`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error('weather');
        const data: unknown = await response.json();
        if (!validWeatherData(data)) throw new Error('weather');
        if (!controller.signal.aborted) { setWeather(data); setWeatherError(''); }
      } catch {
        if (!controller.signal.aborted) setWeatherError('Não foi possível atualizar a meteorologia.');
      } finally {
        pending = false;
        if (!controller.signal.aborted) setWeatherLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 300000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [open, weatherRevision]);
  const supported = ['GRU', 'GIG'].includes(snapshot.code);
  const station = snapshot.code === 'GIG' ? 'SBGL' : 'SBGR';
  const stale = !snapshot.receivedAt || now - snapshot.receivedAt > 60000;
  const queue = useMemo(() => approachQueue(snapshot.code, snapshot.traffic, snapshot.elevation), [snapshot]);
  const metar = weather?.metars.filter(row => row.icaoId === station).sort((a, b) => b.obsTime - a.obsTime)[0];
  const taf = weather?.tafs.filter(row => row.icaoId === station).sort((a, b) => Date.parse(b.issueTime) - Date.parse(a.issueTime))[0];
  const update = (patch: Partial<Preferences>) => setPreferences(value => ({ ...value, ...patch }));
  return <>
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger asChild><Button ref={trigger} type="button" variant="secondary">Torre e spotting{alerts.length ? ` (${alerts.length})` : ''}</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content className="spotting-panel" onInteractOutside={event => event.preventDefault()} onCloseAutoFocus={event => {
          if (trigger.current && trigger.current.getClientRects().length === 0) {
            event.preventDefault();
            document.getElementById('mobile-menu-toggle')?.focus();
          }
        }}>
          <div className="spotting-heading">
            <Dialog.Title>Torre e spotting</Dialog.Title>
            <Dialog.Close asChild><Button type="button" variant="ghost" aria-label="Fechar torre e spotting">Fechar</Button></Dialog.Close>
          </div>
          <Dialog.Description>Acompanhe GRU e GIG sem perder o mapa.</Dialog.Description>
          <div className="spotting-airports" aria-label="Aeroporto do spotting">
            {(['GRU', 'GIG'] as const).map(code => <Button key={code} variant="secondary" type="button" aria-pressed={snapshot.code === code} onClick={() => airportCommand({ type: 'airport', code })}>{code === 'GRU' ? 'GRU · Guarulhos' : 'GIG · Galeão'}</Button>)}
          </div>
          {!supported ? <p role="status">Escolha GRU ou GIG para abrir a torre, a meteorologia e as aproximações.</p> : <>
            <section aria-labelledby="tower-heading">
              <h3 id="tower-heading">Vista da pista</h3>
              <p>Ponto virtual junto à pista. A câmera permanece fixa ao selecionar aeronaves.</p>
              <label htmlFor="tower-runway">Pista da vista 3D</label>
              <select id="tower-runway" value={snapshot.towerRunway || ''} onChange={event => airportCommand({ type: 'tower', runway: event.target.value || null })}>
                <option value="">Visão geral do aeroporto</option>
                {RUNWAYS.filter(runway => runway.airport === snapshot.code).map(runway => <option key={runway.ends.join('/')} value={runway.ends.join('/')}>Torre 3D · {runway.ends.join(' / ')}</option>)}
              </select>
              {snapshot.towerRunway && <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Ver a pista no mapa</Button>}
            </section>
            <section aria-labelledby="approach-heading">
              <h3 id="approach-heading">Fila de aproximação</h3>
              <p>Ordenada por distância. Pista provável e tempo são estimativas pelo ADS-B, não a sequência autorizada de pouso.</p>
              {stale ? <p role="status">{snapshot.message || 'Sinal ADS-B desatualizado. Aguardando novas posições.'}</p> : queue.length === 0 ? <p role="status">Nenhuma aproximação identificada agora.</p> : <ol className="approach-queue">
                {queue.slice(0, 12).map(({ aircraft, runway, distance, minutes }) => <li key={aircraft.hex}>
                  <button type="button" onClick={() => airportCommand({ type: 'aircraft', hex: aircraft.hex })}>
                    <strong>{aircraft.flight}</strong><span>{distance.toFixed(1).replace('.', ',')} km · {minutes ? `~${minutes} min` : 'Tempo indeterminado'}</span>
                    <small>{aircraft.type} · {Math.round(aircraft.altitude).toLocaleString('pt-BR')} pés · {runway ? `Pista provável ${runway}` : 'Pista indeterminada'}</small>
                  </button>
                </li>)}
              </ol>}
            </section>
            <section aria-labelledby="weather-heading">
              <h3 id="weather-heading">Meteorologia · {snapshot.code}</h3>
              <p>Horário de Brasília · <a href="https://aviationweather.gov/data/api/" target="_blank" rel="noopener noreferrer">NOAA/AWC</a></p>
              {weatherLoading && !weather && <p role="status">Consultando meteorologia…</p>}
              {weatherError && <p role="alert">{weatherError} <button className="account-text-action" type="button" disabled={weatherLoading} onClick={() => setWeatherRevision(value => value + 1)}>Tentar novamente</button></p>}
              {metar ? <div className="weather-observation">
                <strong>Observado em {clock(metar.obsTime * 1000)}</strong>
                {now - metar.obsTime * 1000 > 90 * 60000 && <p className="spotting-warning" role="status">Observação desatualizada: há mais de 90 minutos.</p>}
                <p>{windText(metar)}<br />{visibilityText(metar, metar.rawOb)}<br />{conditionsText(metar, metar.rawOb)}</p>
                {metar.temp != null && <p>{metar.temp} °C{metar.altim != null ? ` · Pressão ${Math.round(metar.altim)} hPa` : ''}</p>}
                <details><summary>METAR original</summary><p className="weather-raw">{metar.rawOb}</p></details>
              </div> : !weatherLoading && <p>METAR indisponível para este aeroporto.</p>}
              {taf ? <details className="weather-forecast"><summary>Previsão TAF · até {clock(taf.validTimeTo * 1000)}</summary>
                {taf.validTimeTo * 1000 <= now ? <p className="spotting-warning">Previsão vencida. Aguarde uma nova atualização.</p> : taf.fcsts.filter(f => f.timeTo * 1000 > now && f.timeFrom * 1000 < now + 86400000).slice(0, 5).map((forecast, index) => <div key={index}>
                  <strong>{clock(forecast.timeFrom * 1000)} a {clock((forecast.timeBec || forecast.timeTo) * 1000)}</strong>
                  <p>{forecast.fcstChange === 'TEMPO' ? 'Temporariamente: ' : forecast.fcstChange === 'BECMG' ? 'Mudança gradual: ' : ''}{forecast.probability ? `${forecast.probability}% de probabilidade · ` : ''}{windText(forecast)} · {visibilityText(forecast)} · {conditionsText(forecast)}</p>
                </div>)}
                <p className="weather-raw">{taf.rawTAF}</p>
              </details> : !weatherLoading && <p>Previsão TAF indisponível.</p>}
            </section>
          </>}
          <section aria-labelledby="spotting-alert-heading">
            <h3 id="spotting-alert-heading">Alertas de spotting</h3>
            <p>Alertas nesta página para o aeroporto selecionado, enquanto ela estiver aberta. Preferências salvas neste navegador.</p>
            <label className="spotting-check"><input type="checkbox" checked={preferences.enabled} onChange={event => update({ enabled: event.target.checked })} />Ativar alertas de spotting</label>
            <label htmlFor="spotting-models">Modelos ICAO, separados por vírgula</label>
            <input id="spotting-models" value={preferences.models} maxLength={300} placeholder="A388, B744, B77W" onChange={event => update({ models: event.target.value })} />
            <label htmlFor="spotting-registrations">Matrículas, separadas por vírgula</label>
            <input id="spotting-registrations" value={preferences.registrations} maxLength={300} placeholder="PT-ABC, PR-XYZ" onChange={event => update({ registrations: event.target.value })} />
            <label className="spotting-check"><input type="checkbox" checked={preferences.favorites} disabled={!account.session} onChange={event => update({ favorites: event.target.checked })} />Incluir aeronaves favoritas da conta</label>
            {!account.session && <p>Entre na sua conta para usar seus favoritos nos alertas.</p>}
            <label htmlFor="spotting-radius">Avisar dentro de</label>
            <select id="spotting-radius" value={preferences.radius} onChange={event => update({ radius: Number(event.target.value) })}>{[20, 40, 80].map(radius => <option key={radius} value={radius}>{radius} km</option>)}</select>
            {preferences.enabled && !tokens(preferences.models).length && !tokens(preferences.registrations).length && !favoriteHexes.length && <p role="status">Adicione um modelo, uma matrícula ou um favorito para receber alertas.</p>}
            {alerts.length > 0 && <><ul className="spotting-alerts">{alerts.map(alert => <li key={alert.key}>{alert.text}</li>)}</ul><Button variant="secondary" type="button" onClick={() => setAlerts([])}>Limpar avisos</Button></>}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {!open && preferences.enabled && alerts.length > 0 && <div className="spotting-notice" role="status"><button type="button" onClick={() => setOpen(true)}>{alerts[0].text}<span>Abrir alertas de spotting</span></button><button type="button" aria-label="Dispensar avisos de spotting" onClick={() => setAlerts([])}>Fechar</button></div>}
  </>;
}
