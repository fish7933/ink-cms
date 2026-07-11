import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/usePermissions';
import ShipTypeManagementPage from './ShipTypeManagementPage';
import ShipFlagManagementPage from './ShipFlagManagementPage';
import FleetManagementPage from './FleetManagementPage';

// 선종/분류, 선적국, 플릿 관리를 한 페이지에 탭으로 묶은 화면 (선박 목록은 별도 메뉴로 유지).
// 각 탭은 기존 독립 페이지 컴포넌트를 그대로 재사용한다.
export default function ShipManagementSettingsPage() {
  const navigate = useNavigate();
  const permissions = usePermissions('ship_management_settings');

  // 이 컨테이너 페이지는 기존 role 기반 접근 제어가 없었으므로, canView가 유일한 접근 제어가 된다.
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4">
      <h1 className="text-lg font-bold text-gray-900 mb-3">선박 관리 설정</h1>
      <Tabs defaultValue="ship-types">
        <TabsList className="h-9 gap-1 flex-wrap">
          <TabsTrigger value="ship-types" className="text-xs h-8">선종/분류 관리</TabsTrigger>
          <TabsTrigger value="ship-flags" className="text-xs h-8">선적국 관리</TabsTrigger>
          <TabsTrigger value="fleet-management" className="text-xs h-8">플릿 관리</TabsTrigger>
        </TabsList>
        <TabsContent value="ship-types" className="mt-3"><ShipTypeManagementPage /></TabsContent>
        <TabsContent value="ship-flags" className="mt-3"><ShipFlagManagementPage /></TabsContent>
        <TabsContent value="fleet-management" className="mt-3"><FleetManagementPage /></TabsContent>
      </Tabs>
    </div>
  );
}
