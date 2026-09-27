import { icon } from '../icons.js';
import { esc } from '../utils.js';
import { PREVIEW_MODE } from '../config.js';

export const topbar = () => `
  <header class="topbar">
    <div class="brand">${icon.heart()}<span>몸무게일기</span></div>
    <a class="icon-btn" href="#/settings" aria-label="설정">${icon.gear()}</a>
  </header>`;

export const backbar = (title, sub = '', href = '#/record') => `
  <header class="backbar">
    <a class="icon-btn sm" href="${href}" aria-label="뒤로 가기">${icon.back()}</a>
    <div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
  </header>`;

export const previewBanner = () =>
  PREVIEW_MODE
    ? '<p class="preview-banner">미리보기 모드예요. 데이터는 이 브라우저에만 저장되고, AI 코치 답변은 예시 문장이에요. js/config.js에 GAS 주소를 넣으면 실제로 동작해요.</p>'
    : '';

export function deltaChip(cur, prev, unit) {
  if (cur == null || prev == null) return '<span class="chip neutral">비교 없음</span>';
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return '<span class="chip neutral">변화 없음</span>';
  const abs = Math.abs(d).toFixed(1) + unit;
  return d > 0 ? `<span class="chip clay">${abs} 증가</span>` : `<span class="chip down">${abs} 감소</span>`;
}

export function timingTone(timing) {
  if (/즉시/.test(timing)) return 'clay';
  if (/공복|식전/.test(timing)) return 'neutral';
  return '';
}
