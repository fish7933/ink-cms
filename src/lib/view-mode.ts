// PC/모바일 화면 전환 — 언어(preferred_language)는 계정에 귀속되지만, 이건 "이 기기의 화면을
// 어떻게 보여줄지"라 기기(localStorage)에 귀속시킨다. 'auto'면 뷰포트 크기로 자동 판단
// (useIsMobile, src/hooks/use-mobile.tsx), 수동으로 고정하면 뷰포트와 무관하게 그 값을 따른다.
export type ViewMode = 'auto' | 'mobile' | 'desktop';

const STORAGE_KEY = 'viewMode';
const CHANGE_EVENT = 'viewmode-changed';

export function getViewMode(): ViewMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'mobile' || stored === 'desktop' ? stored : 'auto';
}

export function setViewMode(mode: ViewMode) {
  if (mode === 'auto') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onViewModeChange(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}
