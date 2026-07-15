import { X } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import { useTabContext } from '@/contexts/TabContext';
import { useUISettings } from '@/contexts/UISettingsContext';

const CONTROLS_WIDTH = 120;
const HOVER_PADDING = 40; // 양쪽 px + 닫기 버튼 여유

interface TabBarProps {
  // 탭의 path(쿼리스트링 제외)와 정확히 일치할 때 탭 제목 옆에 작은 배지 숫자를 표시한다.
  pathBadgeCounts?: Record<string, number>;
}

export default function TabBar({ pathBadgeCounts = {} }: TabBarProps) {
  const { tabs, activeTabId, activateTab, closeTab, closeLastTab, closeAllTabs } = useTabContext();
  const { uiSettings } = useUISettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const titleWidthCache = useRef<Record<string, number>>({});

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // canvas로 텍스트 너비 측정
  const measureTextWidth = (text: string): number => {
    if (titleWidthCache.current[text]) return titleWidthCache.current[text];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return uiSettings.tabMaxWidth;
    ctx.font = '12px sans-serif';
    const width = Math.ceil(ctx.measureText(text).width) + HOVER_PADDING;
    titleWidthCache.current[text] = width;
    return width;
  };

  if (tabs.length === 0) return null;

  const availableWidth = containerWidth - CONTROLS_WIDTH;
  const baseTabWidth = availableWidth > 0
    ? Math.max(uiSettings.tabMinWidth, Math.min(uiSettings.tabMaxWidth, Math.floor(availableWidth / tabs.length)))
    : uiSettings.tabMaxWidth;

  return (
    <div ref={containerRef} className="bg-gray-100 border-b border-gray-200 flex items-end gap-1.5 px-2 pt-1.5 overflow-x-auto scrollbar-hide shrink-0" style={{ scrollbarWidth: 'none' }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        const isHovered = hoveredTabId === tab.id;
        const tabWidth = isHovered ? Math.max(baseTabWidth, measureTextWidth(tab.title)) : baseTabWidth;
        const tabBadge = pathBadgeCounts[tab.path.split('?')[0]] || 0;
        return (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-3 cursor-pointer shrink-0 group rounded-t-md border border-b-0 transition-[width,background-color] duration-150 ${
              isActive
                ? 'bg-white text-blue-700 shadow-[0_-1px_4px_rgba(0,0,0,0.05)] border-gray-200 border-t-2 border-t-blue-600 font-medium'
                : 'bg-gray-50 text-gray-500 border-gray-200 border-t-2 border-t-transparent hover:bg-white hover:text-gray-700'
            }`}
            style={{ width: `${tabWidth}px`, height: '34px' }}
            onClick={() => activateTab(tab.id)}
            onMouseEnter={() => setHoveredTabId(tab.id)}
            onMouseLeave={() => setHoveredTabId(null)}
          >
            <span className={`flex-1 text-xs select-none ${isHovered ? '' : 'truncate'}`}>{tab.title}</span>
            {tabBadge > 0 && (
              <span className="shrink-0 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[1.1rem] text-center font-semibold">
                {tabBadge > 99 ? '99+' : tabBadge}
              </span>
            )}
            <button
              className={`shrink-0 rounded p-0.5 transition-colors opacity-0 group-hover:opacity-100 ${
                isActive ? 'hover:bg-gray-100 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
              }`}
              onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
              title="이 탭 닫기"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      <div className="flex items-center gap-0.5 px-2 pb-1.5 ml-auto shrink-0 sticky right-0 bg-gray-100">
        <button
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-800 hover:bg-white transition-colors"
          onClick={closeLastTab}
          title="마지막 탭 닫기"
        >
          <X className="w-3 h-3" />
          <span>닫기</span>
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          onClick={closeAllTabs}
          title="모든 탭 닫기"
        >
          <X className="w-3 h-3" />
          <span>전체</span>
        </button>
      </div>
    </div>
  );
}
