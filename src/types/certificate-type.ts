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