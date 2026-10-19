import { useId, useRef, useState } from 'react';

export default function SettingHelp({ label, children }) {
  const id = useId();
  const button = useRef(null);
  const [open, setOpen] = useState(false);
  return <span className="setting-help">
    <button ref={button} className="setting-help-trigger" type="button"
      aria-label={`Informazioni su ${label}`} aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (document.activeElement !== button.current) setOpen(false); }}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>?</button>
    {open && <span id={id} className="setting-help-tooltip" role="tooltip">{children}</span>}
  </span>;
}
