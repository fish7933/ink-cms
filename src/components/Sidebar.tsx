import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

// 우리회사 내부 직원만 쓰는 영역 — 전 세계 사용자를 위한 영문 전환에서 제외하고 한글 그대로
// 유지한다(사용자 명시 요청). 같은 라벨 문자열("설정" 등)이 번역 대상 카테고리에도 있을 수
// 있어, 카테고리 id로 명시적으로 걸러야 한다(라벨 텍스트만으로는 번역 사전에서 구분이 안 됨).
const KOREAN_ONLY_CATEGORY_IDS = new Set(['groupware', 'accounting']);

export default function Sidebar({ menuStructure, currentRole, permissions = [], selectedCategoryId, badgeCounts = {} }: SidebarProps) {
  const { openTab } = useTabContext();
  const location = useLocation();
  const { t } = useTranslation();

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
    const [itemPath, itemQuery] = item.path.split('?');
    // 쿼리로만 구분되는 형제 메뉴(예: /companies?type=owner vs ?type=manning)는 경로가 같으므로
    // 쿼리까지 정확히 비교해야 한다.
    if (itemQuery) {
      return location.pathname === itemPath && location.search.replace(/^\?/, '') === itemQuery;
    }
    if (location.pathname === itemPath) return true;
    // "/crew"가 "/crew-rotation"의 문자열 접두사라는 이유만으로 잘못 매칭되지 않도록 경로 구분자
    // 경계까지 확인 — 첫 세그먼트가 아니라 이 항목의 전체 경로를 기준으로 삼아야
    // "/settings/file-storage"와 "/settings/files"처럼 상위 세그먼트를 공유하는 형제 항목끼리
    // 서로 잘못 활성화되지 않는다.
    return itemPath.length > 1 && location.pathname.startsWith(itemPath + '/');
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
  const isKoreanOnly = !!currentCategory && KOREAN_ONLY_CATEGORY_IDS.has(currentCategory.id);

  return (
    <div className="w-56 bg-white border-r border-gray-200 h-full flex flex-col shrink-0">
      <ScrollArea className="flex-1">
        <div className="p-2.5 space-y-0.5">
          {currentCategory && (
            <div className="px-2.5 pt-2.5 pb-2 mb-1">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {isKoreanOnly ? currentCategory.label : t(currentCategory.label)}
              </h3>
            </div>
          )}
          {visibleItems.length === 0 ? (
            <p className="text-xs text-gray-400 px-2.5 py-2">
              {currentCategory ? t('접근 권한이 없습니다') : t('메뉴를 선택하세요')}
            </p>
          ) : (
            visibleItems
              .sort((a, b) => a.order - b.order)
              .map(item => {
                const ItemIcon = getIconComponent(item.icon);
                const isActive = isItemActive(item);
                const badgeCount = badgeCounts[item.id] || 0;
                const itemLabel = isKoreanOnly ? item.label : t(item.label);
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className={cn(
                      'w-full justify-start h-9 px-2.5 text-[13.5px] font-normal rounded-md transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-semibold border-l-2 border-blue-600 pl-2 hover:bg-blue-100'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                    onClick={() => item.path && openTab(item.path, itemLabel)}
                  >
                    {ItemIcon && <ItemIcon className={cn('h-3.5 w-3.5 mr-2 shrink-0', isActive ? 'text-blue-600' : 'text-gray-400')} />}
                    <span className="truncate flex-1 min-w-0 text-left">{itemLabel}</span>
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
