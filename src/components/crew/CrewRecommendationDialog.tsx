import { useState, useEffect } from 'react';
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

export function CrewRecommendationDialog({
  open,
  onClose,
  jobPostingGroupId,
  companyId,
  companyName,
  fleetId,
  fleetName,
  shipId,
  shipName,
  rankId,
  rankCode,
  rankName,
  salary,
  currency,
  contractMonths,
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
    remarks: '',
  });

  const hasJobPostingInfo = Boolean(jobPostingGroupId && companyId && shipId);

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
        remarks: '',
      });
      setUploadedFiles([]);
    }
  }, [open, rankId, salary, currency, contractMonths]);

  const loadInitialData = async () => {
    try {
      const { data: ranksData } = await supabase
        .from('ranks')
        .select('*')
        .order('display_order');
      if (ranksData) setRanks(ranksData);

      const nationalitiesData = await getNationalities(true);
      setNationalities(nationalitiesData);

      const currentUser = await getCurrentUser();
      if (currentUser && currentUser.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', currentUser.company_id)
          .single();

        if (companyData) {
          const company = companyData as Company;
          if (company.country) {
            const companyCountry = company.country;
            const matchedNationality = nationalitiesData.find(n =>
              n.country_code === companyCountry ||
              n.country_name_en === companyCountry ||
              n.country_name_ko === companyCountry
            );
            if (matchedNationality) {
              setFormData(prev => ({ ...prev, nationality_id: matchedNationality.country_name_ko }));
            } else {
              const looseMatch = nationalitiesData.find(n =>
                n.country_name_en.toLowerCase().includes(companyCountry.toLowerCase()) ||
                n.country_name_ko.includes(companyCountry)
              );
              if (looseMatch) {
                setFormData(prev => ({ ...prev, nationality_id: looseMatch.country_name_ko }));
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(file => {
        if (file.size > 10 * 1024 * 1024) {
          alert(`${file.name}은(는) 10MB를 초과합니다.`);
          return false;
        }
        return true;
      });
      setUploadedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFilesToStorage = async (files: File[]): Promise<string[]> => {
    const uploadedPaths: string[] = [];
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `crew-recommendations/${fileName}`;
      const { error } = await supabase.storage.from('documents').upload(filePath, file);
      if (error) {
        console.error('File upload error:', error);
        throw new Error(`파일 업로드 실패: ${file.name}`);
      }
      uploadedPaths.push(filePath);
    }
    return uploadedPaths;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.crew_name.trim()) { alert('선원 성명을 입력해주세요.'); return; }
    if (!formData.crew_birth_date) { alert('선원 생년월일을 입력해주세요.'); return; }
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
      if (!currentUser || !currentUser.company_id) {
        throw new Error('사용자 정보를 찾을 수 없습니다.');
      }

      const uploadedFilePaths = await uploadFilesToStorage(uploadedFiles);

      const resumeFilesData = uploadedFiles.map((file, index) => ({
        name: file.name,
        path: uploadedFilePaths[index],
        size: file.size,
        type: file.type,
      }));

      // UUID 타입 ID는 String으로, null이면 제외
      const toStr = (val: string | undefined | null): string | null => {
        if (!val) return null;
        return String(val);
      };

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
        remarks: formData.remarks.trim() || null,
        status: 'pending',
        created_by: toStr(currentUser.id),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // null 값 제거
      const cleanedData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(insertData)) {
        if (value !== null && value !== undefined) {
          cleanedData[key] = value;
        }
      }

      const { error } = await supabase
        .from('crew_recommendations')
        .insert(cleanedData)
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        throw new Error(error.message || '선원 추천 제출에 실패했습니다.');
      }

      alert('선원 추천이 성공적으로 제출되었습니다.');
      onClose(true);
    } catch (error) {
      console.error('Failed to submit crew recommendation:', error);
      alert(error instanceof Error ? error.message : '선원 추천 제출에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const selectedRank = ranks.find(r => r.id === formData.selected_rank_id);

  const departmentColors = {
    deck: 'bg-blue-100 text-blue-700 border-blue-300',
    engine: 'bg-green-100 text-green-700 border-green-300',
    catering: 'bg-orange-100 text-orange-700 border-orange-300',
  };

  return (
    <Dialog open={open} onOpenChange={() => !uploading && onClose(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>선원 추천</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 선원 기본 정보 */}
          <div>
            <Label className="text-sm font-semibold">선원 기본 정보</Label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">성명 *</Label>
                <Input
                  type="text"
                  value={formData.crew_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, crew_name: e.target.value }))}
                  placeholder="선원 성명"
                  className="h-9 mt-1"
                  disabled={uploading}
                />
              </div>
              <div>
                <Label className="text-xs">생년월일 *</Label>
                <Input
                  type="date"
                  value={formData.crew_birth_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, crew_birth_date: e.target.value }))}
                  className="h-9 mt-1"
                  disabled={uploading}
                />
              </div>
              <div>
                <Label className="text-xs">국적 *</Label>
                <Select
                  value={formData.nationality_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, nationality_id: value }))}
                  disabled={uploading}
                >
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder="국적 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {nationalities.map(nat => (
                      <SelectItem key={nat.id} value={nat.country_name_ko}>
                        {nat.country_name_ko} ({nat.country_name_en})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* 선박 정보 */}
          <div>
            <Label className="text-sm font-semibold">선박 정보</Label>
            <div className="mt-2 p-3 bg-gray-50 rounded-md space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">선주사:</span>
                <span className="text-sm font-medium">{companyName}</span>
              </div>
              {fleetName && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">선대:</span>
                  <span className="text-sm font-medium">{fleetName}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">선박:</span>
                <span className="text-sm font-medium">{shipName}</span>
              </div>
            </div>
          </div>

          {/* 직급 정보 */}
          <div>
            <Label className="text-sm font-semibold">직급 정보</Label>
            {rankId ? (
              <div className="mt-2 p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={departmentColors[selectedRank?.department as keyof typeof departmentColors] || ''}>
                    {rankCode}
                  </Badge>
                  <span className="text-sm">{rankName}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">제시 급여:</span>
                    <span className="ml-1 font-medium">{currency} {salary?.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">제시 계약:</span>
                    <span className="ml-1 font-medium">{contractMonths}개월</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <Label className="text-xs">직급 *</Label>
                <Select
                  value={formData.selected_rank_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, selected_rank_id: value }))}
                  disabled={uploading}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="직급 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {ranks.map(rank => (
                      <SelectItem key={rank.id} value={String(rank.id)}>
                        {rank.rank_code} - {rank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 희망 조건 */}
          <div>
            <Label className="text-sm font-semibold">희망 조건</Label>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">희망 급여 *</Label>
                <Input
                  type="number"
                  value={formData.desired_salary || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, desired_salary: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  className="h-9"
                  disabled={uploading}
                />
              </div>
              <div>
                <Label className="text-xs">통화</Label>
                <Select
                  value={formData.desired_currency}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, desired_currency: value }))}
                  disabled={uploading}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="KRW">KRW</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">희망 계약 월수 *</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.desired_contract_months || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, desired_contract_months: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  className="h-9"
                  disabled={uploading}
                />
              </div>
            </div>
          </div>

          {/* 출국 가능일 */}
          <div>
            <Label>출국 가능일 *</Label>
            <Input
              type="date"
              value={formData.available_date}
              onChange={(e) => setFormData(prev => ({ ...prev, available_date: e.target.value }))}
              className="mt-1"
              disabled={uploading}
            />
          </div>

          {/* 비고 */}
          <div>
            <Label>비고</Label>
            <Textarea
              value={formData.remarks}
              onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
              placeholder="추가 정보나 특이사항을 입력하세요"
              rows={3}
              className="mt-1"
              disabled={uploading}
            />
          </div>

          {/* 이력서 첨부 */}
          <div>
            <Label>선원 이력서 *</Label>
            <div className="mt-1 space-y-2">
              <div className="border-2 border-dashed rounded-md p-4 text-center">
                <input
                  type="file"
                  id="resume-upload"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
                <label
                  htmlFor="resume-upload"
                  className={`cursor-pointer flex flex-col items-center gap-2 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <Upload className="w-8 h-8 text-gray-400" />
                  <div className="text-sm text-gray-600">
                    <span className="text-blue-600 hover:text-blue-700 font-medium">파일 선택</span>
                    {' '}또는 드래그 앤 드롭
                  </div>
                  <div className="text-xs text-gray-500">PDF, DOC, DOCX, JPG, PNG (최대 10MB)</div>
                </label>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="text-sm truncate">{file.name}</div>
                        <div className="text-xs text-gray-500 shrink-0">({(file.size / 1024).toFixed(1)} KB)</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="h-7 w-7 p-0 shrink-0"
                        disabled={uploading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onClose(false)} disabled={uploading}>
              취소
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? '제출 중...' : '선원 추천 제출'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}