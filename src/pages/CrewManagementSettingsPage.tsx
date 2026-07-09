import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NationalityManagementPage from './NationalityManagementPage';
import CertificateTypeManagementPage from './CertificateTypeManagementPage';
import RanksPage from './RanksPage';
import PortManagementPage from './PortManagementPage';
import SignOffReasonsPage from './SignOffReasonsPage';

// 선원 국적/증서 유형/직급/교대지/하선 사유 관리를 한 페이지에 탭으로 묶은 화면.
// 각 탭은 기존 독립 페이지 컴포넌트를 그대로 재사용한다(등록/수정은 여전히 별도 탭에서 열림).
export default function CrewManagementSettingsPage() {
  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4">
      <h1 className="text-lg font-bold text-gray-900 mb-3">선원 관리 설정</h1>
      <Tabs defaultValue="nationalities">
        <TabsList className="h-9 gap-1 flex-wrap">
          <TabsTrigger value="nationalities" className="text-xs h-8">선원 국적 관리</TabsTrigger>
          <TabsTrigger value="certificate-types" className="text-xs h-8">증서 유형 관리</TabsTrigger>
          <TabsTrigger value="ranks" className="text-xs h-8">직급 관리</TabsTrigger>
          <TabsTrigger value="ports" className="text-xs h-8">교대지 관리</TabsTrigger>
          <TabsTrigger value="sign-off-reasons" className="text-xs h-8">하선 사유 관리</TabsTrigger>
        </TabsList>
        <TabsContent value="nationalities" className="mt-3"><NationalityManagementPage /></TabsContent>
        <TabsContent value="certificate-types" className="mt-3"><CertificateTypeManagementPage /></TabsContent>
        <TabsContent value="ranks" className="mt-3"><RanksPage /></TabsContent>
        <TabsContent value="ports" className="mt-3"><PortManagementPage /></TabsContent>
        <TabsContent value="sign-off-reasons" className="mt-3"><SignOffReasonsPage /></TabsContent>
      </Tabs>
    </div>
  );
}
