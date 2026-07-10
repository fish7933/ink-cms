import { supabase } from '@/lib/supabase';
import type { HomepagePost } from '@/types/homepage';

export async function getHomepagePosts(): Promise<HomepagePost[]> {
  const { data, error } = await supabase
    .from('homepage_posts')
    .select('*')
    .order('published_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addHomepagePost(input: {
  category: 'notice' | 'news';
  title: string;
  content: string;
  attachments?: HomepagePost['attachments'];
  is_published: boolean;
  published_at: string;
  created_by: string;
}): Promise<HomepagePost> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('homepage_posts')
    .insert({
      category: input.category,
      title: input.title,
      content: input.content,
      attachments: input.attachments || [],
      is_published: input.is_published,
      published_at: input.published_at,
      created_by: input.created_by,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHomepagePost(id: string, updates: Partial<Pick<HomepagePost,
  'category' | 'title' | 'content' | 'attachments' | 'is_published' | 'published_at'
>>): Promise<void> {
  const { error } = await supabase
    .from('homepage_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteHomepagePost(id: string): Promise<void> {
  const { error } = await supabase.from('homepage_posts').delete().eq('id', id);
  if (error) throw error;
}
