import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MenuCategory, MenuItem } from '@/types/menu';
import type { Permission } from '@/types/permissions';
import { getIconComponent } from '@/lib/icon-utils';
import { useTabContext } from '@/contexts/TabContext';
import { resourceForMenuItemId } from '@/lib/menu-permission-map';

interface SidebarProps {
  menuStructure: MenuCategory[];
  currentRole: string;
  permissions?: Permission[];
  selectedCategoryId?: string | null;
}

export default function Sidebar({ menuStructure, currentRole, permissions = [], selectedCategoryId }: SidebarProps) {
  const { openTab } = useTabContext();
  const location = useLocation();

  // 접속(canView) 권한이 명시적으로 꺼진 메뉴만 숨긴다. 권한 관리 화면과 매핑되지 않은 메뉴이거나,
  // 아직 아무도 손대지 않아 레코드가 없는 리소스는 항상 노출(기본 허용)한다 — usePermissions와 동일한 기본값.
  const isFullAccessRole = ['admin', 'system_admin'].includes(currentRole);
  const canViewItem = (item: MenuItem) => {
    if (isFullAccessRole) return true;
    const resource = resourceForMenuItemId(item.id);
    if (!resource) return true;
    const perm = permissions.find(p => p.resource === resource);
    return perm?.can_view ?? true;
  };

  const isItemActive = (item: MenuItem) => {
    if (!item.path) return false;
    const itemPath = item.path.split('?')[0];
    if (item.query) {
      return location.pathname === itemPath && location.search.includes(item.query);
    }
    if (location.pathname === itemPath) return true;
    const base = '/' + itemPath.split('/').filter(Boolean)[0];
    return base.length > 1 && location.pathname.startsWith(base);
  };

  const filterItemsByRole = (items: MenuItem[]) =>
    items.filter(item =>
      item.is_active &&
      (isFullAccessRole || !item.roles || item.roles.length === 0 || item.roles.includes(currentRole)) &&
      canViewItem(item)
    );

  // selectedCategoryId로 카테고리 찾기, 없으면 URL 기반으로 fallback
  const currentCategory =
    menuStructure.find(c => c.id === selectedCategoryId) ||
    menuStructure.find(c => c.items.some(item => isItemActive(item))) ||
    menuStructure.find(c =>
      c.items.some(item => {
        if (!item.path) return false;
        const base = '/' + item.path.split('/').filter(Boolean)[0];
        return base.length > 1 && location.pathname.startsWith(base);
      })
    );

  const visibleItems = currentCategory ? filterItemsByRole(currentCategory.items) : [];

  return (
    <div className="w-52 bg-white border-r h-full flex flex-col shrink-0">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-0.5">
          {currentCategory && (
            <div className="px-2 py-2 mb-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {currentCategory.label}
              </h3>
            </div>
          )}
          {visibleItems.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-2">
              {currentCategory ? '접근 권한이 없습니다' : '메뉴를 선택하세요'}
            </p>
          ) : (
            visibleItems
              .sort((a, b) => a.order - b.order)
              .map(item => {
                const ItemIcon = getIconComponent(item.icon);
                const isActive = isItemActive(item);
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className={cn(
                      'w-full justify-start h-8 px-2 text-sm',
                      isActive
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    )}
                    onClick={() => item.path && openTab(item.path, item.label)}
                  >
                    {ItemIcon && <ItemIcon className="h-3.5 w-3.5 mr-2 shrink-0" />}
                    <span className="truncate">{item.label}</span>
                  </Button>
                );
              })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
