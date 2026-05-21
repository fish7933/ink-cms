import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import type { User } from '@/lib/store';
import {
  getShipTypes,
  getSizeClassifications,
  addShipType,
  updateShipType,
  deleteShipType,
  addSizeClassification,
  updateSizeClassification,
  deleteSizeClassification,
} from '@/services/ship-classification.service';
import type { ShipType, ShipSizeClassification } from '@/types/ship-classification';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Ship, Ruler } from 'lucide-react';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import ShipTypeTable from '@/components/ship-classification/ShipTypeTable';
import ShipTypeDialog from '@/components/ship-classification/ShipTypeDialog';
import SizeClassificationTable from '@/components/ship-classification/SizeClassificationTable';
import SizeClassificationDialog from '@/components/ship-classification/SizeClassificationDialog';

export default function ShipTypeManagementPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [shipTypes, setShipTypes] = useState<ShipType[]>([]);
  const [sizeClassifications, setSizeClassifications] = useState<ShipSizeClassification[]>([]);
  const [loading, setLoading] = useState(true);

  const permissions = usePermissions('ships');

  const [isShipTypeDialogOpen, setIsShipTypeDialogOpen] = useState(false);
  const [isSizeDialogOpen, setIsSizeDialogOpen] = useState(false);
  const [editingShipType, setEditingShipType] = useState<ShipType | null>(null);
  const [editingSizeClassification, setEditingSizeClassification] = useState<ShipSizeClassification | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_owner', 'ship_manager'].includes(user.role)) {
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
      const [typesData, classificationsData] = await Promise.all([
        getShipTypes(),
        getSizeClassifications(),
      ]);
      setShipTypes(typesData);
      setSizeClassifications(classificationsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddShipType = () => {
    setEditingShipType(null);
    setIsShipTypeDialogOpen(true);
  };

  const handleEditShipType = (shipType: ShipType) => {
    setEditingShipType(shipType);
    setIsShipTypeDialogOpen(true);
  };

  const handleDeleteShipType = async (id: string) => {
    if (!confirm('이 선종을 삭제하시겠습니까?')) return;
    
    try {
      await deleteShipType(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting ship type:', error);
      alert('선종 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSaveShipType = async (data: Omit<ShipType, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (editingShipType) {
        await updateShipType(editingShipType.id, data);
      } else {
        await addShipType(data);
      }
      await loadData();
      setIsShipTypeDialogOpen(false);
    } catch (error) {
      console.error('Error saving ship type:', error);
      alert('선종 저장 중 오류가 발생했습니다.');
    }
  };

  const handleAddSizeClassification = () => {
    setEditingSizeClassification(null);
    setIsSizeDialogOpen(true);
  };

  const handleEditSizeClassification = (classification: ShipSizeClassification) => {
    setEditingSizeClassification(classification);
    setIsSizeDialogOpen(true);
  };

  const handleDeleteSizeClassification = async (id: string) => {
    if (!confirm('이 분류를 삭제하시겠습니까?')) return;
    
    try {
      await deleteSizeClassification(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting classification:', error);
      alert('분류 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSaveSizeClassification = async (data: Omit<ShipSizeClassification, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (editingSizeClassification) {
        await updateSizeClassification(editingSizeClassification.id, data);
      } else {
        await addSizeClassification(data);
      }
      await loadData();
      setIsSizeDialogOpen(false);
    } catch (error) {
      console.error('Error saving classification:', error);
      alert('분류 저장 중 오류가 발생했습니다.');
    }
  };

  if (!currentUser || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <ProtectedRoute resource="ships">
      <Layout>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
          {/* Ship Types Section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Ship className="w-5 h-5" />
                    선종 관리
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    선박의 종류를 관리하세요
                  </CardDescription>
                </div>
                {permissions.canCreate && (
                  <Button 
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={handleAddShipType}
                  >
                    <Plus className="w-4 h-4" />
                    선종 추가
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ShipTypeTable
                shipTypes={shipTypes}
                onEdit={handleEditShipType}
                onDelete={handleDeleteShipType}
                canEdit={permissions.canEdit}
                canDelete={permissions.canDelete}
              />
            </CardContent>
          </Card>

          {/* Size Classifications Section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Ruler className="w-5 h-5" />
                    선박 크기 분류 관리
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    GT/DWT 기준 선박 크기 분류를 관리하세요
                  </CardDescription>
                </div>
                {permissions.canCreate && (
                  <Button 
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={handleAddSizeClassification}
                  >
                    <Plus className="w-4 h-4" />
                    분류 추가
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <SizeClassificationTable
                classifications={sizeClassifications}
                shipTypes={shipTypes}
                onEdit={handleEditSizeClassification}
                onDelete={handleDeleteSizeClassification}
                canEdit={permissions.canEdit}
                canDelete={permissions.canDelete}
              />
            </CardContent>
          </Card>

          {/* Dialogs */}
          <ShipTypeDialog
            open={isShipTypeDialogOpen}
            onOpenChange={setIsShipTypeDialogOpen}
            shipType={editingShipType}
            onSave={handleSaveShipType}
          />

          <SizeClassificationDialog
            open={isSizeDialogOpen}
            onOpenChange={setIsSizeDialogOpen}
            classification={editingSizeClassification}
            shipTypes={shipTypes}
            onSave={handleSaveSizeClassification}
          />
        </div>
      </Layout>
    </ProtectedRoute>
  );
}