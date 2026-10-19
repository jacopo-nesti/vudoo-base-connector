import { useEffect, useState } from 'react';
import { columnDefinitions, defaultColumns, readTableState, writeTableState } from '../uiPreferences.js';
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
export default function TableTools({channel,preferences,filters,onApply,presets=[],filtered,onReset}) {
  const {state,setState,storageError}=preferences;
  const [selected,setSelected]=useState('');
  const [name,setName]=useState('');
  const [feedback,setFeedback]=useState('');
  const custom=state.views.find(v=>v.id===selected);
  function apply(view) { onApply(view.filters || {}); setState(s=>({...s,columns:view.columns || s.columns,density:view.density || s.density,sort:view.sort || 'source'})); }
  useEffect(()=>{ const initial=state.views.find(v=>v.id===state.startup); if(initial){apply(initial);setSelected(initial.id);setName(initial.name);} },[]);
  return <section className="enterprise-table-tools" aria-label="Viste e preferenze tabella">
    <div className="enterprise-view-row"><label className="form-field"><span>Vista</span><select className="select" value={selected} onChange={e=>{const id=e.target.value;setSelected(id);const view=[...presets,...state.views].find(v=>v.id===id);setName(state.views.find(v=>v.id===id)?.name || '');if(view)apply(view);}}><option value="">Vista corrente</option><optgroup label="Viste rapide">{presets.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</optgroup><optgroup label="Viste personali">{state.views.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</optgroup></select></label>
      <label className="form-field"><span>Nome vista personale</span><input className="input" value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="Es. Base - warning categoria" /></label>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!name.trim() || state.views.length>=30} onClick={()=>{const id=globalThis.crypto.randomUUID();setState(s=>({...s,views:[...s.views,{id,name:name.trim(),channel,filters,columns:s.columns,density:s.density,sort:s.sort}]}));setSelected(id);setFeedback('Vista salvata sul dispositivo.');}}>Salva nuova vista</button>
      {custom && <><button type="button" className="btn btn-quiet btn-sm" disabled={!name.trim()} onClick={()=>setState(s=>({...s,views:s.views.map(v=>v.id===selected?{...v,name:name.trim()}:v)}))}>Rinomina</button><button type="button" className="btn btn-quiet btn-sm" onClick={()=>apply(custom)}>Ripristina vista</button><button type="button" className="btn btn-quiet btn-sm" onClick={()=>{setState(s=>({...s,views:s.views.filter(v=>v.id!==selected),startup:s.startup===selected?'':s.startup}));setSelected('');setName('');}}>Elimina vista</button><label className="enterprise-startup"><input type="checkbox" checked={state.startup===selected} onChange={e=>setState(s=>({...s,startup:e.target.checked?selected:''}))}/> Vista iniziale</label></>}
    </div><div className="enterprise-preferences-row"><details className="column-chooser"><summary>Colonne</summary><div>{Object.entries(columnDefinitions[channel]).map(([key,label])=><label key={key}><input type="checkbox" checked={state.columns[key]} onChange={()=>setState(s=>({...s,columns:{...s.columns,[key]:!s.columns[key]}}))}/>{label}</label>)}</div><button type="button" className="btn btn-quiet btn-sm" onClick={()=>setState(s=>({...s,columns:defaultColumns(channel)}))}>Ripristina colonne</button><small>Prodotto, selezione e azioni restano visibili.</small></details>
      <label>Densità <select className="select" value={state.density} onChange={e=>setState(s=>({...s,density:e.target.value}))}><option value="comfortable">Comoda</option><option value="compact">Compatta</option></select></label>
      <label>Ordina <select className="select" value={state.sort} onChange={e=>setState(s=>({...s,sort:e.target.value}))}><option value="source">Ordine catalogo</option>{[['title','Nome'],['sku','SKU'],['ean','EAN'],['quantity','Scorta'],['price','Prezzo'],['status','Stato']].flatMap(([key,label])=>[<option key={key} value={key}>{label} ↑</option>,<option key={key+':desc'} value={key+':desc'}>{label} ↓</option>])}</select></label>
      <span className={filtered?'tag tag-blue':'muted'}>{filtered?'Vista filtrata':'Tutti i prodotti'}</span><button type="button" className="btn btn-quiet btn-sm" disabled={!filtered} onClick={()=>{onReset();setSelected('');}}>Reset filtri</button>
    </div>{storageError?<p role="alert">Preferenze non salvate: lo spazio locale non è disponibile.</p>:feedback?<p role="status">{feedback}</p>:null}
  </section>;
}
