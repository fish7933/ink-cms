import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { msg } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Upload, X, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { getCurrentUser } from '@/lib/store';
import { getNationalities } from '@/services/nationality.service';
import { jobPostingGroupService } from '@/services/job-posting-group.service';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { useTabContext } from '@/contexts/TabContext';
import type { Rank, JobPostingGroupWithDetails, CrewRecommendationResumeFile } from '@/types/models';
import type { Nationality } from '@/types/nationality';

const EDUCATION_OPTIONS = [
  '고등학교 졸업', '해양고등학교 졸업', '전문대학 졸업',
  '해양대학교 졸업', '대학교 졸업', '대학원 졸업', '기타',
];

const DEPT_COLORS: Record<string, string> = {
  deck: 'bg-blue-100 text-blue-700 border-blue-300',
  engine: 'bg-green-100 text-green-700 border-green-300',
  catering: 'bg-orange-100 text-orange-700 border-orange-300',
};

export default function CrewRecommendationPage() {
  const { groupId, rankId } = useParams<{ groupId: string; rankId: string }>();
  const [searchParams] = useSearchParams();
  const sourceRecommendationId = searchParams.get('from');
  const { activeTabId, closeTab } = useTabContext();

  const [posting, setPosting] = useState<JobPostingGroupWithDetails | null>(null);
  const [loadingPosting, setLoadingPosting] = useState(true);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [carriedResumeFiles, setCarriedResumeFiles] = useState<CrewRecommendationResumeFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    crew_name: '',
    crew_birth_date: '',
    nationality_id: '',
    available_date: '',
    education: '',
    remarks: '',
  });

  const finish = () => {
    if (activeTabId) closeTab(activeTabId);
  };

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      setLoadingPosting(true);
      const data = await jobPostingGroupService.getById(groupId);
      setPosting(data);
      setLoadingPosting(false);
    })();
  }, [groupId]);

  // 재추천은 새로 추천하는 것과 달리 이전에 추천했던 선원의 정보를 그대로 이어받는다.
  useEffect(() => {
    if (!sourceRecommendationId) return;
    (async () => {
      const source = await crewRecommendationService.getById(sourceRecommendationId);
      if (!source) return;
      setFormData({
        crew_name: source.crew_name,
        crew_birth_date: source.crew_birth_date,
        nationality_id: source.nationality || '',
        available_date: source.available_date,
        education: source.education || '',
        remarks: source.remarks || '',
      });
      setCarriedResumeFiles(source.resume_files || []);
    })();
  }, [sourceRecommendationId]);

  useEffect(() => {
    (async () => {
      const { data: ranksData } = await supabase.from('ranks').select('*');
      if (ranksData) setRanks(sortRanksByDisplayOrder(ranksData));

      const nationalitiesData = await getNationalities(true);
      setNationalities(nationalitiesData);

      // 재추천은 이전 추천의 국적을 그대로 이어받으므로, 회사 기본 국적으로 덮어쓰지 않는다.
      if (sourceRecommendationId) return;

      const currentUser = await getCurrentUser();
      if (currentUser?.company_id) {
        const { data: companyData } = await supabase.from('companies').select('*').eq('id', currentUser.company_id).single();
        const country = (companyData as { country?: string } | null)?.country;
        if (country) {
          const match = nationalitiesData.find(n =>
            n.country_code === country || n.country_name_en === country ||
            n.country_name_ko === country || n.country_name_en.toLowerCase().includes(country.toLowerCase())
          );
          if (match) setFormData(prev => ({ ...prev, nationality_id: match.country_code }));
        }
      }
    })();
  }, [sourceRecommendationId]);

  const rankDetail = posting?.ranks.find(r => r.rank_id === rankId);
  const selectedRank = ranks.find(r => r.id === rankId);

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
    if (!posting || !rankDetail) { alert('구인 공고 정보가 없습니다.'); return; }
    if (!formData.crew_name.trim()) { alert('선원 성명을 입력해주세요.'); return; }
    if (!formData.crew_birth_date) { alert('생년월일을 입력해주세요.'); return; }
    if (!formData.nationality_id) { alert('국적을 선택해주세요.'); return; }
    if (!formData.available_date) { alert('출국 가능일을 입력해주세요.'); return; }
    if (uploadedFiles.length === 0 && carriedResumeFiles.length === 0) { alert('선원 이력서를 첨부해주세요.'); return; }

    try {
      setUploading(true);
      const currentUser = await getCurrentUser();
      if (!currentUser?.company_id) throw new Error('사용자 정보를 찾을 수 없습니다.');

      const paths = await uploadFiles(uploadedFiles);
      const resumeFilesData = [
        ...carriedResumeFiles,
        ...uploadedFiles.map((f, i) => ({ name: f.name, path: paths[i], size: f.size, type: f.type })),
      ];

      const { error } = await supabase.from('crew_recommendations').insert({
        crew_name: formData.crew_name.trim(),
        crew_birth_date: formData.crew_birth_date,
        nationality: formData.nationality_id,
        rank_id: rankDetail.rank_id,
        manning_agency_id: currentUser.company_id,
        company_id: posting.company_id,
        fleet_id: posting.fleet_id,
        ship_id: posting.ship_id,
        job_posting_group_id: posting.id,
        available_date: formData.available_date,
        desired_salary: rankDetail.salary_amount,
        desired_currency: rankDetail.salary_currency,
        desired_contract_months: rankDetail.contract_months,
        resume_files: JSON.stringify(resumeFilesData),
        education: formData.education || null,
        remarks: formData.remarks.trim() || null,
        status: 'pending',
        created_by: currentUser.id,
      }).select().single();
      if (error) throw new Error(error.message);

      alert('선원 추천이 성공적으로 제출되었습니다.');
      window.dispatchEvent(new CustomEvent('job-posting-data-changed'));
      finish();
    } catch (error) {
      console.error('Failed to submit crew recommendation:', error);
      alert(error instanceof Error ? error.message : '선원 추천 제출에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  if (loadingPosting) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!posting || !rankDetail) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">구인 공고 정보를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <div className="mb-3">
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1" onClick={finish}>
          <ArrowLeft className="w-4 h-4" />취소
        </Button>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{sourceRecommendationId ? '선원 재추천' : '선원 추천'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {sourceRecommendationId && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
                이전에 추천했던 선원의 정보를 그대로 불러왔습니다. 필요한 내용을 확인/수정한 뒤 다시 제출해주세요.
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold mb-2 text-gray-700 border-b pb-1">선원 기본 정보</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">성명 *</Label><Input value={formData.crew_name} onChange={e => setFormData(p => ({ ...p, crew_name: e.target.value }))} placeholder="Full Name" className="h-9 mt-1" disabled={uploading} /></div>
                <div><Label className="text-xs">생년월일 *</Label><Input type="date" value={formData.crew_birth_date} onChange={e => setFormData(p => ({ ...p, crew_birth_date: e.target.value }))} className="h-9 mt-1" disabled={uploading} /></div>
                <div>
                  <Label className="text-xs">국적 *</Label>
                  <Select value={formData.nationality_id} onValueChange={v => setFormData(p => ({ ...p, nationality_id: v }))} disabled={uploading}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="국적 선택" /></SelectTrigger>
                    <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_code}>{n.country_name_ko} ({n.country_name_en})</SelectItem>)}</SelectContent>
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

            <div>
              <h3 className="text-sm font-semibold mb-2 text-gray-700 border-b pb-1">선박 정보</h3>
              <div className="p-3 bg-gray-50 rounded-md space-y-1 text-sm">
                <div><span className="text-gray-500">선주사:</span> <span className="font-medium">{posting.company_name}</span></div>
                {posting.fleet_name && <div><span className="text-gray-500">선대:</span> <span className="font-medium">{posting.fleet_name}</span></div>}
                <div><span className="text-gray-500">선박:</span> <span className="font-medium">{posting.ship_name}</span></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 text-gray-700 border-b pb-1">직급 정보</h3>
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={DEPT_COLORS[selectedRank?.department || ''] || ''}>{rankDetail.rank_code}</Badge>
                  <span className="text-sm">{rankDetail.rank_name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">제시 급여:</span> <span className="font-medium">{rankDetail.salary_currency} {rankDetail.salary_amount?.toLocaleString()}</span></div>
                  <div><span className="text-gray-500">계약 기간:</span> <span className="font-medium">{rankDetail.contract_months}개월</span></div>
                </div>
              </div>
            </div>

            <div>
              <Label>출국 가능일 *</Label>
              <Input type="date" value={formData.available_date} onChange={e => setFormData(p => ({ ...p, available_date: e.target.value }))} className="mt-1" disabled={uploading} />
            </div>

            <div>
              <Label>비고</Label>
              <Textarea value={formData.remarks} onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))} placeholder="추가 정보나 특이사항을 입력하세요" rows={3} className="mt-1" disabled={uploading} />
            </div>

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
                {carriedResumeFiles.length > 0 && (
                  <div className="space-y-2">
                    {carriedResumeFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-sm truncate">{file.name}</span>
                          <span className="text-xs text-gray-500 shrink-0">({(file.size / 1024).toFixed(1)} KB · 이전 첨부)</span>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setCarriedResumeFiles(prev => prev.filter((_, i) => i !== idx))} className="h-7 w-7 p-0 shrink-0" disabled={uploading}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
              <Button type="button" variant="outline" onClick={finish} disabled={uploading}>취소</Button>
              <Button type="submit" disabled={uploading}>{uploading ? '제출 중...' : '선원 추천 제출'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
