import { api } from '../api.js';
import { icon } from '../icons.js';
import { state, activeMeds, recordOn, latestRecord, upsertRecord, saveSettings } from '../store.js';
import { $, $$, esc, num, fix1, comma, fmtLong, greeting, cycleDay, cyclePhase, movingAvg, debounce, toast, resizeImage } from '../utils.js';
import { calcPlan, planSummary, safeDateLabel, ACTIVITY } from '../calorie.js';
import { topbar, previewBanner, timingTone } from './common.js';

const MOODS = [
  { v: 'good', label: '좋음', svg: icon.moodGood },
  { v: 'normal', label: '보통', svg: icon.moodNormal },
  { v: 'hard', label: '힘듦', svg: icon.moodHard },
];

function initDraft() {
  if (state.draft && state.draft.date === state.today) return state.draft;
  const rec = recordOn(state.today);
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

export function render(view) {
  const d = initDraft();
  const s = state.settings;
  const cd = cycleDay(s, state.today);
  const last = latestRecord();
  const saved = recordOn(state.today);

  view.innerHTML = `
    ${topbar()}
    <div class="page-title">
      <h1>${esc(greeting(s.nickname || '회원님'))}</h1>
      <p>${fmtLong(state.today)} · ${cd ? [`생리주기 ${cd}일차`, cyclePhase(cd, s)].filter(Boolean).join(' · ') : '<a class="link-btn" href="#/settings">생리주기 설정하기</a>'}</p>
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
          <button type="submit" class="btn">${icon.plus()} 목록에 추가</button>
        </form>
      </section>

      <button type="button" class="btn lg" id="save">${saved ? '기록 수정하고 피드백 다시 받기' : '기록 저장하고 코치 피드백 받기'}</button>

      <div id="coach-preview">${previewHtml()}</div>

      <section class="card" aria-labelledby="h-goal" id="goal-card">${goalHtml()}</section>

      <section class="card" aria-labelledby="h-kcal">
        <div class="card-head">
          <h2 id="h-kcal">칼로리 플랜</h2>
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
    </div>`;

  bindInbody(view);
  bindMood(view);
  bindMeds(view);
  bindKcal(view);
  bindRetry(view);
  $('#save', view).addEventListener('click', () => onSave(view));
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
    body = '아침 기록을 저장하면 코치가 오늘의 몸 상태를 풀어서 설명해드려요.';
    links = `<a class="link-btn" href="#/chat">${icon.chat()} AI 코치와 대화하기</a>`;
  } else if (!fb) {
    body = '피드백을 아직 만들지 못했어요. 다시 시도해볼까요?';
    links = `<button type="button" class="link-btn peach" id="retry-fb">${icon.refresh()} 피드백 다시 받기</button>
             <a class="link-btn" href="#/chat">${icon.chat()} AI 코치와 대화하기</a>`;
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
  $$('input[name="mood"]', view).forEach((r) => r.addEventListener('change', () => (d.mood = r.value)));
  $('#mood-note', view).addEventListener('input', (e) => (d.mood_note = e.target.value));
}

/* ───────── 복용약 ───────── */
function bindMeds(view) {
  const d = state.draft;
  const list = $('#med-list', view);
  list.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const name = e.target.value;
    d.taken = e.target.checked ? [...new Set([...d.taken, name])] : d.taken.filter((n) => n !== name);
  });

  const form = $('#med-add', view);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const med = { name: fd.get('name').trim(), timing: fd.get('timing').trim(), ingredient_dose: fd.get('ingredient_dose').trim() };
    if (!med.name) return;
    const btn = $('button', form);
    btn.disabled = true;
    try {
      state.meds = await api.addMed(med);
      form.reset();
      list.innerHTML = medListHtml(d);
      toast(`${med.name}을(를) 목록에 추가했어요`);
    } catch (err) {
      toast('추가 실패: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ───────── 저장 ───────── */
async function onSave(view) {
  const d = state.draft;
  if (d.weight == null && d.muscle_mass == null && d.body_fat_pct == null && !d.mood) {
    toast('인바디 수치나 오늘의 마음 중 하나는 입력해주세요');
    return;
  }
  const btn = $('#save', view);
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 코치가 피드백을 쓰고 있어요…';
  try {
    const res = await api.saveRecord({
      date: d.date,
      weight: d.weight,
      muscle_mass: d.muscle_mass,
      body_fat_pct: d.body_fat_pct,
      mood: d.mood,
      mood_note: d.mood_note.trim(),
      medications_taken: d.taken,
    });
    upsertRecord(res.record);
    toast(res.feedbackError ? '기록은 저장했지만 피드백 생성에 실패했어요' : '저장했어요. 오늘의 피드백이 도착했어요');
    btn.textContent = '기록 수정하고 피드백 다시 받기';
    $('#coach-preview', view).innerHTML = previewHtml();
    $('#goal-card', view).innerHTML = goalHtml();
    bindRetry(view);
    $('#coach-preview', view).scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    toast('저장 실패: ' + err.message);
    btn.textContent = recordOn(state.today) ? '기록 수정하고 피드백 다시 받기' : '기록 저장하고 코치 피드백 받기';
  } finally {
    btn.disabled = false;
  }
}

function bindRetry(view) {
  const retry = $('#retry-fb', view);
  if (!retry) return;
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    retry.innerHTML = '<span class="spinner dark"></span> 만드는 중…';
    try {
      upsertRecord(await api.regenerateFeedback(state.today));
      $('#coach-preview', view).innerHTML = previewHtml();
    } catch (err) {
      toast('실패: ' + err.message);
      retry.disabled = false;
      retry.textContent = '피드백 다시 받기';
    }
    bindRetry(view);
  });
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
    calorie_plan: planSummary(plan, gw, gd),
  });
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
  // 코치가 참고할 칼로리 요약이 최신 기록 기준과 다르면 조용히 갱신
  const summary = planSummary(plan, state.settings.goal_weight, state.settings.goal_date);
  if (summary && summary !== state.settings.calorie_plan) persistGoal({ calorie_plan: summary });
}

function kcalHtml(p, input) {
  if (p.status === 'need_weight') {
    return '<p class="hint" style="margin:0">현재 체중을 입력하면 하루 권장 칼로리를 계산해드려요.</p>';
  }
  if (p.status === 'need_profile') {
    return '<p class="hint" style="margin:0">체지방률을 입력하거나, <a class="link-btn" href="#/settings">설정</a>에서 키와 출생연도를 알려주시면 계산할 수 있어요.</p>';
  }

  const chips = [];
  let sub = `유지 칼로리 ${comma(p.tdee)}kcal · 기초대사량 ${comma(p.bmr)}kcal`;
  let notice = '';

  if (p.status === 'ok' || p.status === 'too_fast') {
    sub = `유지 칼로리 ${comma(p.tdee)}kcal에서 하루 ${comma(p.deficit)}kcal 줄이기`;
    chips.push(`<span class="chip lg">주당 -${p.weeklyLoss.toFixed(2)}kg</span>`);
    chips.push(`<span class="chip lg peach">D-${p.days} · ${p.diffKg.toFixed(1)}kg</span>`);
  }
  chips.push(`<span class="chip lg clay">단백질 약 ${p.protein}g</span>`);

  if (p.status === 'too_fast') {
    notice = `
      <div class="notice">
        목표 날짜까지 가려면 하루 ${comma(p.needDeficit)}kcal를 줄여야 해서 안전한 속도(주당 체중의 1%, 기초대사량 이상 섭취)를 넘어요.
        권장 칼로리는 안전 하한선에 맞췄어요. 이 속도라면 <strong>${esc(safeDateLabel(p))}</strong>쯤 도달해요.
        <br><button type="button" class="link-btn" id="k-fix-date">목표 날짜를 ${esc(safeDateLabel(p))}로 바꾸기</button>
      </div>`;
  } else if (p.status === 'reached') {
    notice = '<div class="notice">현재 체중이 목표 체중 이하예요. 유지 칼로리로 안내할게요.</div>';
  } else if (p.status === 'date_passed') {
    notice = '<div class="notice">목표 날짜가 지났어요. 새 날짜를 골라주세요.</div>';
  } else if (p.status === 'no_room') {
    notice = '<div class="notice">지금 활동량에서는 더 줄일 여유가 없어요. 활동량을 늘리는 쪽으로 코치와 이야기해봐요.</div>';
  } else if (p.status === 'maintain') {
    notice = '<p class="hint">목표 체중과 날짜를 정하면 감량용 권장 칼로리로 바꿔드려요.</p>';
  }

  return `
    <div class="kcal-main">
      <span class="lbl">${p.status === 'ok' || p.status === 'too_fast' ? '하루 권장 섭취' : '하루 유지 칼로리'}</span>
      <span class="val">${comma(p.target)}<small>kcal</small></span>
    </div>
    <p class="kcal-sub">${sub}</p>
    <div class="kcal-chips">${chips.join('')}</div>
    ${notice}
    <p class="footnote">${esc(p.method)}${input.fatPct ? ` · 체지방률 ${fix1(input.fatPct)}%` : ''} 기준 추정치예요. 혈당 강하제를 복용 중이라면 섭취량을 크게 줄이기 전에 주치의와 상의해주세요.</p>`;
}
