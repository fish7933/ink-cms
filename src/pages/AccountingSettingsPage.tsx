import { useState } from 'react';
import { Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BankAccountManagementPage from '@/pages/BankAccountManagementPage';
import CardManagementPage from '@/pages/CardManagementPage';
import CashRegisterManagementPage from '@/pages/CashRegisterManagementPage';

const TABS = ['bank', 'card', 'cash'] as const;
type TabKey = typeof TABS[number];

// 이 페이지는 앱 자체의 워크스페이스 탭 시스템(Layout.tsx의 TabPageRenderer) 안에서
// <Routes location={tab.path}>로 렌더링된다 — tab.path가 탭이 열릴 때의 경로로 고정되기
// 때문에, useSearchParams로 하위 탭 상태를 URL에 반영하면 클릭 즉시 고정된 경로로 되돌아가
// "탭이 안 눌리는" 것처럼 보인다. URL과 무관한 로컬 상태로 관리해야 한다.
export default function AccountingSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('bank');

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">경리 설정</h1>
          <p className="text-sm text-gray-500">통장, 카드, 현금 시재를 등록하고 관리합니다.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="bank">통장관리</TabsTrigger>
          <TabsTrigger value="card">카드관리</TabsTrigger>
          <TabsTrigger value="cash">현금관리</TabsTrigger>
        </TabsList>
        <TabsContent value="bank"><BankAccountManagementPage /></TabsContent>
        <TabsContent value="card"><CardManagementPage /></TabsContent>
        <TabsContent value="cash"><CashRegisterManagementPage /></TabsContent>
      </Tabs>
    </div>
  );
}
