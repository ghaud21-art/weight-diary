import { api } from './api.js';
import { todayStr, toast, addDays, daysBetween, debounce } from './utils.js';
import { periodStats } from './cycle.js';
import { PREVIEW_MODE } from './config.js';
import { currentEmail } from './auth.js';

export const state = {
  today: todayStr(),
  settings: {},
  meds: [],
  records: [],        // 날짜 오름차순 (최근 60일 + 달력에서 불러온 달)
  firstRecord: null,
  periods: [],
  calMonth: null,     // 달력에서 보고 있는 달 (yyyy-MM)
  draft: null,        // 오늘 기록 화면에서 입력 중인 값 (탭 이동해도 유지)
  journeyRange: 7,
};

export function load(data) {
  state.today = todayStr();
  state.settings = data.settings || {};
  state.meds = data.medications || [];
  // 달력에서 따로 불러온 60일 이전 기록은 유지
  const from = addDays(state.today, -60);
  const fresh = data.records || [];
  const older = state.records.filter((r) => r.date < from && !fresh.some((x) => x.date === r.date));
  state.records = older.concat(fresh).sort((a, b) => (a.date < b.date ? -1 : 1));
  state.firstRecord = data.firstRecord || state.records.find((r) => r.weight != null) || null;
  state.periods = data.periods || [];
  persist();
}

/* ───────── 기기 캐시: 앱을 열자마자 마지막 데이터로 화면을 그림 ───────── */
const CACHE_KEY = 'hd_cache_v1';

function snapshot() {
  const from = addDays(state.today, -60);
  return {
    settings: state.settings, medications: state.meds, periods: state.periods, firstRecord: state.firstRecord,
    records: state.records.filter((r) => r.date >= from),
  };
}
export const persist = debounce(() => {
  if (PREVIEW_MODE) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ owner: currentEmail(), at: Date.now(), data: snapshot() })); } catch {}
}, 400);

export function readCache() {
  if (PREVIEW_MODE) return null;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!c || !c.owner || c.owner !== currentEmail()) return null;
    return c.data;
  } catch {
    return null;
  }
}
export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem('hd_draft');
    localStorage.removeItem('hd_drafts');
  } catch {}
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
  persist();
}

export function setMeds(list) {
  state.meds = list;
  persist();
}

export function setPeriods(list, settings) {
  state.periods = list;
  if (settings) Object.assign(state.settings, settings);
  persist();
}

/**
 * 생리 기록을 화면에 먼저 반영 (서버와 같은 규칙).
 * 잘못된 입력이면 바로 오류를 던지고, 되돌릴 수 있게 이전 목록을 돌려줌.
 */
export function applyPeriodLocal(date, type, on) {
  const before = state.periods;
  const ps = before.map((p) => ({ ...p })).sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  if (type === 'start') {
    const same = ps.find((p) => p.start_date === date);
    if (on && !same) ps.push({ start_date: date, end_date: '' });
    if (!on && same) ps.splice(ps.indexOf(same), 1);
  } else {
    const target = ps.filter((p) => p.start_date <= date).pop();
    if (!target) throw new Error('먼저 생리 시작일을 기록해주세요');
    if (on && daysBetween(target.start_date, date) > 14) throw new Error('시작일로부터 14일 안의 날짜만 종료일로 기록할 수 있어요');
    target.end_date = on ? date : target.end_date === date ? '' : target.end_date;
  }
  setPeriods(ps.sort((a, b) => (a.start_date < b.start_date ? -1 : 1)));
  return before;
}

export function applyTheme(t) {
  const theme = t === 'A' ? 'A' : 'B';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'A' ? '#F6F4EE' : '#FBF1EC');
  try { localStorage.setItem('mc_theme', theme); } catch {}
}

/** 설정 저장 (시트 settings) — 화면에는 바로 반영하고 서버 저장은 뒤에서 */
export async function saveSettings(partial, { quiet = false } = {}) {
  Object.assign(state.settings, partial);
  persist();
  try {
    const s = await api.saveSettings(partial);
    state.settings = { ...state.settings, ...s, ...partial };
    persist();
    if (!quiet) toast('저장했어요');
  } catch (e) {
    toast('설정 저장 실패: ' + e.message);
  }
}
