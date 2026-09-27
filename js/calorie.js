import { daysBetween, addDays, fmtLong, comma } from './utils.js';

export const ACTIVITY = [
  { v: 1.2, label: '거의 앉아서 생활' },
  { v: 1.375, label: '가벼운 활동 · 주 1~3회 운동' },
  { v: 1.55, label: '보통 활동 · 주 3~5회 운동' },
  { v: 1.725, label: '활발한 활동 · 주 6~7회 운동' },
];

const KCAL_PER_KG = 7700;   // 체지방 1kg ≈ 7,700kcal
const MIN_KCAL = 1200;      // 여성 최소 섭취 권장선
const MAX_WEEKLY_RATE = 0.01; // 주당 체중의 1%를 넘지 않게

const round10 = (v) => Math.round(v / 10) * 10;

/**
 * 하루 권장 섭취 칼로리 계산
 * - 체지방률이 있으면 Katch-McArdle(제지방량 기반), 없으면 Mifflin-St Jeor(여성) 공식
 * - 안전장치: 기초대사량·1,200kcal 아래로 내려가지 않고, 주당 체중 1% 이상 빼지 않음
 */
export function calcPlan({ weight, fatPct, heightCm, age, activity, goalWeight, goalDate, today }) {
  const w = Number(weight);
  if (!(w > 0)) return { status: 'need_weight' };

  let bmr, method;
  if (fatPct > 3 && fatPct < 70) {
    bmr = 370 + 21.6 * w * (1 - fatPct / 100);
    method = '제지방량 기반(Katch-McArdle) 공식';
  } else if (heightCm > 0 && age > 0) {
    bmr = 10 * w + 6.25 * heightCm - 5 * age - 161;
    method = '키·나이 기반(Mifflin-St Jeor) 공식';
  } else {
    return { status: 'need_profile' };
  }

  const act = Number(activity) || 1.375;
  const tdee = bmr * act;
  const floor = Math.max(MIN_KCAL, bmr);
  const base = { bmr, tdee, floor, method, protein: Math.round(w * 1.4) };

  const gw = Number(goalWeight);
  if (!(gw > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(goalDate || '')) {
    return { ...base, status: 'maintain', target: round10(tdee) };
  }
  const diffKg = w - gw;
  if (diffKg <= 0) return { ...base, status: 'reached', target: round10(tdee) };

  const days = daysBetween(today, goalDate);
  if (days <= 0) return { ...base, status: 'date_passed', target: round10(tdee) };

  const maxDeficit = Math.min(tdee - floor, (w * MAX_WEEKLY_RATE * KCAL_PER_KG) / 7);
  if (maxDeficit < 50) return { ...base, status: 'no_room', target: round10(Math.max(tdee, floor)) };

  const needDeficit = (diffKg * KCAL_PER_KG) / days;
  const deficit = Math.min(needDeficit, maxDeficit);
  const safeDays = Math.ceil((diffKg * KCAL_PER_KG) / maxDeficit);

  return {
    ...base,
    status: needDeficit > maxDeficit + 1 ? 'too_fast' : 'ok',
    target: round10(tdee - deficit),
    deficit,
    needDeficit,
    days,
    diffKg,
    weeklyLoss: (deficit * 7) / KCAL_PER_KG,
    safeDate: addDays(today, safeDays),
  };
}

/** AI 코치 컨텍스트용 한 줄 요약 */
export function planSummary(plan, goalWeight, goalDate) {
  if (!plan || !plan.target) return '';
  const head = `하루 권장 섭취 약 ${comma(plan.target)}kcal (유지 칼로리 ${comma(plan.tdee)}kcal, 기초대사량 ${comma(plan.bmr)}kcal, 단백질 약 ${plan.protein}g)`;
  if (plan.status === 'ok') return `${head}, 목표 ${goalWeight}kg까지 ${goalDate}, 주당 약 ${plan.weeklyLoss.toFixed(2)}kg 감량 속도`;
  if (plan.status === 'too_fast') return `${head}, 목표 날짜(${goalDate})는 안전 속도를 넘어 권장 칼로리를 하한선에 맞춤. 안전 속도 도달 예상일 ${plan.safeDate}`;
  if (plan.status === 'reached') return `${head}, 목표 체중 도달 — 유지 모드`;
  return head;
}

export function safeDateLabel(plan) {
  return plan.safeDate ? fmtLong(plan.safeDate) : '';
}
