import { useEffect, useRef, useState } from 'react';
import { SkyCandidate } from './sky-candidate';
import { cameraHeading, directionCandidates, type NearbyAircraft, type CompassEvent } from '@/lib/nearby-radar';

export function SkyCamera({ aircraft, locationFresh, now }: { aircraft: NearbyAircraft[]; locationFresh: boolean; now: number }) {
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
