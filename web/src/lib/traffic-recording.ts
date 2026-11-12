import { getAirportSnapshot, subscribeAirportSnapshot, type AirportSnapshot } from './airport-operations';
import type { TrafficAircraft } from './types';
import { openObservatoryDB, requestResult, transactionDone } from './observatory-db';
export type FocusAirport = 'GRU' | 'GIG';
export type TrafficFrame = { id: string; airport: FocusAirport; time: number; aircraft: TrafficAircraft[] };
export const RECORDING_WINDOW = 60 * 60 * 1000;
const FRAME_LIMIT = 240;
export function trimFrames(frames: TrafficFrame[], now = Date.now()) {
  const unique = new Map(frames.filter(frame => frame.time >= now - RECORDING_WINDOW && frame.time <= now + 60000)
    .map(frame => [frame.id, frame]));
  return (['GRU', 'GIG'] as const).flatMap(airport => [...unique.values()].filter(frame => frame.airport === airport)
    .sort((a, b) => a.time - b.time).slice(-FRAME_LIMIT)).sort((a, b) => a.time - b.time);
}
export function frameAt(frames: TrafficFrame[], time: number): TrafficFrame | null {
  // Never interpolate across a reception gap or show a future observation.
  const frame = [...frames].reverse().find(frame => frame.time <= time);
  return frame && time - frame.time <= 60000 ? frame : null;
}
let state: { frames: TrafficFrame[]; persistent: boolean; loaded: boolean } = { frames: [], persistent: true, loaded: false };
const listeners = new Set<() => void>();
export const getRecording = () => state;
export function subscribeRecording(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function emit() { listeners.forEach(fn => fn()); }
let initialized: Promise<void> | null = null;
let writeQueue = Promise.resolve();
let generation = 0;
export function loadRecording() {
  if (!initialized) initialized = (async () => {
    const version = generation;
    try {
      const db = await openObservatoryDB();
      const stored = await requestResult<TrafficFrame[]>(db.transaction('frames').objectStore('frames').getAll());
      if (version !== generation) return;
      state = { frames: trimFrames([...stored.filter(validFrame), ...state.frames]), persistent: true, loaded: true };
    } catch { state = { ...state, persistent: false, loaded: true }; }
    emit();
  })();
  return initialized;
}
function validFrame(frame: TrafficFrame) {
  return frame && ['GRU', 'GIG'].includes(frame.airport) && Number.isFinite(frame.time) && Array.isArray(frame.aircraft) &&
    frame.aircraft.every(a => a && typeof a.hex === 'string' && Number.isFinite(a.lat) && Number.isFinite(a.lon));
}
export function recordAirportSnapshot(snapshot: AirportSnapshot) {
  if (!['GRU', 'GIG'].includes(snapshot.code) || !snapshot.receivedAt || Date.now() - snapshot.receivedAt > 60000) return;
  const airport = snapshot.code as FocusAirport;
  const id = `${airport}:${snapshot.receivedAt}`;
  if (state.frames.some(frame => frame.id === id)) return;
  const frame: TrafficFrame = { id, airport, time: snapshot.receivedAt, aircraft: snapshot.traffic.slice(0, 200).map(a => ({ ...a })) };
  state = { ...state, frames: trimFrames([...state.frames, frame]) };
  emit();
  const version = generation;
  writeQueue = writeQueue.then(async () => {
    if (version !== generation) return;
    try {
      await loadRecording();
      const db = await openObservatoryDB();
      if (version !== generation) return;
      const transaction = db.transaction('frames', 'readwrite');
      const done = transactionDone(transaction);
      const store = transaction.objectStore('frames');
      store.put(frame);
      const retained = new Set(state.frames.map(row => row.id));
      const keys = store.getAllKeys();
      keys.onsuccess = () => keys.result.forEach(key => { if (!retained.has(String(key))) store.delete(key); });
      await done;
    } catch { state = { ...state, persistent: false }; emit(); }
  });
}
export function clearRecording() {
  generation++;
  state = { ...state, frames: [], loaded: true };
  emit();
  const operation = writeQueue.then(async () => {
    const db = await openObservatoryDB();
    const transaction = db.transaction('frames', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('frames').clear();
    await done;
  });
  // Future samples queue after deletion, even if persistent storage is unavailable.
  writeQueue = operation.catch(() => { state = { ...state, persistent: false }; emit(); });
  return operation;
}
export function startTrafficRecording() {
  void loadRecording();
  const capture = () => recordAirportSnapshot(getAirportSnapshot());
  capture();
  const unsubscribe = subscribeAirportSnapshot(capture);
  const timer = setInterval(() => { state = { ...state, frames: trimFrames(state.frames) }; emit(); }, 60000);
  return () => { unsubscribe(); clearInterval(timer); };
}
