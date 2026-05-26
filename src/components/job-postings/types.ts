import type { Rank } from '@/types/models';

export interface RankWithSalary extends Rank {
  base_salary: number;
  currency: string;
  template_id: string;
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