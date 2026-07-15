import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, logout as logoutUser } from '@/lib/store';
import type { User } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Ship, LogOut, ChevronDown, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import NotificationCenter from '@/components/NotificationCenter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { defaultMenuStructure } from '@/lib/default-menu';
import { getIconComponent } from '@/lib/icon-utils';
import type { MenuCategory } from '@/types/menu';
import { useTabContext } from '@/contexts/TabContext';
import { getCompanyInfo } from '@/services/company-info.service';

interface HeaderProps {
  selectedCategoryId?: string | null;
  onCategorySelect?: (id: string) => void;
  menuStructure?: MenuCategory[];
}

export default function Header({ selectedCategoryId, onCategorySelect, menuStructure = defaultMenuStructure }: HeaderProps) {
  const navigate = useNavigate();
  const { openTab } = useTabContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      setCurrentUser(user);
      setLoading(false);
    };
    loadUser();

    const loadLogo = async () => {
      try {
        const info = await getCompanyInfo();
        setLogoUrl(info?.logo_url || '');
      } catch (e) {
        console.error(e);
      }
    };
    loadLogo();
    window.addEventListener('company-info-changed', loadLogo);
    return () => window.removeEventListener('company-info-changed', loadLogo);
  }, []);

  const goHome = () => openTab('/dashboard', '대시보드');

  const handleLogout = async () => {
    try {
      await logoutUser();
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  const filterCategoriesByRole = (categories: MenuCategory[]) => {
    if (!currentUser) return [];
    const isAdmin = ['admin', 'system_admin'].includes(currentUser.role ?? '');
    return categories
      .filter(c => c.is_active)
      .map(c => ({
        ...c,
        items: c.items.filter(item =>
          item.is_active &&
          ((isAdmin && !item.strictRoles) || !item.roles || item.roles.length === 0 || item.roles.includes(currentUser.role))
        ),
      }))
      .filter(c => c.items.length > 0)
      .sort((a, b) => a.order - b.order);
  };

  const roleLabels: Record<string, string> = {
    admin: '슈퍼관리자',
    system_admin: '시스템 관리자',
    ship_owner: '선주',
    ship_manager: '선박관리사',
    manning_agency: '선원 매닝사',
    crew: '선원',
  };

  const visibleCategories = filterCategoriesByRole(menuStructure);

  if (loading || !currentUser) {
    return (
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] shrink-0">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-6 w-6 object-contain rounded" />
          ) : (
            <Ship className="h-5 w-5 text-blue-600" />
          )}
          <span className="text-lg font-semibold text-gray-900 tracking-tight">선원 관리 시스템</span>
        </div>
      </header>
    );
  }

  const initial = currentUser.name?.trim()?.[0] || '?';

  return (
    <header className="bg-white border-b border-gray-200 h-14 flex items-center px-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] shrink-0 gap-2 relative z-20">
      {/* 로고 */}
      <button
        type="button"
        onClick={goHome}
        className="flex items-center gap-2 mr-5 shrink-0 hover:opacity-75 transition-opacity"
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-6 w-6 object-contain rounded" />
        ) : (
          <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center">
            <Ship className="h-4 w-4 text-white" />
          </div>
        )}
        <span className="text-[15px] font-semibold text-gray-900 tracking-tight whitespace-nowrap">선원 관리 시스템</span>
      </button>

      {/* 카테고리 버튼들 - 클릭 시 좌측 사이드바 즉시 변경 */}
      <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
        {visibleCategories.map(category => {
          const CategoryIcon = getIconComponent(category.icon);
          const isSelected = category.id === selectedCategoryId;
          return (
            <Button
              key={category.id}
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-3 text-sm shrink-0 gap-1.5 rounded-full transition-colors',
                isSelected
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                  : 'text-gray-600 hover:bg-gray-100 border border-transparent'
              )}
              onClick={() => onCategorySelect?.(category.id)}
            >
              {CategoryIcon && <CategoryIcon className="h-3.5 w-3.5" />}
              {category.label}
            </Button>
          );
        })}
      </nav>

      {/* 우측 영역 */}
      <div className="flex items-center gap-2 shrink-0">
        <NotificationCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 h-8 px-2 rounded-full">
              <div className="h-6 w-6 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                {initial}
              </div>
              <span className="text-sm font-medium">{currentUser.name}</span>
              <span className="text-xs text-gray-400">({roleLabels[currentUser.role] ?? currentUser.role})</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => openTab('/profile', '내 프로필')} className="cursor-pointer">
              <UserIcon className="h-4 w-4 mr-2" />
              내 프로필
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
              <LogOut className="h-4 w-4 mr-2" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
