import { api } from '../api.js';
import { icon } from '../icons.js';
import { PREVIEW_MODE } from '../config.js';
import { signOut, currentEmail } from '../auth.js';
import { resetPreview } from '../mock.js';
import { state, applyTheme, saveSettings, cycleStats, setMeds, clearCache } from '../store.js';
import { $, $$, esc, toast, fmtLong } from '../utils.js';
import { backbar } from './common.js';
import { isInstalled, canPrompt, isIOS, promptInstall, onInstallChange } from '../pwa.js';

export function render(view) {
  const s = state.settings;
  const email = currentEmail();
  view.innerHTML = `
    ${backbar('설정', email || '', '#/record')}
    <div class="stack" style="padding-top:6px;gap:20px">

      <section aria-labelledby="h-theme">
        <h2 class="set-title" id="h-theme">테마</h2>
        <div class="themes" role="radiogroup">
          ${themeCard('A', '스타일 A', '포레스트 민트', ['#82AF9A', '#A896C8', '#F6F4EE'], '#E4DFD2')}
          ${themeCard('B', '스타일 B', '블러쉬 그레인', ['#E39898', '#DFA06E', '#FBF1EC'], '#EAD7CD')}
        </div>
      </section>

      <section class="card r18 flat" aria-labelledby="h-profile">
        <h2 id="h-profile" style="font-size:14px">내 정보</h2>
        ${field('nickname', '부르는 이름', 'text', s.nickname, '', 'wide')}
        ${field('height_cm', '키', 'number', s.height_cm, 'cm')}
        ${field('birth_year', '출생연도', 'number', s.birth_year, '년')}
        <p class="hint">키·출생연도는 체지방률이 없을 때 칼로리 계산에 쓰여요.</p>
      </section>

      <section class="card r18 flat" aria-labelledby="h-cycle">
        <div class="card-head" style="margin-bottom:12px">
          <h2 id="h-cycle" style="font-size:14px">생리주기</h2>
          <a class="link-btn" href="#/calendar">달력에서 기록하기</a>
        </div>
        ${cycleInfoHtml()}
        ${field('cycle_length', '기본 주기', 'number', s.cycle_length, '일')}
        <p class="hint">시작일이 2번 이상 기록되면 최근 6번의 평균 주기로 자동 계산돼요. 그 전까지는 기본 주기를 써요.</p>
        <div class="toggle-row" style="padding-bottom:0">
          <label for="n-pill">피임약 복용 중<small>주기 조절용 — 자연 주기 단계(황체기 등) 해석을 쓰지 않아요</small></label>
          <input id="n-pill" class="switch" type="checkbox" ${s.on_contraceptive === 'true' ? 'checked' : ''}>
        </div>
      </section>

      <section class="card r18 flat" aria-labelledby="h-goal">
        <h2 id="h-goal" style="font-size:14px;margin-bottom:12px">목표</h2>
        ${field('goal_body_fat_pct', '체지방률 목표', 'number', s.goal_body_fat_pct, '%')}
        ${field('goal_muscle_mass', '골격근량 목표', 'number', s.goal_muscle_mass, 'kg')}
        <p class="hint">목표 체중·날짜는 기록 화면의 칼로리 처방 카드에서 정해요.</p>
      </section>

      <section class="card r18 flat" aria-labelledby="h-meds" style="padding:16px 0 0">
        <h2 id="h-meds" style="font-size:14px;padding:0 16px;margin-bottom:12px">복용약 관리</h2>
        <div class="med-manage" id="med-manage"></div>
      </section>

      <section class="card r18 flat" style="padding:6px 16px" aria-label="알림">
        <div class="toggle-row">
          <label for="n-morning">아침 기록 알림<small>기록이 없으면 매일 오전 8시에 메일로 알려드려요</small></label>
          <input id="n-morning" class="switch" type="checkbox" ${s.notification_morning === 'true' ? 'checked' : ''}>
        </div>
        <div class="toggle-row">
          <label for="n-med">약 복용 알림<small>체크 안 한 약이 있으면 오후 8시에 메일로 알려드려요</small></label>
          <input id="n-med" class="switch" type="checkbox" ${s.notification_med === 'true' ? 'checked' : ''}>
        </div>
      </section>

      <section class="card r18 flat" aria-label="앱 설치" id="install-card"></section>

      <button type="button" class="btn ghost lg" id="logout" style="box-shadow:none">${PREVIEW_MODE ? '미리보기 데이터 초기화' : '로그아웃'}</button>
    </div>`;

  // 테마
  $$('input[name="theme"]', view).forEach((r) =>
    r.addEventListener('change', () => {
      applyTheme(r.value);
      saveSettings({ theme: r.value }, { quiet: true });
    }),
  );

  // 일반 필드 — 값이 바뀌면 저장
  $$('[data-setting]', view).forEach((inp) =>
    inp.addEventListener('change', () => {
      const key = inp.dataset.setting;
      const val = inp.value.trim();
      if (key === 'cycle_length' && val && (Number(val) < 20 || Number(val) > 45)) return toast('주기는 20~45일 사이로 입력해주세요');
      saveSettings({ [key]: val });
    }),
  );

  $('#n-pill', view).addEventListener('change', (e) => saveSettings({ on_contraceptive: String(e.target.checked) }));

  // 알림
  $('#n-morning', view).addEventListener('change', (e) => saveSettings({ notification_morning: String(e.target.checked) }));
  $('#n-med', view).addEventListener('change', (e) => saveSettings({ notification_med: String(e.target.checked) }));

  // 복용약 관리
  paintMeds($('#med-manage', view));

  // 앱 설치
  const card = $('#install-card', view);
  const paintInstall = () => {
    let sub, btn = '';
    if (isInstalled()) sub = '홈 화면에 설치된 앱으로 열려 있어요.';
    else if (canPrompt()) { sub = '홈 화면에 아이콘을 추가하고 앱처럼 열 수 있어요.'; btn = '<button type="button" class="btn" id="install-btn">설치</button>'; }
    else if (isIOS()) sub = 'Safari 아래 공유 버튼을 누르고 "홈 화면에 추가"를 선택해주세요.';
    else sub = '브라우저 메뉴(⋮)에서 "앱 설치" 또는 "홈 화면에 추가"를 선택해주세요.';
    card.innerHTML = `
      <div class="install-row">
        <img src="icons/icon-192.png" alt="" width="48" height="48">
        <div style="flex:1;min-width:0"><p class="t">건강일기 앱으로 설치</p><p class="s">${sub}</p></div>
        ${btn}
      </div>`;
    $('#install-btn', card)?.addEventListener('click', async () => {
      if (await promptInstall()) toast('홈 화면에 설치했어요');
    });
  };
  paintInstall();
  const off = onInstallChange(paintInstall);

  $('#logout', view).addEventListener('click', async () => {
    if (PREVIEW_MODE) {
      resetPreview();
      state.draft = null;
      location.hash = '#/record';
      location.reload();
      return;
    }
    clearCache();
    await signOut();
    location.reload();
  });
  return off;
}

function cycleInfoHtml() {
  const st = cycleStats();
  const md = (d) => fmtLong(d).replace(/ \S+요일$/, '');
  const rows = st.last
    ? [
        ['최근 시작일', md(st.last.start_date)],
        ['평균 주기', st.gaps.length ? `${Math.round(st.avgCycle)}일 (최근 ${st.gaps.length}회${st.spread != null ? `, 편차 ${st.spread}일` : ''})` : '기록 부족'],
        ['평균 기간', `${Math.round(st.avgLen)}일`],
        ['다음 예정일', md(st.next)],
      ]
    : [['기록', '아직 없어요']];
  return `<dl class="info-list">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function themeCard(value, name, desc, colors, border) {
  const checked = (state.settings.theme || 'B') === value;
  return `
    <label class="theme-card">
      <input type="radio" name="theme" value="${value}" ${checked ? 'checked' : ''}>
      <div class="swatch" style="border:1px solid ${border}">${colors.map((c) => `<div style="background:${c}"></div>`).join('')}</div>
      <p class="n">${name}</p>
      <p class="d">${desc}</p>
      <div class="using"><span>사용 중</span></div>
    </label>`;
}

function field(key, label, type, value, unit, cls = '') {
  const id = 'set-' + key;
  return `
    <div class="set-row">
      <label for="${id}">${label}</label>
      <input class="input ${cls}" id="${id}" data-setting="${key}" type="${type}" ${type === 'number' ? 'step="0.1" inputmode="decimal"' : ''} value="${esc(value || '')}">
      ${cls === 'wide' ? '' : `<span class="unit">${unit}</span>`}
    </div>`;
}

function paintMeds(panel) {
  const items = state.meds.map((m) => `
    <div class="med-edit ${m.active ? '' : 'off'}" data-id="${esc(m.id)}">
      <div class="row">
        <input class="input" data-f="name" value="${esc(m.name)}" aria-label="약 이름" maxlength="60">
        <input class="input" data-f="timing" value="${esc(m.timing)}" placeholder="복용 타이밍" aria-label="복용 타이밍" maxlength="40" style="flex:0 0 104px">
      </div>
      <input class="input" data-f="ingredient_dose" value="${esc(m.ingredient_dose)}" placeholder="성분 · 용량" aria-label="성분 · 용량" maxlength="80">
      <div class="acts">
        <label class="show-toggle"><input type="checkbox" class="switch" data-act="active" ${m.active ? 'checked' : ''}>기록 화면에 표시</label>
        <button type="button" class="btn ghost" data-act="delete">삭제</button>
        <button type="button" class="btn" data-act="save">저장</button>
      </div>
    </div>`).join('');

  panel.innerHTML = `${items || '<p class="hint" style="margin:0">등록된 약이 없어요.</p>'}
    <form class="med-edit med-new" id="med-new">
      <p class="t">새 약 추가</p>
      <div class="row">
        <input class="input" name="name" placeholder="약 이름" aria-label="새 약 이름" maxlength="60" required>
        <input class="input" name="timing" placeholder="복용 타이밍" aria-label="새 약 복용 타이밍" maxlength="40" style="flex:0 0 104px">
      </div>
      <input class="input" name="ingredient_dose" placeholder="성분 · 용량 (예: 로수바스타틴 10mg)" aria-label="새 약 성분 · 용량" maxlength="80">
      <button type="submit" class="btn">추가</button>
    </form>`;

  // 모든 변경은 화면에 먼저 반영하고, 서버 저장이 실패하면 되돌림
  const commit = async (optimistic, request, okMsg) => {
    const before = state.meds;
    setMeds(optimistic);
    paintMeds(panel);
    if (okMsg) toast(okMsg);
    try {
      setMeds(await request());
      paintMeds(panel);
    } catch (err) {
      setMeds(before);
      paintMeds(panel);
      toast('저장 실패: ' + err.message);
    }
  };

  $('#med-new', panel).addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const med = { name: fd.get('name').trim(), timing: fd.get('timing').trim(), ingredient_dose: fd.get('ingredient_dose').trim() };
    if (!med.name) return;
    commit(state.meds.concat({ ...med, id: 'tmp_' + Date.now(), is_default: false, active: true }), () => api.addMed(med), `${med.name}을(를) 추가했어요`);
  });

  panel.onchange = (e) => {
    if (e.target.dataset.act !== 'active') return;
    const id = e.target.closest('.med-edit').dataset.id;
    const active = e.target.checked;
    commit(state.meds.map((m) => (m.id === id ? { ...m, active } : m)), () => api.updateMed({ id, active }), active ? '기록 화면에 표시할게요' : '기록 화면에서 숨겼어요');
  };

  panel.onclick = (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const box = btn.closest('.med-edit');
    const id = box.dataset.id;
    const med = state.meds.find((m) => m.id === id);
    if (!med) return;
    if (id.startsWith('tmp_')) return toast('저장 중이에요. 잠시 후 다시 눌러주세요');
    if (btn.dataset.act === 'save') {
      const vals = Object.fromEntries($$('[data-f]', box).map((i) => [i.dataset.f, i.value.trim()]));
      if (!vals.name) return toast('약 이름을 입력해주세요');
      commit(state.meds.map((m) => (m.id === id ? { ...m, ...vals } : m)), () => api.updateMed({ id, ...vals }), '저장했어요');
    } else if (btn.dataset.act === 'delete') {
      if (!confirm(`${med.name}을(를) 삭제할까요?`)) return;
      commit(state.meds.filter((m) => m.id !== id), () => api.deleteMed(id), '삭제했어요');
    }
  };
}
