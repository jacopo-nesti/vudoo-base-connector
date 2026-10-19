import { statusTone } from '../statusPresentation.js';
import { useEffect, useRef } from 'react';

export function catalogImages(product) {
  const asList = value => Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set([product?.imageLink, product?.sourceImage, ...asList(product?.images), ...asList(product?.sourceImages), ...asList(product?.additionalImages)].map(image => typeof image === 'string' ? image : image?.url).filter(url => typeof url === 'string' && /^https?:\/\//i.test(url)))];
}

export default function ProductInspector({ product, onClose, onEdit }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!product) return;
    const trigger = document.activeElement;
    panel.current?.focus();
    return () => { if (trigger?.isConnected) trigger.focus(); };
  }, [product?.id]);
  if (!product) return null;
  const images = catalogImages(product);
  const value = key => product[key] ?? '—';
  const state = product.basePreflight?.status;
  const fields = [['SKU', product.sku], ['EAN', product.ean], ['ID Vudoo', product.id], ['Prezzo', [value('price'), product.currency].filter(Boolean).join(' ')], ['Scorta', value('quantity')], ['Categoria', product.canonicalCategory || product.sourceCategory || product.category]];
  return <aside ref={panel} tabIndex={-1} className="product-inspector" aria-label="Dettaglio rapido prodotto" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header><span className="topbar-eyebrow">DETTAGLIO PRODOTTO</span><button type="button" className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Chiudi dettaglio prodotto">×</button></header>
    <div className="inspector-identity">{images[0] ? <img src={images[0]} alt="" /> : <span className="inspector-no-image" aria-hidden="true">◇</span>}<div><h2>{value('title')}</h2><span className="mono">{product.sku || 'SKU non disponibile'}</span></div></div>
    <section><h3>Dati principali</h3><dl>{fields.map(([label, content]) => <div key={label}><dt>{label}</dt><dd>{content ?? '—'}</dd></div>)}</dl></section>
    <section><h3>Media <span>{images.length}</span></h3>{images.length ? <div className="inspector-media">{images.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Anteprima immagine ${index + 1}`}><img src={url} alt={`Immagine ${index + 1} del prodotto`} loading="lazy" /></a>)}</div> : <p className="muted">Nessuna immagine disponibile.</p>}</section>
    <section><h3>Base.com</h3><span className={`status-chip status-chip-${statusTone(state)}`}>{state || 'NON VERIFICATO'}</span><dl><div><dt>Problemi</dt><dd>{product.basePreflight?.counts?.BLOCKING ?? '—'}</dd></div><div><dt>Categoria canonica</dt><dd>{product.canonicalCategory || 'Da verificare'}</dd></div></dl></section>
    <button type="button" className="btn btn-primary inspector-edit" onClick={onEdit}>Apri scheda completa</button>
  </aside>;
}
