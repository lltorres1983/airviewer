import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/providers/account-provider';
import { closeObservatory, type DiaryDraft } from '@/lib/observatory-ui';
import { diaryBackup, diaryPhoto, parseDiaryBackup, readDiary, removeDiary, saveDiary, type DiaryEntry } from '@/lib/spotting-diary';
function blank(draft: DiaryDraft | null): DiaryEntry {
  return { id: crypto.randomUUID(), hex: '', registration: '', type: '', flight: '', airport: 'GRU', observedAt: new Date().toISOString(), notes: '', photo: null, ...draft };
}
function localDate(iso: string) {
  const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function SpottingDiary({ draft }: { draft: DiaryDraft | null }) {
  const account = useAccount();
  return account.session ? <DiaryForm key={account.session.user.id} owner={account.session.user.id} draft={draft} /> : <section><h3>Seu diário de spotting</h3><p>Entre na sua conta para organizar os registros deste dispositivo.</p><button onClick={() => { closeObservatory(); account.openPanel(); }}>Entrar na conta</button></section>;
}
function DiaryForm({ owner, draft }: { owner: string; draft: DiaryDraft | null }) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [entry, setEntry] = useState(() => blank(draft));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const active = useRef(true);
  const form = useRef<HTMLFormElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    active.current = true;
    void readDiary(owner).then(rows => { if (active.current) { setEntries(rows); setLoaded(true); } }).catch(() => { if (active.current) setError('Não foi possível abrir o diário neste dispositivo.'); });
    return () => { active.current = false; };
  }, [owner]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (active.current) setEntries(await readDiary(owner)); }
    catch (e) { if (active.current) setError(e instanceof Error && e.message ? e.message : 'Não foi possível salvar no dispositivo. Verifique o espaço disponível.'); }
    finally { if (active.current) setBusy(false); }
  };
  const field = (name: 'registration' | 'flight' | 'type' | 'hex', label: string, maxLength: number) => <label>{label}<input aria-label={label} value={entry[name]} maxLength={maxLength} onChange={e => setEntry({ ...entry, [name]: e.target.value.toUpperCase() })} /></label>;
  return <section className="spotting-diary">
    <p>Registros locais, separados por conta. Não sincronizam entre dispositivos; exporte um backup antes de limpar os dados do navegador. Limite por conta: 1.000 observações ou 50 MB, incluindo fotos.</p>
    <div className="observatory-toolbar"><button disabled={!loaded || busy || !entries.length} onClick={() => {
      const url = URL.createObjectURL(new Blob([diaryBackup(entries)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `airviewer-diario-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Exportar backup</button><label className="diary-import">Importar backup<input type="file" accept="application/json,.json" disabled={busy || !loaded} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      void run(async () => {
        if (file.size > 50 * 1024 * 1024) throw new Error('O backup deve ter até 50 MB.');
        const imported = parseDiaryBackup(await file.text());
        if (!active.current) return;
        const current = await readDiary(owner); const ids = new Set(current.map(row => row.id));
        const unique = [...new Map(imported.map(row => [row.id, row])).values()].filter(row => !ids.has(row.id));
        await saveDiary(owner, unique);
        if (active.current) setNotice(`${unique.length} registros importados. Duplicados foram preservados.`);
      });
    }} /></label></div>
    <form ref={form} onSubmit={event => { event.preventDefault(); void run(async () => {
      if (!entry.registration.trim() && !entry.flight.trim() && !entry.hex.trim()) throw new Error('Informe a matrícula, o voo ou o código ICAO.');
      await saveDiary(owner, [entry]);
      if (active.current) { setEntry(blank(null)); if (photoInput.current) photoInput.current.value = ''; setNotice('Registro salvo neste dispositivo.'); }
    }); }}>
      <h3>{entries.some(row => row.id === entry.id) ? 'Editar observação' : 'Nova observação'}</h3>
      <fieldset disabled={busy || !loaded} className="diary-fields">
        {field('registration', 'Matrícula', 20)}{field('flight', 'Voo', 20)}{field('type', 'Modelo', 12)}{field('hex', 'Código ICAO', 12)}
        <label>Aeroporto<select aria-label="Aeroporto" value={entry.airport} onChange={e => setEntry({ ...entry, airport: e.target.value })}><option>GRU</option><option>GIG</option><option>Outro</option></select></label>
        <label>Data e hora (horário deste dispositivo)<input type="datetime-local" required value={localDate(entry.observedAt)} onChange={e => { if (e.target.value && Number.isFinite(Date.parse(e.target.value))) setEntry({ ...entry, observedAt: new Date(e.target.value).toISOString() }); }} /></label>
        <label className="diary-wide">Anotações<textarea aria-label="Anotações" maxLength={2000} rows={3} value={entry.notes} onChange={e => setEntry({ ...entry, notes: e.target.value })} /></label>
        <label className="diary-wide">Sua foto · JPG, PNG ou WebP, até 10 MB<input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
          const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError('');
          void diaryPhoto(file).then(photo => { if (active.current) setEntry(previous => ({ ...previous, photo })); }).catch(e => { if (active.current) setError(e instanceof Error ? e.message : 'Não foi possível abrir a foto.'); }).finally(() => { if (active.current) setBusy(false); });
        }} /></label>
        {entry.photo && <div className="diary-wide"><img className="diary-photo-preview" src={entry.photo} alt="Foto da observação" /><button type="button" onClick={() => { setEntry({ ...entry, photo: null }); if (photoInput.current) photoInput.current.value = ''; }}>Remover foto</button></div>}
        <div className="observatory-toolbar diary-wide"><button type="submit">Salvar observação</button><button type="button" onClick={() => { setEntry(blank(null)); if (photoInput.current) photoInput.current.value = ''; }}>Limpar formulário</button></div>
      </fieldset>
    </form>
    {busy && <p role="status">Salvando…</p>}{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <h3>Observações · {entries.length}</h3>
    {loaded && !entries.length && <p>Nenhuma observação salva. Registre seu primeiro avistamento acima.</p>}
    <ul className="diary-entries">{entries.map(row => <li key={row.id}>
      {row.photo && <img src={row.photo} alt={`Foto de ${row.registration || row.flight || row.hex}`} loading="lazy" />}
      <div><strong>{row.registration || row.flight || row.hex}</strong><p>{row.airport} · {row.type || 'Modelo não informado'} · {new Date(row.observedAt).toLocaleString('pt-BR')}</p><p>{row.flight} {row.hex}</p>{row.notes && <p className="diary-notes">{row.notes}</p>}
      <div className="observatory-toolbar"><button disabled={busy} onClick={() => { setEntry(row); setNotice(''); if (photoInput.current) photoInput.current.value = ''; form.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>Editar</button><button disabled={busy} onClick={() => {
        if (!window.confirm('Excluir esta observação e sua foto?')) return;
        void run(async () => { await removeDiary(owner, row.id); if (active.current) { if (entry.id === row.id) setEntry(blank(null)); setNotice('Observação excluída.'); } });
      }}>Excluir</button></div></div>
    </li>)}</ul>
  </section>;
}
