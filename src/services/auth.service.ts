import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

const SESSION_KEY = 'user_session'

interface UserSession {
  userId: string
  token: string
  expiresAt: number
}

export interface User {
  id: string
  username: string
  email: string
  full_name: string
  name: string
  role?: string
  user_group_id: string
  company_id?: string
  is_active?: boolean
  resignation_date?: string | null
  user_groups?: { id: string; name: string; permissions: string[] }
  companies?: { id: string; name: string; company_type: string }
}

export interface LoginResult {
  success: boolean
  user?: User
  error?: 'USER_NOT_FOUND' | 'INVALID_PASSWORD' | 'UNKNOWN_ERROR'
}

function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

function getSession(): UserSession | null {
  try {
    const s = localStorage.getItem(SESSION_KEY)
    if (!s) return null
    const session: UserSession = JSON.parse(s)
    if (session.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch { return null }
}

function setSession(userId: string) {
  const session: UserSession = {
    userId,
    token: generateToken(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

async function fetchUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return null

  return {
    ...data,
    id: String(data.id),
    full_name: data.name || data.username || '',
    name: data.name || data.username || '',
    company_id: data.company_id ? String(data.company_id) : undefined,
  }
}

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .limit(1)

    if (error) return { success: false, error: 'UNKNOWN_ERROR' }

    const user = users?.[0]
    if (!user) return { success: false, error: 'USER_NOT_FOUND' }
    if (user.is_active === false) return { success: false, error: 'USER_NOT_FOUND' }
    // 퇴사일이 지난 직원은 계정이 남아있어도 더 이상 로그인할 수 없다 (퇴사 처리).
    if (user.resignation_date) {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      if (user.resignation_date <= today) return { success: false, error: 'USER_NOT_FOUND' }
    }

    const passwordField = user.password || user.encrypted_password
    if (!passwordField) return { success: false, error: 'INVALID_PASSWORD' }

    const valid = await bcrypt.compare(password, String(passwordField))
    if (!valid) return { success: false, error: 'INVALID_PASSWORD' }

    setSession(String(user.id))
    const enriched = await fetchUserById(String(user.id))
    return { success: true, user: enriched || user }
  } catch {
    return { success: false, error: 'UNKNOWN_ERROR' }
  }
}

export async function logout(): Promise<void> {
  clearSession()
}

export async function getCurrentUser(): Promise<User | null> {
  const session = getSession()
  if (!session) return null
  const user = await fetchUserById(session.userId)
  if (!user) { clearSession(); return null }
  // 로그인해 있는 도중 퇴사일이 지나면(관리자가 뒤늦게 퇴사일을 입력한 경우 포함) 즉시 세션을 끊는다.
  if (user.resignation_date) {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    if (user.resignation_date <= today) { clearSession(); return null }
  }
  return user
}

export async function initializeAuth(): Promise<User | null> {
  return getCurrentUser()
}

export async function updatePassword(userId: string, newPassword: string) {
  const hash = await bcrypt.hash(newPassword, 10)
  const { error } = await supabase
    .from('users')
    .update({ password: hash, updated_at: new Date().toISOString() })
    .eq('id', userId)
  return { error: error ? new Error(error.message) : null }
}

export async function resetPassword(email: string, newPassword: string) {
  const { data: users } = await supabase
    .from('users').select('id').eq('email', email).limit(1)
  const user = users?.[0]
  if (!user) return { error: new Error('User not found') }
  return updatePassword(String(user.id), newPassword)
}

export async function register(userData: {
  username: string
  email: string
  password: string
  full_name: string
  user_group_id: string
  company_id?: string
}): Promise<User> {
  const hash = await bcrypt.hash(userData.password, 10)
  const { data, error } = await supabase
    .from('users')
    .insert([{
      username: userData.username,
      email: userData.email,
      password: hash,
      name: userData.full_name,
      user_group_id: userData.user_group_id,
      company_id: userData.company_id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single()

  if (error) throw new Error(error.message)
  setSession(String(data.id))
  return data
}