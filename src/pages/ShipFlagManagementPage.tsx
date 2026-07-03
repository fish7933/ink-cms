import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import type { User } from '@/lib/store';
import {
  getShipFlags,
  addShipFlag,
  updateShipFlag,
  deleteShipFlag,
} from '@/services/ship-flag.service';
import type { ShipFlag } from '@/types/ship-flag';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Flag } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import ShipFlagTable from '@/components/ship-flag/ShipFlagTable';
import ShipFlagDialog from '@/components/ship-flag/ShipFlagDialog';

export default function ShipFlagManagementPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [shipFlags, setShipFlags] = useState<ShipFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const permissions = usePermissions('ships');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<ShipFlag | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin', 'system_admin'].includes(user.role)) {
        navigate('/dashboard');
        return;
      }
      setCurrentUser(user);
      loadData();
    };
    
    loadUser();
  }, [navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const flagsData = await getShipFlags();
      setShipFlags(flagsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingFlag(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (flag: ShipFlag) => {
    setEditingFlag(flag);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 선적국을 삭제하시겠습니까?')) return;
    
    try {
      await deleteShipFlag(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting ship flag:', error);
      alert('선적국 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSave = async (data: Omit<ShipFlag, 'id' | 'created_at' | 'updated_at' | 'display_order'>) => {
    try {
      if (editingFlag) {
        await updateShipFlag(editingFlag.id, data);
      } else {
        const nextOrder = shipFlags.length > 0 ? Math.max(...shipFlags.map(f => f.display_order)) + 1 : 1;
        await addShipFlag({ ...data, display_order: nextOrder });
      }
      await loadData();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving ship flag:', error);
      alert('선적국 저장 중 오류가 발생했습니다.');
    }
  };

  if (!currentUser || loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <ProtectedRoute resource="ships">
      <>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Flag className="w-5 h-5" />
                    선적국 관리
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    선박 등록 국가를 관리하세요
                  </CardDescription>
                </div>
                {permissions.canCreate && (
                  <Button 
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={handleAdd}
                  >
                    <Plus className="w-4 h-4" />
                    선적국 추가
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ShipFlagTable
                flags={shipFlags}
                onFlagsChange={setShipFlags}
                onReorderError={loadData}
                onEdit={handleEdit}
                onDelete={handleDelete}
                canEdit={permissions.canEdit}
                canDelete={permissions.canDelete}
              />
            </CardContent>
          </Card>

          <ShipFlagDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            flag={editingFlag}
            onSave={handleSave}
          />
        </div>
      </>
    </ProtectedRoute>
  );
}