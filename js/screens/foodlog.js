// 먹을 때마다 한 줄씩 기록 → AI가 그 줄의 칼로리를 바로 계산 (기록 화면 · 달력에서 같이 사용)
import { api } from '../api.js';
import { icon } from '../icons.js';
import { state, recordOn, upsertRecord } from '../store.js';
import { $, $$, esc, num, comma, toast } from '../utils.js';

const pending = {}; // 날짜 → 계산 중인 항목들
const nowTime = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 16);
const PLACEHOLDER = { food: '예: 점심 김치찌개, 밥 반 공기', exercise: '예: 걷기 40분 / 필라테스 50분' };

const sum = (list) => (list || []).reduce((a, x) => a + (Number(x.kcal) || 0), 0);

/** 목록이 바뀌면 합계도 화면에서 바로 다시 계산 */
function withTotals(rec, food, ex) {
  const any = food.length || ex.length;
  return {
    ...rec,
    food_log: food,
    exercise_log: ex,
    intake_kcal: food.length ? Math.round(sum(food)) : null,
    exercise_kcal: any ? Math.round(sum(ex)) : null,
    kcal_goal: rec.kcal_goal ?? num(state.settings.calorie_net_goal),
  };
}

export function sumHtml(date) {
  const rec = recordOn(date);
  const intake = rec?.intake_kcal || 0, ex = rec?.exercise_kcal || 0, net = intake - ex;
  const goal = rec?.kcal_goal ?? num(state.settings.calorie_net_goal);
  const pct = goal ? Math.min(100, Math.round((net / goal) * 100)) : 0;
  return `
    <div class="food-sum">
      <div><p class="k">먹은 칼로리</p><p class="v">${comma(intake)}<small>kcal</small></p></div>
      <div><p class="k">운동</p><p class="v">${comma(ex)}<small>kcal</small></p></div>
      <div><p class="k">순 섭취</p><p class="v">${comma(net)}<small>kcal</small></p></div>
    </div>
    ${goal ? `
      <div class="flog-goal">
        <div class="progress ${net > goal ? 'over' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="오늘 목표 칼로리 대비"><div style="width:${Math.max(2, pct)}%"></div></div>
        <p class="hint">${net <= goal ? `목표 ${comma(goal)}kcal까지 ${comma(goal - net)}kcal 남았어요` : `목표 ${comma(goal)}kcal보다 ${comma(net - goal)}kcal 많아요`}</p>
      </div>` : '<p class="hint">기록 화면의 칼로리 처방을 정하면 오늘 목표와 비교해드려요.</p>'}`;
}

function listHtml(date) {
  const rec = recordOn(date);
  const rows = [
    ...(rec?.food_log || []).map((x) => ({ ...x, kind: 'food' })),
    ...(rec?.exercise_log || []).map((x) => ({ ...x, kind: 'exercise' })),
    ...(pending[date] || []),
  ].sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);

  if (!rows.length) {
    const legacy = [rec?.food_note && `먹은 것: ${rec.food_note}`, rec?.exercise_note && `운동: ${rec.exercise_note}`].filter(Boolean).join(' / ');
    return legacy ? `<li class="flog-item legacy"><span class="x">예전 메모 — ${esc(legacy)}</span></li>` : '<li class="flog-empty">아직 기록이 없어요.</li>';
  }
  return rows.map((x) => {
    const parts = (x.items || []).length > 1 ? x.items.map((i) => `${esc(i.name)} ${comma(i.kcal)}`).join(' · ') : '';
    return `
      <li class="flog-item ${x.kind}">
        <span class="t">${esc(x.time || '')}</span>
        <span class="x">
          <span class="ico">${x.kind === 'food' ? icon.fork(12) : icon.flame(12)}</span>
          <span>${esc(x.text)}${parts ? `<small>${parts}</small>` : ''}</span>
        </span>
        ${x.tmp
          ? '<span class="kcal busy"><span class="spinner dark"></span></span>'
          : `<button type="button" class="kcal" data-id="${esc(x.id)}" data-kind="${x.kind}" aria-label="${esc(x.text)} 칼로리 고치기">${x.kind === 'exercise' ? '−' : ''}${comma(x.kcal)}<small>kcal</small></button>
             <button type="button" class="del" data-id="${esc(x.id)}" data-kind="${x.kind}" aria-label="${esc(x.text)} 삭제">${icon.close(12)}</button>`}
      </li>`;
  }).join('');
}

export function foodLogHtml(date) {
  return `
    <div class="flog" data-date="${date}">
      <div class="flog-sum">${sumHtml(date)}</div>
      <ul class="flog-list" aria-label="먹은 것 · 운동 기록">${listHtml(date)}</ul>
      <form class="flog-add">
        <div class="flog-kind" role="group" aria-label="기록 종류">
          <button type="button" data-kind="food" aria-pressed="true">${icon.fork(13)} 먹은 것</button>
          <button type="button" data-kind="exercise" aria-pressed="false">${icon.flame(13)} 운동</button>
        </div>
        <div class="flog-row">
          <input class="input" name="text" maxlength="300" placeholder="${PLACEHOLDER.food}" aria-label="기록할 내용" autocomplete="off">
          <button type="submit" class="btn">추가</button>
        </div>
      </form>
      <p class="hint">먹을 때마다 한 줄씩 추가하면 AI가 바로 칼로리를 계산해요. 숫자를 누르면 직접 고칠 수 있어요.</p>
    </div>`;
}

/** root: .flog 요소, onChange: 합계가 바뀌었을 때 (달력 칸 다시 그리기 등) */
export function bindFoodLog(root, onChange) {
  const date = root.dataset.date;
  let kind = 'food';
  const repaint = () => {
    $('.flog-sum', root).innerHTML = sumHtml(date);
    $('.flog-list', root).innerHTML = listHtml(date);
    if (onChange) onChange(recordOn(date));
  };

  $$('.flog-kind button', root).forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.kind;
    $$('.flog-kind button', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const input = $('input[name="text"]', root);
    input.placeholder = PLACEHOLDER[kind];
    input.focus();
  }));

  $('.flog-add', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('input[name="text"]', root);
    const text = input.value.trim();
    if (!text) return;
    const item = { tmp: 'tmp_' + Date.now(), kind, text, time: date === state.today ? nowTime() : '', kcal: 0 };
    (pending[date] ||= []).push(item);
    input.value = '';
    repaint();
    try {
      upsertRecord(await api.addLog({ date, kind: item.kind, text, time: item.time }));
    } catch (err) {
      toast('칼로리 계산 실패: ' + err.message);
      if (!input.value) input.value = text;
    } finally {
      pending[date] = (pending[date] || []).filter((x) => x !== item);
      if (root.isConnected) repaint();
    }
  });

  $('.flog-list', root).addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const { id } = btn.dataset;
    const k = btn.dataset.kind;
    const before = recordOn(date);
    if (!before) return;
    const food = [...(before.food_log || [])], ex = [...(before.exercise_log || [])];
    const list = k === 'exercise' ? ex : food;
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return;

    let request;
    if (btn.classList.contains('del')) {
      if (!confirm(`"${list[idx].text}"을(를) 지울까요?`)) return;
      list.splice(idx, 1);
      request = () => api.deleteLog({ date, kind: k, id });
    } else {
      const answer = prompt(`"${list[idx].text}" 칼로리를 고쳐주세요 (kcal)`, String(list[idx].kcal));
      if (answer === null) return;
      const kcal = Math.round(Number(answer));
      if (!isFinite(kcal) || kcal < 0) return toast('숫자로 입력해주세요');
      list[idx] = { ...list[idx], kcal, edited: true };
      request = () => api.updateLog({ date, kind: k, id, kcal });
    }
    upsertRecord(withTotals(before, food, ex));
    repaint();
    try {
      upsertRecord(await request());
    } catch (err) {
      upsertRecord(before);
      toast('저장 실패: ' + err.message);
    }
    if (root.isConnected) repaint();
  });
}

