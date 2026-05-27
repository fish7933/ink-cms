import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Certificate {
  name: string;
  number: string;
  issued_date: string;
  expiry_date: string;
  issuing_authority: string;
}

interface CertificateUploadDialogProps {
  open: boolean;
  onClose: (saved: boolean) => void;
  recommendationId: string;
  crewName: string;
  existingCertificates?: Certificate[];
}

const CERT_TEMPLATES = [
  'STCW Basic Safety Training',
  'STCW Advanced Fire Fighting',
  'STCW Medical First Aid',
  'STCW Proficiency in Survival Craft',
  'Officer of the Watch (Navigation)',
  'Chief Mate Certificate',
  'Master Certificate',
  'Chief Engineer Certificate',
  'GMDSS General Operator Certificate',
  'Medical Fitness Certificate',
  'Continuous Discharge Certificate (Seaman Book)',
  'Passport',
];

export function CertificateUploadDialog({ open, onClose, recommendationId, crewName, existingCertificates = [] }: CertificateUploadDialogProps) {
  const [certificates, setCertificates] = useState<Certificate[]>(
    existingCertificates.length > 0 ? existingCertificates : []
  );
  const [saving, setSaving] = useState(false);

  const addCert = (name?: string) => {
    setCertificates(prev => [...prev, { name: name || '', number: '', issued_date: '', expiry_date: '', issuing_authority: '' }]);
  };

  const updateCert = (idx: number, field: keyof Certificate, value: string) => {
    setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeCert = (idx: number) => {
    setCertificates(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const valid = certificates.filter(c => c.name.trim());
    if (valid.length === 0) { alert('최소 1개의 증서를 입력하세요.'); return; }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('crew_recommendations')
        .update({
          certificates: JSON.stringify(valid),
          updated_at: new Date().toISOString(),
        })
        .eq('id', recommendationId);

      if (error) throw new Error(error.message);
      alert('증서가 저장되었습니다.');
      onClose(true);
    } catch (e) {
      console.error(e);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => !saving && onClose(false)}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>증서 등록 — {crewName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
            선박관리사 승인 후 증서를 등록합니다. 증서명, 번호, 만료일을 정확히 입력해주세요.
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">보유 증서 ({certificates.length})</span>
            <div className="flex gap-2">
              <Select onValueChange={v => addCert(v)}>
                <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="증서 선택 추가" /></SelectTrigger>
                <SelectContent>{CERT_TEMPLATES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => addCert()} className="h-8 text-xs gap-1">
                <Plus className="h-3 w-3" />직접 입력
              </Button>
            </div>
          </div>

          {certificates.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">
              증서를 추가하세요.
            </div>
          ) : (
            <div className="space-y-3">
              {certificates.map((cert, idx) => (
                <div key={idx} className="p-3 border rounded-md bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-600">증서 {idx + 1}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeCert(idx)} className="h-6 w-6 p-0 text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">증서명 *</Label>
                      <Input value={cert.name} onChange={e => updateCert(idx, 'name', e.target.value)} className="h-8 text-xs mt-0.5" placeholder="Certificate Name" />
                    </div>
                    <div>
                      <Label className="text-xs">증서 번호</Label>
                      <Input value={cert.number} onChange={e => updateCert(idx, 'number', e.target.value)} className="h-8 text-xs mt-0.5" placeholder="번호" />
                    </div>
                    <div>
                      <Label className="text-xs">발급 기관</Label>
                      <Input value={cert.issuing_authority} onChange={e => updateCert(idx, 'issuing_authority', e.target.value)} className="h-8 text-xs mt-0.5" placeholder="발급 기관" />
                    </div>
                    <div>
                      <Label className="text-xs">발급일</Label>
                      <Input type="date" value={cert.issued_date} onChange={e => updateCert(idx, 'issued_date', e.target.value)} className="h-8 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-xs">만료일</Label>
                      <Input type="date" value={cert.expiry_date} onChange={e => updateCert(idx, 'expiry_date', e.target.value)} className="h-8 text-xs mt-0.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} disabled={saving}>취소</Button>
          <Button onClick={handleSave} disabled={saving || certificates.length === 0}>
            {saving ? '저장 중...' : '증서 저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}