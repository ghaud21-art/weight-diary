import { CONFIG, PREVIEW_MODE } from './config.js';
import { api, setAuthHandler } from './api.js';
import { getToken, signIn, signOut } from './auth.js';
import { state, load, applyTheme, readCache, clearCache } from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, toast } from './utils.js';
import { initPwa } from './pwa.js';
import * as record from './screens/record.js';
import * as journey from './screens/journey.js';
import * as calendar from './screens/calendar.js';
import * as coach from './screens/coach.js';
import * as chat from './screens/chat.js';
import * as settings from './screens/settings.js';

const view = $('#view');
const tabbar = $('#tabbar');

const ROUTES = {
  record: { screen: record, tab: 'record' },
  calendar: { screen: calendar, tab: 'calendar' },
  journey: { screen: journey, tab: 'journey' },
  coach: { screen: coach, tab: 'coach' },
  archive: { screen: coach, tab: 'coach', mode: 'archive' },
  chat: { screen: chat, tab: null },
  settings: { screen: settings, tab: null },
};

let cleanup = null;

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const r = ROUTES[name] || ROUTES.record;
  if (typeof cleanup === 'function') cleanup();
  tabbar.hidden = !r.tab;
  document.body.classList.toggle('no-tabbar', !r.tab);
  $$('a', tabbar).forEach((a) => (a.dataset.tab === r.tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  view.innerHTML = '';
  window.scrollTo(0, 0);
  cleanup = r.screen.render(view, { arg: arg && decodeURIComponent(arg), mode: r.mode }) || null;
}

function renderTabbar() {
  const items = { record: ['기록', icon.tabRecord()], calendar: ['달력', icon.tabCalendar()], journey: ['여정', icon.tabJourney()], coach: ['코치', icon.tabCoach()] };
  $$('a', tabbar).forEach((a) => {
    const [label, svg] = items[a.dataset.tab];
    a.innerHTML = `${svg}<span>${label}</span>`;
  });
}

function centerScreen(html) {
  tabbar.hidden = true;
  view.innerHTML = `<div class="center-screen">${html}</div>`;
}

/** 로그인 화면. overlay=true면 현재 화면 위에 덮어서 작업 중이던 내용을 보존 */
function showLogin({ overlay = false } = {}) {
  const box = document.createElement('div');
  box.className = 'center-screen';
  box.innerHTML = `
    <img class="app-logo" src="icons/icon-192.png" alt="" width="88" height="88">
    <h1>건강일기</h1>
    <p>${overlay ? '로그인이 만료됐어요. 다시 로그인하면 이어서 진행할게요.' : '대사 코치와 함께하는 나만의 기록장이에요.<br>본인 구글 계정으로 로그인해주세요.'}</p>
    <div class="gbtn"></div>`;
  if (overlay) {
    Object.assign(box.style, { position: 'fixed', inset: '0', zIndex: '100', background: 'var(--bg)' });
    document.body.appendChild(box);
  } else {
    tabbar.hidden = true;
    view.innerHTML = '';
    view.appendChild(box);
  }
  return signIn($('.gbtn', box)).then((t) => {
    if (overlay) box.remove();
    return t;
  });
}

function showBlocked() {
  centerScreen(`
    <div class="logo">${icon.lock()}</div>
    <h1>들어올 수 없는 계정이에요</h1>
    <p>이 기록장은 한 사람만 쓸 수 있도록 잠겨 있어요.<br>등록된 본인 계정으로 다시 로그인해주세요.</p>
    <button type="button" class="btn" id="switch-account">다른 계정으로 로그인</button>`);
  $('#switch-account').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });
}

function showError(msg) {
  centerScreen(`
    <div class="logo">${icon.heart(30)}</div>
    <h1>불러오지 못했어요</h1>
    <p>${esc(msg)}</p>
    <button type="button" class="btn" onclick="location.reload()">다시 시도</button>`);
}

async function boot() {
  initPwa();
  renderTabbar();
  if (!PREVIEW_MODE) {
    if (!CONFIG.GOOGLE_CLIENT_ID) return showError('js/config.js에 GOOGLE_CLIENT_ID를 입력해주세요.');
    if (!getToken()) {
      try {
        await showLogin();
      } catch (e) {
        return showError(e.message);
      }
    }
    let relogin = null;
    setAuthHandler(() => (relogin ||= showLogin({ overlay: true }).finally(() => (relogin = null))));
  }

  // 기기에 저장된 마지막 데이터가 있으면 바로 화면을 그리고, 최신 데이터는 뒤에서 받아옴
  const cached = readCache();
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    applyTheme(state.settings.theme);
    window.addEventListener('hashchange', route);
    route();
  };
  if (cached) {
    load(cached);
    start();
  } else {
    view.innerHTML = '<div class="stack" style="padding-top:60px"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  }

  try {
    const fresh = await api.bootstrap();
    const changed = !cached || JSON.stringify(fresh.records) !== JSON.stringify(cached.records) ||
      JSON.stringify(fresh.settings) !== JSON.stringify(cached.settings) ||
      JSON.stringify(fresh.medications) !== JSON.stringify(cached.medications) ||
      JSON.stringify(fresh.periods) !== JSON.stringify(cached.periods);
    load(fresh);
    if (!started) start();
    else if (changed) softRefresh();
  } catch (e) {
    if (e.code === 'forbidden') {
      clearCache();
      return showBlocked();
    }
    if (!started) return showError(e.message);
    toast('최신 기록을 불러오지 못해 저장된 기록을 보여드려요');
  }
}

/** 새 데이터가 도착하면 현재 화면을 다시 그림 — 입력 중이거나 대화 중이면 건드리지 않음 */
function softRefresh() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (name === 'chat' || name === 'settings' || typing || document.querySelector('dialog[open]')) return;
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}

boot();
