import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCompanyInfo, saveCompanyInfo, uploadCompanyLogo } from '@/services/company-info.service';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

interface FormState {
  name: string;
  address: string;
  phone: string;
  fax: string;
  logo_url: string;
}

const EMPTY_FORM: FormState = { name: '', address: '', phone: '', fax: '', logo_url: '' };

export default function CompanyInfoPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [id, setId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const permissions = usePermissions('company_info');

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  async function load() {
    setLoading(true);
    try {
      const data = await getCompanyInfo();
      if (data) {
        setId(data.id);
        setForm({ name: data.name, address: data.address || '', phone: data.phone || '', fax: data.fax || '', logo_url: data.logo_url || '' });
        setPreviewUrl(data.logo_url || '');
      }
    } catch (e) {
      console.error(e);
      toast({ title: '불러오기 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      toast({ title: 'JPG, PNG, WEBP, SVG 형식만 가능합니다', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: '5MB 이하만 가능합니다', variant: 'destructive' });
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setSelectedFile(null);
    setPreviewUrl('');
    setForm(f => ({ ...f, logo_url: '' }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast({ title: '회사명을 입력하세요', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      let logoUrl = form.logo_url;
      if (selectedFile) {
        const uploaded = await uploadCompanyLogo(selectedFile);
        if (uploaded) logoUrl = uploaded;
      }
      await saveCompanyInfo(id, {
        name: form.name.trim(),
        address: form.address || null,
        phone: form.phone || null,
        fax: form.fax || null,
        logo_url: logoUrl || null,
      });
      toast({ title: '저장 완료' });
      setSelectedFile(null);
      window.dispatchEvent(new CustomEvent('company-info-changed'));
      await load();
    } catch (e) {
      console.error(e);
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">회사 정보 관리</CardTitle>
            {permissions.canEdit && (
              <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving || loading}>
                <Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : (
            <div className="space-y-3 py-2 max-w-md">
              <div className="space-y-1">
                <Label className="text-xs">회사 로고</Label>
                <div className="flex items-center gap-3">
                  {previewUrl ? (
                    <div className="relative">
                      <img src={previewUrl} alt="" className="w-16 h-16 rounded-md object-contain border bg-white" />
                      <button type="button" onClick={handleRemoveLogo} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-md border border-dashed flex items-center justify-center text-gray-300 text-xs">없음</div>
                  )}
                  <Label htmlFor="logo-input" className="cursor-pointer">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 border rounded-md hover:bg-gray-50 text-xs">
                      <Upload className="w-3.5 h-3.5" />로고 업로드
                    </div>
                  </Label>
                  <Input id="logo-input" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml" onChange={handleFileSelect} className="hidden" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">회사명 *</Label>
                <Input className="h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="회사명 입력" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">주소</Label>
                <Input className="h-8 text-sm" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="주소 입력" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">연락처</Label>
                  <Input className="h-8 text-sm" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="전화번호" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">팩스번호</Label>
                  <Input className="h-8 text-sm" value={form.fax} onChange={e => setForm(f => ({ ...f, fax: e.target.value }))} placeholder="팩스번호" />
                </div>
              </div>
              <p className="text-xs text-gray-400 pt-1">여기 등록된 회사명은 선원 승선경력의 "회사 배치" 기록에서 선박관리사명으로 자동 사용됩니다.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
