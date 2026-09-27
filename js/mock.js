// 미리보기 모드: GAS 없이 브라우저 localStorage에 가짜 데이터로 동작 (실제 AI 호출 없음)
import { todayStr, addDays, cycleDay, daysBetween } from './utils.js';

const KEY = 'mc_preview_db_v4';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function seed() {
  const today = todayStr();
  const settings = {
    theme: 'B', nickname: '회원님', goal_body_fat_pct: '30', goal_muscle_mass: '30', goal_weight: '80', goal_date: addDays(today, 180),
    activity_level: '1.375', height_cm: '165', birth_year: '1995', cycle_start_date: '', cycle_length: '30', on_contraceptive: 'true',
    notification_morning: 'false', notification_med: 'false', calorie_plan: '', calorie_net_goal: '1600',
    chat_summary: '', chat_summary_date: '',
  };
  const meds = [
    ['default_1', '예시 약 A', '식후'], ['default_2', '예시 약 B', '식후'], ['default_3', '예시 약 C', '식후 즉시'], ['default_4', '예시 약 D', '공복'],
  ].map(([id, name, timing]) => ({ id, name, timing, ingredient_dose: '', is_default: true, active: true }));
  const periods = [
    { start_date: addDays(today, -77), end_date: addDays(today, -72) },
    { start_date: addDays(today, -44), end_date: addDays(today, -40) },
    { start_date: addDays(today, -12), end_date: addDays(today, -8) },
  ];
  settings.cycle_start_date = periods[2].start_date;
  settings.cycle_length = '33';
  const records = [];
  let w = 91.2;
  for (let i = 40; i >= 1; i--) {
    const date = addDays(today, -i);
    w += Math.sin(i) * 0.35 - 0.06;
    const hasBody = i % 5 !== 0;
    const intake = i % 6 === 0 ? null : Math.round(1150 + Math.abs(Math.sin(i * 1.7)) * 900);
    records.push({
      date,
      weight: hasBody ? +w.toFixed(1) : null,
      muscle_mass: hasBody ? +(30.4 + Math.sin(i / 3) * 0.2).toFixed(1) : null,
      body_fat_pct: hasBody ? +(38.5 - (40 - i) * 0.03 + Math.sin(i) * 0.3).toFixed(1) : null,
      mood: hasBody ? ['good', 'normal', 'normal', 'hard'][i % 4] : '',
      mood_note: '',
      medications_taken: ['예시 약 A', '예시 약 B'],
      cycle_day: null,
      coach_feedback: hasBody ? sampleFeedback(i % 4 === 0 ? 'hard' : 'normal', '', date) : null,
      intake_kcal: intake,
      exercise_kcal: intake ? [0, 0, 200, 334][i % 4] : null,
      kcal_goal: intake ? 1600 : null,
    });
  }
  const chat = [
    { date: addDays(today, -3), timestamp: '1', role: 'user', message: '생리 시작하고 나서 계속 우울해요' },
    { date: addDays(today, -3), timestamp: '2', role: 'coach', message: '이 시기엔 호르몬 변화로 기분이 가라앉기 쉬워요. 오늘은 따뜻한 차 한 잔과 일찍 잠드는 걸 목표로 해봐요.' },
  ];
  return { settings, meds, records, periods, chat };
}

function db() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const d = seed();
  save(d);
  return d;
}
function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
}
const sortedPeriods = (d) => d.periods.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

function syncCycle(d) {
  const ps = sortedPeriods(d);
  if (!ps.length) return;
  d.settings.cycle_start_date = ps[ps.length - 1].start_date;
  const gaps = [];
  for (let i = 1; i < ps.length; i++) {
    const g = daysBetween(ps[i - 1].start_date, ps[i].start_date);
    if (g >= 15 && g <= 90) gaps.push(g);
  }
  const recent = gaps.slice(-6);
  if (recent.length) d.settings.cycle_length = String(Math.round(recent.reduce((a, b) => a + b, 0) / recent.length));
}

function sampleFeedback(mood, note, date) {
  return {
    briefing: {
      title: mood === 'hard' ? '오늘은 마음부터 챙겨요' : '숫자에 흔들리지 마세요',
      emotional: mood === 'hard' ? `${note ? `"${note}"라고 적어주셨네요. ` : ''}힘든 하루를 버텨낸 것만으로도 충분히 잘하고 계신 거예요.` : '',
      body: '어제와 비교해 작은 변동이 있었지만, 골격근량이 잘 지켜지고 있다는 건 몸이 잘 반응하고 있다는 신호예요. 오늘 숫자를 하나씩 같이 풀어볼게요.',
    },
    facts: {
      headline: '하루 사이의 변화는 대부분 수분이에요.',
      analysis: '탄수화물 1g은 수분 3~4g과 함께 글리코겐으로 저장돼요. 지방 1kg은 약 7,700kcal라서 하루 만에 늘거나 빠질 수 없어요. 7일 평균 추세는 꾸준히 내려가고 있어요.',
    },
    actions: {
      diet: '채소 → 단백질 → 복합 탄수화물 순서로 드세요. 칼로리 플랜 범위 안에서 저녁은 두부와 채소 위주가 좋아요.',
      medication: '식후 즉시 먹는 약은 식사 직후에 챙겨 위장 부담을 줄여주세요.',
      routine: '미지근한 물 1.5~2L를 나눠 마시고, 오늘은 12시 전에 잠드는 걸 목표로 해봐요.',
    },
    day_review: {
      food: '목표 칼로리 안에서 잘 드셨어요. 저녁 탄수화물이 조금 많았지만 단백질도 챙기셨어요.',
      exercise: '걷기 기록이 있어서 좋았어요. 식후 걷기는 혈당 안정에도 도움이 돼요.',
      plan_check: '아침에 정한 "점심 단백질 먼저"를 지키셨어요.',
    },
    tomorrow: {
      title: '내일은 이렇게 해봐요',
      tips: ['아침을 거르지 말고 삶은 달걀과 채소로 시작하기', '저녁 식사 후 20분 걷기', '잠들기 1시간 전에는 휴대폰 내려놓기'],
    },
    closing: { title: '골격근량, 그게 진짜 자산이에요', body: '오늘 숫자 하나에 흔들리지 마세요. 엔진은 잘 돌아가고 있어요.' },
    generated_at: `${date}T07:30:00.000Z`,
    preview: true,
  };
}

export async function mockCall(action, p) {
  await wait(action === 'saveRecord' || action === 'sendChat' || action === 'extractInbody' ? 900 : 120);
  // 지연 뒤에 읽어야 동시에 들어온 다른 저장을 덮어쓰지 않음
  const d = db();
  const today = todayStr();
  const sorted = () => [...d.records].sort((a, b) => (a.date < b.date ? -1 : 1));

  switch (action) {
    case 'bootstrap': {
      const all = sorted();
      return {
        today, settings: d.settings, medications: d.meds, periods: sortedPeriods(d),
        records: all.filter((r) => r.date >= addDays(today, -60)), firstRecord: all.find((r) => r.weight != null) || null,
      };
    }
    case 'getRecords':
      return sorted().filter((r) => r.date >= addDays(today, -(p.days || 60)));
    case 'getRange':
      return { records: sorted().filter((r) => r.date >= p.from && r.date <= p.to), periods: sortedPeriods(d) };
    case 'saveRecord': {
      const old = d.records.find((r) => r.date === p.date) || {};
      const { skipFeedback, ...fields } = p;
      const rec = {
        ...fields, cycle_day: cycleDay(d.settings, p.date), coach_feedback: skipFeedback ? (old.coach_feedback || null) : sampleFeedback(p.mood, p.mood_note, p.date),
        intake_kcal: old.intake_kcal ?? null, exercise_kcal: old.exercise_kcal ?? null, kcal_goal: old.kcal_goal ?? null,
        morning_feedback: old.morning_feedback || null, food_log: old.food_log || [], exercise_log: old.exercise_log || [],
      };
      d.records = d.records.filter((r) => r.date !== p.date).concat(rec);
      save(d);
      return { record: rec, feedbackError: null };
    }
    case 'addLog':
    case 'updateLog':
    case 'deleteLog': {
      let rec = d.records.find((r) => r.date === p.date);
      if (!rec) {
        rec = { date: p.date, weight: null, muscle_mass: null, body_fat_pct: null, mood: '', mood_note: '', medications_taken: [], coach_feedback: null, kcal_goal: null };
        d.records.push(rec);
      }
      rec.food_log ||= [];
      rec.exercise_log ||= [];
      const list = p.kind === 'exercise' ? rec.exercise_log : rec.food_log;
      if (action === 'addLog') {
        // 미리보기용 가짜 판정: 쉼표로 나눈 항목마다 음식 300kcal, 운동 150kcal
        const parts = p.text.split(/[,+]/).map((x) => x.trim()).filter(Boolean);
        const per = p.kind === 'exercise' ? 150 : 300;
        list.push({ id: Math.random().toString(36).slice(2, 10), time: p.time || '', text: p.text, kcal: parts.length * per, items: parts.map((name) => ({ name, amount: '1인분', kcal: per })), note: '' });
      } else if (action === 'updateLog') {
        const it = list.find((x) => x.id === p.id);
        if (it) Object.assign(it, { kcal: p.kcal, edited: true });
      } else {
        const i = list.findIndex((x) => x.id === p.id);
        if (i >= 0) list.splice(i, 1);
      }
      const sum = (l) => l.reduce((a, x) => a + x.kcal, 0);
      rec.intake_kcal = rec.food_log.length ? sum(rec.food_log) : null;
      rec.exercise_kcal = rec.food_log.length || rec.exercise_log.length ? sum(rec.exercise_log) : null;
      if (rec.kcal_goal == null) rec.kcal_goal = Number(d.settings.calorie_net_goal) || null;
      save(d);
      return rec;
    }
    case 'morningFeedback': {
      const rec = d.records.find((r) => r.date === p.date);
      if (!rec || rec.weight == null) throw new Error('먼저 오늘 인바디를 저장해주세요');
      rec.morning_feedback = {
        title: '밤사이 수분이 빠진 가벼운 아침이에요',
        analysis: '어제 저녁을 가볍게 드셔서 글리코겐과 함께 붙어 있던 수분이 빠졌어요. 골격근량은 그대로라 대사 엔진은 잘 지켜지고 있어요. (미리보기 예시)',
        plan: {
          meals: '아침 400 · 점심 600 · 저녁 500 · 간식 200kcal 정도로 나눠보세요. 점심에 단백질을 넉넉히 드세요.',
          exercise: '저녁 식사 1시간 뒤 30분 빠르게 걷기가 좋아요. 공복 고강도 운동은 피해주세요.',
          routine: '물 1.5L를 오전·오후로 나눠 마시고, 식후 약은 식사 직후에 챙겨주세요.',
        },
        focus: '점심에 단백질 한 손바닥 먼저 먹기',
        generated_at: new Date().toISOString(),
      };
      save(d);
      return rec;
    }
    case 'saveDay': {
      let rec = d.records.find((r) => r.date === p.date);
      if (!rec) {
        rec = { date: p.date, weight: null, muscle_mass: null, body_fat_pct: null, mood: '', mood_note: '', medications_taken: [], cycle_day: cycleDay(d.settings, p.date), coach_feedback: null, kcal_goal: null };
        d.records.push(rec);
      }
      if (p.food_note !== undefined) rec.food_note = p.food_note;
      if (p.exercise_note !== undefined) rec.exercise_note = p.exercise_note;
      if (p.estimate) {
        // 미리보기용 가짜 판정: 쉼표·줄바꿈으로 나눈 항목마다 350kcal, 운동 항목마다 150kcal
        const split = (t) => (t || '').split(/[,\n/]+/).map((x) => x.trim()).filter(Boolean);
        const food = split(rec.food_note).map((name) => ({ name, amount: '1인분', kcal: 350 }));
        const ex = split(rec.exercise_note).map((name) => ({ name, amount: '30분', kcal: 150 }));
        rec.food_detail = { food_items: food, food_total: food.length * 350, exercise_items: ex, exercise_total: ex.length * 150, note: '미리보기 모드라 실제 AI 계산이 아니에요.' };
        rec.intake_kcal = food.length ? rec.food_detail.food_total : null;
        rec.exercise_kcal = ex.length ? rec.food_detail.exercise_total : 0;
      } else {
        if (p.intake_kcal !== undefined) rec.intake_kcal = p.intake_kcal;
        if (p.exercise_kcal !== undefined) rec.exercise_kcal = p.exercise_kcal;
      }
      if (rec.kcal_goal == null) rec.kcal_goal = Number(d.settings.calorie_net_goal) || null;
      save(d);
      return rec;
    }
    case 'setPeriod': {
      const ps = sortedPeriods(d);
      if (p.type === 'start') {
        const same = ps.find((x) => x.start_date === p.date);
        if (p.on && !same) d.periods.push({ start_date: p.date, end_date: '' });
        if (!p.on && same) d.periods = d.periods.filter((x) => x.start_date !== p.date);
      } else {
        const target = ps.filter((x) => x.start_date <= p.date).pop();
        if (!target) throw new Error('먼저 생리 시작일을 기록해주세요');
        if (p.on && daysBetween(target.start_date, p.date) > 14) throw new Error('시작일로부터 14일 안의 날짜만 종료일로 기록할 수 있어요');
        const t = d.periods.find((x) => x.start_date === target.start_date);
        t.end_date = p.on ? p.date : t.end_date === p.date ? '' : t.end_date;
      }
      syncCycle(d);
      save(d);
      return { periods: sortedPeriods(d), settings: d.settings };
    }
    case 'regenerateFeedback': {
      const rec = d.records.find((r) => r.date === p.date);
      rec.coach_feedback = sampleFeedback(rec.mood, rec.mood_note, rec.date);
      save(d);
      return rec;
    }
    case 'extractInbody': {
      const last = sorted().filter((r) => r.weight != null).pop() || { weight: 90, muscle_mass: 30.5, body_fat_pct: 38 };
      return { weight: +(last.weight - 0.2).toFixed(1), muscle_mass: +(last.muscle_mass + 0.1).toFixed(1), body_fat_pct: +(last.body_fat_pct - 0.2).toFixed(1) };
    }
    case 'saveSettings':
      Object.assign(d.settings, p);
      save(d);
      return d.settings;
    case 'addMed':
      d.meds.push({ id: 'm_' + Math.random().toString(36).slice(2, 10), name: p.name, timing: p.timing || '', ingredient_dose: p.ingredient_dose || '', is_default: false, active: true });
      save(d);
      return d.meds;
    case 'updateMed': {
      const m = d.meds.find((x) => x.id === p.id);
      Object.assign(m, p);
      save(d);
      return d.meds;
    }
    case 'deleteMed': {
      d.meds = d.meds.filter((x) => x.id !== p.id);
      save(d);
      return d.meds;
    }
    case 'getChat': {
      const rec = d.records.find((r) => r.date === today);
      const last = sortedPeriods(d).pop();
      const since = last ? daysBetween(last.start_date, today) : -1;
      const phase = since >= 0 && since < 5 ? { phase: 'period', day: since + 1 } : { phase: 'other' };
      return { today, messages: d.chat.slice(-80), mood: rec?.mood || '', moodNote: rec?.mood_note || '', phase };
    }
    case 'sendChat': {
      const crisis = /죽고\s*싶|자살|자해|사라지고\s*싶/.test(p.message);
      let reply = '이야기해주셔서 고마워요. 몸이 지치면 마음도 같이 예민해지기 쉬워요. 오늘은 무리한 목표 대신 물 챙기기랑 약 시간 지키기만 신경 써볼까요?\n\n(미리보기 모드라 실제 AI 답변이 아니에요.)';
      if (crisis) reply += '\n\n지금 많이 힘드시다면 자살예방상담전화 1393(24시간)에 전화해주세요.';
      const ts = new Date().toISOString();
      d.chat.push({ date: today, timestamp: ts, role: 'user', message: p.message }, { date: today, timestamp: ts, role: 'coach', message: reply });
      save(d);
      return { reply, crisis, timestamp: ts };
    }
    default:
      throw new Error('unknown_action');
  }
}

export function resetPreview() {
  try { localStorage.removeItem(KEY); } catch {}
}
