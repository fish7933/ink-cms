import { supabase } from '@/lib/supabase';
import type { Port } from '@/types/port';

export async function getPorts(activeOnly: boolean = true): Promise<Port[]> {
  let query = supabase.from('ports').select('*').order('display_order', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching ports:', error);
    return [];
  }
  return data as Port[];
}

export async function addPort(port: Omit<Port, 'id' | 'created_at' | 'updated_at'>): Promise<Port | null> {
  const { data, error } = await supabase.from('ports').insert([port]).select().single();
  if (error) {
    console.error('Error adding port:', error);
    return null;
  }
  return data as Port;
}

export async function updatePort(id: string, updates: Partial<Port>): Promise<Port | null> {
  const { data, error } = await supabase
    .from('ports')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error updating port:', error);
    return null;
  }
  return data as Port;
}

export async function deletePort(id: string): Promise<boolean> {
  const { error } = await supabase.from('ports').delete().eq('id', id);
  if (error) {
    console.error('Error deleting port:', error);
    return false;
  }
  return true;
}

/**
 * 국가/도시가 이미 등록돼 있으면 그 id를 반환하고, 없으면 새로 등록한 뒤 id를 반환한다.
 * 직접 입력한 교대지가 다음부터는 목록에 포함되도록 하는 용도.
 */
export async function findOrCreatePort(countryName: string, cityName: string): Promise<Port | null> {
  const country = countryName.trim();
  const city = cityName.trim();
  if (!country || !city) return null;

  const existing = await getPorts(false);
  const match = existing.find(
    p => p.country_name.trim().toLowerCase() === country.toLowerCase() && p.city_name.trim().toLowerCase() === city.toLowerCase()
  );
  if (match) return match;

  const nextOrder = existing.length > 0 ? Math.max(...existing.map(p => p.display_order)) + 1 : 1;
  return addPort({ country_code: null, country_name: country, city_name: city, is_active: true, display_order: nextOrder });
}
