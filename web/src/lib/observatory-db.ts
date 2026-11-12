let connection: Promise<IDBDatabase> | null = null;
export function openObservatoryDB(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Armazenamento indisponível neste navegador.')); return; }
    let blocked = false;
    const request = indexedDB.open('airviewer-observatory', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('frames', { keyPath: 'id' });
      const diary = db.createObjectStore('diary', { keyPath: 'key' });
      diary.createIndex('owner', 'owner');
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
    request.onerror = () => { connection = null; reject(request.error || new Error('Não foi possível abrir o armazenamento.')); };
    request.onblocked = () => { blocked = true; connection = null; reject(new Error('Feche outras abas do AirViewer e tente novamente.')); };
  });
  return connection;
}
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Não foi possível salvar neste dispositivo.'));
  });
}
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
