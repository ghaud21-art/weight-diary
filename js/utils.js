export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');

/** 한국 시간 기준 오늘 (yyyy-MM-dd) */
export function todayStr() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export function fmtLong(s) {
  const d = parseDate(s);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEK[d.getUTCDay()]}요일`;
}
export function fmtShort(s) {
  const d = parseDate(s);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEK[d.getUTCDay()]})`;
}
export function fmtMD(s) {
  const d = parseDate(s);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
export function weekday(s) {
  return WEEK[parseDate(s).getUTCDay()];
}
export function greeting(name) {
  const h = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
  if (h >= 5 && h < 11) return `${name}, 좋은 아침이에요`;
  if (h >= 11 && h < 17) return `${name}, 좋은 오후예요`;
  return `${name}, 편안한 저녁이에요`;
}

export const num = (v) => (v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v));
export const fix1 = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(1));
export const comma = (v) => Math.round(v).toLocaleString('ko-KR');

export function debounce(fn, ms = 600) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ───────── 생리주기 ───────── */
export function cycleDay(settings, date) {
  const start = settings.cycle_start_date;
  const len = Number(settings.cycle_length) || 28;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return null;
  const diff = daysBetween(start, date);
  if (diff < 0 || diff >= 90) return null;
  return diff + 1;
}
export function cyclePhase(day, settings = {}) {
  if (!day) return '';
  // 피임약 복용 중이면 자연 주기 단계 이름을 붙이지 않음
  if (settings.on_contraceptive === 'true') return day <= 5 ? '출혈기' : '';
  if (day <= 5) return '월경기';
  if (day <= 13) return '황금 감량기';
  if (day <= 16) return '배란기';
  return '황체기';
}

/* ───────── 자동 판정 배지 ───────── */
export function judge(cur, prev, settings = {}) {
  if (!cur || !prev || cur.weight == null || prev.weight == null) return null;
  const dw = cur.weight - prev.weight;
  const df = cur.body_fat_pct != null && prev.body_fat_pct != null ? cur.body_fat_pct - prev.body_fat_pct : 0;
  const dm = cur.muscle_mass != null && prev.muscle_mass != null ? cur.muscle_mass - prev.muscle_mass : 0;
  if (dw <= -0.1 && df < 0) return { label: '황금 감량기', tone: '' };
  if (dw >= 0.3 && df <= 0) return { label: '탄수화물 펌핑', tone: 'clay' };
  if (dw > 0 && cur.cycle_day && cur.cycle_day >= 17 && settings.on_contraceptive !== 'true') return { label: '황체기 수분', tone: 'peach' };
  if (dm >= 0.2 && df <= 0) return { label: '근육 적립', tone: '' };
  if (dw >= 0.3 && df > 0.3) return { label: '리듬 조율', tone: 'clay' };
  if (Math.abs(dw) < 0.2) return { label: '안정 유지', tone: 'neutral' };
  return null;
}

/** 해당 날짜 이전(포함) 최근 n개 기록의 평균 */
export function movingAvg(records, key, n = 7) {
  const vals = records.map((r) => r[key]).filter((v) => v != null).slice(-n);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), ms);
}

/** 사진을 긴 변 1600px JPEG로 줄여 base64 반환 */
export function resizeImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      resolve({ dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 열 수 없어요')); };
    img.src = url;
  });
}
