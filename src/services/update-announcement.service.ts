import { supabase } from '@/lib/supabase';

export interface UpdateAnnouncement {
  id: string;
  summary: string;
  detail: string | null;
  created_at: string;
}

export async function getRecentUpdateAnnouncements(limit = 5): Promise<UpdateAnnouncement[]> {
  const { data, error } = await supabase
    .from('update_announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('Error fetching update announcements:', error); return []; }
  return data || [];
}

export async function addUpdateAnnouncement(summary: string, detail?: string): Promise<void> {
  const { error } = await supabase.from('update_announcements').insert({ summary, detail: detail || null });
  if (error) throw error;
}
