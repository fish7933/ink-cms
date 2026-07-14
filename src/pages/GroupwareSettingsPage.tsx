import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/usePermissions';
import OrgChartManagementPage from './OrgChartManagementPage';
import ApprovalLineManagementPage from './ApprovalLineManagementPage';
import DocumentTypesManagementPage from './DocumentTypesManagementPage';
import ShorePositionsPage from './ShorePositionsPage';
import UserGroupManagementPage from './UserGroupManagementPage';
import PermissionsPage from './PermissionsPage';
import MenuConfigurationPage from './MenuConfigurationPage';

// 그룹웨어 성격의 설정 화면(조직도/결재선/문서유형/육상직원직급/사용자그룹/권한/UI구성)을
// 한 페이지에 탭으로 묶은 화면. CrewManagementSettingsPage와 동일한 패턴 — 각 탭은 기존
// 독립 페이지 컴포넌트를 그대로 재사용한다.
export default function GroupwareSettingsPage() {
  const navigate = useNavigate();
  const permissions = usePermissions('groupware_settings');

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4">
      <h1 className="text-lg font-bold text-gray-900 mb-3">그룹웨어 설정</h1>
      <Tabs defaultValue="org-chart">
        <TabsList className="h-9 gap-1 flex-wrap">
          <TabsTrigger value="org-chart" className="text-xs h-8">조직도 관리</TabsTrigger>
          <TabsTrigger value="approval-lines" className="text-xs h-8">결재선 관리</TabsTrigger>
          <TabsTrigger value="document-types" className="text-xs h-8">문서유형/전결규정 관리</TabsTrigger>
          <TabsTrigger value="shore-positions" className="text-xs h-8">직급 관리</TabsTrigger>
          <TabsTrigger value="user-groups" className="text-xs h-8">사용자 그룹 관리</TabsTrigger>
          <TabsTrigger value="permissions" className="text-xs h-8">권한 관리</TabsTrigger>
          <TabsTrigger value="menu-configuration" className="text-xs h-8">UI 구성 관리</TabsTrigger>
        </TabsList>
        <TabsContent value="org-chart" className="mt-3"><OrgChartManagementPage /></TabsContent>
        <TabsContent value="approval-lines" className="mt-3"><ApprovalLineManagementPage /></TabsContent>
        <TabsContent value="document-types" className="mt-3"><DocumentTypesManagementPage /></TabsContent>
        <TabsContent value="shore-positions" className="mt-3"><ShorePositionsPage /></TabsContent>
        <TabsContent value="user-groups" className="mt-3"><UserGroupManagementPage /></TabsContent>
        <TabsContent value="permissions" className="mt-3"><PermissionsPage /></TabsContent>
        <TabsContent value="menu-configuration" className="mt-3"><MenuConfigurationPage /></TabsContent>
      </Tabs>
    </div>
  );
}
