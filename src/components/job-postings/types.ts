import type { Rank } from '@/types/models';

export interface RankWithSalary extends Rank {
  base_salary: number;
  currency: string;
  template_id: string;
  has_salary: boolean; // 급여 템플릿에 이 직급의 급여 항목이 실제로 있는지 여부 (없으면 직접 입력 필요)
}

export interface SelectedRankDetail {
  rank_id: string;
  rank_name: string;
  rank_code: string;
  department: string;
  base_salary: number;
  currency: string;
  contract_months: number;
  positions_available: number;
  preferred_nationalities: string[];
}

export interface SalaryComponent {
  id: string;
  name: string;
}

export interface SalaryTemplateItem {
  rank: string;
  rank_grade?: string | null;
  component_id: string;
  amount: number;
  component: SalaryComponent;
}

export interface DuplicateWarning {
  rank_id: string;
  rank_name: string;
  rank_code: string;
  existing_postings: Array<{
    id: string;
    ship_name: string;
    embarkation_date: string;
    days_difference: number;
  }>;
}