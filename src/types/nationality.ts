export interface Nationality {
  id: string;
  country_code: string;
  country_name_en: string;
  country_name_ko: string;
  currency_code?: string;
  region?: 'asia' | 'europe' | 'americas' | 'africa' | 'oceania';
  is_major_supplier?: boolean;
  is_active?: boolean;
  display_order?: number;
  created_at: string;
  updated_at: string;
}