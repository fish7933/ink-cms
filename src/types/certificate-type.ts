export interface CertificateType {
  id: string;
  // certificate_categories.code를 참조하는 텍스트 값 (DB 관리 목록 — CertificateTypeManagementPage에서 관리)
  category: string;
  type_code: string;
  type_name_en: string;
  type_name_ko: string;
  description?: string;
  validity_period_months?: number;
  is_mandatory?: boolean;
  is_active?: boolean;
  display_order?: number;
  created_at: string;
  updated_at: string;
}

// 같은 증서 유형이라도 선원 국적(자국 증서 발급 기준)에 따라 유효기간이 다른 경우의 예외 규칙.
// validity_period_months가 null이면 그 국적은 무기한(만료 없음)이라는 뜻.
export interface CertificateNationalityValidity {
  id: string;
  certificate_type_id: string;
  nationality_code: string;
  validity_period_months: number | null;
  created_at: string;
  updated_at: string;
}