export default function CatalogLoadProgress({ status, name }) {
  if (status !== 'loading' && status !== 'success') return null;
  const complete = status === 'success';
  return <div className={`catalog-load-progress${complete ? ' catalog-load-progress--complete' : ''}`} role="status" aria-live="polite">
    <strong>{complete ? '✓ Catalogo caricato' : `Caricamento catalogo ${name || 'Vudoo'}...`}</strong>
    <div className="catalog-load-track" role="progressbar" aria-label="Caricamento catalogo Vudoo"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={complete ? 100 : undefined}
      aria-valuetext={complete ? 'Catalogo caricato' : 'Caricamento in corso'}>
      <span className="catalog-load-fill" />
    </div>
    {!complete && <small>Recupero prodotti da Vudoo...</small>}
  </div>;
}
