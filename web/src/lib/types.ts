import type { Airline } from "./aircraft-data";

export interface CameraSource {
  id: string;
  label: string;
  videoId?: string;
  channelId?: string;
  playlistId?: string;
  externalUrl?: string;
  isLive?: boolean;
  isArchive?: boolean;
}

export interface Airport {
  code: string;
  name: string;
  lat: number;
  lon: number;
  elevationFeet: number;
  radiusKm: number;
  feedRadiusNm: number;
  distance?: number;
  photoUrl?: string;
  videoId?: string;
  videoLabel?: string;
  videoSearchUrl?: string;
  videoChannelId?: string;
  extraVideoId?: string;
  extraVideoLabel?: string;
  liveSources?: CameraSource[];
  archiveSources?: CameraSource[];
  videoChoices?: { videoId: string; label?: string }[];
}

export interface ScheduledFlight {
  flight: string;
  direction: "arrival" | "departure";
  time: number;
  airport: string;
}

export interface Schedule {
  start: number;
  end: number;
  airports: Record<string, ScheduledFlight[]>;
}

export interface TrafficAircraft {
  hex: string;
  registration: string;
  flight: string;
  type: string;
  lat: number;
  lon: number;
  altitude: number;
  track: number;
  verticalRate: number;
  groundSpeed: number;
  distance: number;
  airportBearing: number;
  headingDifference: number;
  onGround: boolean;
  movement: string;
}

export interface TrafficState extends TrafficAircraft {
  startLat: number;
  startLon: number;
  startTrack: number;
  targetLat: number;
  targetLon: number;
  targetTrack: number;
  startedAt: number;
  duration: number;
  lastSeenAt: number;
}

export interface AdsbAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  track?: number;
  calc_track?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  gs?: number;
  seen_pos?: number;
}

export interface AdsbResponse {
  ac: AdsbAircraft[];
  now?: number;
  total?: number;
}

export interface FlightRoute {
  origin: string;
  destination: string;
  originName: string;
  destinationName: string;
  originAirport: string;
  destinationAirport: string;
  airline: Airline | null;
  updatedAt: string;
}
