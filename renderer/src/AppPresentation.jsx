import { useRef, useState } from 'react';
import CatalogSwitcher from './components/CatalogSwitcher.jsx';
import SaveManufacturerDialog from './components/SaveManufacturerDialog.jsx';
import AppShell from './components/AppShell.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import ManufacturersPage from './pages/ManufacturersPage.jsx';
import OperationsPage from './pages/OperationsPage.jsx';
import BaseDiagnosticsPage from './pages/BaseDiagnosticsPage.jsx';
import OrdersBetaPage from './pages/OrdersBetaPage.jsx';
import SystemDiagnostics from './pages/SystemDiagnostics.jsx';
import ProblemsPage from './pages/ProblemsPage.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import ImportFlowPage from './pages/ImportFlowPage.jsx';
import { selectFilteredIds, deselectFilteredIds, clearSelectedIds } from './catalogFilters.js';

export default function AppPresentation({ model: app }) {
  const [catalogSwitcherOpen, setCatalogSwitcherOpen] = useState(false);
  const [problemFocus, setProblemFocus] = useState(null);
  const [settingsTab, setSettingsTab] = useState('technical');
  const problemFocusSequence = useRef(0);
  const { page, setPage, importScope, catalog, selectedIds, filteredProducts, updateSelection,
    visibleSelectedCount, catalogBusy, importLoading, fullImportLoading, manufacturerSyncLoading } = app;
  const preflightResult = importScope === 'full' ? app.fullPreflightResult : app.preflightResult;
  const preflightError = importScope === 'full' ? app.fullPreflightError : app.preflightError;
  const preflightLoading = importScope === 'full' ? app.fullPreflightLoading : app.preflightLoading;
  const importResult = importScope === 'full' ? app.fullImportResult : app.importResult;
  const importError = importScope === 'full' ? app.fullImportError : app.importError;
  const activeImportLoading = importScope === 'full' ? fullImportLoading : importLoading;
  const navigate = next => {
    if (importLoading || fullImportLoading || manufacturerSyncLoading) return;
    if (next === 'base-settings') { setSettingsTab('base'); setPage('system-settings'); return; }
    if (next === 'system-settings') setSettingsTab('technical');
    setPage(next);
  };
  const openProblem = problem => {
    if (problem.productId) {
      setProblemFocus({ productId: problem.productId, requestId: ++problemFocusSequence.current });
      app.setSearchQuery(problem.search || problem.productId);
      app.setCategoryFilter(''); app.setBrandFilter(''); app.setExtraFilters({});
    }
    navigate(problem.page);
  };

  function deselectFiltered() {
    if (!visibleSelectedCount || !window.confirm(`Vuoi deselezionare ${visibleSelectedCount} prodotti selezionati tra quelli visualizzati?`)) return;
    updateSelection(deselectFilteredIds(selectedIds, filteredProducts));
  }

  function clearSelection() {
    if (!window.confirm(`Vuoi rimuovere tutti i prodotti dalla selezione?\nProdotti da rimuovere: ${selectedIds.length}.`)) return;
    updateSelection(clearSelectedIds(selectedIds));
  }

  const basePages = ['base-overview', 'base-manufacturers', 'base-catalog', 'base-operations', 'base-diagnostics', 'base-settings', 'preflight', 'confirmation', 'result'];
  return <AppShell page={page} onNavigate={navigate} supplier={catalog?.manufacturerName || catalog?.channelTitle} dryRunMode={app.dryRunMode} onSetOperatingMode={app.handleSetOperatingMode} app={app} onCatalog={() => setCatalogSwitcherOpen(true)}>
    <CatalogSwitcher open={catalogSwitcherOpen} app={app} onClose={() => setCatalogSwitcherOpen(false)} />
    <SaveManufacturerDialog catalogCode={app.pendingManufacturerCode} onSave={app.handleSaveManufacturer} onClose={() => app.setPendingManufacturerCode(null)} />
    {basePages.includes(page) && <>
      {app.manufacturerDirectoryWarning && <div className="alert alert-warning global-alert" role="alert">{app.manufacturerDirectoryWarning}</div>}
      {page !== 'confirmation' && page !== 'base-overview' && app.dryRunMode === true && <div className="alert alert-warning global-alert"><strong>MODALITÀ SIMULAZIONE: nessuna modifica verrà inviata a Base.com.</strong></div>}
      {app.dryRunMode === null && <div className="alert alert-danger global-alert" role="alert">Configurazione della modalità di importazione non valida. Controlla DRY_RUN nelle impostazioni e riavvia l’applicazione.</div>}
      {app.dryRunMode === undefined && !app.runtimeModeError && <div className="alert alert-info global-alert">Verifica della modalità di importazione in corso…</div>}
      {app.testModeEnabled === true && <div className="alert alert-info global-alert"><strong>Limite di prova attivo: l’import elabora un solo prodotto. La modalità operativa resta {app.dryRunMode ? 'Simulazione' : 'Reale'}.</strong></div>}
      {app.testModeEnabled === null && <div className="alert alert-danger global-alert" role="alert">Configurazione della modalità test non valida. Controlla TEST_MODE nelle impostazioni e riavvia l’applicazione.</div>}
      {app.runtimeModeError && <div className="alert alert-danger global-alert" role="alert">{app.runtimeModeError}</div>}
    </>}
    {page === 'system-diagnostics' && <SystemDiagnostics app={app} />}
    {page === 'system-problems' && <ProblemsPage app={app} onOpen={openProblem} onCatalog={() => setCatalogSwitcherOpen(true)} />}
    {page === 'system-settings' && <SettingsPanel initialTab={settingsTab} dryRunMode={app.dryRunMode} onModeChanged={app.handleSettingsModeChanged} onDiagnostics={() => navigate('base-diagnostics')} filters={{ search: app.searchQuery, categoryFilter: app.categoryFilter, canonicalFilter: app.extraFilters?.canonicalFilter || '', availabilityFilter: app.extraFilters?.availabilityFilter || '', eanFilter: app.extraFilters?.eanFilter || '', imageFilter: app.extraFilters?.imageFilter || '' }} />}
    {page === 'system-help' && <HelpPage />}
    {page === 'base-overview' && <DashboardPage onNavigate={navigate} onLoadCatalog={app.handleFetchCatalog} catalogBusy={app.catalogBusy} catalogError={app.catalogError} />}
    {page === 'base-manufacturers' && <ManufacturersPage onNavigate={navigate} onLoadCatalog={app.handleFetchCatalog} catalogBusy={app.catalogBusy} catalogError={app.catalogError} />}
    {page === 'base-catalog' && <CatalogPage model={{
      problemFocus, onProblemFocusHandled: () => setProblemFocus(null),
      companyCode: app.companyCode, setCompanyCode: app.setCompanyCode, activeCatalogCode: app.activeCatalogCode, catalog,
      catalogLoading: app.catalogLoading, catalogError: app.catalogError, catalogBusy,
      onCatalog: () => setCatalogSwitcherOpen(true), onSettingsColumns: () => { if (!importLoading && !fullImportLoading && !manufacturerSyncLoading) { setSettingsTab('columns'); setPage('system-settings'); } }, onFetch: app.handleFetchCatalog, searchQuery: app.searchQuery, setSearchQuery: app.setSearchQuery,
      categoryFilter: app.categoryFilter, setCategoryFilter: app.setCategoryFilter,
      categories: app.categories, canonicalCategories: app.canonicalCategories,
      extraFilters: app.extraFilters, setExtraFilters: app.setExtraFilters,
      filteredProducts,
      selectedIds, selectedIdSet: app.selectedIdSet, selectedProducts: app.selectedProducts,
      visibleSelectedCount, selectableVisibleCount: app.selectableVisibleCount,
      hasActiveFilters: app.hasActiveFilters, onToggle: app.handleToggleProduct,
      onSelectFiltered: () => updateSelection(selectFilteredIds(selectedIds, filteredProducts)),
      onDeselectFiltered: deselectFiltered, onClearSelection: clearSelection,
      onUndo: app.undoLastSelectionChange, canUndo: app.previousSelectedIds !== null,
      onPreflightSelected: app.handlePreflightSelected, preflightLoading: app.preflightLoading,
      onSaveProduct: app.handleSaveProductFields,
      onMediaChange: app.handleLocalMediaChanged,
      onBulkEditProducts: app.handleBulkEditProducts,
      onSelectInventory: app.handleSelectInventory, onRetryInventory: app.handleRetryInventory,
    }} />}
    {page === 'base-operations' && <OperationsPage catalog={catalog} selectedCount={selectedIds.length} catalogBusy={catalogBusy} dryRunMode={app.dryRunMode} fullPreflightLoading={app.fullPreflightLoading} preflightLoading={app.preflightLoading} manufacturerSyncLoading={manufacturerSyncLoading} manufacturerSyncError={app.manufacturerSyncError} manufacturerSyncResult={app.manufacturerSyncResult} onPreflightFull={app.handlePreflightFull} onPreflightSelected={app.handlePreflightSelected} onSync={app.handleManufacturerSync} onCatalog={() => navigate('base-catalog')} />}
    {page === 'base-diagnostics' && <BaseDiagnosticsPage catalog={catalog} catalogCode={app.activeCatalogCode} dryRunMode={app.dryRunMode} baseConfigured={app.baseConfigured} />}
    {page === 'base-orders' && <OrdersBetaPage />}
    {['preflight', 'confirmation', 'result'].includes(page) && <ImportFlowPage stage={page} scope={importScope} result={page === 'result' ? importResult : preflightResult} preflightError={preflightError} importError={importError} preflightLoading={preflightLoading} importLoading={activeImportLoading} catalog={catalog} selectedCount={selectedIds.length} dryRunMode={app.dryRunMode} testModeEnabled={app.testModeEnabled} baseApiRequestsPerMinute={app.baseApiRequestsPerMinute} importReadStrategy={app.importReadStrategy} onBack={() => setPage(page === 'confirmation' ? 'preflight' : 'base-operations')} onContinue={() => setPage('confirmation')} onImport={importScope === 'full' ? app.handleImportFull : app.handleImportSelected} onCatalog={() => navigate('base-catalog')} />}
  </AppShell>;
}
