/* PWA: install prompt, iOS instructions, update prompt, offline notice and sharing. */

import { $, store, toast } from './core.js';

const DISMISS_DAYS = 30;
const installCard = $('installCard');
const iosGuide = $('iosGuide');
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let deferredPrompt = null;
let engaged = false;

export const canInstall = () => !isStandalone && (Boolean(deferredPrompt) || isIOS);

function dismissedRecently() {
  const at = store.get('installDismissedAt', 0);
  return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 86400000;
}

function refreshInstallUi() {
  const available = canInstall();
  $('setInstallRow').hidden = !available;
  installCard.hidden = !(available && engaged && !dismissedRecently());
}

export async function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch { /* ignored */ }
    deferredPrompt = null;
    refreshInstallUi();
  } else if (isIOS && typeof iosGuide.showModal === 'function') {
    iosGuide.showModal();
  }
}

/** Call after the person has done something real, so the offer never interrupts a first glance. */
export function markEngaged() {
  if (engaged) return;
  engaged = true;
  setTimeout(refreshInstallUi, 1500);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  refreshInstallUi();
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; installCard.hidden = true; refreshInstallUi(); toast('Timekeeper installed'); });

$('installBtn').addEventListener('click', () => promptInstall());
$('installLater').addEventListener('click', () => {
  store.set('installDismissedAt', Date.now());
  installCard.hidden = true;
});
$('setInstallBtn').addEventListener('click', () => { $('settingsDialog').close(); promptInstall(); });
$('iosClose').addEventListener('click', () => iosGuide.close());
refreshInstallUi();

/* ---------- Share ---------- */

const shareBtn = $('shareBtn');
if (navigator.share) {
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', () => {
    navigator.share({ title: document.title, url: location.origin + location.pathname }).catch(() => {});
  });
}

/* ---------- Offline notice ---------- */

const offlineBar = $('offlineBar');
function syncOnline() { offlineBar.hidden = navigator.onLine; }
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);
syncOnline();

/* ---------- Service worker and updates ---------- */

if ('serviceWorker' in navigator) {
  const updateBar = $('updateBar');
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then((reg) => {
      const offer = (worker) => {
        updateBar.hidden = false;
        $('updateBtn').onclick = () => worker.postMessage('SKIP_WAITING');
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
      });
      // Look for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    }).catch(() => { /* the site still works without offline support */ });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The very first install also fires this event; only reload for a real update.
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}
