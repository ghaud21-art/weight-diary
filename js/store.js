import { api } from './api.js';
import { todayStr, toast } from './utils.js';
import { periodStats } from './cycle.js';

export const state = {
  today: todayStr(),
  settings: {},
  meds: [],
  records: [],        // 최근 60일, 날짜 오름차순
  firstRecord: null,
  periods: [],
  calMonth: null,     // 달력에서 보고 있는 달 (yyyy-MM)
  draft: null,        // 오늘 기록 화면에서 입력 중인 값 (탭 이동해도 유지)
  journeyRange: 7,
};

export function load(data) {
  state.today = data.today || todayStr();
  state.settings = data.settings || {};
  state.meds = data.medications || [];
  state.records = (data.records || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  state.firstRecord = data.firstRecord || state.records[0] || null;
  state.periods = data.periods || [];
}

export const cycleStats = () => periodStats(state.periods, state.settings, state.today);

export const activeMeds = () => state.meds.filter((m) => m.active);
export const recordOn = (date) => state.records.find((r) => r.date === date) || null;
// 달력에서 칼로리만 적은 날은 인바디 비교 대상에서 제외
export const hasBody = (r) => r && (r.weight != null || r.muscle_mass != null || r.body_fat_pct != null);
/** 아침 기록(인바디 또는 마음)이 있는 날만 — 달력에서 칼로리만 적은 날 제외 */
export const morningOn = (date) => { const r = recordOn(date); return r && (hasBody(r) || r.mood) ? r : null; };
export const bodyRecords = () => state.records.filter(hasBody);
export const prevRecord = (date) => bodyRecords().filter((r) => r.date < date).pop() || null;
export const latestRecord = () => bodyRecords().pop() || null;

export function upsertRecord(rec) {
  state.records = state.records.filter((r) => r.date !== rec.date).concat(rec).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (rec.weight != null && (!state.firstRecord || rec.date < state.firstRecord.date)) state.firstRecord = rec;
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
