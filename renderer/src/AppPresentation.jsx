import AppShell from './components/AppShell.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import OperationsPage from './pages/OperationsPage.jsx';
import DiagnosticsPage from './pages/DiagnosticsPage.jsx';
import ImportFlowPage from './pages/ImportFlowPage.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import { selectFilteredIds, deselectFilteredIds, clearSelectedIds } from './catalogFilters.js';

export default function AppPresentation({ model: app }) {
  const { page, setPage, importScope, catalog, selectedIds, filteredProducts, updateSelection,
    visibleSelectedCount, catalogBusy, importLoading, fullImportLoading, manufacturerSyncLoading } = app;
  const preflightResult = importScope === 'full' ? app.fullPreflightResult : app.preflightResult;
  const preflightError = importScope === 'full' ? app.fullPreflightError : app.preflightError;
  const preflightLoading = importScope === 'full' ? app.fullPreflightLoading : app.preflightLoading;
  const importResult = importScope === 'full' ? app.fullImportResult : app.importResult;
  const importError = importScope === 'full' ? app.fullImportError : app.importError;
  const activeImportLoading = importScope === 'full' ? fullImportLoading : importLoading;
  const navigate = next => { if (!importLoading && !fullImportLoading && !manufacturerSyncLoading) setPage(next); };

  function deselectFiltered() {
    if (!visibleSelectedCount || !window.confirm(`Vuoi deselezionare ${visibleSelectedCount} prodotti selezionati tra quelli visualizzati?`)) return;
    updateSelection(deselectFilteredIds(selectedIds, filteredProducts));
  }

  function clearSelection() {
    if (!window.confirm(`Vuoi rimuovere tutti i prodotti dalla selezione?\nProdotti da rimuovere: ${selectedIds.length}.`)) return;
    updateSelection(clearSelectedIds(selectedIds));
  }

  return <AppShell page={page} onNavigate={navigate} supplier={catalog?.channelTitle} dryRunMode={app.dryRunMode}>
    {page !== 'confirmation' && app.dryRunMode === true && <div className="alert alert-warning global-alert"><strong>Modalità simulazione attiva: nessuna modifica verrà scritta su Base.com.</strong></div>}
    {page !== 'confirmation' && app.dryRunMode === false && <div className="alert alert-danger global-alert" role="alert"><strong>ATTENZIONE: modalità reale attiva. L’importazione può modificare Base.com.</strong></div>}
    {app.dryRunMode === null && <div className="alert alert-danger global-alert" role="alert">Configurazione della modalità di importazione non valida. Controlla DRY_RUN nelle impostazioni e riavvia l’applicazione.</div>}
    {app.dryRunMode === undefined && !app.runtimeModeError && <div className="alert alert-info global-alert">Verifica della modalità di importazione in corso…</div>}
    {app.testModeEnabled === true && <div className="alert alert-info global-alert"><strong>Modalità test attiva: gli import di prodotti sono limitati dal backend.</strong></div>}
    {app.testModeEnabled === null && <div className="alert alert-danger global-alert" role="alert">Configurazione della modalità test non valida. Controlla TEST_MODE nelle impostazioni e riavvia l’applicazione.</div>}
    {app.runtimeModeError && <div className="alert alert-danger global-alert" role="alert">{app.runtimeModeError}</div>}

    {page === 'overview' && <DashboardPage catalog={catalog} selectedCount={selectedIds.length} dryRunMode={app.dryRunMode} environment={app.environment} onNavigate={navigate} />}
    {page === 'catalog' && <CatalogPage model={{
      companyCode: app.companyCode, setCompanyCode: app.setCompanyCode, catalog,
      catalogLoading: app.catalogLoading, catalogError: app.catalogError, catalogBusy,
      onFetch: app.handleFetchCatalog, searchQuery: app.searchQuery, setSearchQuery: app.setSearchQuery,
      categoryFilter: app.categoryFilter, setCategoryFilter: app.setCategoryFilter,
      brandFilter: app.brandFilter, setBrandFilter: app.setBrandFilter,
      categories: app.categories, brands: app.brands, filteredProducts,
      selectedIds, selectedIdSet: app.selectedIdSet, selectedProducts: app.selectedProducts,
      visibleSelectedCount, selectableVisibleCount: app.selectableVisibleCount,
      hasActiveFilters: app.hasActiveFilters, onToggle: app.handleToggleProduct,
      onSelectFiltered: () => updateSelection(selectFilteredIds(selectedIds, filteredProducts)),
      onDeselectFiltered: deselectFiltered, onClearSelection: clearSelection,
      onUndo: app.undoLastSelectionChange, canUndo: app.previousSelectedIds !== null,
      onPreflightSelected: app.handlePreflightSelected, preflightLoading: app.preflightLoading,
    }} />}
    {page === 'operations' && <OperationsPage catalog={catalog} selectedCount={selectedIds.length} catalogBusy={catalogBusy} dryRunMode={app.dryRunMode} fullPreflightLoading={app.fullPreflightLoading} preflightLoading={app.preflightLoading} manufacturerSyncLoading={manufacturerSyncLoading} manufacturerSyncError={app.manufacturerSyncError} manufacturerSyncResult={app.manufacturerSyncResult} onPreflightFull={app.handlePreflightFull} onPreflightSelected={app.handlePreflightSelected} onSync={app.handleManufacturerSync} onCatalog={() => navigate('catalog')} />}
    {page === 'settings' && <div className="page-stack"><div className="page-heading"><div><h1>Impostazioni</h1><p>Configura le modalità operative e i limiti dell’integrazione.</p></div></div><SettingsPanel /></div>}
    {page === 'diagnostics' && <DiagnosticsPage environment={app.environment} loading={app.loading} error={app.environmentError} response={app.response} onEnvironmentCheck={app.handleEnvironmentCheck} onPing={app.handlePing} />}
    {['preflight', 'confirmation', 'result'].includes(page) && <ImportFlowPage stage={page} scope={importScope} result={page === 'result' ? importResult : preflightResult} preflightError={preflightError} importError={importError} preflightLoading={preflightLoading} importLoading={activeImportLoading} catalog={catalog} selectedCount={selectedIds.length} dryRunMode={app.dryRunMode} testModeEnabled={app.testModeEnabled} baseApiRequestsPerMinute={app.baseApiRequestsPerMinute} importReadStrategy={app.importReadStrategy} onBack={() => setPage(page === 'confirmation' ? 'preflight' : 'operations')} onContinue={() => setPage('confirmation')} onImport={importScope === 'full' ? app.handleImportFull : app.handleImportSelected} onCatalog={() => navigate('catalog')} />}
  </AppShell>;
}
