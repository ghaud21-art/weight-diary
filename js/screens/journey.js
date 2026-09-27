import { icon } from '../icons.js';
import { state, latestRecord, bodyRecords, cycleStats } from '../store.js';
import { $, $$, esc, addDays, daysBetween, fmtShort, fmtMD, weekday, fix1, judge } from '../utils.js';
import { cycleLabel } from '../cycle.js';
import { topbar } from './common.js';

const W = 326, H = 130, PAD = 12;

export function render(view) {
  const last = latestRecord();
  const lastJudge = last ? judge(last, bodyRecords().filter((r) => r.date < last.date).pop(), state.settings) : null;
  const sub = [cycleLabel(cycleStats()), lastJudge?.label].filter(Boolean).join(' · ') || '기록이 쌓일수록 흐름이 보여요';

  view.innerHTML = `
    ${topbar()}
    <div class="page-title"><h1>나의 여정</h1><p>${esc(sub)}</p></div>
    <div class="stack">
      <div class="seg" role="group" aria-label="기간 선택">
        <button type="button" data-range="7">7일</button>
        <button type="button" data-range="30">30일</button>
      </div>
      <div id="journey-body"></div>
    </div>`;

  $$('.seg button', view).forEach((b) =>
    b.addEventListener('click', () => {
      state.journeyRange = Number(b.dataset.range);
      paint(view);
    }),
  );
  paint(view);
}

function paint(view) {
  const n = state.journeyRange;
  $$('.seg button', view).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === n)));
  const start = addDays(state.today, -(n - 1));
  const inRange = bodyRecords().filter((r) => r.date >= start && r.date <= state.today);
  const prevStart = addDays(start, -n);
  const prevRange = bodyRecords().filter((r) => r.date >= prevStart && r.date < start);

  $('#journey-body', view).innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <section class="card" aria-labelledby="h-trend">
        <div class="card-head" style="align-items:center">
          <h2 id="h-trend" style="font-size:15px">체중 · 체지방률 추이</h2>
          <div class="legend">
            <span><i style="background:var(--accent)"></i>체지방률</span>
            <span><i style="background:var(--muted)"></i>체중</span>
          </div>
        </div>
        ${chartHtml(inRange, start, n)}
      </section>

      <section class="stats" aria-label="${n === 7 ? '이번 주' : '최근 30일'} 평균">
        ${statHtml('평균 체중', inRange, prevRange, 'weight', 'kg')}
        ${statHtml('평균 골격근', inRange, prevRange, 'muscle_mass', 'kg')}
        ${statHtml('평균 체지방률', inRange, prevRange, 'body_fat_pct', '%')}
      </section>

      <section class="list" aria-labelledby="h-recent">
        <h2 id="h-recent">최근 기록</h2>
        ${listHtml(inRange)}
      </section>
    </div>`;
}

function chartHtml(recs, start, n) {
  const pts = (key) => recs.filter((r) => r[key] != null).map((r) => ({ x: daysBetween(start, r.date), v: r[key] }));
  const wPts = pts('weight');
  const fPts = pts('body_fat_pct');
  if (wPts.length + fPts.length === 0) {
    return '<p class="empty">이 기간에는 아직 기록이 없어요.<br>아침 인바디를 기록하면 그래프가 그려져요.</p>';
  }
  const scale = (arr) => {
    const vs = arr.map((p) => p.v);
    let min = Math.min(...vs), max = Math.max(...vs);
    if (max - min < 0.6) { const m = (max + min) / 2; min = m - 0.3; max = m + 0.3; }
    return arr.map((p) => [
      +(((n === 1 ? 0 : p.x / (n - 1)) * (W - 2 * PAD)) + PAD).toFixed(1),
      +(PAD + (1 - (p.v - min) / (max - min)) * (H - 2 * PAD)).toFixed(1),
      p.v,
    ]);
  };
  const lastY = (arr) => (arr.length ? scale(arr).pop()[1] : null);
  const wY = lastY(wPts), fY = lastY(fPts);
  // 두 선의 끝점이 가까우면 체중 라벨은 점 아래쪽에 표시
  const below = wY != null && fY != null && Math.abs(wY - fY) < 16 ? 'weight' : null;
  const line = (arr, color, sw, unit, key) => {
    if (!arr.length) return '';
    const s = scale(arr);
    const lastP = s[s.length - 1];
    const ty = below === key ? lastP[1] + 17 : lastP[1] - 9;
    return `
      ${s.length > 1 ? `<polyline points="${s.map((p) => p[0] + ',' + p[1]).join(' ')}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${s.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === s.length - 1 ? 4 : 2.2}" fill="${color}"><title>${fix1(p[2])}${unit}</title></circle>`).join('')}
      <text x="${Math.min(lastP[0], W - 4)}" y="${Math.max(10, Math.min(H + 4, ty))}" text-anchor="end" font-size="10.5" fill="${color}" font-weight="600">${fix1(lastP[2])}${unit}</text>`;
  };
  const labels = n === 7
    ? Array.from({ length: 7 }, (_, i) => weekday(addDays(start, i)))
    : [0, 7, 14, 22, 29].map((i) => fmtMD(addDays(start, i)));
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${n}일 체중과 체지방률 추이 그래프">
      ${line(wPts, 'var(--muted)', 2, 'kg', 'weight')}
      ${line(fPts, 'var(--accent)', 2.6, '%', 'fat')}
    </svg>
    <div class="chart-x" style="padding:0 ${PAD - 4}px">${labels.map((l) => `<span>${l}</span>`).join('')}</div>`;
}

function avg(recs, key) {
  const vs = recs.map((r) => r[key]).filter((v) => v != null);
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
}

function statHtml(label, cur, prev, key, unit) {
  const a = avg(cur, key), b = avg(prev, key);
  let delta = '<span class="delta">&nbsp;</span>';
  if (a != null && b != null) {
    const d = Math.round((a - b) * 10) / 10;
    if (d > 0) delta = `<span class="delta up" aria-label="이전 기간보다 ${d} 증가">${icon.triUp()}${d.toFixed(1)}</span>`;
    else if (d < 0) delta = `<span class="delta down" aria-label="이전 기간보다 ${Math.abs(d)} 감소">${icon.triDown()}${Math.abs(d).toFixed(1)}</span>`;
    else delta = '<span class="delta">변화 없음</span>';
  }
  return `
    <div class="stat">
      <p class="k">${label}</p>
      <p class="v">${a != null ? fix1(a) + unit : '-'}</p>
      ${delta}
    </div>`;
}

function listHtml(recs) {
  if (!recs.length) return '<p class="empty">아직 기록이 없어요.</p>';
  return recs.slice().reverse().map((r) => {
    const prev = bodyRecords().filter((x) => x.date < r.date).pop();
    const j = judge(r, prev, state.settings);
    const parts = [r.weight != null ? `${fix1(r.weight)}kg` : null, r.body_fat_pct != null ? `체지방 ${fix1(r.body_fat_pct)}%` : null, r.muscle_mass != null ? `근육 ${fix1(r.muscle_mass)}kg` : null].filter(Boolean);
    const inner = `
      <div class="main">
        <p class="t">${fmtShort(r.date)}</p>
        <p class="s">${esc(parts.join(' · ') || '수치 없음')}</p>
      </div>
      ${j ? `<span class="chip lg ${j.tone}">${esc(j.label)}</span>` : ''}`;
    return r.coach_feedback
      ? `<a class="list-item" href="#/coach/${r.date}" aria-label="${fmtShort(r.date)} 피드백 보기">${inner}</a>`
      : `<div class="list-item">${inner}</div>`;
  }).join('');
}
