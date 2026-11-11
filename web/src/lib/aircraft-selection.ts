import type { TrafficAircraft } from "./types";

export type AircraftSelection = Pick<
  TrafficAircraft,
  "hex" | "registration" | "flight" | "type"
> & { routeHint: string };
let selection: AircraftSelection | null = null;
const listeners = new Set<() => void>();

export const getAircraftSelection = () => selection;
export function subscribeAircraftSelection(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function selectAircraft(aircraft: AircraftSelection | null) {
  selection = aircraft;
  listeners.forEach((listener) => listener());
}

export type SavedAircraft = Pick<
  AircraftSelection,
  "hex" | "registration" | "type"
>;
const savedSelectionListeners = new Set<(aircraft: SavedAircraft) => void>();
export function openSavedAircraft(aircraft: SavedAircraft) {
  savedSelectionListeners.forEach((listener) => listener(aircraft));
}
export function subscribeSavedAircraft(
  listener: (aircraft: SavedAircraft) => void,
) {
  savedSelectionListeners.add(listener);
  return () => {
    savedSelectionListeners.delete(listener);
  };
}
