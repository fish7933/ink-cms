import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCurrentUser } from '@/services/auth.service';
import { usePermissions } from '@/hooks/usePermissions';
import { EMPLOYEE_ROLES } from '@/pages/EmployeeCardManagementPage';
import EmployeeSalaryItemsSection from '@/components/employee-salary/EmployeeSalaryItemsSection';
import EmployeePayrollPeriodsSection from '@/components/employee-salary/EmployeePayrollPeriodsSection';

// 육상 직원 급여관리 — 급여 항목(정보관리) + 월별 지급 처리 두 탭으로 구성.
// 선원 급여 템플릿 시스템과는 완전히 별개 도메인이며, 결재 엔진과 연동하지 않는다.
export default function EmployeeSalaryManagementPage() {
  const navigate = useNavigate();
  const permissions = usePermissions('employee_salary');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      const user = await getCurrentUser();
      if (!user || !EMPLOYEE_ROLES.includes(user.role ?? '')) { navigate('/dashboard'); return; }
      setChecking(false);
    };
    check();
  }, [navigate]);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  if (checking || permissions.loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-600" />
            <div>
              <CardTitle className="text-base">직원 급여관리</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">육상 직원의 급여 항목을 관리하고, 매월 급여를 확정해 지급 이력을 남깁니다.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs defaultValue="items">
            <TabsList>
              <TabsTrigger value="items">급여 항목 관리</TabsTrigger>
              <TabsTrigger value="periods">월별 지급 처리</TabsTrigger>
            </TabsList>
            <TabsContent value="items" className="mt-3">
              <EmployeeSalaryItemsSection />
            </TabsContent>
            <TabsContent value="periods" className="mt-3">
              <EmployeePayrollPeriodsSection />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
