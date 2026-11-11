/** Top-down, north-facing silhouettes. ICAO designators from adsb.lol/live/aircraft.
 * These represent aircraft families, not exact manufacturer drawings.
 */
const models = {
  airliner: 'A318 A319 A320 A321 A19N A20N A21N B731 B732 B733 B734 B735 B736 B737 B738 B739 B37M B38M B39M B3XM B712 B721 B722 B752 B753 MD81 MD82 MD83 MD87 MD88 MD90',
  heavy: 'A30B A306 A310 A332 A333 A338 A339 A342 A343 A345 A346 A359 A35K A388 B741 B742 B743 B744 B748 B762 B763 B764 B772 B773 B77L B77W B778 B779 B788 B789 B78X DC10 MD11',
  regional: 'E170 E175 E190 E195 E290 E295 E75L E75S E135 E145 CRJ1 CRJ2 CRJ7 CRJ9 CRJX A220 BCS1 BCS3 F70 F100',
  business: 'C500 C510 C525 C25A C25B C25C C25M C550 C560 C56X C650 C680 C68A C700 C750 E50P E55P E550 E545 E35L E35S LJ31 LJ35 LJ40 LJ45 LJ55 LJ60 LJ70 LJ75 GLF4 GLF5 GLF6 GLEX GL5T GL7T CL30 CL35 CL60 FA50 F900 FA7X FA8X FA6X',
  turboprop: 'AT43 AT44 AT45 AT46 AT72 AT73 AT75 AT76 DH8A DH8B DH8C DH8D DHC6 SF34 SB20 E110 E120 B350 BE20 BE30 BE9L BE9T C208 C212 PC12 TBM7 TBM8 TBM9 P180',
  light: 'C150 C152 C162 C172 C177 C180 C182 C185 C206 C210 C310 C340 C402 C414 C421 PA18 PA24 PA28 PA32 PA34 PA44 PA46 SR20 SR22 S22T DA20 DA40 DA42 DA62 BE36 BE58 M20P M20T RV7 RV8 RV9 RV10',
  helicopter: 'AS50 AS55 AS65 EC20 EC25 EC30 EC35 EC45 EC55 H125 H130 H135 H145 H160 H175 H225 R22 R44 R66 B06 B47 B407 B412 B429 B430 B505 A109 A119 A139 A169 A189 S76 S92',
} as const;
export type AircraftIconKind = keyof typeof models | 'generic';
export const aircraftIconKinds: AircraftIconKind[] = [...Object.keys(models) as (keyof typeof models)[], 'generic'];
const kindsByModel = new Map<string, AircraftIconKind>(Object.entries(models).flatMap(([kind, codes]) => codes.split(' ').map(code => [code, kind as AircraftIconKind])));
export function aircraftIconKind(type: string | undefined): AircraftIconKind {
  return kindsByModel.get((type || '').trim().toUpperCase()) || 'generic';
}
// Coordinates share a 56px canvas and a north-facing nose for map rotation.
const silhouettes: Record<AircraftIconKind, string> = {
  generic: 'M28 4 Q33 8 33 23 L51 33 L51 38 L33 33 L32 44 L39 49 L39 52 L28 48 L17 52 L17 49 L24 44 L23 33 L5 38 L5 33 L23 23 Q23 8 28 4 Z',
  airliner: 'M28 3 Q32 6 32 23 L49 33 L50 38 L32 32 L31 44 L38 49 L38 52 L28 48 L18 52 L18 49 L25 44 L24 32 L6 38 L7 33 L24 23 Q24 6 28 3 Z M17 26 L20 26 L20 34 L17 34 Z M36 26 L39 26 L39 34 L36 34 Z',
  heavy: 'M28 3 Q34 7 34 23 L52 34 L52 40 L34 33 L32 44 L41 49 L41 52 L28 48 L15 52 L15 49 L24 44 L22 33 L4 40 L4 34 L22 23 Q22 7 28 3 Z M12 29 L16 29 L16 37 L12 37 Z M19 24 L23 24 L23 33 L19 33 Z M33 24 L37 24 L37 33 L33 33 Z M40 29 L44 29 L44 37 L40 37 Z',
  regional: 'M28 5 Q31 8 31 25 L47 34 L47 38 L31 32 L30 45 L37 48 L37 51 L19 51 L19 48 L26 45 L25 32 L9 38 L9 34 L25 25 Q25 8 28 5 Z M21 38 L24 38 L24 45 L21 45 Z M32 38 L35 38 L35 45 L32 45 Z',
  business: 'M28 7 Q31 11 31 25 L47 33 L47 37 L31 31 L30 43 L39 48 L39 51 L17 51 L17 48 L26 43 L25 31 L9 37 L9 33 L25 25 Q25 11 28 7 Z M20 35 L24 35 L24 43 L20 43 Z M32 35 L36 35 L36 43 L32 43 Z',
  turboprop: 'M28 5 Q32 9 32 22 L50 24 L50 30 L32 29 L31 44 L39 48 L39 51 L28 48 L17 51 L17 48 L25 44 L24 29 L6 30 L6 24 L24 22 Q24 9 28 5 Z M15 18 L19 18 L19 32 L15 32 Z M37 18 L41 18 L41 32 L37 32 Z M11 17 L23 17 M33 17 L45 17',
  light: 'M28 9 Q32 11 32 22 L49 22 L49 28 L32 28 L30 42 L38 44 L38 48 L28 46 L18 48 L18 44 L26 42 L24 28 L7 28 L7 22 L24 22 Q24 11 28 9 Z M20 8 L36 8',
  helicopter: 'M28 12 C39 12 38 32 31 35 L30 46 L36 47 L36 50 L20 50 L20 47 L26 46 L25 35 C18 32 17 12 28 12 Z M18 17 L18 35 M38 17 L38 35 M8 10 L48 38 M8 38 L48 10',
};
export function createAircraftMapIcon(color: string, strokeColor: string, kind: AircraftIconKind = 'generic') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 56;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponível');
  const shape = new Path2D(silhouettes[kind]);
  context.fillStyle = color;
  context.strokeStyle = strokeColor;
  context.lineWidth = 3;
  context.lineJoin = context.lineCap = 'round';
  context.stroke(shape);
  context.fill(shape);
  // Thin colored centerline keeps propellers and rotor visible inside their outline.
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke(shape);
  return context.getImageData(0, 0, 56, 56);
}
export function createAircraftMarkerDataUrl(color: string, stroke: string, kind: AircraftIconKind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 56;
  canvas.getContext('2d')!.putImageData(createAircraftMapIcon(color, stroke, kind), 0, 0);
  return canvas.toDataURL('image/png');
}
