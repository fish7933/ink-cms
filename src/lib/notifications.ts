import { supabase } from './supabase';

export interface Notification {
  id: string;
  user_id: string;
  type: 'new_application' | 'status_change' | 'new_job' | 'system';
  title: string;
  message: string;
  related_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface JobApplicationPayload {
  id: string;
  job_posting_id: string | null;
  crew_member_id: string | null;
  applied_by: string;
  status: string;
  comments?: string;
  applied_at: string;
}

const TABLE_NAME = 'notifications';

/**
 * Get all notifications for a user
 */
export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }

  return data || [];
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('Error fetching unread count:', error);
    return 0;
  }

  return data?.length || 0;
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as read:', error);
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<void> {
  const { data: unread } = await supabase
    .from(TABLE_NAME)
    .select('id')
    .eq('user_id', userId)
    .eq('is_read', false);

  if (unread && unread.length > 0) {
    for (const n of unread) {
      await supabase
        .from(TABLE_NAME)
        .update({ is_read: true })
        .eq('id', n.id);
    }
  }
}

/**
 * Create a notification
 */
export async function createNotification(notification: Omit<Notification, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase
    .from(TABLE_NAME)
    .insert([notification]);

  if (error) {
    console.error('Error creating notification:', error);
  }
}

/**
 * Subscribe to notifications (no-op since Atoms Cloud doesn't support realtime)
 * Returns a cleanup object with unsubscribe method
 */
export function subscribeToNotifications(
  _userId: string,
  _callback: (notification: Notification) => void
): { unsubscribe: () => void } {
  // Realtime subscriptions are not supported in Atoms Cloud
  // Polling can be implemented at the component level if needed
  return {
    unsubscribe: () => {},
  };
}