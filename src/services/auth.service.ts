/* eslint-disable @typescript-eslint/no-explicit-any */
import { client } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
const SESSION_KEY = 'user_session';

interface UserSession {
  userId: string;
  token: string;
  expiresAt: number;
}

interface UserGroup {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

interface CompanyInfo {
  id: string;
  name: string;
  company_type: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role?: string;
  user_group_id: string;
  company_id?: string;
  is_active?: boolean;
  password?: string;
  user_groups?: UserGroup;
  companies?: CompanyInfo;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  error?: 'USER_NOT_FOUND' | 'INVALID_PASSWORD' | 'UNKNOWN_ERROR';
}

// ─── Storage Manager ────────────────────────────────────────────────
class StorageManager {
  private memoryStorage: Map<string, string> = new Map();
  private storageAvailable: boolean = false;
  private useMemory: boolean = false;

  constructor() {
    this.checkStorageAvailability();
  }

  private checkStorageAvailability(): void {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);

      if (retrieved === 'test') {
        this.storageAvailable = true;
        this.useMemory = false;
      } else {
        throw new Error('localStorage test failed');
      }
    } catch {
      console.warn('⚠️ localStorage is blocked, using memory storage');
      this.storageAvailable = false;
      this.useMemory = true;
    }
  }

  setItem(key: string, value: string): void {
    this.memoryStorage.set(key, value);
    if (this.storageAvailable && !this.useMemory) {
      try {
        localStorage.setItem(key, value);
      } catch {
        this.useMemory = true;
      }
    }
  }

  getItem(key: string): string | null {
    const memoryValue = this.memoryStorage.get(key);
    if (memoryValue) return memoryValue;
    if (this.storageAvailable && !this.useMemory) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          this.memoryStorage.set(key, value);
          return value;
        }
      } catch {
        this.useMemory = true;
      }
    }
    return null;
  }

  removeItem(key: string): void {
    this.memoryStorage.delete(key);
    if (this.storageAvailable && !this.useMemory) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
}

const storage = new StorageManager();

// ─── Session helpers ────────────────────────────────────────────────
function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getSession(): UserSession | null {
  try {
    const sessionStr = storage.getItem(SESSION_KEY);
    if (!sessionStr) return null;

    const session: UserSession = JSON.parse(sessionStr);
    if (session.expiresAt < Date.now()) {
      storage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function setSession(userId: string): void {
  try {
    const session: UserSession = {
      userId,
      token: generateToken(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Error setting session:', error);
  }
}

function clearSession(): void {
  try {
    storage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error('Error clearing session:', error);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────
function parsePermissions(perms: unknown): string[] {
  if (Array.isArray(perms)) return perms;
  if (typeof perms === 'string') {
    try {
      const parsed = JSON.parse(perms);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Fetch user group data via web-sdk
async function fetchUserGroup(userGroupId: string | number | null): Promise<UserGroup | undefined> {
  if (!userGroupId) return undefined;
  try {
    const response = await (client.entities as any).user_groups.queryAll({
      query: { id: Number(userGroupId) },
      limit: 1,
    });
    const data = response?.data?.items?.[0];
    if (!data) return undefined;
    return {
      id: String(data.id),
      name: String(data.name || ''),
      description: String(data.description || ''),
      permissions: parsePermissions(data.permissions),
    };
  } catch {
    return undefined;
  }
}

// Fetch company data via web-sdk
async function fetchCompany(companyId: string | number | null): Promise<CompanyInfo | undefined> {
  if (!companyId || companyId === '0' || companyId === 0) return undefined;
  try {
    const response = await (client.entities as any).companies.queryAll({
      query: { id: Number(companyId) },
      limit: 1,
    });
    const data = response?.data?.items?.[0];
    if (!data) return undefined;
    return {
      id: String(data.id),
      name: String(data.name || ''),
      company_type: String(data.type || data.company_type || ''),
    };
  } catch {
    return undefined;
  }
}

// Enrich user with group and company info
async function enrichUser(rawUser: Record<string, unknown>): Promise<User> {
  const userGroup = await fetchUserGroup(rawUser.user_group_id as string | number | null);
  const company = await fetchCompany(rawUser.company_id as string | number | null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = rawUser;

  return {
    ...userWithoutPassword,
    id: String(rawUser.id),
    username: String(rawUser.username || ''),
    email: String(rawUser.email || ''),
    full_name: String(rawUser.full_name || rawUser.username || ''),
    role: String(rawUser.role || ''),
    user_group_id: String(rawUser.user_group_id || ''),
    company_id: rawUser.company_id ? String(rawUser.company_id) : undefined,
    is_active: rawUser.is_active !== false,
    user_groups: userGroup,
    companies: company,
  } as User;
}

// ─── Public API ─────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    console.log('Login attempt for username:', username);

    // Query user by username using web-sdk entities
    const response = await (client.entities as any).users.queryAll({
      query: { username },
      limit: 1,
    });

    const users = response?.data?.items || [];
    const user = users[0];

    if (!user) {
      console.log('User not found');
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    console.log('User found:', user.username);

    if (user.is_active === false) {
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    if (!user.password) {
      return { success: false, error: 'INVALID_PASSWORD' };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, String(user.password));

    if (!isPasswordValid) {
      console.log('Invalid password');
      return { success: false, error: 'INVALID_PASSWORD' };
    }

    console.log('✅ Password verified, creating session');

    // Create session
    setSession(String(user.id));

    // Enrich user with group and company data
    const enrichedUser = await enrichUser(user);

    console.log('✅ Login successful for user:', enrichedUser.username);

    return { success: true, user: enrichedUser };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, error: 'UNKNOWN_ERROR' };
  }
}

export async function register(userData: {
  username: string;
  email: string;
  password: string;
  full_name: string;
  user_group_id: string;
  company_id?: string;
}): Promise<User> {
  try {
    // Check if username already exists
    const existingUserRes = await (client.entities as any).users.queryAll({
      query: { username: userData.username },
      limit: 1,
    });
    if (existingUserRes?.data?.items?.length > 0) {
      throw new Error('Username already exists');
    }

    // Check if email already exists
    const existingEmailRes = await (client.entities as any).users.queryAll({
      query: { email: userData.email },
      limit: 1,
    });
    if (existingEmailRes?.data?.items?.length > 0) {
      throw new Error('Email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);

    // Insert new user via web-sdk
    const newUserResponse = await (client.entities as any).users.create({
      data: {
        username: userData.username,
        email: userData.email,
        password: passwordHash,
        full_name: userData.full_name,
        user_group_id: userData.user_group_id,
        company_id: userData.company_id,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const newUser = newUserResponse?.data;

    // Create session for new user
    setSession(String(newUser.id));

    // Enrich and return
    return await enrichUser(newUser);
  } catch (err) {
    console.error('Registration error:', err);
    throw err;
  }
}

export async function logout(): Promise<void> {
  try {
    clearSession();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const session = getSession();
    if (!session) {
      return null;
    }

    // Fetch user data by ID using web-sdk
    const response = await (client.entities as any).users.get({
      id: String(session.userId),
    });

    const user = response?.data;

    if (!user || !user.id) {
      clearSession();
      return null;
    }

    if (user.is_active === false) {
      clearSession();
      return null;
    }

    // Enrich user with group and company data
    return await enrichUser(user);
  } catch (err) {
    console.error('Get current user error:', err);
    clearSession();
    return null;
  }
}

export async function initializeAuth(): Promise<User | null> {
  return getCurrentUser();
}

export async function updatePassword(
  userId: string,
  newPassword: string
): Promise<{ error: Error | null }> {
  try {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await (client.entities as any).users.update({
      id: String(userId),
      data: {
        password: passwordHash,
        updated_at: new Date().toISOString(),
      },
    });

    return { error: null };
  } catch (err) {
    console.error('Update password error:', err);
    return { error: err as Error };
  }
}

export async function resetPassword(
  email: string,
  newPassword: string
): Promise<{ error: Error | null }> {
  try {
    const response = await (client.entities as any).users.queryAll({
      query: { email },
      limit: 1,
    });
    const user = response?.data?.items?.[0];

    if (!user) {
      throw new Error('User not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await (client.entities as any).users.update({
      id: String(user.id),
      data: {
        password: passwordHash,
        updated_at: new Date().toISOString(),
      },
    });

    return { error: null };
  } catch (err) {
    console.error('Reset password error:', err);
    return { error: err as Error };
  }
}