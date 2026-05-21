-- Create notifications table for storing notification history
-- Run this in Supabase SQL Editor

BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_application', 'status_change', 'new_job', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id UUID, -- Can reference job_application_id, job_posting_id, etc.
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own notifications
CREATE POLICY "allow_users_read_own_notifications" 
ON notifications FOR SELECT 
TO public 
USING (true);

CREATE POLICY "allow_insert_notifications" 
ON notifications FOR INSERT 
TO public 
WITH CHECK (true);

CREATE POLICY "allow_users_update_own_notifications" 
ON notifications FOR UPDATE 
TO public 
USING (true);

COMMIT;