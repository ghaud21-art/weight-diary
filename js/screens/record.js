import { api } from '../api.js';
import { icon } from '../icons.js';
import { state, activeMeds, morningOn as recordOn, recordOn as dayRecordOn, hasBody, prevRecord, latestRecord, upsertRecord, saveSettings, setMeds } from '../store.js';
import { $, $$, esc, num, fix1, comma, fmtLong, fmtMD, daysBetween, greeting, movingAvg, debounce, toast, resizeImage } from '../utils.js';
import { calcPlan, planSummary, safeDateLabel, ACTIVITY } from '../calorie.js';
import { topbar, previewBanner, timingTone, deltaChip } from './common.js';
import { foodLogHtml, bindFoodLog } from './foodlog.js';

// 피드백을 만드는 중인지 (화면을 다시 그려도 유지)
const busy = { morning: false, evening: false };

const MOODS = [
  { v: 'good', label: '좋음', svg: icon.moodGood },
  { v: 'normal', label: '보통', svg: icon.moodNormal },
  { v: 'hard', label: '힘듦', svg: icon.moodHard },
];

function initDraft() {
  if (state.draft && state.draft.date === state.today) return state.draft;
  const rec = recordOn(state.today);
  const kept = readDraft();
  if (kept) {
    state.draft = { ...kept, kcalWeight: null };
    return state.draft;
  }
  state.draft = {
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

const section = (time, title) => `<h3 class="sec"><span class="sec-time">${time}</span>${title}</h3>`;

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

      ${section('아침', '인바디 · 복용약')}
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
      </section>

      <div id="morning-fb">${morningHtml()}</div>

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

      ${section('하루 동안', '먹은 것 · 운동')}
      <section class="card" aria-labelledby="h-food" id="food-card">
        <div class="card-head">
          <h2 id="h-food">오늘 먹은 것 · 운동</h2>
          <span class="meta">AI 칼로리 계산</span>
        </div>
        ${foodLogHtml(state.today)}
      </section>

      <details class="card rx-details" id="kcal-card">
        <summary><span id="h-kcal">칼로리 처방</span><span class="meta" id="kcal-summary"></span></summary>
        <div class="kcal-inputs" style="margin-top:14px">
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
      </details>

      <section class="card" aria-labelledby="h-goal" id="goal-card">${goalHtml()}</section>

      ${section('저녁', '마음 · 하루 마무리')}
      <section class="card" aria-labelledby="h-mood" id="mood-card">
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

      <div id="evening-fb">${eveningHtml()}</div>
    </div>
    <div class="dirty-bar" id="dirty-bar" role="status" hidden>
      <span>저장하지 않은 기록이 있어요</span>
      <button type="button" class="btn bar-save" data-save data-label="저장">저장</button>
    </div>`;

  bindInbody(view);
  bindMood(view);
  bindMeds(view);
  bindKcal(view);
  bindFoodLog($('#food-card .flog', view));
  bindFeedbackButtons(view);
  $$('[data-save]', view).forEach((b) => b.addEventListener('click', () => onSave(view)));
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

/* ───────── 아침 인바디 피드백: 오늘 하루 계획 ───────── */
/** 직전 측정 → 오늘 인바디 비교표 */
function inbodyCompareHtml() {
  const rec = dayRecordOn(state.today);
  if (!hasBody(rec)) return '';
  const prev = prevRecord(state.today);
  const gap = prev ? daysBetween(prev.date, state.today) : 0;
  const row = (label, key, unit, pu) => `
    <div class="cmp-row">
      <span class="k">${label}</span>
      <span class="v">${prev?.[key] != null ? fix1(prev[key]) + ' → ' : ''}<strong>${rec[key] != null ? fix1(rec[key]) + unit : '-'}</strong></span>
      ${deltaChip(rec[key], prev?.[key], pu)}
    </div>`;
  return `
    <div class="cmp morning-cmp">
      <p class="cmp-cap">${prev ? (gap === 1 ? '어제' : fmtMD(prev.date) + ' (' + gap + '일 전)') + ' → 오늘' : '첫 측정이에요'}</p>
      ${row('체중', 'weight', 'kg', 'kg')}
      ${row('골격근량', 'muscle_mass', 'kg', 'kg')}
      ${row('체지방률', 'body_fat_pct', '%', '%p')}
    </div>`;
}

function morningHtml() {
  const rec = dayRecordOn(state.today);
  const fb = rec?.morning_feedback;
  const btn = (label) => `<button type="button" class="btn" id="morning-btn">${icon.sun(15)} ${label}</button>`;
  if (busy.morning) {
    return `<section class="coach-preview"><p class="title"><span class="spinner dark"></span> 코치가 오늘 인바디를 보고 하루 계획을 세우는 중이에요…</p></section>`;
  }
  if (!fb) {
    return `
      <section class="coach-preview" aria-label="아침 인바디 피드백">
        <div class="inner">
          <span class="badge-ico">${icon.sun()}</span>
          <div style="flex:1;min-width:0">
            <p class="title">아침 인바디 피드백</p>
            <p class="body">인바디를 저장하고 받아보세요. 어제와 비교해 오늘 몸 상태를 풀어주고, 끼니·운동·약 타이밍까지 오늘 하루 계획을 세워드려요.</p>
          </div>
        </div>
        ${inbodyCompareHtml()}
        <div style="margin-top:12px">${btn('인바디 피드백 받기')}</div>
      </section>`;
  }
  const p = fb.plan || {};
  return `
    <section class="coach-preview morning" aria-label="아침 인바디 피드백">
      <div class="inner">
        <span class="badge-ico">${icon.sun()}</span>
        <div style="flex:1;min-width:0">
          <p class="k-label">아침 인바디 피드백</p>
          <p class="title">${esc(fb.title)}</p>
        </div>
      </div>
      ${inbodyCompareHtml()}
      <p class="body morning-analysis">${esc(fb.analysis)}</p>
      <ul class="plan-list" aria-label="오늘 하루 계획">
        <li><span class="badge-ico accent">${icon.fork(14)}</span><div><b>끼니</b><p>${esc(p.meals || '')}</p></div></li>
        <li><span class="badge-ico peach">${icon.flame(14)}</span><div><b>운동</b><p>${esc(p.exercise || '')}</p></div></li>
        <li><span class="badge-ico clay">${icon.drop(14)}</span><div><b>물 · 약 · 수면</b><p>${esc(p.routine || '')}</p></div></li>
      </ul>
      ${fb.focus ? `<p class="focus"><b>오늘의 한 가지</b> ${esc(fb.focus)}</p>` : ''}
      <div class="links"><button type="button" class="link-btn muted" id="morning-btn">${icon.refresh()} 인바디 피드백 다시 받기</button></div>
    </section>`;
}

/* ───────── 저녁 하루 마무리 피드백 ───────── */
function eveningHtml() {
  const rec = dayRecordOn(state.today);
  const fb = rec?.coach_feedback;
  const label = fb ? '하루 마무리 피드백 다시 받기' : '하루 마무리 피드백 받기';
  const button = `
    <div class="send-box">
      <button type="button" class="btn lg" id="evening-btn" ${busy.evening ? 'disabled' : ''}>
        ${busy.evening ? '<span class="spinner"></span> 코치가 오늘 하루를 돌아보는 중…' : `${icon.chat(16)} ${label}`}
      </button>
      <p class="hint">저녁에 마음까지 기록한 뒤 눌러주세요. 인바디·복용약·먹은 것·운동·마음을 모두 보고 내일을 위한 조언을 드려요.</p>
    </div>`;
  if (!fb || fb.legacy) return button;
  const tips = fb.tomorrow?.tips || [];
  return `
    <section class="coach-preview evening" aria-label="하루 마무리 피드백">
      <div class="inner">
        <span class="badge-ico">${icon.coach()}</span>
        <div style="flex:1;min-width:0">
          <p class="k-label">하루 마무리 피드백</p>
          <p class="title">${esc(fb.briefing?.title || '')}</p>
          <p class="body">${esc(fb.briefing?.emotional || fb.briefing?.body || '')}</p>
        </div>
      </div>
      ${tips.length ? `
        <div class="tomorrow">
          <p class="t">${icon.bolt(14)} ${esc(fb.tomorrow.title || '내일을 위한 조언')}</p>
          <ol>${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        </div>` : ''}
      <div class="links">
        <a class="link-btn peach" href="#/coach">자세히 보기 →</a>
        <a class="link-btn" href="#/chat">${icon.chat()} AI 코치와 대화하기</a>
      </div>
    </section>
    ${button}`;
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

/* ───────── 저장 ───────── */
/** 오늘 인바디·복용약·마음 저장 (피드백은 만들지 않음). 성공하면 true */
async function saveDraft(view) {
  const d = state.draft;
  if (d.weight == null && d.muscle_mass == null && d.body_fat_pct == null && !d.mood && !d.taken.length) {
    toast('인바디 수치, 복용약, 오늘의 마음 중 하나는 입력해주세요');
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
    upsertRecord(res.record);
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

/* ───────── 피드백 받기 ───────── */
function paintFeedback(view) {
  const m = $('#morning-fb', view), e = $('#evening-fb', view);
  if (m) m.innerHTML = morningHtml();
  if (e) e.innerHTML = eveningHtml();
}

function bindFeedbackButtons(view) {
  // 버튼은 다시 그려지므로 바깥에서 한 번만 받음
  view.addEventListener('click', (e) => {
    if (e.target.closest('#morning-btn')) requestMorning(view);
    if (e.target.closest('#evening-btn')) requestEvening(view);
  });
}

async function requestMorning(view) {
  if (busy.morning) return;
  const d = state.draft;
  if (d.weight == null && d.body_fat_pct == null && !hasBody(dayRecordOn(state.today))) {
    toast('먼저 오늘 인바디를 입력해주세요');
    return $('#h-inbody', view)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  busy.morning = true;
  paintFeedback(view);
  try {
    if (isDirty() || !hasBody(dayRecordOn(state.today))) {
      if (!(await saveDraft(view))) return;
    }
    upsertRecord(await api.morningFeedback(state.today));
    toast('오늘 하루 계획이 도착했어요');
  } catch (err) {
    toast('피드백을 만들지 못했어요: ' + err.message);
  } finally {
    busy.morning = false;
    if ($('#morning-fb', view)) paintFeedback(view);
  }
}

async function requestEvening(view) {
  if (busy.evening) return;
  if (!state.draft.mood) {
    toast('저녁 마음 체크를 먼저 해주세요');
    return $('#mood-card', view)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  busy.evening = true;
  paintFeedback(view);
  try {
    if (isDirty() || !recordOn(state.today)) {
      if (!(await saveDraft(view))) return;
    }
    upsertRecord(await api.regenerateFeedback(state.today));
    toast('하루 마무리 피드백이 도착했어요');
  } catch (err) {
    toast('피드백을 만들지 못했어요: ' + err.message);
  } finally {
    busy.evening = false;
    if ($('#evening-fb', view)) {
      paintFeedback(view);
      $('#evening-fb', view).scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const sum = $('#kcal-summary', view);
  if (sum) sum.textContent = plan.target ? `오늘 음식 ${comma(plan.target)} · 운동 ${comma(plan.exercise)}kcal` : '목표를 정해주세요';
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
