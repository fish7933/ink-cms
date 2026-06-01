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
    if (item.query) {
      const path = item.path?.split('?')[0];
      const query = item.query;
      return location.pathname === path && location.search.includes(query);
    }
    if (!item.path) return false;
    if (location.pathname === item.path) return true;
    // 하위 경로도 활성으로 처리 (예: /crew/uuid → /crew/management 활성)
    if (item.path !== '/' && location.pathname.startsWith(item.path.replace('/management', ''))) return true;
    return false;
  };

  const filterItemsByRole = (items: MenuItem[]) => {
    return items.filter(item => 
      item.is_active && 
      (!item.roles || item.roles.length === 0 || item.roles.includes(currentRole))
    );
  };

  // Find the current active category based on current path
  const currentCategory = menuStructure.find(category =>
    category.items.some(item => {
      if (item.path?.includes('?')) {
        const [path, query] = item.path.split('?');
        return location.pathname === path && location.search.includes(query);
      }
      return location.pathname === item.path;
    })
  );

  // If no active category found, still show sidebar structure
  if (!currentCategory) {
    return (
      <div className="w-64 bg-white border-r h-full flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 px-3 mb-2">
                메뉴
              </h3>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  const visibleItems = filterItemsByRole(currentCategory.items);

  // If no visible items, still show the category name
  if (visibleItems.length === 0) {
    return (
      <div className="w-64 bg-white border-r h-full flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 px-3 mb-2">
                {currentCategory.label}
              </h3>
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
            <h3 className="text-sm font-semibold text-gray-900 px-3 mb-2">
              {currentCategory.label}
            </h3>
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
                    "w-full justify-start h-9 px-3 text-sm",
                    isActive && "bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
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