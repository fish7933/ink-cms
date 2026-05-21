import { supabase } from '@/lib/supabase';
import type { Permission, PermissionUpdate } from '@/types/permissions';

// Get permissions for a specific user from database
export const getPermissionsByUserId = async (userId: string): Promise<Permission[]> => {
  const { data, error } = await supabase
    .from('permissions')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching permissions:', error);
    return [];
  }

  return data || [];
};

// Get all permissions (for admin use)
export const getAllPermissions = async (): Promise<Permission[]> => {
  const { data, error } = await supabase
    .from('permissions')
    .select('*');

  if (error) {
    console.error('Error fetching all permissions:', error);
    return [];
  }

  return data || [];
};

// Update a specific permission
export const updatePermission = async (
  userId: string,
  resource: string,
  updates: Partial<PermissionUpdate>
): Promise<Permission | null> => {
  const { data, error } = await supabase
    .from('permissions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('resource', resource)
    .select()
    .single();

  if (error) {
    console.error('Error updating permission:', error);
    return null;
  }

  return data;
};

// Update multiple permissions for a user
export const updateUserPermissions = async (
  userId: string,
  permissionUpdates: PermissionUpdate[]
): Promise<Permission[]> => {
  const updatedPermissions: Permission[] = [];

  for (const update of permissionUpdates) {
    const permission = await updatePermission(userId, update.resource, update);
    if (permission) {
      updatedPermissions.push(permission);
    }
  }

  return updatedPermissions;
};

// Check if user has specific permission
export const hasPermission = async (
  userId: string,
  resource: string,
  action: 'view' | 'create' | 'edit' | 'delete'
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('permissions')
    .select('*')
    .eq('user_id', userId)
    .eq('resource', resource)
    .single();

  if (error || !data) {
    return false;
  }

  switch (action) {
    case 'view':
      return data.can_view;
    case 'create':
      return data.can_create;
    case 'edit':
      return data.can_edit;
    case 'delete':
      return data.can_delete;
    default:
      return false;
  }
};

// Helper function to check if user can approve/reject crew applications
export const canManageCrewApplications = (role: string): boolean => {
  return role === 'ship_manager' || role === 'ship_owner';
};

// Helper function to check if user is limited to their own data
export const isDataOwnershipRequired = (role: string): boolean => {
  return role === 'ship_owner' || role === 'crew';
};