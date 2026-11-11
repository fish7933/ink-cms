import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { getViewMode, setViewMode, onViewModeChange, type ViewMode } from '@/lib/view-mode';

// 최종적으로 화면에 적용할 모드('auto' 오버라이드일 땐 뷰포트 자동감지 결과를 따른다).
export function useViewMode(): { mode: ViewMode; effectiveMode: 'mobile' | 'desktop'; setMode: (m: ViewMode) => void } {
  const [mode, setModeState] = useState<ViewMode>(getViewMode());
  const isMobileViewport = useIsMobile();

  useEffect(() => onViewModeChange(() => setModeState(getViewMode())), []);

  const effectiveMode = mode === 'auto' ? (isMobileViewport ? 'mobile' : 'desktop') : mode;

  return { mode, effectiveMode, setMode: setViewMode };
}
