export type DiaryDraft = { hex: string; registration: string; type: string; flight: string; airport: string; observedAt: string };
export type ObservatoryTab = 'replay' | 'compare' | 'diary';
let state: { open: boolean; tab: ObservatoryTab; draft: DiaryDraft | null } = { open: false, tab: 'replay', draft: null };
const listeners = new Set<() => void>();
export const getObservatory = () => state;
export function subscribeObservatory(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function openObservatory(tab: ObservatoryTab = 'replay', draft: DiaryDraft | null = null) {
  state = { open: true, tab, draft: tab === 'diary' ? draft : null }; listeners.forEach(fn => fn());
}
export function closeObservatory() { state = { ...state, open: false }; listeners.forEach(fn => fn()); }
