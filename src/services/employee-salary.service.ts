import { supabase } from '@/lib/supabase';
import { getShorePositions } from '@/services/shore-position.service';
import { EMPLOYEE_ROLES } from '@/pages/EmployeeCardManagementPage';
import type {
  EmployeeSalaryItem,
  EmployeeSalaryItemCategory,
  EmployeePayrollPeriod,
  EmployeePayrollPeriodSummary,
  EmployeePayslip,
  EmployeePayslipItem,
  EmployeePayslipWithDetails,
  PayrollEmployee,
} from '@/types/employee-salary';

const sumByCategory = (items: { category: EmployeeSalaryItemCategory; amount: number }[], category: EmployeeSalaryItemCategory) =>
  items.filter(i => i.category === category).reduce((sum, i) => sum + Number(i.amount), 0);

// --- 급여 대상 직원 ---

// 육상 직원(EMPLOYEE_ROLES) 전원을 직급 선임순 → 입사일순으로 정렬해 반환 —
// EmployeeCardManagementPage.tsx의 직원 목록 정렬과 동일한 기준.
export async function getPayrollEligibleEmployees(): Promise<PayrollEmployee[]> {
  const [{ data: users, error }, positions] = await Promise.all([
    supabase.from('users').select('id, name, role, position_id, hire_date').in('role', EMPLOYEE_ROLES),
    getShorePositions(),
  ]);
  if (error) { console.error(error); return []; }
  const positionById = new Map(positions.map(p => [p.id, p]));
  return (users || [])
    .map(u => ({ ...u, position_name: u.position_id ? positionById.get(u.position_id)?.name || null : null }))
    .sort((a, b) => {
      const posA = a.position_id ? positionById.get(a.position_id)?.display_order ?? Infinity : Infinity;
      const posB = b.position_id ? positionById.get(b.position_id)?.display_order ?? Infinity : Infinity;
      if (posA !== posB) return posA - posB;
      const hireA = a.hire_date ?? '9999-99-99';
      const hireB = b.hire_date ?? '9999-99-99';
      return hireA.localeCompare(hireB);
    });
}

// --- 급여 항목 (정보관리) ---

export async function getEmployeeSalaryItems(userId: string): Promise<EmployeeSalaryItem[]> {
  const { data, error } = await supabase
    .from('employee_salary_items')
    .select('*')
    .eq('user_id', userId)
    .order('category')
    .order('display_order');
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function addEmployeeSalaryItem(data: Omit<EmployeeSalaryItem, 'id' | 'created_at' | 'updated_at'>): Promise<EmployeeSalaryItem> {
  const now = new Date().toISOString();
  const { data: result, error } = await supabase.from('employee_salary_items').insert({ ...data, created_at: now, updated_at: now }).select().single();
  if (error) throw error;
  return result;
}

export async function updateEmployeeSalaryItem(id: string, data: Partial<Omit<EmployeeSalaryItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const { error } = await supabase.from('employee_salary_items').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteEmployeeSalaryItem(id: string): Promise<void> {
  const { error } = await supabase.from('employee_salary_items').delete().eq('id', id);
  if (error) throw error;
}

// --- 월별 지급 회차 ---

export async function getPayrollPeriods(): Promise<EmployeePayrollPeriodSummary[]> {
  const { data: periods, error } = await supabase.from('employee_payroll_periods').select('*').order('year_month', { ascending: false });
  if (error) { console.error(error); return []; }
  if (!periods || periods.length === 0) return [];

  const { data: payslips } = await supabase.from('employee_payslips').select('period_id, net_amount').in('period_id', periods.map(p => p.id));
  const summaryByPeriod = new Map<string, { count: number; total: number }>();
  for (const p of payslips || []) {
    const cur = summaryByPeriod.get(p.period_id) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(p.net_amount) || 0;
    summaryByPeriod.set(p.period_id, cur);
  }
  return periods.map(p => ({ ...p, payslip_count: summaryByPeriod.get(p.id)?.count || 0, total_net_amount: summaryByPeriod.get(p.id)?.total || 0 }));
}

export async function getPayrollPeriodByYearMonth(yearMonth: string): Promise<EmployeePayrollPeriod | null> {
  const { data, error } = await supabase.from('employee_payroll_periods').select('*').eq('year_month', yearMonth).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

export async function getOrCreatePayrollPeriod(yearMonth: string): Promise<EmployeePayrollPeriod> {
  const existing = await getPayrollPeriodByYearMonth(yearMonth);
  if (existing) return existing;
  const { data, error } = await supabase.from('employee_payroll_periods').insert({ year_month: yearMonth }).select().single();
  if (error) throw error;
  return data;
}

export async function confirmPayrollPeriod(periodId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('employee_payroll_periods')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: userId, updated_at: new Date().toISOString() })
    .eq('id', periodId);
  if (error) throw error;
}

export async function reopenPayrollPeriod(periodId: string): Promise<void> {
  const { error } = await supabase
    .from('employee_payroll_periods')
    .update({ status: 'draft', confirmed_at: null, confirmed_by: null, updated_at: new Date().toISOString() })
    .eq('id', periodId);
  if (error) throw error;
}

// --- 급여명세서 ---

// 이 기간에 아직 명세서가 없는 대상 직원마다, 현재 급여 항목(employee_salary_items)을
// 스냅샷으로 복사해 명세서를 생성한다. 이미 명세서가 있는 직원은 건너뛴다(중복 생성 방지).
export async function generatePayslipsForPeriod(periodId: string): Promise<{ created: number; skipped: number }> {
  const [{ data: existing, error: existingError }, employees] = await Promise.all([
    supabase.from('employee_payslips').select('user_id').eq('period_id', periodId),
    getPayrollEligibleEmployees(),
  ]);
  if (existingError) throw existingError;
  const existingUserIds = new Set((existing || []).map(p => p.user_id));
  const targets = employees.filter(e => !existingUserIds.has(e.id));
  if (targets.length === 0) return { created: 0, skipped: employees.length };

  const { data: allItems, error: itemsError } = await supabase
    .from('employee_salary_items')
    .select('*')
    .in('user_id', targets.map(e => e.id))
    .eq('is_active', true)
    .order('display_order');
  if (itemsError) throw itemsError;
  const itemsByUser = new Map<string, EmployeeSalaryItem[]>();
  for (const item of allItems || []) {
    if (!itemsByUser.has(item.user_id)) itemsByUser.set(item.user_id, []);
    itemsByUser.get(item.user_id)!.push(item);
  }

  const now = new Date().toISOString();
  await Promise.all(targets.map(async emp => {
    const items = itemsByUser.get(emp.id) || [];
    const base = sumByCategory(items, 'base');
    const allowance = sumByCategory(items, 'allowance');
    const deduction = sumByCategory(items, 'deduction');
    const { data: payslip, error: payslipError } = await supabase
      .from('employee_payslips')
      .insert({
        period_id: periodId,
        user_id: emp.id,
        base_amount: base,
        total_allowance: allowance,
        total_deduction: deduction,
        net_amount: base + allowance - deduction,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (payslipError) throw payslipError;
    if (items.length > 0) {
      const { error: insertItemsError } = await supabase.from('employee_payslip_items').insert(
        items.map(i => ({ payslip_id: payslip.id, category: i.category, name: i.name, amount: i.amount, display_order: i.display_order }))
      );
      if (insertItemsError) throw insertItemsError;
    }
  }));

  return { created: targets.length, skipped: employees.length - targets.length };
}

async function attachEmployeeDetails(payslips: EmployeePayslip[], items: EmployeePayslipItem[]): Promise<EmployeePayslipWithDetails[]> {
  if (payslips.length === 0) return [];
  const userIds = [...new Set(payslips.map(p => p.user_id))];
  const [{ data: users }, positions] = await Promise.all([
    supabase.from('users').select('id, name, position_id').in('id', userIds),
    getShorePositions(),
  ]);
  const positionNameById = new Map(positions.map(p => [p.id, p.name]));
  const userById = new Map((users || []).map(u => [u.id, u]));
  const itemsByPayslip = new Map<string, EmployeePayslipItem[]>();
  for (const item of items) {
    if (!itemsByPayslip.has(item.payslip_id)) itemsByPayslip.set(item.payslip_id, []);
    itemsByPayslip.get(item.payslip_id)!.push(item);
  }
  return payslips.map(p => {
    const u = userById.get(p.user_id);
    return {
      ...p,
      employee_name: u?.name || '알 수 없음',
      employee_position_name: u?.position_id ? positionNameById.get(u.position_id) || null : null,
      items: itemsByPayslip.get(p.id) || [],
    };
  });
}

export async function getPayslipsForPeriod(periodId: string): Promise<EmployeePayslipWithDetails[]> {
  const { data: payslips, error } = await supabase.from('employee_payslips').select('*').eq('period_id', periodId).order('created_at');
  if (error) { console.error(error); return []; }
  if (!payslips || payslips.length === 0) return [];
  const { data: items, error: itemsError } = await supabase
    .from('employee_payslip_items')
    .select('*')
    .in('payslip_id', payslips.map(p => p.id))
    .order('display_order');
  if (itemsError) { console.error(itemsError); return attachEmployeeDetails(payslips, []); }
  return attachEmployeeDetails(payslips, items || []);
}

export async function getPayslipDetail(payslipId: string): Promise<EmployeePayslipWithDetails | null> {
  const { data: payslip, error } = await supabase.from('employee_payslips').select('*').eq('id', payslipId).maybeSingle();
  if (error) { console.error(error); return null; }
  if (!payslip) return null;
  const { data: items, error: itemsError } = await supabase.from('employee_payslip_items').select('*').eq('payslip_id', payslipId).order('display_order');
  if (itemsError) { console.error(itemsError); return null; }
  const [detail] = await attachEmployeeDetails([payslip], items || []);
  return detail || null;
}

// draft 상태인 기간에서만 화면에서 호출되어야 한다 — 전량 delete-then-insert 후 합계를 다시 계산한다.
export async function updatePayslipItems(
  payslipId: string,
  items: { category: EmployeeSalaryItemCategory; name: string; amount: number; display_order: number }[]
): Promise<void> {
  const { error: deleteError } = await supabase.from('employee_payslip_items').delete().eq('payslip_id', payslipId);
  if (deleteError) throw deleteError;
  if (items.length > 0) {
    const { error: insertError } = await supabase.from('employee_payslip_items').insert(items.map(i => ({ ...i, payslip_id: payslipId })));
    if (insertError) throw insertError;
  }
  const base = sumByCategory(items, 'base');
  const allowance = sumByCategory(items, 'allowance');
  const deduction = sumByCategory(items, 'deduction');
  const { error: updateError } = await supabase
    .from('employee_payslips')
    .update({ base_amount: base, total_allowance: allowance, total_deduction: deduction, net_amount: base + allowance - deduction, updated_at: new Date().toISOString() })
    .eq('id', payslipId);
  if (updateError) throw updateError;
}

// draft 기간에서 특정 직원의 명세서를 제외 — 이후 "명세서 생성"을 다시 누르면 그 직원만 재생성된다.
export async function deletePayslip(payslipId: string): Promise<void> {
  const { error } = await supabase.from('employee_payslips').delete().eq('id', payslipId);
  if (error) throw error;
}
