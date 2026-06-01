import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MenuCategory, MenuItem } from '@/types/menu';
import { getIconComponent } from '@/lib/icon-utils';

interface SidebarProps {
  menuStructure: MenuCategory[];
  currentRole: string;
}

export default function Sidebar({ menuStructure, currentRole }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isItemActive = (item: MenuItem) => {
    if (!item.path) return false;
    if (item.query) {
      const path = item.path.split('?')[0];
      return location.pathname === path && location.search.includes(item.query);
    }
    if (location.pathname === item.path) return true;
    // /crew/management → /crew 로 베이스 추출해서 하위 경로 매칭
    const base = item.path.replace('/management', '').replace('/input', '');
    if (base.length > 1 && base !== '/' && location.pathname.startsWith(base + '/')) return true;
    return false;
  };

  const filterItemsByRole = (items: MenuItem[]) => {
    return items.filter(item =>
      item.is_active &&
      (!item.roles || item.roles.length === 0 || item.roles.includes(currentRole))
    );
  };

  // 현재 경로에 해당하는 카테고리 찾기
  const currentCategory =
    // 1차: 정확한 경로 매칭
    menuStructure.find(category =>
      category.items.some(item => isItemActive(item))
    ) ||
    // 2차: 베이스 경로 prefix 매칭 (예: /crew/uuid → /crew 카테고리)
    menuStructure.find(category =>
      category.items.some(item => {
        if (!item.path) return false;
        const base = '/' + item.path.split('/').filter(Boolean)[0];
        return base.length > 1 && location.pathname.startsWith(base);
      })
    );

  if (!currentCategory) {
    return (
      <div className="w-64 bg-white border-r h-full flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 px-3 mb-2">메뉴</h3>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  const visibleItems = filterItemsByRole(currentCategory.items);

  if (visibleItems.length === 0) {
    return (
      <div className="w-64 bg-white border-r h-full flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 px-3 mb-2">{currentCategory.label}</h3>
              <p className="text-xs text-gray-500 px-3">접근 권한이 없습니다</p>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-r h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-1">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 px-3 mb-2">{currentCategory.label}</h3>
          </div>
          {visibleItems
            .sort((a, b) => a.order - b.order)
            .map(item => {
              const ItemIcon = getIconComponent(item.icon);
              const isActive = isItemActive(item);
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={cn(
                    'w-full justify-start h-9 px-3 text-sm',
                    isActive && 'bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium'
                  )}
                  onClick={() => item.path && navigate(item.path)}
                >
                  {ItemIcon && <ItemIcon className="h-4 w-4 mr-2" />}
                  {item.label}
                </Button>
              );
            })}
        </div>
      </ScrollArea>
    </div>
  );
}