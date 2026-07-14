import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import type { User } from '@/types/models';

const SALT_ROUNDS = 10;

export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id,username,name,email,role,company_id,position_id,user_group_id,hire_date,is_active,is_executive,is_leave_exempt,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) { console.error('Error fetching users:', error); return []; }
  return (data || []) as User[];
}

export async function getUsersByRole(role: string): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id,username,name,email,role,company_id,position_id,user_group_id,is_active,created_at,updated_at')
    .eq('role', role)
    .order('name');
  if (error) { console.error('Error fetching users by role:', error); return []; }
  return (data || []) as User[];
}

export async function addUser(
  user: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password: string; position_id?: string | null; crew_member_id?: string | null; hire_date?: string | null }
): Promise<User | null> {
  const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('users')
    .insert([{
      username: user.username,
      email: user.email,
      password: passwordHash,
      role: user.role,
      name: user.name,
      company_id: user.company_id || null,
      position_id: user.position_id || null,
      crew_member_id: user.crew_member_id || null,
      hire_date: user.hire_date || null,
      is_executive: user.is_executive || false,
      is_active: true,
      created_at: now,
      updated_at: now,
    }])
    .select('id,username,name,email,role,company_id,position_id,hire_date,is_executive,is_active,created_at,updated_at')
    .single();
  if (error) { console.error('Error adding user:', error); throw error; }
  return data as User;
}

export async function updateUser(
  id: string,
  updates: Partial<User> & { password?: string; position_id?: string | null; crew_member_id?: string | null; hire_date?: string | null }
): Promise<User | null> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.company_id !== undefined) payload.company_id = updates.company_id;
  if (updates.position_id !== undefined) payload.position_id = updates.position_id;
  if (updates.crew_member_id !== undefined) payload.crew_member_id = updates.crew_member_id;
  if (updates.hire_date !== undefined) payload.hire_date = updates.hire_date;
  if (updates.is_executive !== undefined) payload.is_executive = updates.is_executive;
  if (updates.password) payload.password = await bcrypt.hash(updates.password, SALT_ROUNDS);

  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', id)
    .select('id,username,name,email,role,company_id,position_id,hire_date,is_executive,is_active,created_at,updated_at')
    .single();
  if (error) { console.error('Error updating user:', error); throw error; }
  return data as User;
}

export async function deleteUser(id: string): Promise<boolean> {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) { console.error('Error deleting user:', error); throw error; }
  return true;
}
