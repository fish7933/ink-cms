import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HardDrive, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getFileStorageSettings, saveFileStorageSettings } from '@/services/file-storage-settings.service';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

const emptyForm = {
  endpoint_url: '', region: '', bucket: '', access_key_id: '', secret_access_key: '',
  path_style_access: true, is_active: false, memo: '',
};

// 외부 S3 호환 저장소(엔드포인트/버킷/키) 연결 정보를 저장해두는 화면 — 지금은 이 정보를
// 보관만 하고, 실제 업로드는 계속 이 시스템(Supabase Storage)으로 간다. 나중에 실제 외부
// 파일서버가 준비되면 여기 저장된 정보로 연동 작업을 진행한다.
export default function FileStorageSettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('file_storage_settings');
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => {
    getFileStorageSettings().then(s => {
      if (s) {
        setSettingsId(s.id);
        setForm({
          endpoint_url: s.endpoint_url || '', region: s.region || '', bucket: s.bucket || '',
          access_key_id: s.access_key_id || '', secret_access_key: s.secret_access_key || '',
          path_style_access: s.path_style_access, is_active: s.is_active, memo: s.memo || '',
        });
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setError('');
    try {
      setSaving(true);
      const me = await getCurrentUser();
      const saved = await saveFileStorageSettings({
        provider: 's3_compatible',
        endpoint_url: form.endpoint_url.trim() || null,
        region: form.region.trim() || null,
        bucket: form.bucket.trim() || null,
        access_key_id: form.access_key_id.trim() || null,
        secret_access_key: form.secret_access_key.trim() || null,
        path_style_access: form.path_style_access,
        is_active: form.is_active,
        memo: form.memo.trim() || null,
        updated_by: me?.id || null,
      });
      setSettingsId(saved.id);
      toast({ title: '저장되었습니다.' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <HardDrive className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">파일 저장소 설정</h1>
          <p className="text-sm text-gray-500">외부 S3 호환 저장소 연결 정보를 미리 저장해둘 수 있습니다.</p>
        </div>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          지금은 이 정보를 저장만 해두고, 실제 업로드는 계속 이 시스템(Supabase)에 저장됩니다.
          외부 저장소가 준비되면 여기 입력된 정보로 관리자가 연동 작업을 진행합니다.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{settingsId ? '연결 정보' : '연결 정보 등록'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">엔드포인트 URL</Label><Input value={form.endpoint_url} onChange={e => setForm({ ...form, endpoint_url: e.target.value })} placeholder="https://s3.ap-northeast-2.amazonaws.com" className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">리전</Label><Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="ap-northeast-2" className="h-9 text-sm" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">버킷명</Label><Input value={form.bucket} onChange={e => setForm({ ...form, bucket: e.target.value })} className="h-9 text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Access Key ID</Label><Input value={form.access_key_id} onChange={e => setForm({ ...form, access_key_id: e.target.value })} className="h-9 text-sm font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Secret Access Key</Label><Input type="password" value={form.secret_access_key} onChange={e => setForm({ ...form, secret_access_key: e.target.value })} className="h-9 text-sm font-mono" /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={form.path_style_access} onCheckedChange={c => setForm({ ...form, path_style_access: c === true })} />
            <span className="text-sm">Path-style 접근 방식 사용 (MinIO 등 일부 S3 호환 스토리지에서 필요)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={form.is_active} onCheckedChange={c => setForm({ ...form, is_active: c === true })} />
            <span className="text-sm">사용 예정으로 표시 <span className="text-gray-400 font-normal">(체크해도 실제 업로드 경로는 아직 바뀌지 않습니다)</span></span>
          </label>
          <div className="space-y-1.5"><Label className="text-xs">메모</Label><Textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2} className="text-sm resize-none" /></div>
          {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          {permissions.canEdit && (
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
