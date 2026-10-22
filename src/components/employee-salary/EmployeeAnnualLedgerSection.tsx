import { useState, useEffect } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getPayrollEligibleEmployees, getMyPayslips } from '@/services/employee-salary.service';
import EmployeeAnnualPayrollLedger from '@/components/employee-salary/EmployeeAnnualPayrollLedger';
import type { PayrollEmployee, EmployeePayslipWithDetails } from '@/types/employee-salary';

// 관리자가 직원을 골라 그 직원의 연도별 급여 내역(EmployeeAnnualPayrollLedger)을 조회한다 —
// 직원 본인이 보는 "내 급여명세서 > 연도별 급여 내역" 탭과 같은 표를 재사용한다.
export default function EmployeeAnnualLedgerSection() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [payslips, setPayslips] = useState<EmployeePayslipWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [payslipsLoading, setPayslipsLoading] = useState(false);

  useEffect(() => {
    getPayrollEligibleEmployees().then(list => {
      setEmployees(list);
      if (list[0]) setSelectedEmployeeId(list[0].id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) { setPayslips([]); return; }
    setPayslipsLoading(true);
    getMyPayslips(selectedEmployeeId).then(list => {
      setPayslips(list);
      setPayslipsLoading(false);
    });
  }, [selectedEmployeeId]);

  if (loading) {
    return <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">직원</Label>
        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
          <SelectTrigger className="h-9 text-sm w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {employees.length === 0
              ? <SelectItem value="_none" disabled className="text-sm">등록된 직원이 없습니다</SelectItem>
              : employees.map(e => <SelectItem key={e.id} value={e.id} className="text-sm">{e.name}{e.position_name ? ` · ${e.position_name}` : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {payslipsLoading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <EmployeeAnnualPayrollLedger payslips={payslips} emptyMessage="해당 직원의 급여명세서가 없습니다." />
      )}
    </div>
  );
}
