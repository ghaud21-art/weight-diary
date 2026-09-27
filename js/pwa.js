// 홈 화면 설치(PWA) — 서비스 워커 등록과 설치 안내
let deferred = null;
const listeners = new Set();

export function initPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const canPrompt = () => !!deferred;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((fn) => fn());
  return outcome === 'accepted';
}
