import type { FlightRoute } from "./types";

export interface Airline {
  name: string;
  country: string;
  icao: string;
  iata: string;
  callsign: string;
}
export interface AircraftPhoto {
  src: string;
  link: string;
  photographer: string;
}
export interface AircraftRegistration {
  registration: string;
  type: string;
}

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object"
    ? (value as JsonObject)
    : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function httpsUrl(value: unknown, hosts: string[]): string {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && hosts.includes(url.hostname)
      ? url.href
      : "";
  } catch {
    return "";
  }
}
async function json(url: string, signal: AbortSignal): Promise<JsonObject> {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`Consulta HTTP ${response.status}`);
  return object(await response.json());
}
function airline(value: unknown): Airline | null {
  const data = object(value);
  if (!text(data.name)) return null;
  return {
    name: text(data.name),
    country: text(data.country),
    icao: text(data.icao),
    iata: text(data.iata),
    callsign: text(data.callsign),
  };
}
const routes = new Map<string, { value: FlightRoute; expires: number }>();
export async function fetchFlightRoute(
  flight: string,
  signal: AbortSignal,
): Promise<FlightRoute | null> {
  const callsign = flight.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(callsign)) return null;
  const cached = routes.get(callsign);
  if (cached && cached.expires > Date.now()) return cached.value;
  const data = await json(
    `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
    signal,
  );
  const route = object(object(data.response).flightroute);
  if (!Object.keys(route).length) return null;
  const origin = object(route.origin),
    destination = object(route.destination);
  const result: FlightRoute = {
    origin: text(origin.iata_code) || text(origin.icao_code),
    destination: text(destination.iata_code) || text(destination.icao_code),
    originName: text(origin.municipality),
    destinationName: text(destination.municipality),
    originAirport: text(origin.name),
    destinationAirport: text(destination.name),
    airline: airline(route.airline),
    updatedAt: new Date().toISOString(),
  };
  if (routes.size >= 200) routes.delete(routes.keys().next().value!);
  routes.set(callsign, { value: result, expires: Date.now() + 5 * 60000 });
  return result;
}
export async function fetchAirline(
  flight: string,
  signal: AbortSignal,
): Promise<Airline | null> {
  // Only a valid ICAO flight callsign identifies an airline; registrations do not.
  const code = /^([A-Z]{3})\d/.exec(flight.trim().toUpperCase())?.[1];
  if (!code) return null;
  const data = await json(`https://api.adsbdb.com/v0/airline/${code}`, signal);
  const entries = object(data.response).airline;
  const candidates = Array.isArray(entries) ? entries : [entries];
  return candidates.map(airline).find((item) => item?.icao === code) || null;
}
export async function fetchRegistration(
  hex: string,
  signal: AbortSignal,
): Promise<AircraftRegistration | null> {
  if (!/^[a-f0-9]{6}$/i.test(hex)) return null;
  const data = await json(`https://api.adsbdb.com/v0/aircraft/${hex}`, signal);
  const aircraft = object(object(data.response).aircraft);
  const registration = text(aircraft.registration).toUpperCase();
  return registration
    ? { registration, type: text(aircraft.icao_type) || text(aircraft.type) }
    : null;
}
export async function fetchAircraftPhoto(
  registration: string,
  signal: AbortSignal,
  size: "small" | "large" = "large",
): Promise<AircraftPhoto | null> {
  const prefix = registration.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,12}$/.test(prefix)) return null;
  const data = await json(
    `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(prefix)}`,
    signal,
  );
  if (!Array.isArray(data.photos)) return null;
  for (const value of data.photos) {
    const photo = object(value);
    const src = httpsUrl(
      size === "small"
        ? object(photo.thumbnail).src || object(photo.thumbnail_large).src
        : object(photo.thumbnail_large).src || object(photo.thumbnail).src,
      ["t.plnspttrs.net"],
    );
    const link = httpsUrl(photo.link, [
      "www.planespotters.net",
      "planespotters.net",
    ]);
    const photographer = text(photo.photographer);
    if (src && link && photographer) return { src, link, photographer };
  }
  return null;
}
