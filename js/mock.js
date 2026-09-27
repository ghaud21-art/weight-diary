// 미리보기 모드: GAS 없이 브라우저 localStorage에 가짜 데이터로 동작 (실제 AI 호출 없음)
import { todayStr, addDays, cycleDay } from './utils.js';

const KEY = 'mc_preview_db';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function seed() {
  const today = todayStr();
  const settings = {
    theme: 'B', nickname: '회원님', goal_body_fat_pct: '22', goal_muscle_mass: '34.5', goal_weight: '55', goal_date: addDays(today, 90),
    activity_level: '1.375', height_cm: '162', birth_year: '1990', cycle_start_date: addDays(today, -11), cycle_length: '28', on_contraceptive: 'true',
    notification_morning: 'false', notification_med: 'false', calorie_plan: '', chat_summary: '', chat_summary_date: '',
  };
  const meds = [
    ['default_1', '예시 약 A', '식후'], ['default_2', '예시 약 B', '식후'], ['default_3', '예시 약 C', '식후 즉시'], ['default_4', '예시 약 D', '공복'],
  ].map(([id, name, timing]) => ({ id, name, timing, ingredient_dose: '', is_default: true, active: true }));
  const series = [
    [59.6, 33.2, 25.6], [59.4, 33.3, 25.4], [59.7, 33.2, 25.5], [59.3, 33.3, 25.2], [59.1, 33.3, 25.0], [59.2, 33.4, 24.9],
    [58.9, 33.4, 24.8], [59.0, 33.3, 24.9], [58.7, 33.4, 24.8], [58.9, 33.4, 24.7], [58.6, 33.4, 24.3],
  ];
  const records = series.map(([weight, muscle_mass, body_fat_pct], i) => {
    const date = addDays(today, i - series.length);
    return {
      date, weight, muscle_mass, body_fat_pct, mood: ['good', 'normal', 'normal', 'hard'][i % 4], mood_note: '',
      medications_taken: ['예시 약 A', '예시 약 B'], cycle_day: cycleDay(settings, date), coach_feedback: sampleFeedback(i % 4 === 3 ? 'hard' : 'normal', '', date),
    };
  });
  return { settings, meds, records, chat: [] };
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

  switch (action) {
    case 'bootstrap': {
      const sorted = [...d.records].sort((a, b) => (a.date < b.date ? -1 : 1));
      return { today, settings: d.settings, medications: d.meds, records: sorted.filter((r) => r.date >= addDays(today, -60)), firstRecord: sorted[0] || null };
    }
    case 'getRecords':
      return d.records.filter((r) => r.date >= addDays(today, -(p.days || 60))).sort((a, b) => (a.date < b.date ? -1 : 1));
    case 'saveRecord': {
      const rec = { ...p, cycle_day: cycleDay(d.settings, p.date), coach_feedback: sampleFeedback(p.mood, p.mood_note, p.date) };
      d.records = d.records.filter((r) => r.date !== p.date).concat(rec);
      save(d);
      return { record: rec, feedbackError: null };
    }
    case 'regenerateFeedback': {
      const rec = d.records.find((r) => r.date === p.date);
      rec.coach_feedback = sampleFeedback(rec.mood, rec.mood_note, rec.date);
      save(d);
      return rec;
    }
    case 'extractInbody': {
      const last = [...d.records].sort((a, b) => (a.date < b.date ? -1 : 1)).pop() || { weight: 58.5, muscle_mass: 33.5, body_fat_pct: 24.2 };
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
      const m = d.meds.find((x) => x.id === p.id);
      if (m.is_default) m.active = false;
      else d.meds = d.meds.filter((x) => x.id !== p.id);
      save(d);
      return d.meds;
    }
    case 'getChat': {
      const rec = d.records.find((r) => r.date === today);
      return { messages: d.chat.filter((m) => m.date === today), mood: rec?.mood || '', moodNote: rec?.mood_note || '' };
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
