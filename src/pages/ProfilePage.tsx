import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, updatePassword } from '@/services/auth.service';
import { supabase } from '@/lib/supabase';
import { User, Mail, Building2, Shield, Calendar, Lock, Bell } from 'lucide-react';
import {
  isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush,
  getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences,
} from '@/services/push.service';

interface UserData {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  name?: string;
  phone?: string;
  company_id?: string;
  created_at: string;
  user_groups?: {
    name: string;
  };
  companies?: {
    name: string;
  };
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>({ notify_approval_request: true, notify_approval_complete: true });
  const [prefsBusy, setPrefsBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadUserData();
    isSubscribed().then(setPushEnabled);
  }, []);

  useEffect(() => {
    if (user) getNotificationPreferences(user.id).then(setPrefs).catch(() => {});
  }, [user]);

  const handleTogglePush = async (checked: boolean) => {
    if (!user) return;
    setPushBusy(true);
    try {
      if (checked) {
        await subscribeToPush(user.id);
        setPushEnabled(true);
        toast({ title: '알림이 켜졌습니다.', description: '결재 차례가 되면 이 브라우저로 알림을 받습니다.' });
      } else {
        await unsubscribeFromPush();
        setPushEnabled(false);
        toast({ title: '알림이 꺼졌습니다.' });
      }
    } catch (e) {
      toast({ title: '알림 설정 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setPushBusy(false);
    }
  };

  const handleTogglePref = async (key: keyof NotificationPreferences, checked: boolean) => {
    if (!user) return;
    const prev = prefs;
    setPrefs({ ...prefs, [key]: checked });
    setPrefsBusy(true);
    try {
      await updateNotificationPreferences(user.id, { [key]: checked });
    } catch (e) {
      setPrefs(prev);
      toast({ title: '설정 저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setPrefsBusy(false);
    }
  };

  const loadUserData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser as UserData);
      setFormData({
        full_name: currentUser.full_name || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
      });
    } catch (error) {
      console.error('Error loading user data:', error);
      toast({
        title: '오류',
        description: '사용자 정보를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user!.id);

      if (error) throw error;

      toast({
        title: '성공',
        description: '프로필이 업데이트되었습니다.',
      });

      // Reload user data
      await loadUserData();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: '오류',
        description: '프로필 업데이트에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: '오류',
        description: '새 비밀번호가 일치하지 않습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: '오류',
        description: '비밀번호는 최소 6자 이상이어야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    setChangingPassword(true);

    try {
      const { error } = await updatePassword(user!.id, passwordData.newPassword);

      if (error) throw error;

      toast({
        title: '성공',
        description: '비밀번호가 변경되었습니다.',
      });

      // Clear password fields
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Error changing password:', error);
      toast({
        title: '오류',
        description: '비밀번호 변경에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    return null;
  }

  const displayName = user?.full_name || user?.name || user?.username || '사용자';
  const userGroup = user?.user_groups?.name || '미지정';
  const companyName = user?.companies?.name || '미지정';

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">프로필 설정</h1>
          <p className="text-sm text-gray-600 mt-1">
            계정 정보를 관리하고 비밀번호를 변경할 수 있습니다.
          </p>
        </div>

        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              기본 정보
            </CardTitle>
            <CardDescription>
              사용자 계정의 기본 정보입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <User className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">사용자명</p>
                  <p className="font-medium">{user.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Shield className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">사용자 그룹</p>
                  <p className="font-medium">{userGroup}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Building2 className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">소속 회사</p>
                  <p className="font-medium">{companyName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Calendar className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">가입일</p>
                  <p className="font-medium">
                    {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Push Notification Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              결재 알림
            </CardTitle>
            <CardDescription>
              내 차례의 결재 문서가 도착하면 이 브라우저(또는 홈 화면에 추가한 앱)로 알림을 받습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPushSupported() ? (
              <>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">이 브라우저에서 결재 알림 받기</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {pushEnabled ? '알림이 켜져 있습니다.' : '알림이 꺼져 있습니다.'}
                    </p>
                  </div>
                  <Switch checked={pushEnabled} disabled={pushBusy} onCheckedChange={handleTogglePush} />
                </div>

                {pushEnabled && (
                  <div className="space-y-2 pl-1">
                    <div className="flex items-center justify-between py-1.5">
                      <div>
                        <p className="text-sm">결재 요청 알림</p>
                        <p className="text-xs text-gray-500">내 차례의 결재가 도착했을 때</p>
                      </div>
                      <Switch
                        checked={prefs.notify_approval_request}
                        disabled={prefsBusy}
                        onCheckedChange={c => handleTogglePref('notify_approval_request', c)}
                      />
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <div>
                        <p className="text-sm">결재 완료 알림</p>
                        <p className="text-xs text-gray-500">내가 상신한 문서가 최종 승인됐을 때</p>
                      </div>
                      <Switch
                        checked={prefs.notify_approval_complete}
                        disabled={prefsBusy}
                        onCheckedChange={c => handleTogglePref('notify_approval_complete', c)}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">이 브라우저는 알림 기능을 지원하지 않습니다.</p>
            )}
          </CardContent>
        </Card>

        {/* Edit Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              프로필 수정
            </CardTitle>
            <CardDescription>
              이름, 이메일, 연락처 정보를 수정할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">이름</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) =>
                    setFormData({ ...formData, full_name: e.target.value })
                  }
                  placeholder="이름을 입력하세요"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="이메일을 입력하세요"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">연락처</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="연락처를 입력하세요"
                />
              </div>

              <Button type="submit" disabled={updating} className="w-full">
                {updating ? '업데이트 중...' : '프로필 업데이트'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              비밀번호 변경
            </CardTitle>
            <CardDescription>
              계정 보안을 위해 주기적으로 비밀번호를 변경하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">현재 비밀번호</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) =>
                    setPasswordData({
                      ...passwordData,
                      currentPassword: e.target.value,
                    })
                  }
                  placeholder="현재 비밀번호를 입력하세요"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="newPassword">새 비밀번호</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) =>
                    setPasswordData({
                      ...passwordData,
                      newPassword: e.target.value,
                    })
                  }
                  placeholder="새 비밀번호를 입력하세요 (최소 6자)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) =>
                    setPasswordData({
                      ...passwordData,
                      confirmPassword: e.target.value,
                    })
                  }
                  placeholder="새 비밀번호를 다시 입력하세요"
                />
              </div>

              <Button
                type="submit"
                disabled={changingPassword}
                className="w-full"
                variant="secondary"
              >
                {changingPassword ? '변경 중...' : '비밀번호 변경'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}