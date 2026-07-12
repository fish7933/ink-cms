import { supabase } from '@/lib/supabase';
import { uploadFile } from '@/lib/storage';

export interface CompanyInfo {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
}

export async function getCompanyInfo(): Promise<CompanyInfo | null> {
  const { data, error } = await supabase
    .from('company_info')
    .select('id, name, address, phone, fax, email, website, logo_url')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCompanyInfo(
  id: string | null,
  payload: { name: string; address: string | null; phone: string | null; fax: string | null; email: string | null; website: string | null; logo_url: string | null }
): Promise<void> {
  if (id) {
    const { error } = await supabase
      .from('company_info')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('company_info')
      .insert([{ ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
    if (error) throw error;
  }
}

export async function uploadCompanyLogo(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `logo/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
  return uploadFile('company-assets', path, file);
}
