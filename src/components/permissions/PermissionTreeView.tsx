import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { Permission } from '@/types/permissions';
import { MENU_STRUCTURE } from '@/types/permissions';

interface PermissionTreeViewProps {
  permissions: Permission[];
  onPermissionChange: (resource: string, field: keyof Permission, value: boolean) => void;
}

export default function PermissionTreeView({ permissions, onPermissionChange }: PermissionTreeViewProps) {
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(
    new Set(MENU_STRUCTURE.map(m => m.id))
  );

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(menuId)) {
        next.delete(menuId);
      } else {
        next.add(menuId);
      }
      return next;
    });
  };

  const getPermission = (resource: string) => {
    return permissions.find(p => p.resource === resource);
  };

  return (
    <div className="space-y-1">
      {MENU_STRUCTURE.map((menu) => {
        const isExpanded = expandedMenus.has(menu.id);
        
        return (
          <div key={menu.id} className="border rounded-lg overflow-hidden">
            {/* Menu Header */}
            <button
              onClick={() => toggleMenu(menu.id)}
              className="w-full flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
              )}
              <Folder className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <span className="font-semibold text-gray-900">{menu.name}</span>
            </button>

            {/* Pages */}
            {isExpanded && menu.children && (
              <div className="bg-white">
                {/* Header Row */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 bg-gray-50 border-t border-b text-xs font-medium text-gray-600">
                  <div className="pl-8">페이지</div>
                  <div className="w-16 text-center">추가</div>
                  <div className="w-16 text-center">수정</div>
                  <div className="w-16 text-center">삭제</div>
                </div>

                {/* Page Rows */}
                {menu.children.map((page) => {
                  const permission = getPermission(page.resource);
                  
                  return (
                    <div
                      key={page.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 hover:bg-blue-50/50 transition-colors border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-2 pl-8">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{page.name}</span>
                      </div>
                      
                      <div className="w-16 flex items-center justify-center">
                        <Checkbox
                          checked={permission?.can_create ?? false}
                          onCheckedChange={(checked) =>
                            onPermissionChange(page.resource, 'can_create', checked as boolean)
                          }
                        />
                      </div>
                      
                      <div className="w-16 flex items-center justify-center">
                        <Checkbox
                          checked={permission?.can_edit ?? false}
                          onCheckedChange={(checked) =>
                            onPermissionChange(page.resource, 'can_edit', checked as boolean)
                          }
                        />
                      </div>
                      
                      <div className="w-16 flex items-center justify-center">
                        <Checkbox
                          checked={permission?.can_delete ?? false}
                          onCheckedChange={(checked) =>
                            onPermissionChange(page.resource, 'can_delete', checked as boolean)
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}