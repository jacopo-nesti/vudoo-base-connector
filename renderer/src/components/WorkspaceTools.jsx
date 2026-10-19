import { useEffect, useRef, useState } from 'react';
import { filterCommands, nextCommandIndex } from '../commandPalette.js';
import { addNotification, clearNoncritical, NOTIFICATION_EVENT, OPERATION_EVENTS, readNotifications, writeNotifications } from '../operationNotifications.js';
import '../workspaceTools.css';

function useDialogFocus(ref, onClose, initialFocus = 'input, button') {
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.querySelector(initialFocus)?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('input, button:not(:disabled), [tabindex="0"]')];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    dialog?.addEventListener('keydown', keydown);
    return () => { dialog?.removeEventListener('keydown', keydown); previous?.isConnected && previous.focus(); };
  }, []);
}
function Palette({ onClose, onCommand }) {
  const ref = useRef(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const commands = filterCommands(query);
  useDialogFocus(ref, onClose, '[role="combobox"]');
  function choose(command) { if (command) { onClose(); onCommand(command.id); } }
  return <div className="workspace-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-title">
    <div className="workspace-dialog-heading"><h2 id="command-title">Comandi rapidi</h2><button type="button" className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Chiudi comandi rapidi">Esc</button></div>
    <input className="input" type="search" aria-label="Cerca un comando" placeholder="Cerca una pagina o un’azione…" role="combobox" aria-expanded="true" aria-controls="command-options" aria-autocomplete="list" aria-activedescendant={commands[active] ? `command-${commands[active].id}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setActive(nextCommandIndex(active, event.key, commands.length)); }
      if (event.key === 'Enter') { event.preventDefault(); choose(commands[active]); }
    }} />
    <div role="listbox" id="command-options" aria-label="Azioni disponibili">{commands.map((command, index) => <div key={command.id} id={`command-${command.id}`} role="option" aria-selected={active === index} className={`command-option ${active === index ? 'is-active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => choose(command)}><strong>{command.label}</strong><small>{command.hint}</small></div>)}</div>
    {!commands.length && <p className="text-muted">Nessun comando corrisponde alla ricerca.</p>}<footer>↑ ↓ seleziona · Invio apri · Esc chiudi</footer>
  </section></div>;
}
function Notifications({ items, setItems, onClose, onNavigate, storageFailed, busy }) {
  const ref = useRef(null);
  useDialogFocus(ref, onClose);
  return <div className="workspace-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title">
    <div className="workspace-dialog-heading"><div><h2 id="notification-title">Notifiche</h2><small>Ultimi 60 eventi operativi · solo su questo dispositivo</small></div><button type="button" className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Chiudi notifiche">✕</button></div>
    {storageFailed && <p role="status" className="alert alert-warning">Memoria locale non disponibile: lo storico è mantenuto solo durante questa sessione.</p>}
    <div className="notification-actions"><button className="btn btn-secondary btn-sm" disabled={!items.some(item => !item.read)} onClick={() => setItems(current => current.map(item => ({ ...item, read: true })))}>Segna tutte come lette</button><button className="btn btn-quiet btn-sm" disabled={!items.some(item => OPERATION_EVENTS[item.event].type !== 'error')} onClick={() => setItems(clearNoncritical)}>Svuota non critiche</button></div>
    <div className="notification-list">{!items.length && <div className="workspace-empty"><strong>Nessuna notifica operativa</strong><p>Qui troverai gli esiti di caricamenti, salvataggi e verifiche.</p></div>}{items.map(item => { const event = OPERATION_EVENTS[item.event]; return <article key={item.id} className={`notification-item ${item.read ? '' : 'is-unread'}`}><span className={`notification-symbol notification-symbol--${event.type}`} aria-label={event.type === 'error' ? 'Errore' : 'Completato'}>{event.type === 'error' ? '!' : '✓'}</span><div><strong>{event.title}</strong><p>{event.description}</p><time dateTime={new Date(item.timestamp).toISOString()}>{new Date(item.timestamp).toLocaleString('it-IT')}</time><div className="notification-actions"><button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => { onClose(); onNavigate(event.page); }}>Apri contesto</button>{!item.read && <button className="btn btn-quiet btn-sm" onClick={() => setItems(current => current.map(entry => entry.id === item.id ? { ...entry, read: true } : entry))}>Segna letta</button>}</div></div></article>; })}</div>
  </section></div>;
}
export default function WorkspaceTools({ onNavigate, onCatalog, onSearch, busy }) {
  const [panel, setPanel] = useState(null);
  const [items, setItems] = useState(() => { try { return readNotifications(window.localStorage); } catch { return []; } });
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => { try { setStorageFailed(!writeNotifications(window.localStorage, items)); } catch { setStorageFailed(true); } }, [items]);
  useEffect(() => { const handle = event => setItems(current => addNotification(current, event.detail)); window.addEventListener(NOTIFICATION_EVENT, handle); return () => window.removeEventListener(NOTIFICATION_EVENT, handle); }, []);
  useEffect(() => {
    function handle(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!busy && (panel === 'commands' || !document.querySelector('[role="dialog"], dialog[open]'))) setPanel(current => current === 'commands' ? null : 'commands');
      }
    }
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [busy, panel]);
  function command(id) { if (busy) return; if (id === 'catalog') onCatalog(); else if (id === 'search') onSearch(); else onNavigate(id); }
  const unread = items.filter(item => !item.read).length;
  return <><button type="button" className="btn btn-quiet btn-sm workspace-command-trigger" disabled={busy} onClick={() => setPanel('commands')} aria-label="Apri comandi rapidi (Ctrl+K)">Comandi <kbd>Ctrl K</kbd></button><button type="button" className="btn btn-quiet btn-sm notification-trigger" onClick={() => setPanel('notifications')} aria-label={`Notifiche, ${unread} non lette`}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{unread > 0 && <span className="notification-count">{unread}</span>}</button>{panel === 'commands' && <Palette onClose={() => setPanel(null)} onCommand={command} />}{panel === 'notifications' && <Notifications items={items} setItems={setItems} onClose={() => setPanel(null)} onNavigate={onNavigate} storageFailed={storageFailed} busy={busy} />}</>;
}
