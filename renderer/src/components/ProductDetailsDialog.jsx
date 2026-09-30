import { useEffect, useRef } from 'react';
import { hasDisplayValue } from '../catalogFilters.js';

const fields = [
  ['ID prodotto', 'id'],
  ['SKU Vudoo', 'sku'],
  ['MPN', 'mpn'],
  ['Brand', 'brand'],
  ['Categoria sorgente', 'category'],
  ['Prezzo', 'price'],
  ['Formato / Dimensione', 'size'],
  ['Colore', 'color'],
  ['EAN', 'ean'],
  ['Gruppo prodotti', 'itemGroupId'],
  ['Disponibilità', 'availability'],
  ['Quantità', 'quantity'],
  ['Condizione', 'condition'],
];

export default function ProductDetailsDialog({ product, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!product) return undefined;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, [product]);

  if (!product) return null;

  return <dialog ref={dialogRef} className="product-dialog" aria-labelledby="product-dialog-title"
    onClose={onClose} onClick={event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}>
    <div className="product-dialog-content">
      <header className="product-dialog-header">
        <div><span className="product-dialog-eyebrow">Dettagli prodotto</span><h2 id="product-dialog-title">{product.title || 'Senza titolo'}</h2></div>
        <button className="product-dialog-close" type="button" aria-label="Chiudi dettagli prodotto"
          autoFocus onClick={() => dialogRef.current?.close()}>×</button>
      </header>
      <div className="product-dialog-body">
        <dl className="product-dialog-fields">
          {fields.filter(([, key]) => hasDisplayValue(product[key])).map(([label, key]) =>
            <div key={key}><dt>{label}</dt><dd>{product[key]}</dd></div>)}
        </dl>
        {hasDisplayValue(product.description) && <section className="product-dialog-description">
          <h3>Descrizione</h3><p>{product.description}</p>
        </section>}
      </div>
    </div>
  </dialog>;
}
