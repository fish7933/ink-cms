import { supabase } from '@/lib/supabase';

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export async function getHolidays(): Promise<Holiday[]> {
  const { data, error } = await supabase.from('holidays').select('id, date, name').order('date');
  if (error) throw error;
  return data || [];
}

// 연차 시간 계산 등에서 빠르게 조회할 수 있도록 날짜 문자열(Set)로 반환
export async function getHolidayDateSet(): Promise<Set<string>> {
  const holidays = await getHolidays();
  return new Set(holidays.map(h => h.date));
}

export async function addHoliday(date: string, name: string): Promise<Holiday> {
  const { data, error } = await supabase.from('holidays').insert({ date, name }).select('id, date, name').single();
  if (error) throw error;
  return data;
}

export async function deleteHoliday(id: string): Promise<void> {
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) throw error;
}
