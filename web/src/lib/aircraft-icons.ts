/** Top-down, north-facing silhouettes. ICAO designators from adsb.lol/live/aircraft.
 * These represent aircraft families, not exact manufacturer drawings.
 */
const models = {
  airbus: 'A318 A319 A320 A321 A19N A20N A21N',
  boeing: 'B731 B732 B733 B734 B735 B736 B737 B738 B739 B37M B38M B39M B3XM B752 B753',
  rearjet: 'B712 B721 B722 MD81 MD82 MD83 MD87 MD88 MD90 E135 E145 CRJ1 CRJ2 CRJ7 CRJ9 CRJX F70 F100',
  heavy: 'A30B A306 A310 A332 A333 A338 A339 A359 A35K B762 B763 B764 B772 B773 B77L B77W B778 B779 B788 B789 B78X',
  quadjet: 'A342 A343 A345 A346',
  trijet: 'DC10 MD11',
  jumbo: 'B741 B742 B743 B744 B748',
  superjumbo: 'A388',
  regional: 'E170 E175 E190 E195 E290 E295 E75L E75S BCS1 BCS3',
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
// Separate components keep engine outlines visible over wings at map scale.
const narrowBody = 'M28 3 C32 5 32 10 32 15 L31 43 L29 51 L27 51 L25 43 L24 15 C24 10 24 5 28 3 Z';
const longBody = 'M28 2 L31 8 L31 40 L29 52 L27 52 L25 40 L25 8 Z';
const wideBody = 'M28 2 C34 6 34 12 34 18 L33 41 L30 52 L26 52 L23 41 L22 18 C22 12 22 6 28 2 Z';
const rearEngines = 'M20 35 Q22 32 24 35 L24 43 L20 43 Z M32 35 Q34 32 36 35 L36 43 L32 43 Z';
const twinEngines = 'M16 22 Q19 19 21 22 L21 29 L16 29 Z M35 22 Q37 19 40 22 L40 29 L35 29 Z';
const fourEngines = 'M8 27 Q10 24 12 27 L12 34 L8 34 Z M17 21 Q19 18 21 21 L21 29 L17 29 Z M35 21 Q37 18 39 21 L39 29 L35 29 Z M44 27 Q46 24 48 27 L48 34 L44 34 Z';
const sweptTail = 'M27 41 L17 47 L17 50 L28 47 L39 50 L39 47 L29 41 Z';
const tTail = 'M27 46 L17 48 L17 51 L39 51 L39 48 L29 46 Z';
const silhouettes: Record<AircraftIconKind, string[]> = {
  generic: ['M28 4 L32 23 L50 34 L50 38 L32 33 L30 44 L38 49 L38 52 L28 48 L18 52 L18 49 L26 44 L24 33 L6 38 L6 34 L24 23 Z'],
  airbus: [
    'M25 20 L6 31 L5 35 L24 30 L32 30 L51 35 L50 31 L31 20 Z M5 31 L5 36 M51 31 L51 36',
    twinEngines, narrowBody, sweptTail,
  ],
  boeing: [
    'M25 23 L7 34 L4 28 L5 39 L25 32 L31 32 L51 39 L52 28 L49 34 L31 23 Z',
    'M14 26 Q17 23 19 26 L19 32 L14 32 Z M37 26 Q39 23 42 26 L42 32 L37 32 Z',
    longBody, 'M26 41 L19 47 L19 50 L28 47 L37 50 L37 47 L30 41 Z',
  ],
  heavy: [
    'M24 19 L3 35 L3 40 L23 31 L33 31 L53 40 L53 35 L32 19 Z',
    'M13 22 Q17 17 21 22 L21 31 L13 31 Z M35 22 Q39 17 43 22 L43 31 L35 31 Z',
    wideBody, sweptTail,
  ],
  quadjet: ['M25 20 L3 35 L3 39 L25 31 L31 31 L53 39 L53 35 L31 20 Z', fourEngines, longBody, sweptTail],
  trijet: ['M24 20 L4 34 L4 39 L24 31 L32 31 L52 39 L52 34 L32 20 Z', twinEngines, wideBody, sweptTail, 'M26 39 L30 39 L30 48 L26 48 Z'],
  jumbo: ['M24 19 L3 36 L3 41 L24 31 L32 31 L53 41 L53 36 L32 19 Z', fourEngines, wideBody, sweptTail, 'M25 8 Q28 5 31 8 L31 18 L25 18 Z'],
  superjumbo: ['M22 19 L3 32 L3 39 L22 32 L34 32 L53 39 L53 32 L34 19 Z', fourEngines, 'M28 2 C35 4 35 12 35 17 L34 40 L30 52 L26 52 L22 40 L21 17 C21 12 21 4 28 2 Z', 'M25 40 L14 47 L14 51 L28 47 L42 51 L42 47 L31 40 Z'],
  regional: ['M25 23 L8 31 L8 36 L25 30 L31 30 L48 36 L48 31 L31 23 Z', twinEngines, longBody, sweptTail],
  rearjet: ['M25 26 L9 35 L9 39 L25 32 L31 32 L47 39 L47 35 L31 26 Z', rearEngines, longBody, tTail],
  business: ['M25 24 L5 33 L5 37 L25 30 L31 30 L51 37 L51 33 L31 24 Z', rearEngines, 'M28 8 Q31 12 31 18 L30 43 L28 49 L26 43 L25 18 Q25 12 28 8 Z', tTail],
  turboprop: ['M24 22 L5 23 L5 29 L24 28 L32 28 L51 29 L51 23 L32 22 Z', 'M15 16 L19 16 L19 32 L15 32 Z M37 16 L41 16 L41 32 L37 32 Z', narrowBody, tTail, 'M10 15 L24 15 M32 15 L46 15'],
  light: ['M24 22 L5 22 L5 28 L24 28 L32 28 L51 28 L51 22 L32 22 Z', 'M28 9 Q32 11 32 22 L30 42 L38 44 L38 48 L28 46 L18 48 L18 44 L26 42 L24 22 Q24 11 28 9 Z', 'M20 8 L36 8'],
  helicopter: ['M28 12 C39 12 38 32 31 35 L30 46 L36 47 L36 50 L20 50 L20 47 L26 46 L25 35 C18 32 17 12 28 12 Z', 'M18 17 L18 35 M38 17 L38 35', 'M8 10 L48 38 M8 38 L48 10'],
};
export function createAircraftMapIcon(color: string, strokeColor: string, kind: AircraftIconKind = 'generic') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 56;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponível');
  context.lineJoin = context.lineCap = 'round';
  for (const component of silhouettes[kind]) {
    const shape = new Path2D(component);
    context.fillStyle = color;
    context.strokeStyle = strokeColor;
    context.lineWidth = 2;
    context.stroke(shape);
    context.fill(shape);
    // Propeller and rotor strokes remain colored inside the outline.
    context.strokeStyle = color;
    context.lineWidth = 0.65;
    context.stroke(shape);
  }
  return context.getImageData(0, 0, 56, 56);
}
export function createAircraftMarkerDataUrl(color: string, stroke: string, kind: AircraftIconKind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 56;
  canvas.getContext('2d')!.putImageData(createAircraftMapIcon(color, stroke, kind), 0, 0);
  return canvas.toDataURL('image/png');
}
