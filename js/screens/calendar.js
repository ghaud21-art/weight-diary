import { api } from '../api.js';
import { icon } from '../icons.js';
import { state, upsertRecord, recordOn, cycleStats, hasBody, setPeriods, applyPeriodLocal } from '../store.js';
import { $, $$, esc, num, fix1, comma, addDays, fmtLong, toast } from '../utils.js';
import { dayStatus } from '../calorie.js';
import { periodMarks, nextLabel } from '../cycle.js';
import { topbar } from './common.js';
import { foodResultHtml } from './record.js';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const loaded = new Set();
const pad = (n) => String(n).padStart(2, '0');
const STAMP = { success: '달성', over: '초과' };

function monthInfo(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = `${ym}-01`;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${ym}-${pad(days)}`;
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return { y, m, first, last, days, lead };
}
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function render(view) {
  if (!state.calMonth) state.calMonth = state.today.slice(0, 7);
  const st = cycleStats();
  const sub = st.last
    ? `평균 주기 ${Math.round(st.avgCycle)}일${st.spread != null ? ` (편차 ${st.spread}일)` : ''} · 다음 예정 ${nextLabel(st)}`
    : '날짜를 눌러 칼로리와 생리일을 기록해요';

  view.innerHTML = `
    ${topbar()}
    <div class="page-title"><h1>달력</h1><p>${esc(sub)}</p></div>
    <div class="stack">
      <section class="card cal-card" aria-label="월간 달력">
        <div class="cal-nav">
          <button type="button" class="icon-btn sm" data-nav="-1" aria-label="이전 달">${icon.back()}</button>
          <h2 id="cal-title"></h2>
          <button type="button" class="icon-btn sm" data-nav="1" aria-label="다음 달"><span style="display:inline-flex;transform:scaleX(-1)">${icon.back()}</span></button>
        </div>
        <div class="cal-week" aria-hidden="true">${WEEK.map((w, i) => `<span class="${i === 0 ? 'sun' : ''}">${w}</span>`).join('')}</div>
        <div class="cal-grid" id="cal-grid" role="grid"></div>
        <div class="cal-legend">
          <span><i class="lg-success"></i>목표 달성</span>
          <span><i class="lg-over"></i>목표 초과</span>
          <span><i class="lg-period"></i>생리</span>
          <span><i class="lg-predicted"></i>생리 예정</span>
        </div>
        <div class="cal-keys">
          <span>${icon.fork(11)}섭취</span><span>${icon.flame(11)}운동</span><span>${icon.scale(11)}체중</span>
        </div>
      </section>
      <section class="card" aria-labelledby="h-month" id="month-summary"></section>
    </div>
    <dialog class="sheet" id="day-sheet" aria-labelledby="sheet-title"></dialog>`;

  $$('[data-nav]', view).forEach((b) => b.addEventListener('click', () => {
    state.calMonth = shiftMonth(state.calMonth, Number(b.dataset.nav));
    paint(view);
  }));
  $('#cal-grid', view).addEventListener('click', (e) => {
    const cell = e.target.closest('[data-date]');
    if (cell) openSheet(view, cell.dataset.date);
  });
  paint(view);
}

async function paint(view) {
  const ym = state.calMonth;
  const mi = monthInfo(ym);
  $('#cal-title', view).textContent = `${mi.y}년 ${mi.m}월`;
  drawGrid(view, mi);
  if (mi.first >= addDays(state.today, -60)) loaded.add(ym);
  if (!loaded.has(ym)) {
    try {
      const res = await api.getRange(mi.first, mi.last);
      res.records.forEach(upsertRecord);
      setPeriods(res.periods);
      loaded.add(ym);
      if (state.calMonth === ym && $('#cal-grid', view)) drawGrid(view, mi);
    } catch (err) {
      toast('달력 기록을 불러오지 못했어요: ' + err.message);
    }
  }
}

function drawGrid(view, mi) {
  const marks = periodMarks(cycleStats());
  const cells = [];
  const start = addDays(mi.first, -mi.lead);
  const total = Math.ceil((mi.lead + mi.days) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const date = addDays(start, i);
    const inMonth = date >= mi.first && date <= mi.last;
    const future = date > state.today;
    const rec = recordOn(date);
    const status = dayStatus(rec);
    const cls = ['cal-cell', inMonth ? '' : 'out', future ? 'future' : '', date === state.today ? 'today' : '',
      inMonth && status ? `st-${status}` : '', inMonth && marks[date] ? `mk-${marks[date]}` : ''].filter(Boolean).join(' ');
    const lines = [];
    if (inMonth && rec) {
      if (rec.intake_kcal != null) lines.push(`<span>${icon.fork(9)}${Math.round(rec.intake_kcal)}</span>`);
      if (rec.exercise_kcal != null && rec.intake_kcal != null) lines.push(`<span>${icon.flame(9)}${Math.round(rec.exercise_kcal)}</span>`);
      if (rec.weight != null) lines.push(`<span>${icon.scale(9)}${fix1(rec.weight)}</span>`);
    }
    const label = [fmtLong(date), marks[date] === 'period' ? '생리' : marks[date] === 'predicted' ? '생리 예정' : '',
      status === 'success' ? '목표 달성' : status === 'over' ? '목표 초과' : '',
      rec?.intake_kcal != null ? `섭취 ${rec.intake_kcal}kcal` : '', rec?.weight != null ? `체중 ${rec.weight}kg` : ''].filter(Boolean).join(', ');
    const d = Number(date.slice(8));
    cells.push(`
      <button type="button" class="${cls}" ${inMonth && !future ? `data-date="${date}"` : 'tabindex="-1" disabled'} aria-label="${esc(label)}"
        ${inMonth && STAMP[status] ? `data-stamp="${STAMP[status]}"` : ''}>
        <span class="d">${d}</span>
        <span class="lines">${lines.join('')}</span>
      </button>`);
  }
  $('#cal-grid', view).innerHTML = cells.join('');
  $('#month-summary', view).innerHTML = summaryHtml(mi);
}

function summaryHtml(mi) {
  const recs = state.records.filter((r) => r.date >= mi.first && r.date <= mi.last);
  const body = recs.filter((r) => r.weight != null);
  const judged = recs.map(dayStatus).filter((s) => s === 'success' || s === 'over');
  const success = judged.filter((s) => s === 'success').length;
  const intake = recs.filter((r) => r.intake_kcal > 0);
  const avgIntake = intake.length ? intake.reduce((a, r) => a + r.intake_kcal, 0) / intake.length : null;
  const change = body.length >= 2 ? body[body.length - 1].weight - body[0].weight : null;
  const periodDays = cycleStats().periods.filter((p) => p.start_date >= mi.first && p.start_date <= mi.last);
  return `
    <h2 id="h-month" style="font-size:15px;margin-bottom:12px">${mi.m}월 요약</h2>
    <div class="sum-grid">
      <div><p class="k">기록한 날</p><p class="v">${recs.length}일</p></div>
      <div><p class="k">칼로리 목표 달성</p><p class="v">${judged.length ? `${success}/${judged.length}일` : '-'}</p></div>
      <div><p class="k">평균 섭취</p><p class="v">${avgIntake != null ? comma(avgIntake) + 'kcal' : '-'}</p></div>
      <div><p class="k">체중 변화</p><p class="v">${change != null ? `${change > 0 ? '+' : ''}${change.toFixed(1)}kg` : '-'}</p></div>
    </div>
    ${periodDays.length ? `<p class="hint">이번 달 생리 시작: ${periodDays.map((p) => `${Number(p.start_date.slice(8))}일`).join(', ')}</p>` : ''}`;
}

/* ───────── 날짜 상세 시트 ───────── */
function syncTodayDraft(date, food, ex) {
  if (date !== state.today || !state.draft) return;
  state.draft.food_note = food;
  state.draft.exercise_note = ex;
  try { localStorage.setItem('hd_draft', JSON.stringify(state.draft)); } catch {}
}

function openSheet(view, date) {
  const dlg = $('#day-sheet', view);
  const rec = recordOn(date);
  const st = cycleStats();
  const isStart = st.periods.some((p) => p.start_date === date);
  const isEnd = st.periods.some((p) => p.end_date === date);
  const goal = rec?.kcal_goal ?? num(state.settings.calorie_net_goal);
  const moods = { good: '좋음', normal: '보통', hard: '힘듦' };

  dlg.innerHTML = `
    <form method="dialog" class="sheet-body" id="day-form">
      <div class="sheet-head">
        <h2 id="sheet-title">${fmtLong(date)}</h2>
        <button type="submit" value="close" class="icon-btn sm" aria-label="닫기" formnovalidate>${icon.close()}</button>
      </div>

      <div class="sheet-body-row">
        ${hasBody(rec)
          ? `<p class="sheet-line">체중 <strong>${fix1(rec.weight)}kg</strong> · 골격근 ${fix1(rec.muscle_mass)}kg · 체지방 ${fix1(rec.body_fat_pct)}%${rec.mood ? ` · 마음 ${moods[rec.mood]}` : ''}</p>`
          : '<p class="sheet-line muted">이 날은 인바디 기록이 없어요.</p>'}
        ${rec?.coach_feedback ? `<a class="link-btn peach" href="#/coach/${date}">이 날의 코치 피드백 보기 →</a>` : ''}
      </div>

      <fieldset class="sheet-group">
        <legend>식단 · 운동</legend>
        <label class="label" for="d-food">먹은 것</label>
        <textarea class="input note" id="d-food" rows="3" maxlength="1000" placeholder="예: 점심 김치찌개에 밥 반 공기, 저녁 닭가슴살 샐러드">${esc(rec?.food_note || '')}</textarea>
        <label class="label" for="d-ex">운동</label>
        <textarea class="input note" id="d-ex" rows="2" maxlength="1000" placeholder="예: 걷기 40분">${esc(rec?.exercise_note || '')}</textarea>
        <button type="button" class="btn outline" id="d-ai">AI로 칼로리 계산</button>
        <div id="d-ai-result">${rec?.food_detail ? foodResultHtml(rec).replace(/<p class="hint">AI 추정치예요[\s\S]*?<\/p>/, '') : ''}</div>
      </fieldset>

      <fieldset class="sheet-group">
        <legend>칼로리 (직접 고치기)</legend>
        <div class="row">
          <div>
            <label class="label" for="d-intake">먹은 칼로리</label>
            <input class="input num" id="d-intake" type="number" inputmode="numeric" min="0" max="9999" step="1" placeholder="kcal" value="${rec?.intake_kcal ?? ''}">
          </div>
          <div>
            <label class="label" for="d-exercise">운동 칼로리</label>
            <input class="input num" id="d-exercise" type="number" inputmode="numeric" min="0" max="5000" step="1" placeholder="kcal" value="${rec?.exercise_kcal ?? ''}">
          </div>
        </div>
        <p class="hint" id="d-judge">${goal ? `먹은 칼로리 − 운동 칼로리가 ${comma(goal)}kcal 이하면 목표 달성이에요.` : '기록 화면의 칼로리 처방을 정하면 달성 여부를 표시해요.'}</p>
        <button type="button" class="btn" id="d-save">칼로리 저장</button>
      </fieldset>

      <fieldset class="sheet-group">
        <legend>생리</legend>
        <label class="check-row"><span>이 날 생리 시작</span><input type="checkbox" class="switch" id="p-start" ${isStart ? 'checked' : ''}></label>
        <label class="check-row"><span>이 날 생리 종료</span><input type="checkbox" class="switch" id="p-end" ${isEnd ? 'checked' : ''}></label>
        <p class="hint">시작일을 기록할수록 평균 주기와 다음 예정일이 자동으로 정확해져요.</p>
      </fieldset>
    </form>`;

  const judgeLine = () => {
    const i = num($('#d-intake', dlg).value), x = num($('#d-exercise', dlg).value) || 0;
    if (i == null || !goal) return;
    const net = i - x;
    $('#d-judge', dlg).textContent = net <= goal
      ? `순 섭취 ${comma(net)}kcal — 목표 ${comma(goal)}kcal 달성이에요.`
      : `순 섭취 ${comma(net)}kcal — 목표 ${comma(goal)}kcal보다 ${comma(net - goal)}kcal 많아요.`;
  };
  $('#d-intake', dlg).addEventListener('input', judgeLine);
  $('#d-exercise', dlg).addEventListener('input', judgeLine);
  judgeLine();

  $('#d-ai', dlg).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const food = $('#d-food', dlg).value.trim(), ex = $('#d-ex', dlg).value.trim();
    if (!food && !ex) return toast('먹은 것이나 운동을 적어주세요');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner dark"></span> AI가 계산하는 중…';
    try {
      const saved = await api.saveDay({ date, food_note: food, exercise_note: ex, estimate: true });
      upsertRecord(saved);
      syncTodayDraft(date, food, ex);
      $('#d-intake', dlg).value = saved.intake_kcal ?? '';
      $('#d-exercise', dlg).value = saved.exercise_kcal ?? '';
      $('#d-ai-result', dlg).innerHTML = foodResultHtml(saved).replace(/<p class="hint">AI 추정치예요[\s\S]*?<\/p>/, '');
      judgeLine();
      if ($('#cal-grid', view)) drawGrid(view, monthInfo(state.calMonth));
      toast('AI가 계산한 칼로리로 저장했어요');
    } catch (err) {
      toast('계산 실패: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI로 칼로리 계산';
    }
  });

  $('#d-save', dlg).addEventListener('click', async () => {
    const intake = num($('#d-intake', dlg).value), exercise = num($('#d-exercise', dlg).value);
    const before = recordOn(date);
    const base = before || { date, weight: null, muscle_mass: null, body_fat_pct: null, mood: '', mood_note: '', medications_taken: [], coach_feedback: null, kcal_goal: null };
    const food = $('#d-food', dlg).value.trim(), ex = $('#d-ex', dlg).value.trim();
    syncTodayDraft(date, food, ex);
    upsertRecord({ ...base, intake_kcal: intake, exercise_kcal: exercise, food_note: food, exercise_note: ex, kcal_goal: base.kcal_goal ?? num(state.settings.calorie_net_goal) });
    dlg.close();
    drawGrid(view, monthInfo(state.calMonth));
    toast('칼로리를 저장했어요');
    try {
      upsertRecord(await api.saveDay({ date, intake_kcal: intake, exercise_kcal: exercise, food_note: food, exercise_note: ex }));
    } catch (err) {
      if (before) upsertRecord(before);
      else state.records = state.records.filter((r) => r.date !== date);
      toast('저장 실패: ' + err.message);
    }
    if ($('#cal-grid', view)) drawGrid(view, monthInfo(state.calMonth));
  });

  const onPeriod = (type) => async (e) => {
    const box = e.currentTarget;
    const on = box.checked;
    let before;
    try {
      before = applyPeriodLocal(date, type, on);
    } catch (err) {
      box.checked = !on;
      return toast(err.message);
    }
    drawGrid(view, monthInfo(state.calMonth));
    renderSub(view);
    toast(on ? (type === 'start' ? '생리 시작일을 기록했어요' : '생리 종료일을 기록했어요') : '기록을 지웠어요');
    try {
      const res = await api.setPeriod(date, type, on);
      setPeriods(res.periods, res.settings);
    } catch (err) {
      setPeriods(before);
      box.checked = !on;
      toast('저장 실패: ' + err.message);
    }
    if ($('#cal-grid', view)) {
      drawGrid(view, monthInfo(state.calMonth));
      renderSub(view);
    }
  };

  $('#p-start', dlg).addEventListener('change', onPeriod('start'));
  $('#p-end', dlg).addEventListener('change', onPeriod('end'));

  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
}

function renderSub(view) {
  const st = cycleStats();
  const p = $('.page-title p', view);
  if (p && st.last) p.textContent = `평균 주기 ${Math.round(st.avgCycle)}일${st.spread != null ? ` (편차 ${st.spread}일)` : ''} · 다음 예정 ${nextLabel(st)}`;
}

