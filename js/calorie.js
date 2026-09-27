import { daysBetween, addDays, fmtLong, comma } from './utils.js';

export const ACTIVITY = [
  { v: 1.2, label: '거의 앉아서 생활' },
  { v: 1.375, label: '가벼운 활동 · 주 1~3회 운동' },
  { v: 1.55, label: '보통 활동 · 주 3~5회 운동' },
  { v: 1.725, label: '활발한 활동 · 주 6~7회 운동' },
];

const KCAL_PER_KG = 7700;     // 체지방 1kg ≈ 7,700kcal
const MIN_KCAL = 1200;        // 여성 최소 섭취 권장선
const MAX_WEEKLY_RATE = 0.01; // 주당 체중의 1%를 넘지 않게
const TEF_RATE = 0.1;         // 소화에 쓰는 에너지 ≈ 하루 소비의 10%
const EXERCISE_SHARE = 0.3;   // 감량분 중 운동으로 태우는 비율
const EXERCISE_MAX = 300;     // 하루 운동 권장 상한

const round10 = (v) => Math.round(v / 10) * 10;

/** 아시아·태평양 기준 BMI 구간 */
export function bmiInfo(weight, heightCm) {
  if (!(weight > 0) || !(heightCm > 0)) return null;
  const bmi = weight / (heightCm / 100) ** 2;
  const label = bmi < 18.5 ? '저체중' : bmi < 23 ? '정상' : bmi < 25 ? '과체중' : bmi < 30 ? '비만' : '고도비만';
  return { bmi, label };
}

/**
 * 칼로리 처방
 * - 기초대사량: 체지방률이 있으면 Katch-McArdle(제지방량 기반), 없으면 Mifflin-St Jeor(여성)
 * - 하루 소비 = 기초대사량 × 활동량 → 기초대사 / 활동대사 / 소화 에너지(10%)로 나눠 표시
 * - 감량분은 식단 70% · 운동 30%(최대 300kcal)로 나눔
 * - 안전장치: 식단만으로 줄여도 기초대사량·1,200kcal 아래로 내려가지 않고, 주당 체중 1% 이상 빼지 않음
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
  const tef = tdee * TEF_RATE;
  const floor = Math.max(MIN_KCAL, bmr);
  const base = {
    bmr, tdee, tef, activityKcal: Math.max(0, tdee - bmr - tef), floor, method,
    protein: Math.round(w * 1.4), bmi: bmiInfo(w, heightCm), weight: w,
  };
  const finish = (plan, deficit) => {
    const exercise = deficit > 0 ? Math.min(EXERCISE_MAX, round10(deficit * EXERCISE_SHARE)) : 0;
    return { ...plan, deficit, exercise, target: round10(tdee - (deficit - exercise)), netGoal: round10(tdee - deficit) };
  };

  const gw = Number(goalWeight);
  if (!(gw > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(goalDate || '')) return finish({ ...base, status: 'maintain' }, 0);
  const diffKg = w - gw;
  if (diffKg <= 0) return finish({ ...base, status: 'reached' }, 0);

  const days = daysBetween(today, goalDate);
  if (days <= 0) return finish({ ...base, status: 'date_passed' }, 0);

  const maxDeficit = Math.min(tdee - floor, (w * MAX_WEEKLY_RATE * KCAL_PER_KG) / 7);
  if (maxDeficit < 50) return finish({ ...base, status: 'no_room' }, 0);

  const needDeficit = (diffKg * KCAL_PER_KG) / days;
  const deficit = Math.min(needDeficit, maxDeficit);
  // 목표 날짜를 그대로 지키려면 필요한 칼로리 (안전 하한선을 적용하기 전 값)
  const goalExercise = Math.min(EXERCISE_MAX, round10(needDeficit * EXERCISE_SHARE));
  const goalPlan = {
    target: round10(tdee - (needDeficit - goalExercise)),
    exercise: goalExercise,
    netGoal: round10(tdee - needDeficit),
    weeklyLoss: (needDeficit * 7) / KCAL_PER_KG,
  };
  return finish({
    goalPlan,
    ...base,
    status: needDeficit > maxDeficit + 1 ? 'too_fast' : 'ok',
    needDeficit, days, diffKg, goalWeight: gw,
    weeklyLoss: (deficit * 7) / KCAL_PER_KG,
    safeDate: addDays(today, Math.ceil((diffKg * KCAL_PER_KG) / maxDeficit)),
  }, deficit);
}

/** AI 코치 컨텍스트용 한 줄 요약 */
export function planSummary(plan, goalWeight, goalDate) {
  if (!plan || !plan.target) return '';
  const head = `하루 음식 섭취 권장 약 ${comma(plan.target)}kcal, 운동 소모 권장 약 ${comma(plan.exercise)}kcal ` +
    `(하루 소비 ${comma(plan.tdee)}kcal = 기초대사 ${comma(plan.bmr)} + 활동 ${comma(plan.activityKcal)} + 소화 ${comma(plan.tef)}, 단백질 약 ${plan.protein}g` +
    `${plan.bmi ? `, BMI ${plan.bmi.bmi.toFixed(1)}` : ''})`;
  if (plan.status === 'ok') return `${head}, 목표 ${goalWeight}kg까지 ${goalDate}, 주당 약 ${plan.weeklyLoss.toFixed(2)}kg 감량 속도`;
  if (plan.status === 'too_fast') {
    return `${head} — 추천 칼로리. 목표 날짜(${goalDate})를 그대로 지키려면 음식 ${comma(plan.goalPlan.target)}kcal·운동 ${comma(plan.goalPlan.exercise)}kcal가 필요해 ` +
      `안전 하한선(기초대사량·1,200kcal, 주당 체중 1%)을 넘음. 추천 칼로리로 가면 ${plan.safeDate}쯤 도달`;
  }
  if (plan.status === 'reached') return `${head}, 목표 체중 도달 — 유지 모드`;
  return head;
}

export function safeDateLabel(plan) {
  return plan.safeDate ? fmtLong(plan.safeDate) : '';
}

/** 달력 판정: 순 섭취(섭취 − 운동)가 목표 이하인지 */
export function dayStatus(rec) {
  if (!rec || !(rec.intake_kcal > 0)) return null;
  if (!(rec.kcal_goal > 0)) return 'logged';
  return rec.intake_kcal - (rec.exercise_kcal || 0) <= rec.kcal_goal ? 'success' : 'over';
}
