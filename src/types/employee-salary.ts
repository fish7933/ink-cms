export type EmployeeSalaryItemCategory = 'base' | 'allowance' | 'deduction';

export interface EmployeeSalaryItem {
  id: string;
  user_id: string;
  category: EmployeeSalaryItemCategory;
  name: string;
  amount: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeePayrollPeriod {
  id: string;
  year_month: string; // 'YYYY-MM'
  status: 'draft' | 'confirmed';
  confirmed_at: string | null;
  confirmed_by: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeePayrollPeriodSummary extends EmployeePayrollPeriod {
  payslip_count: number;
  total_net_amount: number;
}

export interface EmployeePayslip {
  id: string;
  period_id: string;
  user_id: string;
  base_amount: number;
  total_allowance: number;
  total_deduction: number;
  net_amount: number;
  payment_date: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeePayslipItem {
  id: string;
  payslip_id: string;
  category: EmployeeSalaryItemCategory;
  name: string;
  amount: number;
  display_order: number;
}

export interface EmployeePayslipWithDetails extends EmployeePayslip {
  employee_name: string;
  employee_position_name: string | null;
  items: EmployeePayslipItem[];
}

export interface PayrollEmployee {
  id: string;
  name: string;
  role: string;
  position_id: string | null;
  position_name: string | null;
  hire_date: string | null;
}
