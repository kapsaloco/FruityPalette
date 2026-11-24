import { isTauri } from '@tauri-apps/api/core';
import { currentMonitor, getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
import { version } from '../package.json';
import appLicense from '../LICENSE?raw';
import { initFruity } from './styles/fruity/components';
import uiLicense from './styles/fruity/LICENSE?raw';
import { FRUITY_UI_LABEL } from './styles/fruity/v1.1/version';

document.getElementById('app-version')!.textContent = version.replace(/\.0$/, '');
document.getElementById('ui-version')!.textContent = FRUITY_UI_LABEL.slice(1);
document.getElementById('footer-ui-version')!.textContent = FRUITY_UI_LABEL;
document.getElementById('app-license')!.textContent = appLicense;
document.getElementById('ui-license')!.textContent = uiLicense;
initFruity();

if (isTauri() && /Windows/i.test(navigator.userAgent)) {
  const appWindow = getCurrentWindow();
  const reportWindowError = () => {
    document.getElementById('status')!.textContent = 'Could not complete the window action.';
  };

  document.getElementById('window-controls')!.hidden = false;
  document.getElementById('minimize')!.addEventListener('click', () => {
    void appWindow.minimize().catch(reportWindowError);
  });
  document.getElementById('close')!.addEventListener('click', () => {
    void appWindow.close().catch(reportWindowError);
  });
  document.getElementById('window-drag')!.addEventListener('mousedown', event => {
    if (event.button === 0 && event.detail === 1) {
      event.preventDefault();
      void appWindow.startDragging().catch(reportWindowError);
    }
  });
}

import './editor';

async function showFittedWindow() {
  const appWindow = getCurrentWindow();
  try {
    await document.fonts.ready;
    const [monitor, inner, outer, scale] = await Promise.all([
      currentMonitor(), appWindow.innerSize(), appWindow.outerSize(), appWindow.scaleFactor(),
    ]);
    const contentBottom = document.querySelector('main')!.getBoundingClientRect().bottom;
    const available = monitor ? monitor.workArea.size.height - (outer.height - inner.height) : inner.height;
    const height = Math.min(Math.ceil((contentBottom + 40) * scale) + 2, available);
    if (Math.abs(height - inner.height) > 2) await appWindow.setSize(new PhysicalSize(inner.width, height));
    await appWindow.center();
  } catch (error) {
    console.warn('Could not fit the window to its contents.', error);
  } finally {
    await appWindow.show();
  }
}

if (isTauri()) void showFittedWindow().catch(console.error);



