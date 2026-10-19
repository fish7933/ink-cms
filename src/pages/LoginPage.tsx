import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/lib/store';
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
          <div className="mt-6 space-y-2 text-sm text-gray-600">
            <p className="font-semibold">{t('테스트 계정:')}</p>
            <div className="space-y-1 text-xs">
              <p>{t('• 선주사: owner1 / password123')}</p>
              <p>{t('• 관리자: manager1 / password123')}</p>
              <p>{t('• 매닝사: manning1 / password123')}</p>
              <p>{t('• 선원: crew1 / password123')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}