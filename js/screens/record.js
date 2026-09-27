import { api } from '../api.js';
import { icon } from '../icons.js';
import { state, activeMeds, morningOn as recordOn, recordOn as dayRecordOn, latestRecord, upsertRecord, saveSettings, setMeds } from '../store.js';
import { $, $$, esc, num, fix1, comma, fmtLong, greeting, movingAvg, debounce, toast, resizeImage } from '../utils.js';
import { calcPlan, planSummary, safeDateLabel, ACTIVITY } from '../calorie.js';
import { topbar, previewBanner, timingTone } from './common.js';

let feedbackPending = false; // 저장은 끝났고 코치 피드백을 만드는 중

const MOODS = [
  { v: 'good', label: '좋음', svg: icon.moodGood },
  { v: 'normal', label: '보통', svg: icon.moodNormal },
  { v: 'hard', label: '힘듦', svg: icon.moodHard },
];

function initDraft() {
  if (state.draft && state.draft.date === state.today) return state.draft;
  const rec = recordOn(state.today);
  const day = dayRecordOn(state.today);
  const kept = readDraft();
  if (kept) {
    state.draft = { food_note: '', exercise_note: '', ...kept, kcalWeight: null };
    return state.draft;
  }
  state.draft = {
    food_note: day?.food_note || '',
    exercise_note: day?.exercise_note || '',
    date: state.today,
    weight: rec?.weight ?? null,
    muscle_mass: rec?.muscle_mass ?? null,
    body_fat_pct: rec?.body_fat_pct ?? null,
    mood: rec?.mood || '',
    mood_note: rec?.mood_note || '',
    taken: rec ? [...rec.medications_taken] : [],
    kcalWeight: null, // 칼로리 카드에서 직접 고친 현재 체중 (없으면 인바디 값 사용)
  };
  return state.draft;
}

export function render(view) {
  const d = initDraft();
  const s = state.settings;
  const last = latestRecord();

  view.innerHTML = `
    ${topbar()}
    <div class="page-title">
      <h1>${esc(greeting(s.nickname || '회원님'))}</h1>
      <p>${fmtLong(state.today)}</p>
    </div>
    ${previewBanner()}
    <div class="stack">

      <section class="card" aria-labelledby="h-inbody">
        <h2 id="h-inbody">오늘의 인바디</h2>
        <label class="upload" id="upload">
          <span class="ico" id="upload-ico">${icon.camera()}</span>
          <span class="txt" id="upload-txt">인바디 사진을 올려서 자동으로 수치를 읽어와요</span>
          <input type="file" accept="image/*" id="upload-input" aria-label="인바디 사진 올리기">
        </label>
        <div class="row" style="margin-top:14px">
          ${numField('weight', '체중 (kg)', d.weight, last?.weight)}
          ${numField('muscle_mass', '골격근량 (kg)', d.muscle_mass, last?.muscle_mass)}
          ${numField('body_fat_pct', '체지방률 (%)', d.body_fat_pct, last?.body_fat_pct)}
        </div>
        <p class="hint" id="inbody-hint" hidden></p>
        <button type="button" class="btn inbody-save" data-save data-label="인바디 저장">인바디 저장</button>
        <p class="hint save-note">마음·복용약까지 함께 저장돼요. 나중에 고쳐서 다시 저장해도 괜찮아요.</p>
      </section>

      <section class="card" aria-labelledby="h-mood">
        <h2 id="h-mood">오늘의 마음</h2>
        <fieldset class="mood-group">
          <legend class="sr-only">오늘 컨디션 선택</legend>
          ${MOODS.map((m) => `
            <label class="mood">
              <input type="radio" name="mood" value="${m.v}" ${d.mood === m.v ? 'checked' : ''}>
              ${m.svg()}<span>${m.label}</span>
            </label>`).join('')}
        </fieldset>
        <label class="label" for="mood-note" style="margin:14px 0 6px">오늘 있었던 일 (선택)</label>
        <input class="input" id="mood-note" type="text" maxlength="300" placeholder="한 줄로 편하게 적어보세요" value="${esc(d.mood_note)}">
        <button type="button" class="btn mood-save" data-save data-label="마음 저장">마음 저장</button>
      </section>

      <section class="card" aria-labelledby="h-med">
        <h2 id="h-med">오늘의 복용약</h2>
        <div class="med-list" id="med-list">${medListHtml(d)}</div>
        <form class="med-add" id="med-add">
          <p>약을 직접 추가할게요</p>
          <div class="row">
            <input class="input" name="name" type="text" placeholder="약 이름" required maxlength="60" aria-label="약 이름">
            <input class="input timing" name="timing" type="text" placeholder="복용 타이밍" maxlength="40" aria-label="복용 타이밍">
          </div>
          <input class="input" name="ingredient_dose" type="text" placeholder="성분 · 용량 (예: 메트포르민 500mg)" maxlength="80" aria-label="성분 · 용량">
          <button type="submit" class="btn outline">${icon.plus()} 목록에 추가</button>
        </form>
        <button type="button" class="btn med-save" data-save data-label="복용약 저장">복용약 저장</button>
      </section>

      <div id="coach-preview">${previewHtml()}</div>

      <section class="card" aria-labelledby="h-food" id="food-card">${foodHtml()}</section>

      <section class="card" aria-labelledby="h-goal" id="goal-card">${goalHtml()}</section>

      <section class="card" aria-labelledby="h-kcal">
        <div class="card-head">
          <h2 id="h-kcal">칼로리 처방</h2>
          <span class="meta">목표 체중 · 날짜로 계산해요</span>
        </div>
        <div class="kcal-inputs">
          <div>
            <label class="label" for="k-cur">현재 체중</label>
            <input class="input" id="k-cur" type="number" step="0.1" inputmode="decimal" placeholder="kg">
          </div>
          <div>
            <label class="label" for="k-goal">목표 체중</label>
            <input class="input" id="k-goal" type="number" step="0.1" inputmode="decimal" placeholder="kg" value="${esc(s.goal_weight || '')}">
          </div>
          <div>
            <label class="label" for="k-date">목표 날짜</label>
            <input class="input" id="k-date" type="date" min="${state.today}" value="${esc(s.goal_date || '')}">
          </div>
        </div>
        <div class="activity-row">
          <label class="label" for="k-act">활동량</label>
          <select class="select" id="k-act">
            ${ACTIVITY.map((a) => `<option value="${a.v}" ${Number(s.activity_level || 1.375) === a.v ? 'selected' : ''}>${a.label}</option>`).join('')}
          </select>
        </div>
        <div class="kcal-result" id="kcal-result"></div>
      </section>

      <div class="send-box">
        <button type="button" class="btn lg" id="send-coach">${icon.chat(16)} ${sendLabel()}</button>
        <p class="hint">오늘 기록을 다 마쳤으면 눌러주세요. 저장 안 된 내용은 함께 저장하고, 코치 피드백은 이 버튼으로만 받아요.</p>
      </div>
    </div>
    <div class="dirty-bar" id="dirty-bar" role="status" hidden>
      <span>저장하지 않은 기록이 있어요</span>
      <button type="button" class="btn bar-save" data-save data-label="저장">저장</button>
    </div>`;

  bindInbody(view);
  bindMood(view);
  bindMeds(view);
  bindKcal(view);
  bindFood(view);
  $$('[data-save]', view).forEach((b) => b.addEventListener('click', () => onSave(view)));
  $('#send-coach', view).addEventListener('click', () => sendToCoach(view));
  markDirty(view);
}

function numField(key, label, val, placeholder) {
  return `
    <div>
      <label class="label" for="f-${key}">${label}</label>
      <input class="input num" id="f-${key}" data-key="${key}" type="number" step="0.1" inputmode="decimal"
        value="${val ?? ''}" placeholder="${placeholder != null ? fix1(placeholder) : ''}">
    </div>`;
}

function medListHtml(d) {
  const meds = activeMeds();
  if (!meds.length) return '<p class="hint" style="margin:0">등록된 약이 없어요.</p>';
  return meds.map((m) => `
    <div class="med">
      <input id="med-${esc(m.id)}" type="checkbox" value="${esc(m.name)}" ${d.taken.includes(m.name) ? 'checked' : ''}>
      <label for="med-${esc(m.id)}">${esc(m.name)}${m.ingredient_dose ? `<small>${esc(m.ingredient_dose)}</small>` : ''}</label>
      ${m.timing ? `<span class="chip ${timingTone(m.timing)}">${esc(m.timing)}</span>` : ''}
    </div>`).join('');
}

function previewHtml() {
  const rec = recordOn(state.today);
  const fb = rec?.coach_feedback;
  let body, links;
  if (!rec) {
    body = '오늘 기록을 마치고 맨 아래 "코치에게 보내기"를 누르면 코치가 오늘의 몸 상태를 풀어서 설명해드려요.';
    links = `<a class="link-btn" href="#/chat">${icon.chat()} AI 코치와 대화하기</a>`;
  } else if (!fb && feedbackPending) {
    body = '코치가 오늘의 피드백을 쓰고 있어요. 잠시만 기다려주세요.';
    links = `<span class="link-btn muted"><span class="spinner dark"></span> 작성 중…</span>`;
  } else if (!fb) {
    body = '기록은 저장됐어요. 다 적었으면 맨 아래 "코치에게 보내기"를 눌러주세요.';
    links = `<a class="link-btn" href="#/chat">${icon.chat()} AI 코치와 대화하기</a>`;
  } else {
    const text = fb.legacy || fb.briefing?.emotional || fb.briefing?.body || '';
    body = text.length > 90 ? text.slice(0, 90) + '…' : text;
    links = `<a class="link-btn peach" href="#/coach">자세히 보기 →</a>
             <a class="link-btn" href="#/chat">${icon.chat()} AI 코치와 대화하기</a>`;
  }
  return `
    <section class="coach-preview" aria-label="오늘의 코치 피드백">
      <div class="inner">
        <span class="badge-ico">${icon.sun()}</span>
        <div style="flex:1;min-width:0">
          <p class="title">${fb?.briefing?.title ? esc(fb.briefing.title) : '오늘의 코치 피드백'}</p>
          <p class="body">${esc(body)}</p>
        </div>
      </div>
      <div class="links">${links}</div>
    </section>`;
}

function goalHtml() {
  const s = state.settings;
  const goal = num(s.goal_body_fat_pct);
  const avg = movingAvg(state.records, 'body_fat_pct', 7);
  const base = state.firstRecord?.body_fat_pct;
  const muscleNow = latestRecord()?.muscle_mass;
  const goalMuscle = num(s.goal_muscle_mass);
  let pct = 0, text;
  if (goal == null) {
    text = '설정에서 목표 체지방률을 정해주세요.';
  } else if (avg == null) {
    text = '기록이 쌓이면 7일 이동평균으로 진행률을 보여드려요.';
  } else if (avg <= goal) {
    pct = 100;
    text = `7일 이동평균 ${avg.toFixed(1)}% — 목표에 도달했어요. 이제 유지 모드예요.`;
  } else {
    pct = base && base > goal ? Math.max(3, Math.min(100, ((base - avg) / (base - goal)) * 100)) : 3;
    text = `7일 이동평균 ${avg.toFixed(1)}% → 목표까지 ${(avg - goal).toFixed(1)}%p 남았어요`;
  }
  return `
    <div class="card-head">
      <h2 id="h-goal">목표까지</h2>
      <span class="meta">체지방률 목표 ${goal != null ? goal.toFixed(1) + '%' : '-'}</span>
    </div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="체지방률 목표 진행률"><div style="width:${pct}%"></div></div>
    <p class="hint">${esc(text)}</p>
    ${goalMuscle != null && muscleNow != null ? `<p class="hint" style="margin-top:4px">골격근량 ${fix1(muscleNow)}kg / 목표 ${fix1(goalMuscle)}kg</p>` : ''}`;
}

/* ───────── 인바디 ───────── */
function bindInbody(view) {
  const d = state.draft;
  $$('.input.num', view).forEach((inp) =>
    inp.addEventListener('input', () => {
      d[inp.dataset.key] = num(inp.value);
      markDirty(view);
      if (inp.dataset.key === 'weight' || inp.dataset.key === 'body_fat_pct') updateKcal(view);
    }),
  );

  $('#upload-input', view).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const box = $('#upload', view), txt = $('#upload-txt', view), ico = $('#upload-ico', view), hint = $('#inbody-hint', view);
    box.classList.add('busy');
    try {
      const img = await resizeImage(file);
      ico.innerHTML = `<img src="${img.dataUrl}" alt="">`;
      txt.innerHTML = '<span style="display:inline-flex;gap:8px;align-items:center"><span class="spinner dark"></span>사진에서 수치를 읽는 중이에요…</span>';
      const r = await api.extractInbody(img.base64, img.mimeType);
      let found = 0;
      for (const key of ['weight', 'muscle_mass', 'body_fat_pct']) {
        if (r[key] != null) {
          const inp = $(`#f-${key}`, view);
          inp.value = r[key];
          d[key] = Number(r[key]);
          inp.classList.remove('flash');
          void inp.offsetWidth;
          inp.classList.add('flash');
          found++;
        }
      }
      txt.textContent = found ? '다른 사진으로 다시 읽기' : '수치를 찾지 못했어요. 직접 입력해주세요';
      hint.hidden = !found;
      hint.textContent = '사진에서 읽어온 값이에요. 맞는지 확인하고 저장해주세요.';
      markDirty(view);
      updateKcal(view);
    } catch (err) {
      txt.textContent = '읽기에 실패했어요. 직접 입력하거나 다시 시도해주세요';
      toast(err.message);
    } finally {
      box.classList.remove('busy');
    }
  });
}

function bindMood(view) {
  const d = state.draft;
  $$('input[name="mood"]', view).forEach((r) => r.addEventListener('change', () => { d.mood = r.value; markDirty(view); }));
  $('#mood-note', view).addEventListener('input', (e) => { d.mood_note = e.target.value; markDirty(view); });
}

/* ───────── 복용약 ───────── */
function bindMeds(view) {
  const d = state.draft;
  const list = $('#med-list', view);
  list.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const name = e.target.value;
    d.taken = e.target.checked ? [...new Set([...d.taken, name])] : d.taken.filter((n) => n !== name);
    markDirty(view);
  });

  const form = $('#med-add', view);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const med = { name: fd.get('name').trim(), timing: fd.get('timing').trim(), ingredient_dose: fd.get('ingredient_dose').trim() };
    if (!med.name) return;
    const before = state.meds;
    setMeds(before.concat({ ...med, id: 'tmp_' + Date.now(), is_default: false, active: true }));
    form.reset();
    list.innerHTML = medListHtml(d);
    toast(`${med.name}을(를) 목록에 추가했어요`);
    try {
      setMeds(await api.addMed(med));
      list.innerHTML = medListHtml(d);
    } catch (err) {
      setMeds(before);
      list.innerHTML = medListHtml(d);
      toast('추가 실패: ' + err.message);
    }
  });
}

/* ───────── 저장 · 코치에게 보내기 ───────── */
const sendLabel = () => (recordOn(state.today)?.coach_feedback ? '코치에게 다시 보내기' : '코치에게 보내기');

/** 오늘 기록 저장 (코치 피드백은 만들지 않음). 성공하면 true */
async function saveDraft(view) {
  const d = state.draft;
  if (d.weight == null && d.muscle_mass == null && d.body_fat_pct == null && !d.mood && !d.taken.length) {
    toast('인바디 수치, 오늘의 마음, 복용약 중 하나는 입력해주세요');
    return false;
  }
  const btns = $$('[data-save]', view);
  btns.forEach((b) => { b.disabled = true; b.innerHTML = '<span class="spinner"></span> 저장하는 중…'; });
  try {
    const res = await api.saveRecord({
      date: d.date,
      weight: d.weight,
      muscle_mass: d.muscle_mass,
      body_fat_pct: d.body_fat_pct,
      mood: d.mood,
      mood_note: d.mood_note.trim(),
      medications_taken: d.taken,
      skipFeedback: true,
    });
    // 기존 피드백은 유지 (다시 보내기 전까지)
    const prev = recordOn(state.today)?.coach_feedback || null;
    upsertRecord({ ...res.record, coach_feedback: res.record.coach_feedback || prev });
    markDirty(view);
    $('#goal-card', view).innerHTML = goalHtml();
    return true;
  } catch (err) {
    toast('저장 실패: ' + err.message);
    return false;
  } finally {
    btns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.label; });
  }
}

async function onSave(view) {
  if (await saveDraft(view)) toast('저장했어요');
}

/** 맨 아래 버튼: 저장 안 된 기록이 있으면 먼저 저장하고, 코치 피드백을 한 번 받음 */
async function sendToCoach(view) {
  const btn = $('#send-coach', view);
  const refreshPreview = () => {
    const box = $('#coach-preview', view);
    if (box) box.innerHTML = previewHtml();
  };
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 코치에게 보내는 중…';
  try {
    if (isDirty() || !recordOn(state.today)) {
      if (!(await saveDraft(view))) return;
    }
    feedbackPending = true;
    refreshPreview();
    $('#coach-preview', view).scrollIntoView({ behavior: 'smooth', block: 'center' });
    upsertRecord(await api.regenerateFeedback(state.today));
    toast('오늘의 코치 피드백이 도착했어요');
  } catch (err) {
    toast('피드백을 만들지 못했어요: ' + err.message);
  } finally {
    feedbackPending = false;
    refreshPreview();
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = `${icon.chat(16)} ${sendLabel()}`;
    }
  }
}

/* ───────── 칼로리 플랜 ───────── */
function currentPlanInput(view) {
  const d = state.draft;
  const s = state.settings;
  const last = latestRecord();
  const weight = d.kcalWeight ?? d.weight ?? last?.weight ?? null;
  const fatPct = d.body_fat_pct ?? last?.body_fat_pct ?? null;
  const by = num(s.birth_year);
  return {
    weight,
    fatPct,
    heightCm: num(s.height_cm),
    age: by ? Number(state.today.slice(0, 4)) - by : null,
    activity: num($('#k-act', view).value),
    goalWeight: num($('#k-goal', view).value),
    goalDate: $('#k-date', view).value,
    today: state.today,
  };
}

const persistGoal = debounce((obj) => saveSettings(obj, { quiet: true }), 900);

function updateKcal(view) {
  const input = currentPlanInput(view);
  const curEl = $('#k-cur', view);
  if (state.draft.kcalWeight == null) {
    curEl.value = '';
    curEl.placeholder = input.weight != null ? fix1(input.weight) : 'kg';
  }
  const plan = calcPlan(input);
  $('#kcal-result', view).innerHTML = kcalHtml(plan, input);
  const fix = $('#k-fix-date', view);
  if (fix) fix.addEventListener('click', () => {
    $('#k-date', view).value = plan.safeDate;
    onGoalChange(view);
  });
  return plan;
}


function onGoalChange(view) {
  const plan = updateKcal(view);
  const gw = $('#k-goal', view).value;
  const gd = $('#k-date', view).value;
  persistGoal({
    goal_weight: gw,
    goal_date: gd,
    activity_level: $('#k-act', view).value,
    ...planSettings(plan, gw, gd),
  });
}

/** 코치와 달력이 참고하는 칼로리 처방 값 */
function planSettings(plan, gw, gd) {
  if (!plan.target) return {};
  return {
    calorie_plan: planSummary(plan, gw, gd),
    calorie_target: String(plan.target),
    calorie_exercise: String(plan.exercise),
    calorie_net_goal: String(plan.netGoal),
  };
}

function bindKcal(view) {
  const d = state.draft;
  if (d.kcalWeight != null) $('#k-cur', view).value = d.kcalWeight;
  $('#k-cur', view).addEventListener('input', (e) => {
    d.kcalWeight = num(e.target.value);
    onGoalChange(view);
  });
  ['#k-goal', '#k-date', '#k-act'].forEach((sel) => $(sel, view).addEventListener('input', () => onGoalChange(view)));
  const plan = updateKcal(view);
  // 최신 기록 기준 처방이 저장된 값과 다르면 조용히 갱신
  const next = planSettings(plan, state.settings.goal_weight, state.settings.goal_date);
  if (Object.keys(next).some((k) => next[k] !== state.settings[k])) persistGoal(next);
}

function kcalHtml(p, input) {
  if (p.status === 'need_weight') {
    return '<p class="hint" style="margin:0">현재 체중을 입력하면 칼로리 처방을 계산해드려요.</p>';
  }
  if (p.status === 'need_profile') {
    return '<p class="hint" style="margin:0">체지방률을 입력하거나, <a class="link-btn" href="#/settings">설정</a>에서 키와 출생연도를 알려주시면 계산할 수 있어요.</p>';
  }

  const losing = p.status === 'ok' || p.status === 'too_fast';
  let notice = '';
  let compare = '';
  if (losing) {
    const g = p.goalPlan;
    const fast = p.status === 'too_fast';
    const kcal = (v) => (v > 0 ? `${comma(v)}<small>kcal</small>` : '0<small>kcal 이하</small>');
    const goalDay = fmtLong(input.goalDate).replace(/ \S+요일$/, '');
    compare = `
      <div class="rx-compare">
        <div class="rx-col goal ${fast ? '' : 'safe'}">
          <p class="k">목표 날짜(${esc(goalDay)})대로라면</p>
          <strong>${kcal(g.target)}</strong>
          <p class="s">운동 ${comma(g.exercise)}kcal · 주당 −${g.weeklyLoss.toFixed(2)}kg</p>
          <span class="chip ${fast ? 'clay' : 'neutral'}">${fast ? '안전 하한선 아래' : '안전 범위'}</span>
        </div>
        <div class="rx-col rec">
          <p class="k">추천 칼로리</p>
          <strong>${kcal(p.target)}</strong>
          <p class="s">운동 ${comma(p.exercise)}kcal · 주당 −${p.weeklyLoss.toFixed(2)}kg</p>
          <span class="chip">${fast ? esc(safeDateLabel(p).replace(/ \S+요일$/, '')) + '쯤 도달' : '목표 날짜에 도달'}</span>
        </div>
      </div>`;
    notice = fast
      ? `
      <div class="notice">
        목표 날짜를 지키려면 하루 ${comma(p.needDeficit)}kcal를 줄여야 해요. 이건 안전 하한선(기초대사량 ${comma(p.bmr)}kcal·최소 1,200kcal 이상 섭취, 주당 체중의 1% 이내)보다 빠른 속도라,
        아래 처방은 <strong>추천 칼로리</strong> 기준이에요.
        <br><button type="button" class="link-btn" id="k-fix-date">목표 날짜를 ${esc(safeDateLabel(p))}로 바꾸기</button>
      </div>`
      : '<p class="hint">목표 날짜대로 가도 안전한 속도라서 추천 칼로리와 같아요.</p>';
  } else if (p.status === 'reached') {
    notice = '<div class="notice">현재 체중이 목표 체중 이하예요. 유지 칼로리로 안내할게요.</div>';
  } else if (p.status === 'date_passed') {
    notice = '<div class="notice">목표 날짜가 지났어요. 새 날짜를 골라주세요.</div>';
  } else if (p.status === 'no_room') {
    notice = '<div class="notice">지금 활동량에서는 더 줄일 여유가 없어요. 활동량을 늘리는 쪽으로 코치와 이야기해봐요.</div>';
  } else if (p.status === 'maintain') {
    notice = '<div class="notice">위에서 <strong>목표 체중</strong>과 <strong>목표 날짜</strong>를 정하면, 목표 날짜대로 갈 때의 칼로리와 추천 칼로리를 나란히 보여드려요. 지금은 유지 칼로리예요.</div>';
  }

  const pct = (v) => ((v / p.tdee) * 100).toFixed(1);
  const row = (k, v, cls = '') => `<tr class="${cls}"><th scope="row">${k}</th><td>${v}</td></tr>`;
  return `
    ${compare}
    ${notice}
    <div class="rx-grid">
      <div class="rx">
        <span class="badge-ico accent">${icon.fork()}</span>
        <p>${compare ? '추천' : '하루 동안'} 섭취할<br>음식 칼로리</p>
        <strong>${comma(p.target)}<small>kcal</small></strong>
      </div>
      <div class="rx">
        <span class="badge-ico peach">${icon.flame()}</span>
        <p>${compare ? '추천' : '하루 동안'} 소모할<br>운동 칼로리</p>
        <strong>${comma(p.exercise)}<small>kcal</small></strong>
      </div>
    </div>

    <h3 class="rx-title">하루 소비 칼로리 ${comma(p.tdee)}kcal</h3>
    <div class="rx-bar" role="img" aria-label="기초대사량 ${comma(p.bmr)}, 활동대사량 ${comma(p.activityKcal)}, 소화 에너지 ${comma(p.tef)}킬로칼로리">
      <div style="width:${pct(p.bmr)}%;background:var(--accent)">${comma(p.bmr)}</div>
      <div style="width:${pct(p.activityKcal)}%;background:var(--accent2)">${comma(p.activityKcal)}</div>
      <div style="width:${pct(p.tef)}%;background:var(--clay)">${comma(p.tef)}</div>
    </div>
    <div class="legend rx-legend">
      <span><i style="background:var(--accent)"></i>기초대사량</span>
      <span><i style="background:var(--accent2)"></i>활동대사량</span>
      <span><i style="background:var(--clay)"></i>소화 에너지</span>
    </div>

    <table class="rx-table">
      <caption class="sr-only">칼로리 처방 상세</caption>
      <tbody>
        ${row('기초대사량', `${comma(p.bmr)} kcal`)}
        ${row('활동대사량', `${comma(p.activityKcal)} kcal`)}
        ${row('소화에 쓰는 에너지', `${comma(p.tef)} kcal`)}
        ${row('하루 소비 칼로리', `${comma(p.tdee)} kcal`, 'sum')}
        ${losing ? row('하루 줄일 칼로리', `−${comma(p.deficit)} kcal`) : ''}
        ${losing ? row('식단으로', `−${comma(p.deficit - p.exercise)} kcal`, 'sub') : ''}
        ${losing ? row('운동으로', `−${comma(p.exercise)} kcal`, 'sub') : ''}
        ${compare ? row('목표 날짜 기준 섭취', `${comma(Math.max(0, p.goalPlan.target))} kcal`) : ''}
        ${row(compare ? '추천 음식 섭취' : '음식 섭취 처방', `${comma(p.target)} kcal`, 'sum')}
        ${row('순 섭취 목표 (섭취 − 운동)', `${comma(p.netGoal)} kcal`)}
        ${losing ? row('주당 예상 감량', `${p.weeklyLoss.toFixed(2)} kg`) : ''}
        ${losing ? row('목표까지', `D-${p.days} · ${p.diffKg.toFixed(1)} kg`) : ''}
        ${row('단백질 권장', `약 ${p.protein} g`)}
        ${p.bmi ? row('BMI', `${p.bmi.bmi.toFixed(1)} · ${p.bmi.label}`) : ''}
      </tbody>
    </table>
    <p class="footnote">${esc(p.method)}${input.fatPct ? ` · 체지방률 ${fix1(input.fatPct)}%` : ''} 기준 추정치예요.
      달력에서는 순 섭취가 ${comma(p.netGoal)}kcal 이하면 목표 달성으로 표시돼요. 혈당 강하제를 복용 중이라면 섭취량을 크게 줄이기 전에 주치의와 상의해주세요.</p>`;
}

/* ───────── 저장 안 한 변경 표시 · 입력 중인 값 보관 ───────── */
const DRAFT_KEY = 'hd_draft';
const sameNum = (a, b) => (a == null ? null : Number(a)) === (b == null ? null : Number(b));

function isDirty() {
  const d = state.draft;
  const r = recordOn(state.today);
  const taken = (list) => [...(list || [])].sort().join('|');
  if (!r) return d.weight != null || d.muscle_mass != null || d.body_fat_pct != null || !!d.mood || !!d.mood_note.trim();
  return !sameNum(d.weight, r.weight) || !sameNum(d.muscle_mass, r.muscle_mass) || !sameNum(d.body_fat_pct, r.body_fat_pct) ||
    d.mood !== (r.mood || '') || d.mood_note.trim() !== (r.mood_note || '') || taken(d.taken) !== taken(r.medications_taken);
}

/** 입력이 바뀔 때마다: 기기에 임시 보관 + 저장 안 됨 표시 갱신 */
function markDirty(view) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft)); } catch {}
  const bar = $('#dirty-bar', view);
  if (bar) bar.hidden = !isDirty();
}

function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && d.date === state.today ? d : null;
  } catch {
    return null;
  }
}

/* ───────── 오늘 먹은 것 · 운동 (AI 칼로리 판정) ───────── */
function foodHtml() {
  const d = state.draft;
  return `
    <div class="card-head">
      <h2 id="h-food">오늘 먹은 것 · 운동</h2>
      <span class="meta">AI 칼로리 계산</span>
    </div>
    <label class="label" for="food-note">먹은 것</label>
    <textarea class="input note" id="food-note" rows="3" maxlength="1000"
      placeholder="예: 아침 삶은 달걀 2개, 아메리카노&#10;점심 김치찌개에 밥 반 공기&#10;간식 바나나 1개">${esc(d.food_note)}</textarea>
    <label class="label" for="ex-note" style="margin-top:10px">운동</label>
    <textarea class="input note" id="ex-note" rows="2" maxlength="1000" placeholder="예: 걷기 40분, 8천보 / 필라테스 50분">${esc(d.exercise_note)}</textarea>
    <button type="button" class="btn" id="food-save" style="margin-top:12px">AI로 칼로리 계산해서 저장</button>
    <div id="food-result">${foodResultHtml(dayRecordOn(state.today))}</div>`;
}

export function foodResultHtml(rec) {
  if (!rec || (rec.intake_kcal == null && rec.exercise_kcal == null)) return '';
  const det = rec.food_detail;
  const intake = rec.intake_kcal || 0, ex = rec.exercise_kcal || 0, net = intake - ex;
  const goal = rec.kcal_goal ?? num(state.settings.calorie_net_goal);
  const items = (list) => (list || []).map((x) => `
    <li><span>${esc(x.name)}${x.amount ? ` <small>${esc(x.amount)}</small>` : ''}</span><b>${comma(x.kcal)}</b></li>`).join('');
  return `
    <div class="food-sum">
      <div><p class="k">먹은 칼로리</p><p class="v">${comma(intake)}<small>kcal</small></p></div>
      <div><p class="k">운동 칼로리</p><p class="v">${comma(ex)}<small>kcal</small></p></div>
      <div><p class="k">순 섭취</p><p class="v">${comma(net)}<small>kcal</small></p>
        ${goal ? `<span class="chip ${net <= goal ? 'peach' : 'over'}">${net <= goal ? '목표 달성' : `${comma(net - goal)} 초과`}</span>` : ''}</div>
    </div>
    ${det?.food_items?.length ? `<ul class="food-items" aria-label="음식별 칼로리">${items(det.food_items)}</ul>` : ''}
    ${det?.exercise_items?.length ? `<ul class="food-items ex" aria-label="운동별 칼로리">${items(det.exercise_items)}</ul>` : ''}
    ${det?.note ? `<p class="hint">${esc(det.note)}</p>` : ''}
    <p class="hint">AI 추정치예요. 숫자를 직접 고치고 싶으면 <a class="link-btn" href="#/calendar">달력</a>에서 오늘을 눌러주세요.</p>`;
}

function bindFood(view) {
  const d = state.draft;
  $('#food-note', view).addEventListener('input', (e) => { d.food_note = e.target.value; markDirty(view); });
  $('#ex-note', view).addEventListener('input', (e) => { d.exercise_note = e.target.value; markDirty(view); });
  $('#food-save', view).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!d.food_note.trim() && !d.exercise_note.trim()) return toast('먹은 것이나 운동을 적어주세요');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> AI가 칼로리를 계산하는 중…';
    try {
      const rec = await api.saveDay({ date: state.today, food_note: d.food_note.trim(), exercise_note: d.exercise_note.trim(), estimate: true });
      upsertRecord(rec);
      const box = $('#food-result', view);
      if (box) box.innerHTML = foodResultHtml(rec);
      toast(`먹은 칼로리 ${comma(rec.intake_kcal || 0)}kcal로 기록했어요`);
    } catch (err) {
      toast('계산 실패: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI로 칼로리 계산해서 저장';
    }
  });
}
