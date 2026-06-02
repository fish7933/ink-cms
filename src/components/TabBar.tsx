import { X } from 'lucide-react';
import { useTabContext } from '@/contexts/TabContext';

export default function TabBar() {
  const { tabs, activeTabId, activateTab, closeTab } = useTabContext();

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
              className={`shrink-0 rounded p-0.5 transition-colors ${
                isActive ? 'hover:bg-blue-100 text-blue-500' : 'hover:bg-gray-200 text-gray-400'
              }`}
              onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
              title="닫기"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
