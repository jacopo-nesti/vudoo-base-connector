import WorkspaceTools from './WorkspaceTools.jsx';
import vudooLogo from '../assets/vudoo-logo-horizontal-white.png';
import OperatingModeControl from './OperatingModeControl.jsx';
import { useState } from 'react';

const icons = {
  overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  manufacturers: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a8 8 0 0 1 16 0v2H4Z',
  catalog: 'M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
  operations: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  orders: 'M4 3h16v18l-4-2-4 2-4-2-4 2V3Zm4 5h8M8 12h8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .33 1.82 2 2 0 0 1-2.83 2.83 1.7 1.7 0 0 0-1.82-.33A1.7 1.7 0 0 0 14 20.83V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.82.33 2 2 0 0 1-2.83-2.83A1.7 1.7 0 0 0 4.68 15 1.7 1.7 0 0 0 3.17 14H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.33-1.82A2 2 0 0 1 7.1 4.35a1.7 1.7 0 0 0 1.82.33A1.7 1.7 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.82-.33 2 2 0 0 1 2.83 2.83A1.7 1.7 0 0 0 19.32 9a1.7 1.7 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z',
  diagnostics: 'M22 12h-4l-3 9L9 3l-3 9H2',
  help: 'M9 9a3 3 0 1 1 5 2c-1 .7-2 1.2-2 2.5M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
};
const sections = [
  { page: 'base-overview', label: 'Panoramica', icon: 'overview' },
  { page: 'base-manufacturers', label: 'Produttori', icon: 'manufacturers' },
  { page: 'base-catalog', label: 'Prodotti', icon: 'catalog', heading: 'CATALOGO' },
  { page: 'system-problems', label: 'Problemi', icon: 'diagnostics' },
  { page: 'base-operations', label: 'Import / Operazioni', icon: 'operations', heading: 'BASE.COM' },
  { page: 'base-orders', label: 'Ordini', icon: 'orders' },
  { page: 'base-diagnostics', label: 'Diagnostica', icon: 'diagnostics' },
  { page: 'system-settings', label: 'Impostazioni', icon: 'settings', heading: 'SISTEMA' },
  { page: 'system-help', label: 'Guida', icon: 'help' },
];
const activePage = page => ['preflight', 'confirmation', 'result'].includes(page) ? 'base-operations' : page;
function Icon({ name }) { return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>; }

export default function AppShell({ page, onNavigate, supplier, dryRunMode, onSetOperatingMode, app, onCatalog, children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar" aria-label="Navigazione principale">
      <div className="sidebar-logo"><img className="brand-mark" src={vudooLogo} alt="" /><span><strong>Vudoo Product Manager</strong><small>Catalogo e Base.com</small></span><button className="sidebar-collapse-toggle" type="button" aria-label={sidebarCollapsed ? 'Espandi navigazione' : 'Comprimi navigazione'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? '›' : '‹'}</button></div>
      <nav className="sidebar-nav" aria-label="Sezioni">{sections.map(item => <div key={item.page}>{item.heading && <div className="sidebar-section-title">{item.heading}</div>}<button type="button" title={item.label} aria-label={item.label} className={`sidebar-item ${activePage(page) === item.page ? 'active' : ''}`} aria-current={activePage(page) === item.page ? 'page' : undefined} onClick={() => onNavigate(item.page)}><Icon name={item.icon} /><span>{item.label}</span></button></div>)}</nav>
      <div className="sidebar-footer">{supplier && <div className="supplier-block"><span className="sidebar-section-title">Catalogo attivo</span><strong title={supplier}>{supplier}</strong></div>}<OperatingModeControl dryRunMode={dryRunMode} onSetOperatingMode={onSetOperatingMode} disabled={Boolean(app.importLoading || app.fullImportLoading || app.manufacturerSyncLoading)} /></div>
    </aside>
    <header className="topbar">
      <div className="topbar-context"><span className="topbar-eyebrow">PRODUCT MANAGER</span><strong>{sections.find(item => item.page === activePage(page))?.label || 'Vudoo'}</strong></div>
      <label className="topbar-search"><svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><span className="sr-only">Cerca prodotti, SKU, EAN, ID Vudoo</span><input type="search" placeholder="Cerca prodotti, SKU, EAN, ID Vudoo..." value={app.searchQuery} onChange={event => { app.setSearchQuery(event.target.value); if (page !== 'base-catalog') onNavigate('base-catalog'); }} /></label>
      <div className="topbar-end"><WorkspaceTools onNavigate={onNavigate} onCatalog={onCatalog} busy={Boolean(app.catalogBusy || app.importLoading || app.fullImportLoading || app.manufacturerSyncLoading)} onSearch={() => { onNavigate('base-catalog'); requestAnimationFrame(() => document.querySelector('.topbar-search input')?.focus()); }} /><button type="button" className="catalog-context" onClick={onCatalog} disabled={app.catalogBusy}><span className="topbar-eyebrow">CATALOGO VUDOO</span><strong title={supplier || 'Carica catalogo'}>{supplier || 'Carica catalogo'} <span aria-hidden="true">⌄</span></strong>{app.catalog && <small>{app.catalog.totalProducts} prodotti · {app.activeCatalogCode}</small>}</button>{app.catalog && <button className="btn btn-quiet btn-sm" type="button" disabled={app.catalogBusy} onClick={() => app.handleFetchCatalog(app.activeCatalogCode)} aria-label="Ricarica catalogo Vudoo">↻</button>}{typeof dryRunMode === 'boolean' && <span className={`mode-badge ${dryRunMode ? 'mode-badge--simulation' : 'mode-badge--real'}`}>{dryRunMode ? 'SIMULAZIONE' : 'REALE'}</span>}</div>
    </header>
    <main className="content" id="main-content"><div className="content-inner">{children}</div></main>
  </div>;
}
