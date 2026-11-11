import { writeFile } from 'node:fs/promises';

const airportCodes = { SBGR: 'GRU', SBGL: 'GIG', SBRJ: 'SDU' };
const airports = Object.fromEntries(Object.values(airportCodes).map(code => [code, new Map()]));
const day = 24 * 60 * 60 * 1000;
const now = new Date();
const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const end = start + 3 * day;

function referenceDate(timestamp) {
  const [year, month, date] = new Date(timestamp).toISOString().slice(0, 10).split('-');
  return `${date}/${month}/${year}`;
}

function parseSirosTime(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, date, month, year, hour, minute] = match;
  return Date.parse(`${year}-${month}-${date}T${hour}:${minute}:00Z`);
}

function addMovement(flight, airport, otherAirport, direction, plannedTime) {
  const airportCode = airportCodes[airport];
  if (!airportCode) return;
  const time = parseSirosTime(plannedTime);
  if (!(time >= start && time < end)) return;

  const otherCode = airportCodes[otherAirport] || otherAirport;
  const key = `${flight}:${direction}:${time}:${otherCode}`;
  airports[airportCode].set(key, { flight, direction, time, airport: otherCode });
}

// A etapa pode começar antes do dia UTC em que chega ao aeroporto monitorado.
const firstReference = start - 2 * day;
const lastReference = end - day;
const url = new URL('https://sas.anac.gov.br/sas/siros_api/api/voosPeriodo');
url.searchParams.set('dataReferenciaInicio', referenceDate(firstReference).replaceAll('/', ''));
url.searchParams.set('dataReferenciaFinal', referenceDate(lastReference).replaceAll('/', ''));
const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
if (!response.ok) throw new Error(`SIROS HTTP ${response.status}`);
const payload = await response.json();
const rows = typeof payload === 'string' ? JSON.parse(payload) : payload;
if (!Array.isArray(rows)) throw new Error('Resposta inesperada do SIROS');

const references = new Set(rows.map(row => row.dt_referencia));
for (let date = firstReference; date <= lastReference; date += day) {
  if (!references.has(referenceDate(date))) {
    throw new Error(`O SIROS não retornou a programação de ${referenceDate(date)}`);
  }
}

for (const row of rows) {
  const {
    sg_empresa_icao: airline, nr_voo: number,
    sg_icao_origem: origin, sg_icao_destino: destination,
    dt_partida_prevista_utc: departure, dt_chegada_prevista_utc: arrival
  } = row;
  if (!/^[A-Z]{3}$/.test(airline) || !/^\d{1,4}[A-Z]?$/.test(number)) continue;
  const flight = `${airline}${String(number).replace(/^0+(?=\d)/, '')}`;
  addMovement(flight, origin, destination, 'departure', departure);
  addMovement(flight, destination, origin, 'arrival', arrival);
}

const schedules = {};
for (const [code, movements] of Object.entries(airports)) {
  if (!movements.size) throw new Error(`O SIROS não retornou movimentos para ${code}`);
  schedules[code] = [...movements.values()].sort((a, b) => a.time - b.time);
  console.log(`${code}: ${movements.size} movimentos programados`);
}

await writeFile(process.argv[2] || 'web/public/schedule.json', JSON.stringify({ start, end, airports: schedules }));
