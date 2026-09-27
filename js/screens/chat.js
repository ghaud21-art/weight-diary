import { api } from '../api.js';
import { icon } from '../icons.js';
import { state, recordOn } from '../store.js';
import { $, esc, toast } from '../utils.js';

const GREETING = {
  hard: "오늘 컨디션 체크인에서 '힘듦'을 선택하셨네요. 무슨 일이 있었는지 편하게 얘기해주실래요?",
  normal: '오늘은 무난한 하루를 보내고 계신가요? 몸이나 마음에 걸리는 게 있으면 편하게 이야기해주세요.',
  good: '오늘 컨디션이 좋다고 하셨네요. 그 기운을 어떻게 이어가면 좋을지 같이 이야기해볼까요?',
  none: '안녕하세요. 오늘 몸과 마음은 어떠세요? 편하게 이야기해주세요.',
};

export function render(view) {
  view.innerHTML = `
    <div class="chat">
      <header class="chat-head">
        <a class="icon-btn sm" href="#/coach" aria-label="뒤로 가기">${icon.back()}</a>
        <span class="badge-ico lg" style="background:var(--accent2-soft)">${icon.coach()}</span>
        <div><h1>AI 코치와 대화하기</h1><p>대사 상태 · 마음 상태 편하게 이야기해요</p></div>
      </header>
      <p class="chat-banner" role="note">이 대화는 전문 상담·진료를 대신하지 않습니다. 위급하다고 느껴지면 자살예방상담전화 <a href="tel:1393">1393</a>으로 연락해주세요.</p>
      <div class="chat-log" id="log" role="log" aria-live="polite"></div>
      <form class="chat-input" id="chat-form">
        <label for="chat-text" class="sr-only">메시지 입력</label>
        <textarea id="chat-text" rows="1" maxlength="2000" placeholder="메시지를 입력하세요" disabled></textarea>
        <button type="submit" class="send" aria-label="전송" disabled>${icon.send()}</button>
      </form>
    </div>`;

  const log = $('#log', view);
  const form = $('#chat-form', view);
  const input = $('#chat-text', view);
  const send = $('.send', view);
  let busy = false;

  const scroll = () => (log.scrollTop = log.scrollHeight);
  const add = (role, text, extra = '') => {
    const el = document.createElement('div');
    el.className = `msg ${role === 'user' ? 'me' : ''} ${extra}`;
    el.innerHTML = role === 'user'
      ? `<div class="bubble">${esc(text)}</div>`
      : `<span class="av">${icon.coach(13)}</span><div class="bubble">${esc(text)}</div>`;
    log.appendChild(el);
    scroll();
    return el;
  };
  const typing = () => {
    const el = document.createElement('div');
    el.className = 'msg';
    el.innerHTML = `<span class="av">${icon.coach(13)}</span><div class="bubble typing" aria-label="코치가 입력 중"><i></i><i></i><i></i></div>`;
    log.appendChild(el);
    scroll();
    return el;
  };
  const autosize = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden';
  };
  const ready = () => {
    input.disabled = false;
    send.disabled = !input.value.trim() || busy;
  };

  (async () => {
    const t = typing();
    try {
      const res = await api.getChat();
      t.remove();
      const mood = res.mood || recordOn(state.today)?.mood || 'none';
      if (!res.messages.length) add('coach', GREETING[mood] || GREETING.none);
      res.messages.forEach((m) => add(m.role, m.message));
    } catch (err) {
      t.remove();
      add('coach', GREETING[recordOn(state.today)?.mood || 'none']);
      toast('지난 대화를 불러오지 못했어요');
    }
    ready();
    input.focus();
  })();

  input.addEventListener('input', () => { autosize(); ready(); });
  input.addEventListener('keydown', (e) => {
    // 한글 조합 중 Enter는 무시 (마지막 글자 중복 전송 방지)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    input.value = '';
    autosize();
    ready();
    add('user', text);
    const t = typing();
    try {
      const res = await api.sendChat(text);
      t.remove();
      add('coach', res.reply);
    } catch (err) {
      t.remove();
      add('coach', '답변을 받지 못했어요. 잠시 후 다시 보내주세요.\n(' + err.message + ')', 'err');
      input.value = text;
    } finally {
      busy = false;
      ready();
      input.focus();
    }
  });
}
