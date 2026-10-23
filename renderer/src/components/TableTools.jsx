import { useEffect, useState } from 'react';
import { readTableState, shouldApplyStartupView, writeTableState } from '../uiPreferences.js';
import '../enterpriseTables.css';
export function useTablePreferences(channel) {
  const [state,setState] = useState(()=>readTableState(channel));
  const [storageError,setStorageError] = useState(false);
  useEffect(()=>{ setStorageError(!writeTableState(channel,state)); },[channel,state]);
  return {state,setState,storageError};
}
export function SortHeading({label,field,sort,onSort}) {
  return <button className="table-sort" type="button" onClick={()=>onSort(sort === field ? `${field}:desc` : field)}>{label}<span aria-hidden="true">{sort === field ? ' ↑' : sort === `${field}:desc` ? ' ↓' : ' ↕'}</span><span className="sr-only">, ordina {sort === field ? 'decrescente' : 'crescente'}</span></button>;
}
export default function TableTools({channel,preferences,filters,onApply,presets=[],filtered,onReset,onCustomize}) {
  const {state,setState,storageError}=preferences;
  const [selected,setSelected]=useState('');
  function apply(view) { onApply(view.filters || {}); setState(s=>({...s,columns:view.columns || s.columns,density:view.density || s.density,sort:view.sort || 'source'})); }
  useEffect(()=>{ if (!shouldApplyStartupView(channel)) return; const initial=state.views.find(v=>v.id===state.startup); if(initial){apply(initial);setSelected(initial.id);} },[]);
  return <section className="enterprise-table-tools" aria-label="Viste e preferenze tabella">
    <div className="enterprise-view-row"><label className="form-field"><span>Vista</span><select className="select" value={selected} onChange={e=>{const id=e.target.value;setSelected(id);const view=[...presets,...state.views].find(v=>v.id===id);if(view)apply(view);}}><option value="">Vista corrente</option><optgroup label="Viste rapide">{presets.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</optgroup><optgroup label="Viste personali">{state.views.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</optgroup></select></label>
      {state.views.some(view => view.id === selected) && <button type="button" className="btn btn-quiet btn-sm" onClick={() => apply(state.views.find(view => view.id === selected))}>Ripristina vista</button>}
      <button type="button" className="btn btn-secondary btn-sm" onClick={onCustomize}>Personalizza tabella</button>
    </div><div className="enterprise-preferences-row">
      <label>Ordina <select className="select" value={state.sort} onChange={e=>setState(s=>({...s,sort:e.target.value}))}><option value="source">Ordine catalogo</option>{[['title','Nome'],['sku','SKU'],['ean','EAN'],['quantity','Scorta'],['price','Prezzo'],['status','Stato']].flatMap(([key,label])=>[<option key={key} value={key}>{label} ↑</option>,<option key={key+':desc'} value={key+':desc'}>{label} ↓</option>])}</select></label>
      <span className={filtered?'tag tag-blue':'muted'}>{filtered?'Vista filtrata':'Tutti i prodotti'}</span><button type="button" className="btn btn-quiet btn-sm" disabled={!filtered} onClick={()=>{onReset();setSelected('');}}>Reset filtri</button>
    </div>{storageError?<p role="alert">Preferenze non salvate: lo spazio locale non è disponibile.</p>:null}
  </section>;
}
