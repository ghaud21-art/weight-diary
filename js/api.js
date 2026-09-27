import { CONFIG, PREVIEW_MODE } from './config.js';
import { getToken, clearToken } from './auth.js';
import { mockCall } from './mock.js';

export class ApiError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// 토큰 만료 시 앱이 재로그인 흐름을 띄우도록 연결하는 훅
let onAuthNeeded = null;
export function setAuthHandler(fn) {
  onAuthNeeded = fn;
}

async function token() {
  const t = getToken();
  if (t) return t;
  if (!onAuthNeeded) throw new ApiError('unauthorized');
  return onAuthNeeded();
}

export async function call(action, payload = {}) {
  if (PREVIEW_MODE) return mockCall(action, payload);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      // text/plain이면 CORS preflight 없이 GAS로 바로 전송됨
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token: await token() }),
    });
    if (!res.ok) throw new ApiError(`서버 오류 (${res.status})`);
    const data = await res.json();
    if (data.ok) return data.data;
    if (data.error === 'unauthorized' && attempt === 0) {
      clearToken();
      continue;
    }
    throw new ApiError(data.error || '알 수 없는 오류');
  }
  throw new ApiError('unauthorized');
}

export const api = {
  bootstrap: () => call('bootstrap'),
  getRecords: (days) => call('getRecords', { days }),
  saveRecord: (rec) => call('saveRecord', rec),
  regenerateFeedback: (date) => call('regenerateFeedback', { date }),
  extractInbody: (image, mimeType) => call('extractInbody', { image, mimeType }),
  saveSettings: (obj) => call('saveSettings', obj),
  addMed: (m) => call('addMed', m),
  updateMed: (m) => call('updateMed', m),
  deleteMed: (id) => call('deleteMed', { id }),
  getRange: (from, to) => call('getRange', { from, to }),
  saveDay: (day) => call('saveDay', day),
  setPeriod: (date, type, on) => call('setPeriod', { date, type, on }),
  getChat: () => call('getChat'),
  sendChat: (message) => call('sendChat', { message }),
};
