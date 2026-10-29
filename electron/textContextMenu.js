export function textContextMenuTemplate(params) {
  const flags = params.editFlags ?? {};
  const password = params.formControlType === 'input-password';
  const items = [];
  const add = (role, label, available) => { if (available) items.push({ role, label }); };

  if (params.isEditable) {
    add('undo', 'Annulla', flags.canUndo);
    add('redo', 'Ripristina', flags.canRedo);
    if (items.length) items.push({ type: 'separator' });
    if (!password) {
      add('cut', 'Taglia', flags.canCut);
      add('copy', 'Copia', flags.canCopy);
    }
    add('paste', 'Incolla', flags.canPaste);
    if (items.at(-1)?.type !== 'separator' && items.length) items.push({ type: 'separator' });
    add('selectAll', 'Seleziona tutto', flags.canSelectAll);
  } else if (params.selectionText && !password) {
    add('copy', 'Copia', flags.canCopy);
    add('selectAll', 'Seleziona tutto', flags.canSelectAll);
  }

  if (items.at(-1)?.type === 'separator') items.pop();
  return items;
}

export function attachTextContextMenu(window, Menu) {
  window.webContents.on('context-menu', (_event, params) => {
    const template = textContextMenuTemplate(params);
    if (template.length) Menu.buildFromTemplate(template).popup({ window });
  });
}
