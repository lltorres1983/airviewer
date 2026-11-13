import { test, expect } from '@playwright/test';
import { approachQueue, RUNWAYS, bearing, SpottingTracker, type AirportSnapshot } from '../web/src/lib/airport-operations';
import { windText, visibilityText, conditionsText, validWeatherData } from '../web/src/lib/airport-weather';
import type { TrafficAircraft } from '../web/src/lib/types';

const runway = RUNWAYS[0];
const [start, end] = runway.coordinates;
const aircraft: TrafficAircraft = {
  hex: 'abc123', registration: 'PT-ABC', flight: 'TAM1234', type: 'A388',
  lon: start[0] - (end[0] - start[0]) * 3, lat: start[1] - (end[1] - start[1]) * 3,
  altitude: 5000, track: bearing(start, end), verticalRate: -500, groundSpeed: 160,
  distance: 12, airportBearing: bearing(start, end), headingDifference: 0, onGround: false, movement: 'arrival',
};
test('aproximação estima pista alinhada, ordena por distância e exclui saída, solo e cruzeiro', () => {
  const rows = approachQueue('GRU', [aircraft, { ...aircraft, hex: 'near', lon: start[0] - (end[0] - start[0]), lat: start[1] - (end[1] - start[1]), distance: 4 },
    { ...aircraft, onGround: true }, { ...aircraft, headingDifference: 170 }, { ...aircraft, altitude: 35000 }, { ...aircraft, verticalRate: 1500 }], 2459);
  expect(rows).toHaveLength(2);
  expect(rows[0].aircraft.hex).toBe('near');
  expect(rows[1].runway).toBe('10L');
  expect(rows[1].minutes).toBeGreaterThan(0);
  expect(approachQueue('CASA', [aircraft], 0)).toEqual([]);
  expect(approachQueue('GRU', [{ ...aircraft, groundSpeed: 0 }], 2459)).toEqual([]);
});
test('pistas paralelas ambíguas não recebem atribuição definitiva', () => {
  const second = RUNWAYS[1];
  const midpoint: [number, number] = [(start[0] + second.coordinates[0][0]) / 2, (start[1] + second.coordinates[0][1]) / 2];
  const uncertain = { ...aircraft, lon: midpoint[0] - (end[0] - start[0]) * 3, lat: midpoint[1] - (end[1] - start[1]) * 3 };
  expect(approachQueue('GRU', [uncertain], 2459)[0].runway).toBeNull();
});
test('alertas respeitam raio, favoritos, idade do sinal e não repetem a cada atualização', () => {
  const now = Date.now();
  const snapshot: AirportSnapshot = { code: 'GRU', name: 'Guarulhos', elevation: 2459, traffic: [aircraft], receivedAt: now, message: '', towerRunway: null };
  const rule = { enabled: true, models: ['A388'], registrations: [], favorites: [], radius: 20 };
  const tracker = new SpottingTracker();
  expect(tracker.detect({ ...snapshot, receivedAt: now - 61000 }, rule, now)).toEqual([]);
  expect(tracker.detect(snapshot, { ...rule, radius: 5 }, now)).toEqual([]);
  expect(tracker.detect(snapshot, rule, now)).toHaveLength(1);
  expect(tracker.detect({ ...snapshot, receivedAt: now + 15000 }, rule, now + 15000)).toEqual([]);
  expect(tracker.detect({ ...snapshot, code: 'CASA' }, rule, now)).toEqual([]);
  expect(new SpottingTracker().detect(snapshot, { ...rule, models: [], favorites: ['abc123'] }, now)).toHaveLength(1);
  expect(tracker.detect({ ...snapshot, receivedAt: now + 960000 }, rule, now + 960000)).toHaveLength(1);
});
test('meteorologia traduz vento, visibilidade e fenômenos sem inventar dados ausentes', () => {
  expect(windText({ wspd: 0 })).toBe('Vento calmo');
  expect(windText({ wspd: 10, wdir: 'VRB', wgst: 20 })).toContain('variável, 10 nós; rajadas de 20 nós');
  expect(windText({ wspd: null })).toBe('Vento não informado');
  expect(visibilityText({ visib: '6+' })).toBe('Visibilidade de 10 km ou mais');
  expect(visibilityText({ visib: null })).toBe('Visibilidade não informada');
  expect(conditionsText({ wxString: '+TSRA', clouds: [{ cover: 'BKN', base: 2000 }] })).toContain('forte: trovoadas, chuva');
  expect(conditionsText({}, 'CAVOK')).toContain('Sem tempo significativo');
});

test('meteorologia rejeita produtos malformados sem quebrar o painel', () => {
  const base = { generatedAt: new Date().toISOString(), metars: [], tafs: [] };
  expect(validWeatherData(base)).toBe(true);
  expect(validWeatherData({ ...base, metars: [null] })).toBe(false);
  expect(validWeatherData({ ...base, tafs: [{ icaoId: 'SBGR', rawTAF: 'TAF', issueTime: base.generatedAt, validTimeFrom: 1, validTimeTo: 2, fcsts: [null] }] })).toBe(false);
  expect(validWeatherData({ ...base, metars: [{ icaoId: 'SBGR', rawOb: 'METAR', obsTime: 1, clouds: {} }] })).toBe(false);
});

test('aproximação alinhada ao GIG não entra na fila do SDU', () => {
  const inbound = { ...aircraft, lat: -22.82, lon: -43.34, track: 77, altitude: 2000, distance: 20, headingDifference: 35 };
  expect(approachQueue('GIG', [inbound], 0)).toHaveLength(1);
  expect(approachQueue('SDU', [inbound], 0)).toEqual([]);
  const sdu = { ...inbound, lat: -22.94, lon: -43.1627, track: 358, altitude: 1500 };
  expect(approachQueue('SDU', [sdu], 0)).toHaveLength(1);
  expect(approachQueue('GIG', [sdu], 0)).toEqual([]);
});
