import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser } from '@/lib/store';
import { defaultMenuStructure } from '@/lib/default-menu';
import type { MenuCategory, MenuItem } from '@/types/menu';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronDown, ChevronRight, Edit2, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SortableItemProps {
  id: string;
  item: MenuItem;
  onEdit: (item: MenuItem) => void;
  onToggle: (id: string, isActive: boolean) => void;
}

function SortableItem({ id, item, onEdit, onToggle }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 bg-white border rounded-lg hover:border-blue-300"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{item.label}</span>
          {item.path && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {item.path}
            </span>
          )}
        </div>
        {item.roles && item.roles.length > 0 && (
          <div className="flex gap-1 mt-1">
            {item.roles.map(role => (
              <span key={role} className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {role}
              </span>
            ))}
          </div>
        )}
      </div>
      <Switch
        checked={item.is_active}
        onCheckedChange={(checked) => onToggle(id, checked)}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onEdit(item)}
      >
        <Edit2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function MenuConfigurationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [menuStructure, setMenuStructure] = useState<MenuCategory[]>(defaultMenuStructure);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const checkAccess = async () => {
      const user = await getCurrentUser();
      if (!user || user.role !== 'ship_manager') {
        toast({
          title: '접근 권한 없음',
          description: '슈퍼 관리자만 접근할 수 있습니다.',
          variant: 'destructive',
        });
        navigate('/dashboard');
        return;
      }
      setLoading(false);
    };
    checkAccess();
  }, [navigate, toast]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const handleDragEnd = (event: DragEndEvent, categoryId: string) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setMenuStructure(prev => {
        return prev.map(category => {
          if (category.id === categoryId) {
            const oldIndex = category.items.findIndex(item => item.id === active.id);
            const newIndex = category.items.findIndex(item => item.id === over.id);
            const newItems = arrayMove(category.items, oldIndex, newIndex);
            
            // Update order based on new position
            return {
              ...category,
              items: newItems.map((item, index) => ({
                ...item,
                order: index + 1,
              })),
            };
          }
          return category;
        });
      });
    }
  };

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setMenuStructure(prev => {
        const oldIndex = prev.findIndex(cat => cat.id === active.id);
        const newIndex = prev.findIndex(cat => cat.id === over.id);
        const newCategories = arrayMove(prev, oldIndex, newIndex);
        
        return newCategories.map((cat, index) => ({
          ...cat,
          order: index + 1,
        }));
      });
    }
  };

  const handleToggleItem = (categoryId: string, itemId: string, isActive: boolean) => {
    setMenuStructure(prev =>
      prev.map(category => {
        if (category.id === categoryId) {
          return {
            ...category,
            items: category.items.map(item =>
              item.id === itemId ? { ...item, is_active: isActive } : item
            ),
          };
        }
        return category;
      })
    );
  };

  const handleToggleCategory = (categoryId: string, isActive: boolean) => {
    setMenuStructure(prev =>
      prev.map(category =>
        category.id === categoryId ? { ...category, is_active: isActive } : category
      )
    );
  };

  const handleEditItem = (categoryId: string, item: MenuItem) => {
    setEditingItem({ ...item, parent_id: categoryId });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;

    setMenuStructure(prev =>
      prev.map(category => {
        if (category.id === editingItem.parent_id) {
          return {
            ...category,
            items: category.items.map(item =>
              item.id === editingItem.id ? editingItem : item
            ),
          };
        }
        return category;
      })
    );

    setEditDialogOpen(false);
    setEditingItem(null);

    toast({
      title: '저장 완료',
      description: '메뉴 항목이 수정되었습니다.',
    });
  };

  const handleSaveAll = () => {
    // In a real application, save to backend/database
    localStorage.setItem('menuStructure', JSON.stringify(menuStructure));
    
    toast({
      title: '저장 완료',
      description: 'UI 구성이 저장되었습니다.',
    });
  };

  const handleReset = () => {
    setMenuStructure(defaultMenuStructure);
    localStorage.removeItem('menuStructure');
    
    toast({
      title: '초기화 완료',
      description: 'UI 구성이 기본값으로 초기화되었습니다.',
    });
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">로딩중...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">UI 구성 관리</h1>
            <p className="text-gray-600 mt-2">메뉴 구조를 드래그하여 순서를 변경하고, 항목을 활성화/비활성화할 수 있습니다.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              초기화
            </Button>
            <Button onClick={handleSaveAll}>
              <Save className="w-4 h-4 mr-2" />
              저장
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>메뉴 구조</CardTitle>
            <CardDescription>
              대메뉴(카테고리)와 소메뉴(항목)를 관리합니다. 드래그하여 순서를 변경하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleCategoryDragEnd}
            >
              <SortableContext
                items={menuStructure.map(cat => cat.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {menuStructure.map(category => {
                    const isExpanded = expandedCategories.has(category.id);

                    return (
                      <div key={category.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center gap-2 mb-3">
                          <GripVertical className="w-5 h-5 text-gray-400 cursor-grab" />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleCategory(category.id)}
                            className="flex-1 justify-start"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 mr-2" />
                            ) : (
                              <ChevronRight className="w-4 h-4 mr-2" />
                            )}
                            <span className="font-semibold text-base">{category.label}</span>
                            <span className="ml-2 text-xs text-gray-500">
                              ({category.items.length}개 항목)
                            </span>
                          </Button>
                          <Switch
                            checked={category.is_active}
                            onCheckedChange={(checked) => handleToggleCategory(category.id, checked)}
                          />
                        </div>

                        {isExpanded && (
                          <div className="ml-8 space-y-2">
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(event) => handleDragEnd(event, category.id)}
                            >
                              <SortableContext
                                items={category.items.map(item => item.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {category.items.map(item => (
                                  <SortableItem
                                    key={item.id}
                                    id={item.id}
                                    item={item}
                                    onEdit={(item) => handleEditItem(category.id, item)}
                                    onToggle={(id, isActive) => handleToggleItem(category.id, id, isActive)}
                                  />
                                ))}
                              </SortableContext>
                            </DndContext>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>메뉴 항목 수정</DialogTitle>
              <DialogDescription>
                메뉴 항목의 정보를 수정합니다.
              </DialogDescription>
            </DialogHeader>
            {editingItem && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="label">메뉴명</Label>
                  <Input
                    id="label"
                    value={editingItem.label}
                    onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="path">경로</Label>
                  <Input
                    id="path"
                    value={editingItem.path || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, path: e.target.value })}
                    placeholder="/example-path"
                  />
                </div>
                <div>
                  <Label htmlFor="icon">아이콘</Label>
                  <Input
                    id="icon"
                    value={editingItem.icon || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, icon: e.target.value })}
                    placeholder="Users"
                  />
                </div>
                <div>
                  <Label>접근 권한</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['ship_owner', 'ship_manager', 'manning_agency', 'crew'].map(role => (
                      <label key={role} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editingItem.roles?.includes(role) || false}
                          onChange={(e) => {
                            const roles = editingItem.roles || [];
                            if (e.target.checked) {
                              setEditingItem({ ...editingItem, roles: [...roles, role] });
                            } else {
                              setEditingItem({ ...editingItem, roles: roles.filter(r => r !== role) });
                            }
                          }}
                        />
                        <span className="text-sm">{role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                <X className="w-4 h-4 mr-2" />
                취소
              </Button>
              <Button onClick={handleSaveEdit}>
                <Save className="w-4 h-4 mr-2" />
                저장
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}