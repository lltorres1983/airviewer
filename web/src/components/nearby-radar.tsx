import { SkyCandidate } from "./sky-candidate";
import { RadarScope } from "./radar-scope";
import { LocalWeather } from "./local-weather";
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from './ui/button';
import { cameraHeading, directionCandidates, nearbyAircraft, type Observer, type NearbyAircraft, type CompassEvent } from '@/lib/nearby-radar';

function useNearbyTraffic(origin: Observer | null, radius: number) {
  const [data, setData] = useState<{ aircraft: NearbyAircraft[]; time: number; message: string }>({ aircraft: [], time: 0, message: '' });
  useEffect(() => {
    setData({ aircraft: [], time: 0, message: origin ? 'Consultando tráfego próximo…' : '' });
    if (!origin) return;
    const controller = new AbortController(); let pending = false, retryAt = 0;
    const load = async () => {
      if (pending || document.hidden || Date.now() < retryAt) return;
      pending = true;
      try {
        const response = await fetch(`https://proxy.cors.dev/https://api.adsb.lol/v2/point/${origin.latitude.toFixed(5)}/${origin.longitude.toFixed(5)}/${Math.ceil(radius / 1.852)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (response.status === 429) {
          const after = response.headers.get('Retry-After') || '';
          retryAt = Math.max(Date.now() + 60000, /^\d+$/.test(after) ? Date.now() + Number(after) * 1000 : Date.parse(after) || 0);
        }
        if (!response.ok) throw new Error();
        const json = await response.json();
        if (!Array.isArray(json.ac) || !Number.isFinite(json.now) || Date.now() - json.now > 60000 || json.now - Date.now() > 60000) throw new Error();
        if (!controller.signal.aborted) setData({ aircraft: nearbyAircraft(json.ac, origin, radius), time: Date.now(), message: '' });
      } catch { if (!controller.signal.aborted) setData(previous => ({ ...previous, message: Date.now() < retryAt ? 'Limite da fonte atingido. Aguardando nova tentativa.' : 'Tráfego indisponível. Tentando novamente automaticamente…' })); }
      finally { pending = false; }
    };
    void load(); const timer = setInterval(() => void load(), 20000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [origin, radius]);
  return data;
}

export function NearbyRadar() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button ref={trigger} variant="secondary">Radar perto de mim</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="observatory-overlay" /><Dialog.Content className="observatory-panel nearby-panel" onCloseAutoFocus={event => {
      event.preventDefault(); (trigger.current?.getClientRects().length ? trigger.current : document.querySelector<HTMLButtonElement>('#mobile-menu-toggle'))?.focus();
    }}><div className="observatory-header"><div><Dialog.Title>Radar perto de mim</Dialog.Title><Dialog.Description>Localização atual e guia de aviões pela câmera.</Dialog.Description></div><Dialog.Close asChild><button aria-label="Fechar radar perto de mim">Fechar</button></Dialog.Close></div>
      <NearbyRadarContent />
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
function NearbyRadarContent() {
  const [origin, setOrigin] = useState<Observer | null>(null);
  const [radius, setRadius] = useState(20);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [selected, setSelected] = useState('');
  const [now, setNow] = useState(Date.now());
  const request = useRef(0);
  const cameraSection = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => { request.current++; clearInterval(timer); }; }, []);
  const feed = useNearbyTraffic(origin, radius);
  const aircraft = feed.time && now - feed.time <= 60000 ? feed.aircraft : [];
  const locate = () => {
    if (!navigator.geolocation) { setLocationError('Localização indisponível neste navegador.'); return; }
    const version = ++request.current; setLocating(true); setLocationError('');
    navigator.geolocation.getCurrentPosition(position => {
      if (request.current !== version) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0) { setLocationError('O celular não forneceu uma localização válida. Tente novamente.'); setLocating(false); return; }
      setOrigin({ latitude, longitude, accuracy, time: Date.now() }); setSelected(''); setLocating(false);
    }, error => {
      if (request.current !== version) return;
      setLocating(false); setLocationError(error.code === 1 ? 'Acesso à localização negado. Libere a permissão nas configurações do navegador e tente novamente.' : 'Não foi possível obter sua posição. Vá para uma área aberta e tente novamente.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  };
  const current = aircraft.find(a => a.hex === selected);
  const locationFresh = Boolean(origin && now - origin.time <= 120000 && origin.accuracy <= 100);
  return <>
    <p>Use onde você estiver, sem entrar na conta nem alterar o endereço de casa. Para buscar os voos, as coordenadas são enviadas à fonte ADS-B pelo proxy e à Open-Meteo para a meteorologia; a câmera permanece no celular.</p>
    <div className="observatory-toolbar"><button onClick={locate} disabled={locating}>{locating ? 'Obtendo localização…' : origin ? 'Atualizar minha localização' : 'Usar localização agora'}</button><label>Raio <select aria-label="Raio do radar" value={radius} onChange={e => { setRadius(Number(e.target.value)); setSelected(''); }}><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option></select></label>{origin && <button onClick={() => cameraSection.current?.scrollIntoView({ block: 'start' })}>Ir para câmera</button>}</div>
    {locationError && <p role="alert">{locationError}</p>}
    {origin && <>
      <p>Posição obtida às {new Date(origin.time).toLocaleTimeString('pt-BR')} · precisão de aproximadamente {Math.round(origin.accuracy)} m. Atualize se você se deslocar.</p>
      {!locationFresh && <p role="status">Atualize a localização em uma área aberta para usar o guia da câmera (precisão de até 100 m e posição recente).</p>}
      <div className="nearby-layout"><section aria-label="Radar da localização atual">
        <RadarScope aircraft={aircraft} radius={radius} selected={selected} onSelect={setSelected} fresh={Boolean(feed.time && now - feed.time <= 60000)} />
        <p role="status">{feed.message || (!feed.time ? 'Consultando tráfego…' : now - feed.time > 60000 ? 'Sinal desatualizado. Aguardando posições recentes.' : `${aircraft.length} aeronaves próximas · atualização ${new Date(feed.time).toLocaleTimeString('pt-BR')}`)}</p>
        {current && <p className="nearby-selection"><strong>{current.flight}</strong> · {current.registration || current.hex} · {current.type || 'Modelo não informado'} · {current.distance.toFixed(1)} km · direção {Math.round(current.bearing)}°</p>}
        <ol className="nearby-flights">{aircraft.map(a => <li key={a.hex}><button aria-pressed={a.hex === selected} onClick={() => setSelected(a.hex)}>{a.flight} · {a.distance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km <small>{a.altitude === null ? 'Altitude indisponível' : `${Math.round(a.altitude).toLocaleString('pt-BR')} pés`}</small></button></li>)}</ol>
        <p className="observatory-note">Posições <a href="https://www.adsb.lol/" target="_blank" rel="noopener noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>. Nem toda aeronave estará disponível.</p>
      </section><div><LocalWeather origin={origin} now={now} /><div ref={cameraSection}><SkyCamera aircraft={aircraft} locationFresh={locationFresh} now={now} /></div></div></div>
    </>}
  </>;
}

function SkyCamera({ aircraft, locationFresh, now }: { aircraft: NearbyAircraft[]; locationFresh: boolean; now: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orientation, setOrientation] = useState<{ heading: number | null; time: number }>({ heading: null, time: 0 });
  const [offset, setOffset] = useState(0);
  const [sensorAllowed, setSensorAllowed] = useState(false);
  const stop = () => { generation.current++; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setEnabled(false); setBusy(false); setSensorAllowed(false); setOrientation({ heading: null, time: 0 }); };
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { generation.current++; stream.current?.getTracks().forEach(track => track.stop()); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    if (!enabled || !sensorAllowed) return;
    let last = 0;
    const listener = (event: DeviceOrientationEvent) => {
      if (!event.absolute && typeof (event as unknown as CompassEvent).webkitCompassHeading !== 'number') return;
      if (Date.now() - last < 100) return; last = Date.now();
      setOrientation({ heading: cameraHeading(event as unknown as CompassEvent), time: last });
    };
    window.addEventListener('deviceorientationabsolute', listener);
    window.addEventListener('deviceorientation', listener);
    return () => { window.removeEventListener('deviceorientationabsolute', listener); window.removeEventListener('deviceorientation', listener); };
  }, [enabled, sensorAllowed]);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { setError('Câmera indisponível. Abra o site em HTTPS no navegador do celular.'); return; }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setEnabled(false); setSensorAllowed(false);
    const version = ++generation.current; setBusy(true); setError(''); setOrientation({ heading: null, time: 0 });
    const sensor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<string> };
    // Both permission requests originate in this click, before any await (Safari).
    const permission = (() => {
      try { return sensor?.requestPermission ? sensor.requestPermission(true).catch(() => 'denied') : Promise.resolve(sensor ? 'granted' : 'denied'); }
      catch { return Promise.resolve('denied'); }
    })();
    const camera = navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    try {
      const media = await camera;
      if (version !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      media.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (version === generation.current) stop(); }, { once: true }));
      const granted = await permission;
      if (version !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      setSensorAllowed(granted === 'granted');
      if (granted !== 'granted') setError('Bússola não autorizada ou indisponível. A câmera não identificará direções; use o radar.');
      if (video.current) {
        video.current.srcObject = media;
        let playbackTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([video.current.play(), new Promise<never>((_, reject) => {
            playbackTimeout = setTimeout(() => reject(new Error('A câmera não iniciou o vídeo.')), 10000);
          })]);
        } finally { clearTimeout(playbackTimeout); }
      }
      if (version === generation.current) setEnabled(true);
    } catch (failure) {
      if (version !== generation.current) return;
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setEnabled(false);
      const name = failure instanceof DOMException ? failure.name : '';
      setError(name === 'NotAllowedError' ? 'Permissão de câmera negada. Libere o acesso nas configurações do navegador e tente novamente.' : name === 'OverconstrainedError' || name === 'NotFoundError' ? 'Câmera traseira não disponível neste dispositivo. Use o radar.' : 'Não foi possível abrir a câmera. Feche outros aplicativos que a estejam usando e tente novamente.');
    } finally { if (version === generation.current) setBusy(false); }
  }
  const heading = enabled && sensorAllowed && orientation.heading !== null && now - orientation.time <= 10000 && locationFresh ? (orientation.heading + offset + 360) % 360 : null;
  const candidates = directionCandidates(aircraft, heading);
  return <section className="sky-guide" aria-label="Apontar para o céu"><h3>Apontar para o céu</h3>
    <p>No iPhone, abra no Safari e permita o acesso à câmera e à orientação ao tocar no botão.</p>
    <p>Guia experimental: cruza a direção da câmera com os voos ADS-B. Não reconhece o avião pela imagem nem confirma qual objeto você está vendo.</p>
    <div className="observatory-toolbar"><button disabled={busy || !locationFresh} onClick={() => void start()}>{busy ? 'Abrindo câmera…' : enabled ? 'Reativar câmera e bússola' : 'Ativar câmera e bússola'}</button>{(enabled || busy) && <button onClick={stop}>Desligar câmera</button>}</div>
    <div className={`sky-view${enabled ? ' is-enabled' : ''}`}>
      <video ref={video} autoPlay muted playsInline aria-label="Imagem da câmera traseira" />
      {!enabled && <p className="sky-placeholder">Ative a câmera traseira para procurar voos nesta direção.</p>}
      {enabled && <div className="sky-overlay"><p>{heading === null ? 'Sem direção confiável' : `Direção aproximada: ${Math.round(heading)}°`}</p><div className="sky-candidates">
        {heading !== null && <strong>Possíveis voos à frente · ±20°</strong>}
        {candidates.map(a => <SkyCandidate key={`${a.hex}:${a.registration}`} aircraft={a} />)}
        {heading !== null && !candidates.length && <p>Nenhum voo com sinal recente nesta direção.</p>}
        {heading === null && <p>Segure o celular em pé, sem inclinar para os lados. Mova-o suavemente; se a bússola não responder, use o radar.</p>}
      </div></div>}
    </div>
    {error && <p role="alert">{error}</p>}
    {enabled && <><label className="sky-calibration">Correção da bússola: {offset}°<input aria-label="Correção da bússola" type="range" min="-180" max="180" step="1" value={offset} onChange={e => setOffset(Number(e.target.value))} /></label><button onClick={() => setOffset(0)}>Zerar correção</button><p className="observatory-note">Ajuste apenas se souber a direção real. O guia compara o azimute, sem calcular a posição exata do avião na imagem. Interferência magnética e atraso dos dados afetam o resultado.</p></>}
  </section>;
}
