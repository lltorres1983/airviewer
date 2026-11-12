import { useEffect, useState } from 'react';
import App from './App';
import { SkyCameraPage } from './components/sky-camera-page';
export function AppRouter() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => { const update = () => setHash(window.location.hash); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  return hash === '#/camera' ? <SkyCameraPage /> : <App />;
}
