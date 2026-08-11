import { useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BankAccountManagementPage from '@/pages/BankAccountManagementPage';
import CardManagementPage from '@/pages/CardManagementPage';
import CashRegisterManagementPage from '@/pages/CashRegisterManagementPage';

const TABS = ['bank', 'card', 'cash'] as const;
type TabKey = typeof TABS[number];

export default function AccountingSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = TABS.includes(tabParam as TabKey) ? (tabParam as TabKey) : 'bank';

  const handleTabChange = (v: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', v);
      return next;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">경리 설정</h1>
          <p className="text-sm text-gray-500">통장, 카드, 현금 시재를 등록하고 관리합니다.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
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
