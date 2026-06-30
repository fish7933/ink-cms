import { X } from 'lucide-react';
import { useTabContext } from '@/contexts/TabContext';

export default function TabBar() {
  const { tabs, activeTabId, activateTab, closeTab, closeLastTab, closeAllTabs } = useTabContext();

  if (tabs.length === 0) return null;

  return (
    <div className="bg-white border-b flex overflow-x-auto scrollbar-hide shrink-0" style={{ scrollbarWidth: 'none' }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-3 border-r cursor-pointer shrink-0 group transition-colors ${
              isActive
                ? 'bg-blue-50 border-b-2 border-b-blue-600 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={{ width: '160px', height: '36px' }}
            onClick={() => activateTab(tab.id)}
          >
            <span className="flex-1 text-xs truncate select-none">{tab.title}</span>
            <button
              className={`shrink-0 rounded p-0.5 transition-colors opacity-0 group-hover:opacity-100 ${
                isActive ? 'hover:bg-blue-100 text-blue-500' : 'hover:bg-gray-200 text-gray-400'
              }`}
              onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
              title="이 탭 닫기"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* 탭바 끝 닫기 버튼 */}
      <div className="flex items-center gap-0.5 px-2 ml-auto shrink-0 border-l bg-white sticky right-0">
        <button
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
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
