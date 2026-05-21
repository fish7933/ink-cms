/* eslint-disable @typescript-eslint/no-explicit-any */
import { client } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import type { User } from '@/types/models';

const SALT_ROUNDS = 10;

// Helper to get the users entity accessor
function usersEntity() {
  return (client.entities as any).users;
}

export async function getUsers(): Promise<User[]> {
  try {
    const response = await usersEntity().queryAll({
      query: {},
      sort: '-created_at',
      limit: 1000,
      skip: 0,
    });
    const result = response?.data;
    if (Array.isArray(result)) return result as User[];
    if (result?.items) return result.items as User[];
    return [];
  } catch (err) {
    console.error('Error fetching users:', err);
    return [];
  }
}

export async function getUsersByRole(role: string): Promise<User[]> {
  try {
    const response = await usersEntity().queryAll({
      query: { role },
      sort: 'name',
      limit: 1000,
      skip: 0,
    });
    const result = response?.data;
    let items: User[] = [];
    if (Array.isArray(result)) items = result as User[];
    else if (result?.items) items = result.items as User[];
    // Filter by role client-side as a safety net
    return items.filter((u: User) => u.role === role);
  } catch (err) {
    console.error('Error fetching users by role:', err);
    return [];
  }
}

export async function addUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password: string; position_id?: string | null }): Promise<User | null> {
  try {
    // Check if username already exists
    const existingUsers = await getUsers();
    const existingUser = existingUsers.find(u => u.username === user.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const existingEmail = existingUsers.find(u => u.email === user.email);
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Hash password using bcrypt
    const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);

    // Create user via web-sdk entities
    const response = await usersEntity().create({
      data: {
        username: user.username,
        email: user.email,
        password: passwordHash,
        role: user.role,
        name: user.name,
        company_id: user.company_id,
        position_id: user.position_id,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const data = response?.data;
    if (!data) {
      throw new Error('Failed to create user');
    }

    console.log('✅ User created successfully:', data.username);

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = data;
    return userWithoutPassword as User;
  } catch (err) {
    console.error('Error in addUser:', err);
    throw err;
  }
}

export async function updateUser(
  id: string,
  updates: Partial<User> & { password?: string; currentPassword?: string; position_id?: string | null }
): Promise<User | null> {
  try {
    // If password is being updated
    if (updates.password) {
      // If currentPassword is provided, verify it first
      if (updates.currentPassword) {
        const userResponse = await usersEntity().get({ id: String(id) });
        const userData = userResponse?.data;

        if (!userData || !userData.password) {
          throw new Error('User not found or no password set');
        }

        const isPasswordValid = await bcrypt.compare(updates.currentPassword, userData.password);
        if (!isPasswordValid) {
          throw new Error('Current password is incorrect');
        }
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(updates.password, SALT_ROUNDS);

      // Update password
      await usersEntity().update({
        id: String(id),
        data: {
          password: passwordHash,
          updated_at: new Date().toISOString(),
        },
      });

      console.log('✅ Password updated successfully for user:', id);

      // Remove password fields from updates
      delete updates.password;
      delete updates.currentPassword;
    }

    // Remove currentPassword if it exists
    if (updates.currentPassword) {
      delete updates.currentPassword;
    }

    // If there are no other updates besides password, return the user
    if (Object.keys(updates).length === 0) {
      const response = await usersEntity().get({ id: String(id) });
      const data = response?.data;
      if (data) {
        const { password: _, ...userWithoutPassword } = data;
        return userWithoutPassword as User;
      }
      return data as User;
    }

    // Update user via web-sdk entities
    const response = await usersEntity().update({
      id: String(id),
      data: {
        ...updates,
        updated_at: new Date().toISOString(),
      },
    });

    const data = response?.data;
    if (!data) {
      throw new Error('Failed to update user');
    }

    console.log('✅ User updated successfully:', data.username);

    // Return without password
    const { password: _, ...userWithoutPassword } = data;
    return userWithoutPassword as User;
  } catch (err: unknown) {
    console.error('Error in updateUser:', err);
    throw err;
  }
}

export async function deleteUser(id: string): Promise<boolean> {
  try {
    await usersEntity().delete({ id: String(id) });

    console.log('✅ User deleted successfully:', id);
    return true;
  } catch (err) {
    console.error('Error in deleteUser:', err);
    return false;
  }
}