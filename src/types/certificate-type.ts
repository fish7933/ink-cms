export interface CertificateType {
  id: string;
  category: 'stcw' | 'national' | 'medical' | 'safety' | 'technical' | 'other';
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