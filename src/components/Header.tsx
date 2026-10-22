import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { getCurrentUser, logout as logoutUser, setUserLanguage } from '@/lib/store';
import type { User } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Ship, LogOut, ChevronDown, User as UserIcon, Languages } from 'lucide-react';
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
import { resolveMenuLabel } from '@/lib/menu-i18n';

interface HeaderProps {
  selectedCategoryId?: string | null;
  onCategorySelect?: (id: string) => void;
  menuStructure?: MenuCategory[];
}

// 우리회사 내부 직원만 쓰는 영역 — Sidebar.tsx와 동일 기준(카테고리 id로 명시 제외).
const KOREAN_ONLY_CATEGORY_IDS = new Set(['groupware', 'accounting']);

export default function Header({ selectedCategoryId, onCategorySelect, menuStructure = defaultMenuStructure }: HeaderProps) {
  const navigate = useNavigate();
  const { openTab } = useTabContext();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');
  const [lang, setLang] = useState(i18n.language);

  useEffect(() => {
    const onLangChange = (l: string) => setLang(l);
    i18n.on('languageChanged', onLangChange);
    return () => i18n.off('languageChanged', onLangChange);
  }, []);

  const toggleLanguage = async () => {
    const next = lang === 'en' ? 'ko' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
    if (currentUser) {
      try { await setUserLanguage(currentUser.id, next); } catch (e) { console.error(e); }
    }
  };

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

  const goHome = () => openTab('/dashboard', t('대시보드'));

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
          <span className="text-lg font-semibold text-gray-900 tracking-tight">{t('선원 관리 시스템')}</span>
        </div>
      </header>
    );
  }

  const initial = currentUser.name?.trim()?.[0] || '?';

  return (
    <header className="bg-white border-b border-gray-200 h-14 flex items-center px-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] shrink-0 gap-2 relative z-20">
      {/* 로고 — 좌측 사이드바 폭(w-56)과 같은 너비로 맞춰서, 대메뉴가 사이드바 뒤에서 시작하도록 함 */}
      <button
        type="button"
        onClick={goHome}
        className="flex items-center gap-2 w-56 shrink-0 hover:opacity-75 transition-opacity"
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-6 w-6 object-contain rounded" />
        ) : (
          <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center">
            <Ship className="h-4 w-4 text-white" />
          </div>
        )}
        <span className="text-[15px] font-semibold text-gray-900 tracking-tight whitespace-nowrap">{t('선원 관리 시스템')}</span>
      </button>

      {/* 카테고리 버튼들 - 클릭 시 좌측 사이드바 즉시 변경 */}
      <nav className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
        {visibleCategories.map(category => {
          const CategoryIcon = getIconComponent(category.icon);
          const isSelected = category.id === selectedCategoryId;
          return (
            <Button
              key={category.id}
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-3 text-[13.5px] shrink-0 gap-1.5 rounded-full transition-colors',
                isSelected
                  ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200 hover:bg-blue-100'
                  : 'text-gray-600 font-normal hover:bg-gray-100 border border-transparent'
              )}
              onClick={() => onCategorySelect?.(category.id)}
            >
              {CategoryIcon && <CategoryIcon className="h-3.5 w-3.5" />}
              {KOREAN_ONLY_CATEGORY_IDS.has(category.id) ? category.label : resolveMenuLabel(category.label, category.label_en, lang, t)}
            </Button>
          );
        })}
      </nav>

      {/* 우측 영역 */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 gap-1.5 rounded-full text-gray-600 hover:bg-gray-100"
          onClick={toggleLanguage}
          title={lang === 'en' ? 'Switch to Korean' : '영문으로 전환'}
        >
          <Languages className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">{lang === 'en' ? 'EN' : 'KO'}</span>
        </Button>
        <NotificationCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 h-8 px-2 rounded-full">
              <div className="h-6 w-6 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                {initial}
              </div>
              <span className="text-sm font-medium">{currentUser.name}</span>
              <span className="text-xs text-gray-400">({t(roleLabels[currentUser.role] ?? currentUser.role)})</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => openTab('/profile', t('내 프로필'))} className="cursor-pointer">
              <UserIcon className="h-4 w-4 mr-2" />
              {t('내 프로필')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
              <LogOut className="h-4 w-4 mr-2" />
              {t('로그아웃')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
