export interface HomepagePostAttachment {
  name: string;
  path: string;
  size: number;
  type: string;
}

export interface HomepagePost {
  id: string;
  category: 'notice' | 'news';
  title: string;
  content: string;
  attachments: HomepagePostAttachment[];
  is_published: boolean;
  published_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
