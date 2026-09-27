import { api } from '../api.js';
import { icon } from '../icons.js';
import { state, recordOn, hasBody, prevRecord, upsertRecord } from '../store.js';
import { $, esc, fmtLong, fmtShort, fix1, comma, toast } from '../utils.js';
import { backbar, deltaChip } from './common.js';

export function render(view, { arg, mode }) {
  if (mode === 'archive') return renderArchive(view);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(arg || '') ? arg : state.today;
  const isToday = date === state.today;
  view.innerHTML = `
    ${backbar(isToday ? '오늘의 코치 피드백' : '지난 코치 피드백', fmtLong(date), isToday ? '#/record' : '#/archive')}
    <div class="stack" style="padding-top:14px" id="fb-body"></div>`;
  paint(view, date);
}

function paint(view, date) {
  const body = $('#fb-body', view);
  const rec = recordOn(date);
  const isToday = date === state.today;
  const footer = `
    <a class="btn lg" href="#/chat">${icon.chat(16)} AI 코치와 대화하기</a>
    <a class="link-btn muted" href="#/archive" style="justify-content:center;padding:6px">지난 피드백 아카이브 보기</a>`;

  if (!rec || (!rec.morning_feedback && !rec.coach_feedback && !hasBody(rec) && !rec.mood)) {
    body.innerHTML = `
      <div class="card flat empty">${isToday ? '아침에 인바디를 저장하고 "인바디 피드백 받기"를 누르면 오늘 하루 계획이 도착해요.' : '이 날의 기록이 없어요.'}
        <div style="margin-top:14px"><a class="btn" href="#/record" style="width:auto;padding:10px 18px">기록하러 가기</a></div>
      </div>${footer}`;
    return;
  }

  const m = rec.morning_feedback;
  const fb = rec.coach_feedback;
  const prev = prevRecord(date);
  const row = (label, key, unit, pu) => `
    <div class="cmp-row">
      <span class="k">${label}</span>
      <span class="v">${prev?.[key] != null ? fix1(prev[key]) + ' → ' : ''}<strong>${rec[key] != null ? fix1(rec[key]) + unit : '-'}</strong></span>
      ${deltaChip(rec[key], prev?.[key], pu)}
    </div>`;
  const cmp = hasBody(rec) ? `
    <div class="cmp">
      ${row('체중', 'weight', 'kg', 'kg')}
      ${row('골격근량', 'muscle_mass', 'kg', 'kg')}
      ${row('체지방률', 'body_fat_pct', '%', '%p')}
    </div>
    ${prev ? '' : '<p class="hint">비교할 이전 기록이 없어요.</p>'}` : '';

  // 아침: 인바디 해석 + 오늘 하루 계획
  const morning = m ? `
    <h3 class="sec"><span class="sec-time">아침</span>인바디 피드백 · 오늘 하루 계획</h3>
    <section class="card fb-facts" aria-label="아침 인바디 피드백">
      <h2 style="font-size:15px;margin:0">${esc(m.title)}</h2>
      <div style="margin-top:12px">${cmp}</div>
      <p class="fb-analysis">${esc(m.analysis)}</p>
    </section>
    <div class="actions">
      ${action('accent', icon.fork(), '끼니 계획', m.plan?.meals)}
      ${action('peach', icon.flame(), '운동', m.plan?.exercise)}
      ${action('clay', icon.drop(), '물 · 약 · 수면', m.plan?.routine)}
    </div>
    ${m.focus ? `<p class="focus card flat"><b>오늘의 한 가지</b> ${esc(m.focus)}</p>` : ''}` : '';

  // 저녁: 하루 마무리 (4단계 + 하루 돌아보기 + 내일 조언)
  let evening;
  if (fb?.legacy) {
    evening = `<section class="card"><p class="legacy">${esc(fb.legacy)}</p></section>`;
  } else if (fb) {
    evening = `
      <h3 class="sec"><span class="sec-time">저녁</span>하루 마무리 피드백</h3>
      <section class="fb-brief" aria-label="공감 및 멘탈 브리핑">
        <div class="inner">
          <span class="badge-ico lg">${icon.coach()}</span>
          <div>
            <p class="t">${esc(fb.briefing?.title || '')}</p>
            ${fb.briefing?.emotional ? `<p class="emo">${esc(fb.briefing.emotional)}</p>` : ''}
            <p class="b">${esc(fb.briefing?.body || '')}</p>
          </div>
        </div>
      </section>

      <section class="card fb-facts" aria-labelledby="h-facts">
        <h2 id="h-facts" style="font-size:15px;margin:0">대사 과학 팩트 해부</h2>
        <p class="lead">${esc(fb.facts?.headline || '')}</p>
        ${m ? '' : cmp}
        <p class="fb-analysis">${esc(fb.facts?.analysis || '')}</p>
      </section>

      ${fb.day_review ? `
        <section class="card fb-facts" aria-labelledby="h-review">
          <h2 id="h-review" style="font-size:15px;margin:0 0 10px">오늘 하루 돌아보기</h2>
          ${(rec.intake_kcal != null) ? `<p class="lead">먹은 칼로리 ${comma(rec.intake_kcal)}kcal · 운동 ${comma(rec.exercise_kcal || 0)}kcal${rec.kcal_goal ? ` · 목표 ${comma(rec.kcal_goal)}kcal` : ''}</p>` : ''}
          <p class="fb-analysis"><b>식단</b> ${esc(fb.day_review.food || '')}</p>
          <p class="fb-analysis"><b>운동</b> ${esc(fb.day_review.exercise || '')}</p>
          ${fb.day_review.plan_check ? `<p class="fb-analysis"><b>잘한 점</b> ${esc(fb.day_review.plan_check)}</p>` : ''}
        </section>` : ''}

      <section aria-labelledby="h-actions">
        <h2 class="section-title" id="h-actions">맞춤형 3대 행동 강령</h2>
        <div class="actions">
          ${action('accent', icon.fork(), '식단 조율', fb.actions?.diet)}
          ${action('clay', icon.pill(), '약물 복용 타이밍', fb.actions?.medication)}
          ${action('peach', icon.drop(), '수분 · 생활 루틴', fb.actions?.routine)}
        </div>
      </section>

      ${fb.tomorrow?.tips?.length ? `
        <section class="card tomorrow-card" aria-labelledby="h-tomorrow">
          <h2 id="h-tomorrow" style="font-size:15px;margin:0 0 8px">${icon.bolt(15)} ${esc(fb.tomorrow.title || '내일을 위한 조언')}</h2>
          <ol>${fb.tomorrow.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        </section>` : ''}

      <section class="closing" aria-label="엔진 부스팅 클로징">
        ${icon.bolt()}
        <p class="t">${esc(fb.closing?.title || '')}</p>
        <p class="b">${esc(fb.closing?.body || '')}</p>
      </section>
      <button type="button" class="link-btn muted" id="regen" style="justify-content:center;padding:2px">${icon.refresh()} 하루 마무리 피드백 다시 받기</button>`;
  } else {
    evening = isToday
      ? `<div class="card flat empty">저녁에 마음까지 기록하고, 기록 화면 맨 아래 "하루 마무리 피드백 받기"를 눌러주세요.
           <div style="margin-top:14px"><a class="btn" href="#/record" style="width:auto;padding:10px 18px">기록하러 가기</a></div></div>`
      : `<div class="card flat empty">이 날은 하루 마무리 피드백이 없어요.
           <div style="margin-top:14px"><button type="button" class="btn" id="regen" style="width:auto;padding:10px 18px">${icon.refresh()} 지금 받아보기</button></div></div>`;
  }

  body.innerHTML = `${morning}${evening}${footer}`;
  bindRegen(view, date);
}

const action = (tone, svg, title, text) => `
  <div class="action">
    <span class="badge-ico ${tone}">${svg}</span>
    <div><p class="t">${title}</p><p class="b">${esc(text || '')}</p></div>
  </div>`;

function bindRegen(view, date) {
  const btn = $('#regen', view);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner dark"></span> 코치가 다시 쓰는 중…';
    try {
      upsertRecord(await api.regenerateFeedback(date));
      paint(view, date);
      toast('새 피드백을 받았어요');
    } catch (err) {
      toast('실패: ' + err.message);
      btn.disabled = false;
      btn.textContent = '피드백 다시 받기';
    }
  });
}

/* ───────── 아카이브 ───────── */
async function renderArchive(view) {
  view.innerHTML = `
    ${backbar('지난 피드백', '날짜를 누르면 그날의 피드백을 다시 볼 수 있어요', '#/coach')}
    <div class="stack" style="padding-top:14px">
      <section class="list" id="archive"><p class="empty"><span class="spinner dark" style="display:inline-block"></span></p></section>
    </div>`;
  let recs = state.records;
  try {
    recs = await api.getRecords(365);
    recs.forEach((r) => { if (!recordOn(r.date)) upsertRecord(r); });
  } catch (err) {
    toast('전체 기록을 불러오지 못해 최근 60일만 보여드려요');
  }
  const items = recs.filter((r) => r.coach_feedback || r.morning_feedback).sort((a, b) => (a.date < b.date ? 1 : -1));
  const box = $('#archive', view);
  if (!box) return;
  box.innerHTML = `<h2>피드백 ${items.length}개</h2>` + (items.length
    ? items.map((r) => `
        <a class="list-item" href="#/coach/${r.date}">
          <div class="main">
            <p class="t">${fmtShort(r.date)}</p>
            <p class="s">${esc([r.morning_feedback && '아침 ' + r.morning_feedback.title, r.coach_feedback && '저녁 ' + (r.coach_feedback.briefing?.title || r.coach_feedback.legacy?.slice(0, 30) || '')].filter(Boolean).join(' · '))}</p>
          </div>
          <span style="color:var(--muted)">${icon.chevron(14)}</span>
        </a>`).join('')
    : '<p class="empty">아직 받은 피드백이 없어요.</p>');
}
