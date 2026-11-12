import { useEffect, useState } from 'react';
import { FOCUS_AIRPORTS, useComparisonFeed } from '@/lib/comparison-feed';
import { approachQueue } from '@/lib/airport-operations';
import { validWeatherData, windText, visibilityText, type WeatherData } from '@/lib/airport-weather';
import { openObservatory } from '@/lib/observatory-ui';
import type { FocusAirport } from '@/lib/traffic-recording';
import { TrafficMap } from './traffic-map';
function AirportColumn({ airport, weather }: { airport: FocusAirport; weather: WeatherData | null }) {
  const snapshot = useComparisonFeed(airport);
  const [now, setNow] = useState(Date.now());
  const [camera, setCamera] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  const fresh = snapshot.receivedAt > 0 && now - snapshot.receivedAt <= 60000;
  const traffic = fresh ? snapshot.traffic : [];
  const queue = approachQueue(airport, traffic, FOCUS_AIRPORTS[airport].elevation).slice(0, 5);
  const metar = weather?.metars.find(m => m.icaoId === FOCUS_AIRPORTS[airport].station);
  return <section className="airport-column" aria-label={`Comparação ${airport}`}>
    <h3>{airport} <span>{FOCUS_AIRPORTS[airport].name}</span></h3>
    <p role="status">{snapshot.message || (fresh ? `${traffic.length} ${traffic.length === 1 ? 'aeronave' : 'aeronaves'} · atualização ${new Date(snapshot.receivedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Aguardando posições recentes…')}</p>
    <TrafficMap airport={airport} aircraft={traffic} />
    {metar ? <div className="comparison-weather"><strong>{now - metar.obsTime * 1000 > 90 * 60000 ? 'METAR desatualizado' : 'METAR'}</strong><p>{windText(metar)} · {visibilityText(metar, metar.rawOb)}</p><details><summary>Boletim e horário</summary><p>{new Date(metar.obsTime * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)</p><p>{metar.rawOb}</p></details></div> : <p>METAR indisponível</p>}
    <h4>Próximas aproximações estimadas</h4>
    {queue.length ? <ul className="comparison-queue">{queue.map(item => <li key={item.aircraft.hex}><div><strong>{item.aircraft.flight}</strong><span>{item.aircraft.type} · {item.runway ? `Pista provável ${item.runway}` : 'Pista não identificada'} · {item.distance.toFixed(1)} km</span></div><button aria-label={`Registrar ${item.aircraft.flight} no diário`} onClick={() => openObservatory('diary', { hex: item.aircraft.hex, registration: item.aircraft.registration, type: item.aircraft.type, flight: item.aircraft.flight, airport, observedAt: new Date().toISOString() })}>Registrar</button></li>)}</ul> : <p>Nenhuma aproximação identificada.</p>}
    <p className="observatory-note">Estimativas ADS-B; não são instruções de controle de tráfego.</p>
    <h4>Câmera</h4>
    {airport === 'GRU' ? <><button onClick={() => setCamera(!camera)}>{camera ? 'Fechar câmera GRU' : 'Abrir câmera GRU'}</button>{camera && <iframe className="comparison-camera" title="Câmera de Guarulhos" src="https://www.youtube-nocookie.com/embed/live_stream?channel=UCNZCKDhAVtbh7sddChTxI7w" allow="encrypted-media; picture-in-picture" allowFullScreen />}</> : <p>Sem câmera ao vivo verificada para o Galeão.</p>}
  </section>;
}
export function AirportComparison() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}weather.json`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error();
        const data: unknown = await response.json();
        if (!validWeatherData(data)) throw new Error();
        if (!controller.signal.aborted) { setWeather(data); setError(''); }
      } catch { if (!controller.signal.aborted) setError('Não foi possível atualizar a meteorologia.'); }
    };
    void load(); const timer = setInterval(() => void load(), 300000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return <><p>Mapas independentes · horários de Brasília · tráfego atualizado enquanto esta comparação estiver aberta.</p>{error && <p role="alert">{error}</p>}<div className="airport-comparison"><AirportColumn airport="GRU" weather={weather} /><AirportColumn airport="GIG" weather={weather} /></div></>;
}
