import { useState, useEffect } from 'react';
import { msg } from '@/lib/messages';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { getNationalities } from '@/services/nationality.service';
import type { Rank } from '@/types/models';
import type { Nationality } from '@/types/nationality';

interface Company {
  id: string;
  name: string;
  country?: string;
  [key: string]: unknown;
}

interface CrewRecommendationDialogProps {
  open: boolean;
  onClose: (saved: boolean) => void;
  jobPostingGroupId?: string;
  companyId?: string;
  companyName?: string;
  fleetId?: string;
  fleetName?: string;
  shipId?: string;
  shipName?: string;
  rankId?: string;
  rankCode?: string;
  rankName?: string;
  salary?: number;
  currency?: string;
  contractMonths?: number;
}

const EDUCATION_OPTIONS = [
  '고등학교 졸업', '해양고등학교 졸업', '전문대학 졸업',
  '해양대학교 졸업', '대학교 졸업', '대학원 졸업', '기타',
];

export function CrewRecommendationDialog({
  open, onClose,
  jobPostingGroupId, companyId, companyName,
  fleetId, fleetName, shipId, shipName,
  rankId, rankCode, rankName,
  salary, currency, contractMonths,
}: CrewRecommendationDialogProps) {
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    crew_name: '',
    crew_birth_date: '',
    nationality_id: '',
    selected_rank_id: rankId || '',
    desired_salary: salary || 0,
    desired_currency: currency || 'USD',
    desired_contract_months: contractMonths || 0,
    available_date: '',
    education: '',
    remarks: '',
  });

  useEffect(() => {
    if (open) {
      loadInitialData();
      setFormData({
        crew_name: '',
        crew_birth_date: '',
        nationality_id: '',
        selected_rank_id: rankId || '',
        desired_salary: salary || 0,
        desired_currency: currency || 'USD',
        desired_contract_months: contractMonths || 0,
        available_date: '',
        education: '',
        remarks: '',
      });
      setUploadedFiles([]);
    }
  }, [open, rankId, salary, currency, contractMonths]);

  const loadInitialData = async () => {
    try {
      const { data: ranksData } = await supabase.from('ranks').select('*').order('display_order');
      if (ranksData) setRanks(ranksData);

      const nationalitiesData = await getNationalities(true);
      setNationalities(nationalitiesData);

      const currentUser = await getCurrentUser();
      if (currentUser?.company_id) {
        const { data: companyData } = await supabase.from('companies').select('*').eq('id', currentUser.company_id).single();
        if (companyData) {
          const country = (companyData as Company).country;
          if (country) {
            const match = nationalitiesData.find(n =>
              n.country_code === country || n.country_name_en === country ||
              n.country_name_ko === country || n.country_name_en.toLowerCase().includes(country.toLowerCase())
            );
            if (match) setFormData(prev => ({ ...prev, nationality_id: match.country_name_ko }));
          }
        }
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => {
        if (f.size > 10 * 1024 * 1024) { alert(`${f.name}은 10MB를 초과합니다.`); return false; }
        return true;
      });
      setUploadedFiles(prev => [...prev, ...files]);
    }
  };

  const removeFile = (idx: number) => setUploadedFiles(prev => prev.filter((_, i) => i !== idx));

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const paths: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `crew-recommendations/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw new Error(msg.file.uploadFailed(file.name));
      paths.push(path);
    }
    return paths;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.crew_name.trim()) { alert('선원 성명을 입력해주세요.'); return; }
    if (!formData.crew_birth_date) { alert('생년월일을 입력해주세요.'); return; }
    if (!formData.nationality_id) { alert('국적을 선택해주세요.'); return; }
    if (!formData.selected_rank_id) { alert('직급을 선택해주세요.'); return; }
    if (!formData.available_date) { alert('출국 가능일을 입력해주세요.'); return; }
    if (!formData.desired_salary || formData.desired_salary <= 0) { alert('희망 급여를 입력해주세요.'); return; }
    if (!formData.desired_contract_months || formData.desired_contract_months <= 0) { alert('희망 계약 기간을 입력해주세요.'); return; }
    if (!hasJobPostingInfo) { alert('구인 공고 정보가 없습니다.'); return; }
    if (uploadedFiles.length === 0) { alert('선원 이력서를 첨부해주세요.'); return; }

    try {
      setUploading(true);
      const currentUser = await getCurrentUser();
      if (!currentUser?.company_id) throw new Error('사용자 정보를 찾을 수 없습니다.');

      const paths = await uploadFiles(uploadedFiles);
      const resumeFilesData = uploadedFiles.map((f, i) => ({ name: f.name, path: paths[i], size: f.size, type: f.type }));

      const toStr = (v: string | undefined | null) => v ? String(v) : null;

      const insertData: Record<string, unknown> = {
        crew_name: formData.crew_name.trim(),
        crew_birth_date: formData.crew_birth_date,
        nationality: formData.nationality_id,
        rank_id: toStr(formData.selected_rank_id),
        manning_agency_id: toStr(currentUser.company_id),
        company_id: toStr(companyId),
        fleet_id: toStr(fleetId),
        ship_id: toStr(shipId),
        job_posting_group_id: toStr(jobPostingGroupId),
        available_date: formData.available_date,
        desired_salary: formData.desired_salary,
        desired_currency: formData.desired_currency,
        desired_contract_months: formData.desired_contract_months,
        resume_files: JSON.stringify(resumeFilesData),
        education: formData.education || null,
        remarks: formData.remarks.trim() || null,
        status: 'pending',
        created_by: toStr(currentUser.id),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(insertData)) {
        if (v !== null && v !== undefined) cleaned[k] = v;
      }

      const { error } = await supabase.from('crew_recommendations').insert(cleaned).select().single();
      if (error) throw new Error(error.message);

      alert('선원 추천이 성공적으로 제출되었습니다.');
      onClose(true);
    } catch (error) {
      console.error('Failed to submit crew recommendation:', error);
      alert(error instanceof Error ? error.message : '선원 추천 제출에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const hasJobPostingInfo = Boolean(jobPostingGroupId && companyId && shipId);
  const selectedRank = ranks.find(r => r.id === formData.selected_rank_id);
  const deptColors: Record<string, string> = {
    deck: 'bg-blue-100 text-blue-700 border-blue-300',
    engine: 'bg-green-100 text-green-700 border-green-300',
    catering: 'bg-orange-100 text-orange-700 border-orange-300',
  };

  return (
    <Dialog open={open} onOpenChange={() => !uploading && onClose(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>선원 추천</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* 선원 기본 정보 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-gray-700 border-b pb-1">선원 기본 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">성명 *</Label><Input value={formData.crew_name} onChange={e => setFormData(p => ({ ...p, crew_name: e.target.value }))} placeholder="Full Name" className="h-9 mt-1" disabled={uploading} /></div>
              <div><Label className="text-xs">생년월일 *</Label><Input type="date" value={formData.crew_birth_date} onChange={e => setFormData(p => ({ ...p, crew_birth_date: e.target.value }))} className="h-9 mt-1" disabled={uploading} /></div>
              <div>
                <Label className="text-xs">국적 *</Label>
                <Select value={formData.nationality_id} onValueChange={v => setFormData(p => ({ ...p, nationality_id: v }))} disabled={uploading}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="국적 선택" /></SelectTrigger>
                  <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_name_ko}>{n.country_name_ko} ({n.country_name_en})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">최종 학력</Label>
                <Select value={formData.education} onValueChange={v => setFormData(p => ({ ...p, education: v }))} disabled={uploading}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="학력 선택" /></SelectTrigger>
                  <SelectContent>{EDUCATION_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* 선박 정보 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-gray-700 border-b pb-1">선박 정보</h3>
            <div className="p-3 bg-gray-50 rounded-md space-y-1 text-sm">
              <div><span className="text-gray-500">선주사:</span> <span className="font-medium">{companyName}</span></div>
              {fleetName && <div><span className="text-gray-500">선대:</span> <span className="font-medium">{fleetName}</span></div>}
              <div><span className="text-gray-500">선박:</span> <span className="font-medium">{shipName}</span></div>
            </div>
          </div>

          {/* 직급 정보 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-gray-700 border-b pb-1">직급 정보</h3>
            {rankId ? (
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={deptColors[selectedRank?.department || ''] || ''}>{rankCode}</Badge>
                  <span className="text-sm">{rankName}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">제시 급여:</span> <span className="font-medium">{currency} {salary?.toLocaleString()}</span></div>
                  <div><span className="text-gray-500">계약 기간:</span> <span className="font-medium">{contractMonths}개월</span></div>
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-xs">직급 *</Label>
                <Select value={formData.selected_rank_id} onValueChange={v => setFormData(p => ({ ...p, selected_rank_id: v }))} disabled={uploading}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                  <SelectContent>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.rank_code} - {r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 희망 조건 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 text-gray-700 border-b pb-1">희망 조건</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">희망 급여 *</Label><Input type="number" value={formData.desired_salary || ''} onChange={e => setFormData(p => ({ ...p, desired_salary: parseFloat(e.target.value) || 0 }))} className="h-9 mt-1" placeholder="0" disabled={uploading} /></div>
              <div>
                <Label className="text-xs">통화</Label>
                <Select value={formData.desired_currency} onValueChange={v => setFormData(p => ({ ...p, desired_currency: v }))} disabled={uploading}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="KRW">KRW</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">희망 계약 월수 *</Label><Input type="number" min="1" value={formData.desired_contract_months || ''} onChange={e => setFormData(p => ({ ...p, desired_contract_months: parseInt(e.target.value) || 0 }))} className="h-9 mt-1" placeholder="0" disabled={uploading} /></div>
            </div>
          </div>

          {/* 출국 가능일 */}
          <div>
            <Label>출국 가능일 *</Label>
            <Input type="date" value={formData.available_date} onChange={e => setFormData(p => ({ ...p, available_date: e.target.value }))} className="mt-1" disabled={uploading} />
          </div>

          {/* 비고 */}
          <div>
            <Label>비고</Label>
            <Textarea value={formData.remarks} onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))} placeholder="추가 정보나 특이사항을 입력하세요" rows={3} className="mt-1" disabled={uploading} />
          </div>

          {/* 이력서 첨부 */}
          <div>
            <Label>선원 이력서 *</Label>
            <div className="mt-1 space-y-2">
              <div className="border-2 border-dashed rounded-md p-4 text-center">
                <input type="file" id="resume-upload" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" disabled={uploading} />
                <label htmlFor="resume-upload" className={`cursor-pointer flex flex-col items-center gap-2 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Upload className="w-8 h-8 text-gray-400" />
                  <div className="text-sm text-gray-600"><span className="text-blue-600 font-medium">파일 선택</span> 또는 드래그 앤 드롭</div>
                  <div className="text-xs text-gray-500">PDF, DOC, DOCX, JPG, PNG (최대 10MB)</div>
                </label>
              </div>
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm truncate">{file.name}</span>
                        <span className="text-xs text-gray-500 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(idx)} className="h-7 w-7 p-0 shrink-0" disabled={uploading}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800">
            ※ 증서 등록은 선박관리사 승인 후 가능합니다.
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onClose(false)} disabled={uploading}>취소</Button>
            <Button type="submit" disabled={uploading}>{uploading ? '제출 중...' : '선원 추천 제출'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}