import type { Rank } from '@/types/models';

export interface RankWithSalary extends Rank {
  base_salary: number; // 등급이 있는 직급은 최저(하위) 등급 기준 급여, 없으면 공통 급여
  currency: string;
  template_id: string;
  has_salary: boolean; // 급여 템플릿에 이 직급의 급여 항목이 실제로 있는지 여부 (없으면 직접 입력 필요)
  grades: string[]; // 급여템플릿에 등급(A/B/C 등)이 설정된 경우 선택 가능한 등급 목록, 없으면 빈 배열
  default_grade: string | null; // 급여가 가장 낮은(하위) 등급 — 공고 등록 시 기본 선택값
  salary_by_grade: Record<string, number>; // 등급별 급여 합계 (등급 변경 시 재계산에 사용)
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
  salary_grade?: string | null; // 선택된 등급 (해당 직급에 등급 구분이 있는 경우)
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