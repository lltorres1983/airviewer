import { openObservatoryDB, requestResult, transactionDone } from './observatory-db';
import type { DiaryDraft } from './observatory-ui';
export type DiaryEntry = DiaryDraft & { id: string; notes: string; photo: string | null };
type StoredEntry = DiaryEntry & { key: string; owner: string };
export function validDiaryEntry(value: unknown): value is DiaryEntry {
  const v = value as DiaryEntry;
  return !!v && typeof v.id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(v.id) &&
    ['hex', 'registration', 'type', 'flight', 'airport', 'observedAt', 'notes'].every(key => typeof v[key as keyof DiaryEntry] === 'string') &&
    v.hex.length <= 12 && v.registration.length <= 20 && v.type.length <= 12 && v.flight.length <= 20 &&
    ['GRU', 'GIG', 'Outro'].includes(v.airport) && Number.isFinite(Date.parse(v.observedAt)) && v.notes.length <= 2000 &&
    (v.photo === null || (typeof v.photo === 'string' && v.photo.length <= 1500000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.photo)));
}
export async function readDiary(owner: string) {
  const db = await openObservatoryDB();
  const entries = await requestResult<StoredEntry[]>(db.transaction('diary').objectStore('diary').index('owner').getAll(owner));
  return entries.filter(validDiaryEntry).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
}
export async function saveDiary(owner: string, entries: DiaryEntry[]) {
  if (!owner || !entries.every(validDiaryEntry)) throw new Error('Confira os campos do registro.');
  const db = await openObservatoryDB();
  const tx = db.transaction('diary', 'readwrite'); const done = transactionDone(tx);
  const existing = await requestResult<StoredEntry[]>(tx.objectStore('diary').index('owner').getAll(owner));
  const merged = new Map(existing.filter(validDiaryEntry).map(row => [row.id, row as DiaryEntry]));
  entries.forEach(row => merged.set(row.id, row));
  // Keep every exported backup within the import limits, including UTF-8 text.
  if (merged.size > 1000 || new Blob([diaryBackup([...merged.values()])]).size > 50 * 1024 * 1024) {
    tx.abort(); await done.catch(() => {});
    throw new Error('Limite do diário: 1.000 observações ou 50 MB. Exporte um backup e remova registros antigos.');
  }
  entries.forEach(entry => tx.objectStore('diary').put({ ...entry, owner, key: `${owner}:${entry.id}` }));
  await done;
}
export async function removeDiary(owner: string, id: string) {
  const db = await openObservatoryDB(); const tx = db.transaction('diary', 'readwrite'); const done = transactionDone(tx);
  tx.objectStore('diary').delete(`${owner}:${id}`); await done;
}
export function diaryBackup(entries: DiaryEntry[]) {
  // Never export local owner identifiers or IndexedDB keys.
  return JSON.stringify({ version: 1, entries: entries.map(({ id, hex, registration, type, flight, airport, observedAt, notes, photo }) => ({ id, hex, registration, type, flight, airport, observedAt, notes, photo })) });
}
export function parseDiaryBackup(text: string): DiaryEntry[] {
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 1000 || !data.entries.every(validDiaryEntry)) throw new Error('Backup inválido ou incompatível.');
  return data.entries;
}
export async function diaryPhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Escolha uma foto JPG, PNG ou WebP de até 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Não foi possível processar a foto.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL('image/jpeg', .8);
    if (photo.length > 1500000) throw new Error('Foto muito grande. Escolha outra imagem.');
    return photo;
  } finally { bitmap.close(); }
}
