import { useEffect, useRef, useState } from 'react';

const MAX_FILE_BYTES = 4_000_000;

export default function ManualImageEditor({ product, onProductChange }) {
  const pickerRef = useRef(null);
  const savingRef = useRef(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [thumbnails, setThumbnails] = useState({});
  const [base, setBase] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const original = [product.imageLink, ...(Array.isArray(product.additionalImages)
    ? product.additionalImages : product.additionalImages ? [product.additionalImages] : [])].filter(Boolean);
  const manual = product.manualImages ?? [];

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.getBaseImageStatus(product.id).then(response => {
      if (!cancelled) setBase(response);
    }).catch(() => { if (!cancelled) setBase({ ok: false }); });
    return () => { cancelled = true; };
  }, [product.id]);
  useEffect(() => {
    let cancelled = false;
    for (const image of manual) {
      if (thumbnails[image.id]) continue;
      window.electronAPI.getManualImageThumbnail(product.id, image.id).then(response => {
        if (!cancelled && response?.ok) setThumbnails(current => ({ ...current, [image.id]: response.preview }));
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [product.id, manual.map(image => image.id).join(',')]);
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function select(next) {
    setNotice(''); setError('');
    if (!next) return;
    if (!/\.(jpe?g|png)$/i.test(next.name) || !['image/jpeg', 'image/png'].includes(next.type)) {
      setFile(null); setError('Seleziona un file JPG o PNG.'); return;
    }
    if (!next.size || next.size > MAX_FILE_BYTES) {
      setFile(null); setError('Il file deve essere non vuoto e pesare al massimo 4 MB.'); return;
    }
    setFile(next);
  }

  async function add() {
    if (savingRef.current || !file) return;
    savingRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await window.electronAPI.addManualImage(product.id, {
        name: file.name, mimeType: file.type, bytes: await file.arrayBuffer(),
      });
      if (!response?.ok) throw new Error(response?.error || 'Salvataggio immagine non riuscito.');
      onProductChange(response.product);
      setFile(null);
      if (pickerRef.current) pickerRef.current.value = '';
      setNotice('Immagine salvata nel prodotto locale. Sarà inviata con il prossimo import Base.com.');
    } catch (failure) { setError(failure.message || 'Salvataggio immagine non riuscito.'); }
    finally { savingRef.current = false; setBusy(false); }
  }

  async function remove(imageId) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await window.electronAPI.removeManualImage(product.id, imageId);
      if (!response?.ok) throw new Error(response?.error || 'Rimozione immagine non riuscita.');
      onProductChange(response.product);
      setNotice('Immagine manuale rimossa dal prodotto locale. Nessuna foto Base.com è stata cancellata.');
    } catch (failure) { setError(failure.message || 'Rimozione immagine non riuscita.'); }
    finally { setBusy(false); }
  }

  return <section className="base-image-panel" aria-label="Immagini prodotto">
    <div className="base-image-heading"><div><h3>Immagini del prodotto</h3>
      <p className="muted">Il catalogo Vudoo resta invariato. Le immagini manuali seguono quelle originali nell’import Base.com.</p></div></div>
    <h4>Originali Vudoo · {original.length}</h4>
    {original.length ? <div className="base-image-list base-image-list--vudoo">{original.map((url, index) =>
      <div key={`${url}-${index}`}><img src={url} alt={`Immagine Vudoo ${index + 1}`} loading="lazy" /><span>Vudoo #{index + 1}</span></div>)}</div>
      : <p className="muted">Nessuna immagine originale disponibile.</p>}
    <h4>Aggiunte manualmente · {manual.length}</h4>
    {manual.length ? <div className="base-image-list">{manual.map(image => <div key={image.id}>
      {thumbnails[image.id] && <img src={thumbnails[image.id]} alt={`Immagine manuale ${image.name}`} />}
      <span>{image.name} · {Math.ceil(image.size / 1024)} KB</span>
      <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => remove(image.id)}>Rimuovi</button>
    </div>)}</div> : <p className="muted">Nessuna immagine manuale salvata.</p>}
    <h4>Già presenti su Base.com</h4>
    {base?.ok && base.available && base.images.length ? <div className="base-image-list">{base.images.map(image =>
      <div key={image.position}><img src={image.url} alt={`Immagine Base.com ${image.position}`} loading="lazy" />
        <span>Base #{image.position}</span></div>)}</div> : <p className="muted">{base?.ok
      ? 'Prodotto non ancora presente su Base.com o senza immagini.'
      : base ? 'Lettura Base.com non disponibile; puoi comunque aggiungere immagini locali.'
        : 'Verifica immagini Base.com…'}</p>}
    <div className="base-image-drop" onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); if (!busy) select(event.dataTransfer.files?.[0]); }}>
      <p>Trascina qui un JPG o PNG, oppure scegli un file (massimo 4 MB).</p>
      <input ref={pickerRef} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" className="sr-only"
        id="manual-image-file" onChange={event => select(event.target.files?.[0])} />
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => pickerRef.current?.click()}>Scegli file</button>
    </div>
    {file && <div className="base-image-selection">
      {previewUrl && <img src={previewUrl} alt="Anteprima dell'immagine selezionata" />}
      <div><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small>
        <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => { setFile(null); if (pickerRef.current) pickerRef.current.value = ''; }}>Rimuovi selezione</button></div>
    </div>}
    {file && file.size > 1_499_000 && <p className="muted">Questa immagine verrà ottimizzata prima dell’invio a Base.com; il file locale resta originale.</p>}
    <button type="button" className="btn btn-primary" disabled={busy || !file} onClick={add}>
      {busy ? 'Salvataggio…' : 'Aggiungi al prodotto'}</button>
    {notice && <p className="alert alert-success" role="status">{notice}</p>}
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
  </section>;
}
