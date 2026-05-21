import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuStructure] = useState<MenuCategory[]>(defaultMenuStructure);

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      setCurrentUser(user);
      setLoading(false);
    };
    loadUser();
  }, []);

  // Show header structure even during loading
  if (loading || !currentUser) {
    return (
      <header className="bg-white border-b h-16 flex items-center px-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Ship className="h-6 w-6 text-blue-600" />
          <span className="text-xl font-bold text-gray-900">선원 관리 시스템</span>
        </div>
      </header>
    );
  }

  const handleLogout = async () => {
    try {
      await logoutUser();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/login';
    }
  };

  const roleLabels = {
    ship_owner: '선주',
    ship_manager: '선박관리사',
    manning_agency: '선원 매닝사',
    crew: '선원',
  };

  const isCurrentCategory = (category: MenuCategory) => {
    return category.items.some(item => {
      if (item.path?.includes('?')) {
        const [path, query] = item.path.split('?');
        return location.pathname === path && location.search.includes(query);
      }
      return location.pathname === item.path;
    });
  };

  const filterCategoriesByRole = (categories: MenuCategory[]) => {
    return categories
      .filter(category => category.is_active)
      .map(category => ({
        ...category,
        items: category.items.filter(item =>
          item.is_active &&
          (!item.roles || item.roles.length === 0 || item.roles.includes(currentUser.role))
        ),
      }))
      .filter(category => category.items.length > 0)
      .sort((a, b) => a.order - b.order);
  };

  const visibleCategories = filterCategoriesByRole(menuStructure);

  return (
    <header className="bg-white border-b h-16 flex items-center px-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Ship className="h-6 w-6 text-blue-600" />
        <span className="text-xl font-bold text-gray-900">선원 관리 시스템</span>
      </div>

      <nav className="flex-1 flex items-center justify-center gap-1">
        {visibleCategories.map((category) => {
          const CategoryIcon = getIconComponent(category.icon);
          const isCurrent = isCurrentCategory(category);

          return (
            <DropdownMenu key={category.id}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "gap-1 h-9",
                    isCurrent && "bg-blue-50 text-blue-600 hover:bg-blue-100"
                  )}
                >
                  {CategoryIcon && <CategoryIcon className="h-4 w-4" />}
                  {category.label}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {category.items
                  .sort((a, b) => a.order - b.order)
                  .map((item) => {
                    const ItemIcon = getIconComponent(item.icon);
                    return (
                      <DropdownMenuItem
                        key={item.id}
                        onClick={() => item.path && navigate(item.path)}
                        className="cursor-pointer"
                      >
                        {ItemIcon && <ItemIcon className="h-4 w-4 mr-2" />}
                        {item.label}
                      </DropdownMenuItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <NotificationCenter />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 h-9">
              <UserIcon className="h-4 w-4" />
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">{currentUser.name}</span>
                <span className="text-xs text-gray-500">{roleLabels[currentUser.role]}</span>
              </div>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
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