export function attachWindowChrome(window, { isPackaged }) {
  window.setMenu(null);
  const reportWindowState = () => {
    if (!window.isDestroyed()) window.webContents.send('window:state-changed', {
      maximized: window.isMaximized(), fullscreen: window.isFullScreen(),
    });
  };
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    window.on(event, reportWindowState);
  }
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
    if (!isPackaged && (input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
    if (!isPackaged && input.control && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      if (input.shift) window.webContents.reloadIgnoringCache();
      else window.webContents.reload();
    }
  });
}

export function registerWindowIpc(ipcMain, BrowserWindow) {
  const senderWindow = event => BrowserWindow.fromWebContents(event.sender);
  ipcMain.handle('window:minimize', event => {
    const window = senderWindow(event);
    if (window && !window.isDestroyed()) window.minimize();
  });
  ipcMain.handle('window:toggle-maximize', event => {
    const window = senderWindow(event);
    if (!window || window.isDestroyed()) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle('window:close', event => {
    const window = senderWindow(event);
    if (window && !window.isDestroyed()) window.close();
  });
  ipcMain.handle('window:get-state', event => {
    const window = senderWindow(event);
    return window && !window.isDestroyed()
      ? { maximized: window.isMaximized(), fullscreen: window.isFullScreen() }
      : { maximized: false, fullscreen: false };
  });
}
