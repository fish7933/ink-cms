import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, getCurrentUser } from '@/lib/store';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import { getRecentUpdateAnnouncements, type UpdateAnnouncement } from '@/services/update-announcement.service';
import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Ship, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/pages/LoginPage/en.json';
i18n.addResourceBundle('en', 'LoginPage', en, true, true);

export default function LoginPage() {
  const { t } = useTranslation('LoginPage');
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [announcements, setAnnouncements] = useState<UpdateAnnouncement[]>([]);

  // 이미 로그인 세션이 남아있는 상태에서 로그인 화면으로 온 경우(뒤로 가기 포함) 로그인
  // 화면을 다시 보여주지 않고 세션을 유지한 채 대시보드로 보낸다 — replace라서 뒤로 가기를
  // 또 눌러도 로그인 화면으로 못 돌아가고 계속 대시보드에 머문다.
  useEffect(() => {
    getCurrentUser().then(user => { if (user) navigate('/dashboard', { replace: true }); });
    getCompanyInfo().then(setCompanyInfo).catch(() => {});
    getRecentUpdateAnnouncements(3).then(setAnnouncements).catch(() => {});
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(username, password);
      
      if (result.success && result.user) {
        navigate('/dashboard');
      } else {
        // Provide specific error messages based on the error type
        if (result.error === 'USER_NOT_FOUND') {
          setError(t('입력하신 아이디가 존재하지 않습니다. 아이디를 확인해주세요.'));
        } else if (result.error === 'INVALID_PASSWORD') {
          setError(t('비밀번호가 올바르지 않습니다. 다시 확인해주세요.'));
        } else {
          setError(t('로그인 중 오류가 발생했습니다. 다시 시도해주세요.'));
        }
      }
    } catch (err) {
      setError(t('로그인 중 오류가 발생했습니다. 다시 시도해주세요.'));
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-600 rounded-full">
              <Ship className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t('선박 관리 시스템')}</CardTitle>
          <CardDescription>{t('계정 정보를 입력하여 로그인하세요')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('아이디')}</Label>
              <Input
                id="username"
                type="text"
                placeholder={t('아이디를 입력하세요')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('비밀번호')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('비밀번호를 입력하세요')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('로그인 중...') : t('로그인')}
            </Button>
          </form>
          {announcements.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                <Megaphone className="h-3.5 w-3.5" />{t('업데이트 소식')}
              </p>
              <ul className="space-y-1.5">
                {announcements.map(a => (
                  <li key={a.id} className="text-xs text-gray-600">
                    <span className="text-gray-400">{new Date(a.created_at).toLocaleDateString('ko-KR')}</span>
                    {' · '}{a.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 pt-4 border-t flex flex-col items-center gap-1 text-center">
            {companyInfo?.logo_url && (
              <img src={companyInfo.logo_url} alt="" className="h-6 object-contain mb-1" />
            )}
            <p className="text-xs text-gray-500">
              {companyInfo?.name_en || companyInfo?.name || t('선박 관리 시스템')}
            </p>
            {companyInfo?.website && (
              <p className="text-[11px] text-gray-400">{companyInfo.website.replace(/^https?:\/\//, '')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}