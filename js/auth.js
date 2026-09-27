import { CONFIG } from './config.js';

// Google Identity Services — ID 토큰(JWT)을 받아 GAS로 전달, GAS가 서명·이메일을 검증
const KEY = 'mc_id_token';
let gisReady = null;
let waiters = [];

function decode(token) {
  try {
    const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  } catch {
    return null;
  }
}

export function getToken() {
  let t = null;
  try { t = localStorage.getItem(KEY); } catch {}
  if (!t) return null;
  const p = decode(t);
  if (!p || p.exp * 1000 < Date.now() + 60_000) return null;
  return t;
}

export function clearToken() {
  try { localStorage.removeItem(KEY); } catch {}
}

function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        auto_select: true,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
        callback: (res) => {
          try { localStorage.setItem(KEY, res.credential); } catch {}
          const w = waiters;
          waiters = [];
          w.forEach((fn) => fn(res.credential));
        },
      });
      resolve();
    };
    s.onerror = () => reject(new Error('구글 로그인 스크립트를 불러오지 못했어요'));
    document.head.appendChild(s);
  });
  return gisReady;
}

/** 로그인 버튼을 그리고, 로그인되면 토큰으로 resolve */
export async function signIn(buttonEl) {
  await loadGis();
  const wait = new Promise((resolve) => waiters.push(resolve));
  if (buttonEl) {
    google.accounts.id.renderButton(buttonEl, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ko' });
  }
  google.accounts.id.prompt();
  return wait;
}

export async function signOut() {
  clearToken();
  try {
    await loadGis();
    google.accounts.id.disableAutoSelect();
  } catch {}
}

export function currentEmail() {
  const t = getToken();
  return t ? decode(t)?.email : null;
}
