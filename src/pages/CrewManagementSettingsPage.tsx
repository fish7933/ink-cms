import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/usePermissions';
import NationalityManagementPage from './NationalityManagementPage';
import CertificateTypeManagementPage from './CertificateTypeManagementPage';
import RanksPage from './RanksPage';
import PortManagementPage from './PortManagementPage';
import SignOffReasonsPage from './SignOffReasonsPage';
import CrewRecruitmentHistoryPage from './CrewRecruitmentHistoryPage';
import DeletedCrewListPage from './DeletedCrewListPage';

// 선원 국적/증서 유형/직급/교대지/하선 사유 관리를 한 페이지에 탭으로 묶은 화면.
// 각 탭은 기존 독립 페이지 컴포넌트를 그대로 재사용한다(등록/수정은 여전히 별도 탭에서 열림).
// 권한 체크는 이 컨테이너 레벨에서만 하고, 하위 탭 컴포넌트는 탭 단위로 쪼개지 않는다.
export default function CrewManagementSettingsPage() {
  const navigate = useNavigate();
  const permissions = usePermissions('crew_management_settings');

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우에도 접근 차단 — 로딩 중(loading)에는
  // 아직 기본값이라 판단하지 않고 기다린다(정상 권한 사용자가 잠깐 튕겨나가는 걸 방지).
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4">
      <h1 className="text-lg font-bold text-gray-900 mb-3">선원 관리 설정</h1>
      <Tabs defaultValue="nationalities">
        <TabsList className="h-9 gap-1 flex-wrap">
          <TabsTrigger value="nationalities" className="text-xs h-8">선원 국적 관리</TabsTrigger>
          <TabsTrigger value="certificate-types" className="text-xs h-8">증서 관리</TabsTrigger>
          <TabsTrigger value="ranks" className="text-xs h-8">선원 직급 관리</TabsTrigger>
          <TabsTrigger value="ports" className="text-xs h-8">교대지 관리</TabsTrigger>
          <TabsTrigger value="sign-off-reasons" className="text-xs h-8">하선 사유 관리</TabsTrigger>
          <TabsTrigger value="recruitment-history" className="text-xs h-8">채용 히스토리 관리</TabsTrigger>
          <TabsTrigger value="deleted-crew" className="text-xs h-8">삭제 선원 리스트</TabsTrigger>
        </TabsList>
        <TabsContent value="nationalities" className="mt-3"><NationalityManagementPage /></TabsContent>
        <TabsContent value="certificate-types" className="mt-3"><CertificateTypeManagementPage /></TabsContent>
        <TabsContent value="ranks" className="mt-3"><RanksPage /></TabsContent>
        <TabsContent value="ports" className="mt-3"><PortManagementPage /></TabsContent>
        <TabsContent value="sign-off-reasons" className="mt-3"><SignOffReasonsPage /></TabsContent>
        <TabsContent value="recruitment-history" className="mt-3"><CrewRecruitmentHistoryPage /></TabsContent>
        <TabsContent value="deleted-crew" className="mt-3"><DeletedCrewListPage /></TabsContent>
      </Tabs>
    </div>
  );
}
