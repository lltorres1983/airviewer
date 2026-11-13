import type Hls from 'hls.js';

/** Owns the stream so switching cameras or hiding the panel releases the network. */
export function trafficCamera(video: HTMLVideoElement, error: HTMLElement) {
  let player: Hls | undefined;
  let currentUrl = '';
  let generation = 0;
  const failed = () => { if (currentUrl) error.hidden = false; };
  video.addEventListener('error', failed);

  function stop() {
    generation++;
    currentUrl = '';
    player?.destroy();
    player = undefined;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
    error.hidden = true;
  }

  async function show(url: string) {
    if (url === currentUrl) return;
    stop();
    currentUrl = url;
    const request = generation;
    video.hidden = false;
    video.muted = true;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      void video.play().catch(() => { /* Native controls allow manual playback. */ });
      return;
    }
    try {
      const { default: Hls } = await import('hls.js');
      if (request !== generation) return;
      if (!Hls.isSupported()) { failed(); return; }
      player = new Hls({ maxBufferLength: 10, maxMaxBufferLength: 20 });
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) { player?.destroy(); player = undefined; failed(); }
      });
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => { /* Keep controls available if autoplay is blocked. */ });
      });
      player.loadSource(url);
      player.attachMedia(video);
    } catch { if (request === generation) failed(); }
  }

  return { show, stop, dispose() { stop(); video.removeEventListener('error', failed); } };
}
