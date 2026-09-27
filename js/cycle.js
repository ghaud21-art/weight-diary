import { addDays, daysBetween, fmtLong } from './utils.js';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/**
 * 기록된 생리 시작·종료일로 주기 계산 (최근 6회 평균)
 * 불규칙한 주기를 고려해 "마지막 시작일로부터 며칠째"로 표시하고, 순환 계산은 하지 않음
 */
export function periodStats(periods, settings, today) {
  const ps = (periods || []).filter((p) => isDate(p.start_date)).slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const gaps = [];
  for (let i = 1; i < ps.length; i++) {
    const g = daysBetween(ps[i - 1].start_date, ps[i].start_date);
    if (g >= 15 && g <= 90) gaps.push(g);
  }
  const recent = gaps.slice(-6);
  const avgCycle = recent.length ? mean(recent) : Number(settings.cycle_length) || 28;
  const lens = ps.filter((p) => isDate(p.end_date)).map((p) => daysBetween(p.start_date, p.end_date) + 1).filter((l) => l >= 1 && l <= 14).slice(-6);
  const avgLen = lens.length ? mean(lens) : 5;

  // 기록이 없으면 설정의 최근 시작일을 대신 사용
  const last = ps[ps.length - 1] || (isDate(settings.cycle_start_date) ? { start_date: settings.cycle_start_date, end_date: '' } : null);
  const out = {
    periods: ps, gaps: recent, avgCycle, avgLen, last,
    spread: recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : null,
    day: null, next: null, bleeding: false, lateBy: 0,
  };
  if (!last) return out;

  const diff = daysBetween(last.start_date, today);
  if (diff >= 0 && diff < 90) out.day = diff + 1;
  out.next = addDays(last.start_date, Math.round(avgCycle));
  out.bleeding = diff >= 0 && (isDate(last.end_date) ? today <= last.end_date : diff < Math.min(10, Math.round(avgLen)));
  if (today > out.next) out.lateBy = daysBetween(out.next, today);
  return out;
}

/** 헤더에 보여줄 한 줄 요약 */
export function cycleLabel(st) {
  if (!st.last) return '';
  if (st.bleeding) return `생리 ${st.day}일째`;
  if (st.lateBy > 0) return `생리 예정일 ${st.lateBy}일 지남`;
  if (st.day) return `생리 시작 ${st.day}일째`;
  return '';
}

export function nextLabel(st) {
  if (!st.next) return '';
  return fmtLong(st.next).replace(/ \S+요일$/, '');
}

/**
 * 달력 표시용: 날짜 → 'period' | 'predicted'
 * 기록된 생리 기간과, 마지막 시작일 이후 예상 생리 기간(앞으로 3회)을 표시
 */
export function periodMarks(st) {
  const marks = {};
  const len = Math.max(1, Math.round(st.avgLen));
  st.periods.forEach((p, i) => {
    const isLast = i === st.periods.length - 1;
    const end = isDate(p.end_date) ? p.end_date : addDays(p.start_date, (isLast ? len : Math.min(len, 7)) - 1);
    for (let d = p.start_date; d <= end; d = addDays(d, 1)) marks[d] = 'period';
  });
  if (st.last && st.periods.length) {
    const cyc = Math.round(st.avgCycle);
    for (let k = 1; k <= 3; k++) {
      const s = addDays(st.last.start_date, cyc * k);
      for (let j = 0; j < len; j++) {
        const d = addDays(s, j);
        if (!marks[d]) marks[d] = 'predicted';
      }
    }
  }
  return marks;
}
