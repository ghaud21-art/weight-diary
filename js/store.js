import { api } from './api.js';
import { todayStr, toast } from './utils.js';

export const state = {
  today: todayStr(),
  settings: {},
  meds: [],
  records: [],        // 최근 60일, 날짜 오름차순
  firstRecord: null,
  draft: null,        // 오늘 기록 화면에서 입력 중인 값 (탭 이동해도 유지)
  journeyRange: 7,
};

export function load(data) {
  state.today = data.today || todayStr();
  state.settings = data.settings || {};
  state.meds = data.medications || [];
  state.records = (data.records || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  state.firstRecord = data.firstRecord || state.records[0] || null;
}

export const activeMeds = () => state.meds.filter((m) => m.active);
export const recordOn = (date) => state.records.find((r) => r.date === date) || null;
export const prevRecord = (date) => state.records.filter((r) => r.date < date).pop() || null;
export const latestRecord = () => state.records[state.records.length - 1] || null;

export function upsertRecord(rec) {
  state.records = state.records.filter((r) => r.date !== rec.date).concat(rec).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!state.firstRecord || rec.date < state.firstRecord.date) state.firstRecord = rec;
}

export function applyTheme(t) {
  const theme = t === 'A' ? 'A' : 'B';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'A' ? '#F6F4EE' : '#FBF1EC');
  try { localStorage.setItem('mc_theme', theme); } catch {}
}

/** 설정 저장 (시트 settings) — 실패하면 알림만 */
export async function saveSettings(partial, { quiet = false } = {}) {
  Object.assign(state.settings, partial);
  try {
    const s = await api.saveSettings(partial);
    state.settings = { ...state.settings, ...s };
    if (!quiet) toast('저장했어요');
  } catch (e) {
    toast('설정 저장 실패: ' + e.message);
  }
}
