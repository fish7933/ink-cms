export interface Port {
  id: string;
  country_code: string | null;
  country_name: string;
  city_name: string;
  is_active: boolean;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}
