import { api } from '../api.js';
import { icon } from '../icons.js';
import { PREVIEW_MODE } from '../config.js';
import { signOut, currentEmail } from '../auth.js';
import { resetPreview } from '../mock.js';
import { state, applyTheme, saveSettings } from '../store.js';
import { $, $$, esc, toast } from '../utils.js';
import { backbar } from './common.js';

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
          <button type="button" class="link-btn" id="cycle-today">오늘 시작했어요</button>
        </div>
        ${field('cycle_start_date', '최근 시작일', 'date', s.cycle_start_date, '', 'wide')}
        ${field('cycle_length', '평균 주기', 'number', s.cycle_length, '일')}
        <div class="toggle-row" style="padding-bottom:0">
          <label for="n-pill">피임약 복용 중<small>자연 주기 단계(황체기 등) 대신 복용 주기로 해석해요</small></label>
          <input id="n-pill" class="switch" type="checkbox" ${s.on_contraceptive === 'true' ? 'checked' : ''}>
        </div>
      </section>

      <section class="card r18 flat" aria-labelledby="h-goal">
        <h2 id="h-goal" style="font-size:14px;margin-bottom:12px">목표</h2>
        ${field('goal_body_fat_pct', '체지방률 목표', 'number', s.goal_body_fat_pct, '%')}
        ${field('goal_muscle_mass', '골격근량 목표', 'number', s.goal_muscle_mass, 'kg')}
        <p class="hint">목표 체중·날짜는 기록 화면의 칼로리 플랜 카드에서 정해요.</p>
      </section>

      <section class="card r18 flat" style="padding:0">
        <button type="button" class="disclosure" aria-expanded="false" aria-controls="med-manage" id="med-toggle">
          <span>복용약 목록 관리</span>${icon.chevron()}
        </button>
        <div class="med-manage" id="med-manage" hidden></div>
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
  $('#cycle-today', view).addEventListener('click', () => {
    $('[data-setting="cycle_start_date"]', view).value = state.today;
    saveSettings({ cycle_start_date: state.today });
  });

  $('#n-pill', view).addEventListener('change', (e) => saveSettings({ on_contraceptive: String(e.target.checked) }));

  // 알림
  $('#n-morning', view).addEventListener('change', (e) => saveSettings({ notification_morning: String(e.target.checked) }));
  $('#n-med', view).addEventListener('change', (e) => saveSettings({ notification_med: String(e.target.checked) }));

  // 복용약 관리
  const toggle = $('#med-toggle', view);
  const panel = $('#med-manage', view);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open) paintMeds(panel);
  });

  $('#logout', view).addEventListener('click', async () => {
    if (PREVIEW_MODE) {
      resetPreview();
      state.draft = null;
      location.hash = '#/record';
      location.reload();
      return;
    }
    await signOut();
    location.reload();
  });
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
  panel.innerHTML = state.meds.map((m) => `
    <div class="med-edit ${m.active ? '' : 'off'}" data-id="${esc(m.id)}">
      <div class="row">
        <input class="input" data-f="name" value="${esc(m.name)}" aria-label="약 이름" maxlength="60">
        <input class="input" data-f="timing" value="${esc(m.timing)}" placeholder="복용 타이밍" aria-label="복용 타이밍" maxlength="40" style="flex:0 0 104px">
      </div>
      <input class="input" data-f="ingredient_dose" value="${esc(m.ingredient_dose)}" placeholder="성분 · 용량" aria-label="성분 · 용량" maxlength="80">
      <div class="acts">
        ${m.active
          ? `<button type="button" class="btn ghost" data-act="delete">${m.is_default ? '목록에서 숨기기' : '삭제'}</button>`
          : '<button type="button" class="btn ghost" data-act="restore">다시 사용</button>'}
        <button type="button" class="btn" data-act="save">저장</button>
      </div>
    </div>`).join('') + '<p class="hint" style="margin:0">새 약은 기록 화면의 복용약 카드에서 추가할 수 있어요.</p>';

  panel.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const box = btn.closest('.med-edit');
    const id = box.dataset.id;
    const med = state.meds.find((m) => m.id === id);
    btn.disabled = true;
    try {
      if (btn.dataset.act === 'save') {
        const vals = Object.fromEntries($$('[data-f]', box).map((i) => [i.dataset.f, i.value.trim()]));
        if (!vals.name) throw new Error('약 이름을 입력해주세요');
        state.meds = await api.updateMed({ id, ...vals });
        toast('저장했어요');
      } else if (btn.dataset.act === 'delete') {
        if (!confirm(med.is_default ? `${med.name}을(를) 오늘의 복용약 목록에서 숨길까요?` : `${med.name}을(를) 삭제할까요?`)) return;
        state.meds = await api.deleteMed(id);
        toast(med.is_default ? '목록에서 숨겼어요' : '삭제했어요');
      } else if (btn.dataset.act === 'restore') {
        state.meds = await api.updateMed({ id, active: true });
        toast('다시 목록에 표시할게요');
      }
      paintMeds(panel);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  };
}
