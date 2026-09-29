const icons = {
  overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  catalog: 'M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
  operations: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .33 1.82 2 2 0 0 1-2.83 2.83 1.7 1.7 0 0 0-1.82-.33A1.7 1.7 0 0 0 14 20.83V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.82.33 2 2 0 0 1-2.83-2.83A1.7 1.7 0 0 0 4.68 15 1.7 1.7 0 0 0 3.17 14H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.33-1.82A2 2 0 0 1 7.1 4.35 1.7 1.7 0 0 0 9 4.68 1.7 1.7 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.82-.33 2 2 0 0 1 2.83 2.83A1.7 1.7 0 0 0 19.32 9 1.7 1.7 0 0 0 20.83 10H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z',
  diagnostics: 'M22 12h-4l-3 9L9 3l-3 9H2',
};

const navigation = [
  ['overview', 'Panoramica'],
  ['catalog', 'Catalogo Vudoo'],
  ['operations', 'Operazioni'],
  ['settings', 'Impostazioni'],
  ['diagnostics', 'Diagnostica'],
];

function Icon({ name }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>;
}

function ModeBadge({ dryRunMode }) {
  if (typeof dryRunMode !== 'boolean') return null;
  return <span className={`mode-badge ${dryRunMode ? 'mode-badge--simulation' : 'mode-badge--real'}`}>{dryRunMode ? 'SIMULAZIONE' : 'REALE'}</span>;
}

export default function AppShell({ page, onNavigate, supplier, dryRunMode, children }) {
  const active = ['preflight', 'confirmation', 'result'].includes(page) ? 'operations' : page;
  return (
    <div className="app-layout">
      <aside className="sidebar" aria-label="Navigazione principale">
        <div className="sidebar-logo"><span className="brand-mark">V</span><span><strong>Vudoo Connector</strong><small>Integrazione Base.com</small></span></div>
        <nav className="sidebar-nav" aria-label="Sezioni"><div className="sidebar-section-title">Navigazione</div>
          {navigation.map(([id, label]) => <button key={id} type="button" className={`sidebar-item ${active === id ? 'active' : ''}`} aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon name={id} /><span>{label}</span></button>)}
        </nav>
        <div className="sidebar-footer">
          {supplier && <div className="supplier-block"><span className="sidebar-section-title">Fornitore attivo</span><strong title={supplier}>{supplier}</strong></div>}
          {typeof dryRunMode === 'boolean' && <span className="sidebar-mode"><span className={`status-dot ${dryRunMode ? 'status-dot--simulation' : 'status-dot--real'}`} />{dryRunMode ? 'Simulazione attiva' : 'Modalità reale'}</span>}
        </div>
      </aside>
      <header className="topbar"><span className="topbar-title">Vudoo Base Connector</span><div className="topbar-end"><ModeBadge dryRunMode={dryRunMode} /></div></header>
      <main className="content" id="main-content"><div className="content-inner">{children}</div></main>
    </div>
  );
}
