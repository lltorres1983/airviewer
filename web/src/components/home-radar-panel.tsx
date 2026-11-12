import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from './ui/button';
import { useAccount } from '@/providers/account-provider';
import { useHomeRadar } from '@/providers/home-radar-provider';

export function HomeRadarTrigger() {
  const account = useAccount();
  const radar = useHomeRadar();
  return <Button variant="secondary" type="button" aria-pressed={radar.active}
    onClick={() => {
      if (radar.active) radar.deactivate();
      else if (radar.home) radar.activate();
      else account.openPanel();
    }}>{radar.active ? 'Sair do radar de casa' : 'Radar da minha casa'}</Button>;
}

export function HomeRadarPanel() {
  const radar = useHomeRadar();
  const account = useAccount();
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('20');
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const locationRequest = useRef(0);
  useEffect(() => {
    setAddress(radar.home?.address || '');
    setLatitude(radar.home ? String(radar.home.latitude) : '');
    setLongitude(radar.home ? String(radar.home.longitude) : '');
    setRadius(String(radar.home?.radius_km || 20));
  }, [radar.home]);
  useEffect(() => () => { locationRequest.current++; }, []);
  const locate = () => {
    if (!navigator.geolocation) { setMessage('Localização indisponível neste navegador. Informe as coordenadas.'); return; }
    const request = ++locationRequest.current;
    setLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(position => {
      if (locationRequest.current !== request) return;
      setAddress(value => value.trim() ? value : 'Minha casa');
      setLatitude(position.coords.latitude.toFixed(6));
      setLongitude(position.coords.longitude.toFixed(6));
      setLocating(false);
      setMessage(`Localização obtida, precisão aproximada de ${Math.round(position.coords.accuracy)} m. Confira antes de salvar.`);
    }, () => {
      if (locationRequest.current !== request) return;
      setLocating(false);
      setMessage('Não foi possível obter sua localização. Permita o acesso ou informe as coordenadas.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    if (await radar.save({ address, latitude: Number(latitude), longitude: Number(longitude), radius_km: Number(radius) }))
      setMessage('Localização salva na sua conta. Você já pode abrir o radar.');
  }
  return <section className="home-radar-settings" aria-labelledby="home-radar-title">
    <h2 id="home-radar-title">Radar da minha casa</h2>
    <p>Veja quem está se aproximando em um mapa 3D, com anéis de distância. Sua localização fica privada na sua conta.</p>
    {radar.loading ? <p role="status">Carregando localização…</p> : <form onSubmit={event => void submit(event)}>
      <fieldset disabled={radar.busy || locating}>
        <label htmlFor="home-address">Endereço ou referência</label>
        <input id="home-address" value={address} onChange={event => setAddress(event.target.value)} required maxLength={300} autoComplete="street-address" placeholder="Rua, número, cidade e estado" />
        <Button variant="secondary" type="button" onClick={locate}>{locating ? 'Obtendo localização…' : 'Usar minha localização atual'}</Button>
        <p className="home-radar-hint">Estando em casa, use sua localização atual. Você também pode copiar as coordenadas de um mapa. A localização preenche as coordenadas e usa “Minha casa” como referência se o nome estiver vazio. Você pode informar rua e número acima.</p>
        <div className="home-radar-coordinates">
          <label>Latitude<input aria-label="Latitude da casa" type="number" step="any" min="-85" max="85" required value={latitude} onChange={event => setLatitude(event.target.value)} /></label>
          <label>Longitude<input aria-label="Longitude da casa" type="number" step="any" min="-180" max="180" required value={longitude} onChange={event => setLongitude(event.target.value)} /></label>
        </div>
        <label htmlFor="home-radius">Distância de monitoramento</label>
        <select id="home-radius" value={radius} onChange={event => setRadius(event.target.value)}>
          <option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option>
        </select>
        <Button type="submit">{radar.busy ? 'Salvando…' : 'Salvar localização'}</Button>
      </fieldset>
    </form>}
    {radar.error && <div role="alert"><p>{radar.error}</p><button className="account-text-action" onClick={radar.reload} disabled={radar.busy}>Tentar carregar novamente</button></div>}
    {message && <p role="status">{message}</p>}
    {radar.home && <div className="home-radar-actions">
      <Button type="button" disabled={radar.busy} onClick={() => { radar.activate(); account.closePanel(); }}>Abrir radar 3D</Button>
      <Button type="button" variant="secondary" disabled={radar.busy} onClick={async () => {
        setMessage('');
        if (await radar.remove()) setMessage('Localização excluída da sua conta.');
      }}>Excluir localização</Button>
    </div>}
  </section>;
}
