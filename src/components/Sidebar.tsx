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
  badgeCounts?: Record<string, number>;
}

export default function Sidebar({ menuStructure, currentRole, permissions = [], selectedCategoryId, badgeCounts = {} }: SidebarProps) {
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
    // "/crew"가 "/crew-rotation"의 문자열 접두사라는 이유만으로 잘못 매칭되지 않도록 경로 구분자 경계까지 확인
    return base.length > 1 && (location.pathname === base || location.pathname.startsWith(base + '/'));
  };

  const filterItemsByRole = (items: MenuItem[]) =>
    items.filter(item =>
      item.is_active &&
      ((isFullAccessRole && !item.strictRoles) || !item.roles || item.roles.length === 0 || item.roles.includes(currentRole)) &&
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
        return base.length > 1 && (location.pathname === base || location.pathname.startsWith(base + '/'));
      })
    );

  const visibleItems = currentCategory ? filterItemsByRole(currentCategory.items) : [];

  return (
    <div className="w-56 bg-slate-900 h-full flex flex-col shrink-0 shadow-[2px_0_10px_-4px_rgba(0,0,0,0.25)] z-10">
      <ScrollArea className="flex-1">
        <div className="p-2.5 space-y-0.5">
          {currentCategory && (
            <div className="px-2.5 pt-2 pb-2.5 mb-0.5">
              <h3 className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-widest">
                {currentCategory.label}
              </h3>
            </div>
          )}
          {visibleItems.length === 0 ? (
            <p className="text-xs text-slate-500 px-2.5 py-2">
              {currentCategory ? '접근 권한이 없습니다' : '메뉴를 선택하세요'}
            </p>
          ) : (
            visibleItems
              .sort((a, b) => a.order - b.order)
              .map(item => {
                const ItemIcon = getIconComponent(item.icon);
                const isActive = isItemActive(item);
                const badgeCount = badgeCounts[item.id] || 0;
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className={cn(
                      'w-full justify-start h-8 px-2.5 text-sm rounded-md transition-colors',
                      isActive
                        ? 'bg-blue-500/15 text-white font-medium border-l-2 border-blue-400 pl-2 hover:bg-blue-500/20 hover:text-white'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    )}
                    onClick={() => item.path && openTab(item.path, item.label)}
                  >
                    {ItemIcon && <ItemIcon className={cn('h-3.5 w-3.5 mr-2 shrink-0', isActive ? 'text-blue-400' : 'text-slate-400')} />}
                    <span className="truncate flex-1 min-w-0 text-left">{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="ml-1.5 shrink-0 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[1.1rem] text-center font-semibold">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </Button>
                );
              })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
