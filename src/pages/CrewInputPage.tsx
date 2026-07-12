import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Upload, User, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { crewService } from '@/services/crew.service';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { getCertificateTypes } from '@/services/certificate-type.service';
import { getCertificateCategories } from '@/services/certificate-category.service';
import { getNationalities } from '@/services/nationality.service';
import type { CrewRecommendationWithDetails, Rank } from '@/types/models';
import type { CertificateType } from '@/types/certificate-type';
import type { CertificateCategory } from '@/types/certificate-category';
import type { Nationality } from '@/types/nationality';
import { useTabContext } from '@/contexts/TabContext';

interface Certificate {
  name: string;
  number: string;
  issued_date: string;
  expiry_date: string;
  issuing_authority: string;
  no_expiry: boolean;
  file_path?: string;
  file_name?: string;
}

export default function CrewInputPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { recommendationId } = useParams<{ recommendationId?: string }>();
  const { activeTabId, closeTab, updateTab } = useTabContext();

  const [recommendation, setRecommendation] = useState<CrewRecommendationWithDetails | null>(
    (location.state?.recommendation as CrewRecommendationWithDetails) || null
  );
  const [loadingRec, setLoadingRec] = useState(Boolean(recommendationId));

  const finish = () => {
    if (activeTabId) closeTab(activeTabId);
    else navigate('/my-recommendations');
  };

  useEffect(() => {
    if (!recommendationId) { setLoadingRec(false); return; }
    (async () => {
      setLoadingRec(true);
      const rec = await crewRecommendationService.getById(recommendationId);
      setRecommendation(rec);
      setLoadingRec(false);
    })();
  }, [recommendationId]);

  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certFiles, setCertFiles] = useState<Record<number, File>>({});
  const [certificateTypes, setCertificateTypes] = useState<CertificateType[]>([]);
  const [certificateCategories, setCertificateCategories] = useState<CertificateCategory[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    rank_id: '',
    nationality: '',
    date_of_birth: '',
    passport_number: '',
    seaman_book_number: '',
    contact_phone: '',
    contact_email: '',
    emergency_contact: '',
    photo_url: '',
    height: '',
    weight: '',
    blood_type: 'none',
    shoe_size: '',
    coverall_size: '',
    place_of_birth: '',
    next_of_kin: '',
    next_of_kin_relationship: '',
    next_of_kin_contact: '',
    owner_id: '',
    fleet_id: '',
    current_ship_id: '',
    manning_agency_id: '',
  });

  useEffect(() => {
    if (loadingRec) return;
    if (!recommendation) {
      toast({ title: '잘못된 접근', description: '추천 선원 정보가 없습니다.', variant: 'destructive' });
      finish();
      return;
    }
    // 결재 승인 시 등록 선원 목록에 자동 반영되므로, 이미 등록된 건이면
    // 여권/증서 등 세부 정보를 보완할 수 있도록 해당 선원의 수정 화면으로 이동한다.
    if (recommendation.crew_member_id) {
      toast({ title: '이미 등록된 선원', description: '세부 정보를 보완할 수 있도록 선원 정보 화면으로 이동합니다.' });
      const path = `/crew/${recommendation.crew_member_id}`;
      if (activeTabId) updateTab(activeTabId, { path, title: '선원 정보' });
      navigate(path, { replace: true });
      return;
    }
    loadRanks();
    getCertificateTypes(true).then(setCertificateTypes).catch(console.error);
    getCertificateCategories(true).then(setCertificateCategories).catch(console.error);
    getNationalities().then(setNationalities).catch(console.error);
    setFormData(prev => ({
      ...prev,
      name: recommendation.crew_name,
      rank_id: recommendation.rank_id,
      date_of_birth: recommendation.crew_birth_date.split('T')[0],
      owner_id: recommendation.company_id || '',
      fleet_id: recommendation.fleet_id || '',
      current_ship_id: recommendation.ship_id || '',
      manning_agency_id: recommendation.manning_agency_id,
    }));

    // 기존 증서 로드
    if (recommendation.certificates) {
      try {
        const certs = typeof recommendation.certificates === 'string'
          ? JSON.parse(recommendation.certificates)
          : recommendation.certificates;
        if (Array.isArray(certs)) setCertificates(certs);
      } catch (e) { console.error(e); }
    }
  }, [recommendation, loadingRec]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRanks = async () => {
    const { data } = await supabase.from('ranks').select('*');
    if (data) setRanks(sortRanksByDisplayOrder(data));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    setFormData(prev => ({ ...prev, photo_url: '' }));
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!selectedFile) return null;
    try {
      const ext = selectedFile.name.split('.').pop();
      const path = `crew-photos/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from('crew-documents').upload(path, selectedFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('crew-documents').getPublicUrl(path);
      return publicUrl;
    } catch (e) {
      console.error('Error uploading photo:', e);
      return null;
    }
  };

  // 증서 관련
const addCert = (name?: string) => {
    setCertificates(prev => [...prev, { name: name || '', number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: false }]);
  };

  const handleIssuedDateChange = (idx: number, value: string) => {
    setCertificates(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      // 발급일 입력 시 만료일 자동 계산 (5년 후)
      let expiry = c.expiry_date;
      if (value && !c.no_expiry) {
        const d = new Date(value);
        d.setFullYear(d.getFullYear() + 5);
        expiry = d.toISOString().split('T')[0];
      }
      return { ...c, issued_date: value, expiry_date: expiry };
    }));
  };

  const handleNoExpiryChange = (idx: number, checked: boolean) => {
    setCertificates(prev => prev.map((c, i) =>
      i === idx ? { ...c, no_expiry: checked, expiry_date: checked ? '' : c.expiry_date } : c
    ));
  };

  const updateCert = (idx: number, field: keyof Certificate, value: string) => {
    setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeCert = (idx: number) => {
    setCertificates(prev => prev.filter((_, i) => i !== idx));
  };

 const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recommendation) return;
    if (!formData.name || !formData.rank_id) {
      toast({ title: '필수 항목 누락', description: '이름과 직급은 필수 항목입니다.', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);

      // 이미 등록된 선원인지 확인
      const { data: existing } = await supabase
        .from('crew_recommendations')
        .select('crew_member_id')
        .eq('id', recommendation.id)
        .single();

      if (existing?.crew_member_id) {
        toast({ title: '이미 등록됨', description: '이 선원은 이미 등록되어 있습니다. 선원 목록에서 수정하세요.', variant: 'destructive' });
        finish();
        return;
      }

      let photoUrl = formData.photo_url;
      if (selectedFile) {
        const uploaded = await uploadPhoto();
        if (uploaded) photoUrl = uploaded;
      }

      // 증서 파일 업로드
      const validCerts = certificates.filter(c => c.name.trim());
      const certsWithFiles = await Promise.all(
        validCerts.map(async (cert, idx) => {
          const file = certFiles[idx];
          if (file) {
            const ext = file.name.split('.').pop();
            const path = `crew-certificates/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const { error } = await supabase.storage.from('documents').upload(path, file);
            if (!error) return { ...cert, file_path: path, file_name: file.name };
          }
          return cert;
        })
      );

      // 증서 저장
      if (certsWithFiles.length > 0) {
        await supabase
          .from('crew_recommendations')
          .update({ certificates: JSON.stringify(certsWithFiles), updated_at: new Date().toISOString() })
          .eq('id', recommendation.id);
      }

      // 선원 등록
      const crewData = {
        name: formData.name,
        rank_id: formData.rank_id,
        nationality: formData.nationality || undefined,
        date_of_birth: formData.date_of_birth || undefined,
        passport_number: formData.passport_number || undefined,
        seaman_book_number: formData.seaman_book_number || undefined,
        contact_phone: formData.contact_phone || undefined,
        contact_email: formData.contact_email || undefined,
        emergency_contact: formData.emergency_contact || undefined,
        photo_url: photoUrl || undefined,
        height: formData.height ? parseFloat(formData.height) : undefined,
        weight: formData.weight ? parseFloat(formData.weight) : undefined,
        blood_type: formData.blood_type !== 'none' ? formData.blood_type : undefined,
        shoe_size: formData.shoe_size || undefined,
        coverall_size: formData.coverall_size || undefined,
        place_of_birth: formData.place_of_birth || undefined,
        next_of_kin: formData.next_of_kin || undefined,
        next_of_kin_relationship: formData.next_of_kin_relationship || undefined,
        next_of_kin_contact: formData.next_of_kin_contact || undefined,
        owner_id: formData.owner_id || undefined,
        fleet_id: formData.fleet_id || undefined,
        current_ship_id: formData.current_ship_id || undefined,
        manning_agency_id: formData.manning_agency_id,
        current_status: 'registered' as const,
      };

      const newCrew = await crewService.create(crewData);

      // crew_recommendations 에 crew_member_id 저장 (중복 방지)
      if (newCrew?.id) {
        await supabase
          .from('crew_recommendations')
          .update({ crew_member_id: newCrew.id, updated_at: new Date().toISOString() })
          .eq('id', recommendation.id);
      }

      toast({ title: '등록 완료', description: '선원 정보가 성공적으로 등록되었습니다.' });
      finish();
    } catch (error) {
      console.error('Failed to save crew member:', error);
      toast({ title: '저장 실패', description: '선원 정보 저장 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (loadingRec) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!recommendation) return null;

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={finish}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">선원 상세 정보 입력</h1>
            <p className="text-sm text-muted-foreground">추천된 선원의 상세 정보를 입력하여 등록합니다.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 배정 정보 */}
          <Card>
            <CardHeader><CardTitle className="text-base">배정 정보</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div><Label className="text-muted-foreground">선주사</Label><div className="font-medium mt-1">{recommendation.company_name || '-'}</div></div>
              <div><Label className="text-muted-foreground">선박</Label><div className="font-medium mt-1">{recommendation.ship_name || '-'}</div></div>
              <div><Label className="text-muted-foreground">직급</Label><div className="font-medium mt-1">{recommendation.rank_code} ({recommendation.rank_name})</div></div>
              <div><Label className="text-muted-foreground">매닝사</Label><div className="font-medium mt-1">{recommendation.manning_agency_name}</div></div>
            </CardContent>
          </Card>

          {/* 탭 */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-6">
                  <TabsTrigger value="basic">기본 정보</TabsTrigger>
                  <TabsTrigger value="biodata">Bio-Data</TabsTrigger>
                  <TabsTrigger value="emergency">비상 연락처</TabsTrigger>
                  <TabsTrigger value="certificates">증서</TabsTrigger>
                </TabsList>

                {/* 기본 정보 */}
                <TabsContent value="basic" className="space-y-6">
                  <div className="flex flex-col items-center space-y-4 pb-6 border-b">
                    <div className="relative">
                      {previewUrl ? (
                        <div className="relative">
                          <img src={previewUrl} alt="선원 사진" className="w-32 h-32 rounded-full object-cover border-4 border-gray-100 shadow-sm" />
                          <button type="button" onClick={removePhoto} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 shadow-sm">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-32 h-32 rounded-full bg-gray-50 flex items-center justify-center border-4 border-gray-100 shadow-sm">
                          <User className="w-16 h-16 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <Label htmlFor="photo" className="cursor-pointer inline-flex">
                        <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-md hover:bg-gray-50 transition-colors shadow-sm">
                          <Upload className="w-4 h-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-700">사진 업로드</span>
                        </div>
                      </Label>
                      <Input id="photo" type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                      {selectedFile && <p className="text-xs text-gray-500 mt-2">{selectedFile.name}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2"><Label>이름 *</Label><Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required /></div>
                    <div className="space-y-2">
                      <Label>직급 *</Label>
                      <Select value={formData.rank_id} onValueChange={v => setFormData(p => ({ ...p, rank_id: v }))} disabled>
                        <SelectTrigger><SelectValue placeholder="직급 선택" /></SelectTrigger>
                        <SelectContent>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.rank_code})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>국적</Label>
                      <Select value={formData.nationality} onValueChange={v => setFormData(p => ({ ...p, nationality: v }))}>
                        <SelectTrigger><SelectValue placeholder="국적 선택" /></SelectTrigger>
                        <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_code}>{n.country_name_ko} ({n.country_code})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>생년월일</Label><Input type="date" value={formData.date_of_birth} onChange={e => setFormData(p => ({ ...p, date_of_birth: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>여권번호</Label><Input value={formData.passport_number} onChange={e => setFormData(p => ({ ...p, passport_number: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>선원수첩번호</Label><Input value={formData.seaman_book_number} onChange={e => setFormData(p => ({ ...p, seaman_book_number: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>연락처</Label><Input value={formData.contact_phone} onChange={e => setFormData(p => ({ ...p, contact_phone: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>이메일</Label><Input type="email" value={formData.contact_email} onChange={e => setFormData(p => ({ ...p, contact_email: e.target.value }))} /></div>
                  </div>
                </TabsContent>

                {/* Bio-Data */}
                <TabsContent value="biodata" className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2"><Label>출생지</Label><Input value={formData.place_of_birth} onChange={e => setFormData(p => ({ ...p, place_of_birth: e.target.value }))} placeholder="예: 서울, 대한민국" /></div>
                    <div className="space-y-2">
                      <Label>혈액형</Label>
                      <Select value={formData.blood_type} onValueChange={v => setFormData(p => ({ ...p, blood_type: v }))}>
                        <SelectTrigger><SelectValue placeholder="혈액형 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">선택 안함</SelectItem>
                          {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>키 (cm)</Label><Input type="number" value={formData.height} onChange={e => setFormData(p => ({ ...p, height: e.target.value }))} placeholder="170" /></div>
                    <div className="space-y-2"><Label>몸무게 (kg)</Label><Input type="number" value={formData.weight} onChange={e => setFormData(p => ({ ...p, weight: e.target.value }))} placeholder="70" /></div>
                    <div className="space-y-2"><Label>신발 사이즈</Label><Input value={formData.shoe_size} onChange={e => setFormData(p => ({ ...p, shoe_size: e.target.value }))} placeholder="예: 270mm, US 9" /></div>
                    <div className="space-y-2"><Label>작업복 사이즈</Label><Input value={formData.coverall_size} onChange={e => setFormData(p => ({ ...p, coverall_size: e.target.value }))} placeholder="예: L, XL" /></div>
                  </div>
                </TabsContent>

                {/* 비상 연락처 */}
                <TabsContent value="emergency" className="space-y-6">
                  <div className="space-y-2">
                    <Label>비상연락처 (본인)</Label>
                    <Input value={formData.emergency_contact} onChange={e => setFormData(p => ({ ...p, emergency_contact: e.target.value }))} placeholder="비상 시 연락 가능한 본인 연락처" />
                  </div>
                  <div className="pt-6 border-t">
                    <h3 className="font-semibold mb-4 text-lg">가족 연락처</h3>
                    <div className="grid gap-4">
                      <div className="space-y-2"><Label>이름</Label><Input value={formData.next_of_kin} onChange={e => setFormData(p => ({ ...p, next_of_kin: e.target.value }))} placeholder="가족 이름" /></div>
                      <div className="space-y-2"><Label>관계</Label><Input value={formData.next_of_kin_relationship} onChange={e => setFormData(p => ({ ...p, next_of_kin_relationship: e.target.value }))} placeholder="예: 배우자, 부모, 형제" /></div>
                      <div className="space-y-2"><Label>연락처</Label><Input value={formData.next_of_kin_contact} onChange={e => setFormData(p => ({ ...p, next_of_kin_contact: e.target.value }))} placeholder="가족 연락처" /></div>
                    </div>
                  </div>
                </TabsContent>

                {/* 증서 탭 */}
                <TabsContent value="certificates" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      보유 증서 ({certificates.filter(c => c.number || c.issued_date || c.expiry_date).length}건 입력됨 / {certificates.length}건)
                    </p>
                    <div className="flex gap-2">
                      {certificateTypes.length > 0 && certificates.length === 0 && (
                        <Button type="button" variant="default" size="sm" onClick={() => {
                          setCertificates(certificateTypes.map(ct => ({
                            name: `${ct.type_name_en}`,
                            number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !ct.validity_period_months,
                          })));
                        }} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" />전체 증서 불러오기</Button>
                      )}
                      {certificateTypes.length > 0 && certificates.length > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          const existingNames = new Set(certificates.map(c => c.name));
                          const newCerts = certificateTypes
                            .filter(ct => !existingNames.has(`${ct.type_name_en}`))
                            .map(ct => ({ name: `${ct.type_name_en}`, number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !ct.validity_period_months }));
                          if (newCerts.length > 0) setCertificates(prev => [...prev, ...newCerts]);
                        }} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" />누락 증서 추가</Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={() => addCert()} className="h-8 text-xs gap-1">
                        <Plus className="h-3 w-3" />직접 입력
                      </Button>
                    </div>
                  </div>

                  {certificates.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-md">
                      <p className="text-sm text-gray-400 mb-2">증서를 추가하세요.</p>
                      {certificateTypes.length > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          setCertificates(certificateTypes.map(ct => ({
                            name: `${ct.type_name_en}`,
                            number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: !ct.validity_period_months,
                          })));
                        }} className="text-xs gap-1"><Plus className="h-3 w-3" />등록된 증서 유형 전체 불러오기 ({certificateTypes.length}건)</Button>
                      )}
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const grouped: Record<string, { cert: Certificate; idx: number }[]> = {};
                        certificates.forEach((cert, idx) => {
                          const matchedType = certificateTypes.find(ct => cert.name === `${ct.type_name_en}`);
                          const category = matchedType?.category || 'custom';
                          if (!grouped[category]) grouped[category] = [];
                          grouped[category].push({ cert, idx });
                        });
                        const categoryOrder = [...certificateCategories.map(c => c.code), 'custom'];
                        return categoryOrder.filter(cat => grouped[cat]?.length > 0).map(category => (
                          <div key={category} className="space-y-1.5">
                            <div className="flex items-center gap-2 pt-2">
                              <Badge variant="outline" className="text-xs font-semibold">
                                {category === 'custom' ? '직접 입력' : certificateCategories.find(c => c.code === category)?.name || category}
                              </Badge>
                              <div className="flex-1 border-t border-gray-200" />
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead><tr className="border-b bg-gray-50/50">
                                  <th className="text-left p-1.5 w-[200px]">증서명</th>
                                  <th className="text-left p-1.5 w-[120px]">증서번호</th>
                                  <th className="text-left p-1.5 w-[110px]">발급일</th>
                                  <th className="text-left p-1.5 w-[110px]">만료일</th>
                                  <th className="text-left p-1.5 w-[120px]">발급기관</th>
                                  <th className="text-left p-1.5 w-[100px]">파일</th>
                                  <th className="text-center p-1.5 w-[36px]"></th>
                                </tr></thead>
                                <tbody>
                                  {grouped[category].map(({ cert, idx }) => {
                                    const hasData = !!(cert.number || cert.issued_date || cert.expiry_date);
                                    return (
                                      <tr key={idx} className={`border-b ${hasData ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}`}>
                                        <td className="p-1">
                                          {category === 'custom' ? (
                                            <Input value={cert.name} onChange={e => updateCert(idx, 'name', e.target.value)} className="h-7 text-xs" placeholder="증서명" />
                                          ) : (
                                            <span className="text-xs px-1 truncate block" title={cert.name}>{cert.name}</span>
                                          )}
                                        </td>
                                        <td className="p-1"><Input value={cert.number} onChange={e => updateCert(idx, 'number', e.target.value)} className="h-7 text-xs" placeholder="번호" /></td>
                                        <td className="p-1"><Input type="date" value={cert.issued_date} onChange={e => handleIssuedDateChange(idx, e.target.value)} className="h-7 text-xs" /></td>
                                        <td className="p-1">
                                          {cert.no_expiry ? (
                                            <span className="text-xs text-gray-400 px-1 cursor-pointer" onClick={() => handleNoExpiryChange(idx, false)}>무기한</span>
                                          ) : (
                                            <Input type="date" value={cert.expiry_date} onChange={e => updateCert(idx, 'expiry_date', e.target.value)} className="h-7 text-xs" />
                                          )}
                                        </td>
                                        <td className="p-1"><Input value={cert.issuing_authority} onChange={e => updateCert(idx, 'issuing_authority', e.target.value)} className="h-7 text-xs" placeholder="기관" /></td>
                                        <td className="p-1">
                                          {cert.file_name ? (
                                            <div className="flex items-center gap-1 text-xs text-blue-600">
                                              <span className="truncate">{cert.file_name.slice(0, 8)}...</span>
                                              <button type="button" onClick={() => { updateCert(idx, 'file_path', ''); updateCert(idx, 'file_name', ''); setCertFiles(prev => { const n = { ...prev }; delete n[idx]; return n; }); }} className="text-red-400 shrink-0"><X className="h-3 w-3" /></button>
                                            </div>
                                          ) : certFiles[idx] ? (
                                            <div className="flex items-center gap-1 text-xs text-green-600">
                                              <span className="truncate">{certFiles[idx].name.slice(0, 8)}...</span>
                                              <button type="button" onClick={() => setCertFiles(prev => { const n = { ...prev }; delete n[idx]; return n; })} className="text-red-400 shrink-0"><X className="h-3 w-3" /></button>
                                            </div>
                                          ) : (
                                            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                                              <Upload className="h-3 w-3 shrink-0" /><span>파일</span>
                                              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                  if (file.size > 10 * 1024 * 1024) { alert('10MB 초과'); return; }
                                                  setCertFiles(prev => ({ ...prev, [idx]: file }));
                                                }
                                              }} />
                                            </label>
                                          )}
                                        </td>
                                        <td className="p-1 text-center">
                                          <Button type="button" variant="ghost" size="sm" onClick={() => removeCert(idx)} className="h-6 w-6 p-0 text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></Button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ));
                      })()}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={finish} disabled={loading}>취소</Button>
            <Button type="submit" disabled={loading} className="min-w-[100px]">
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>저장 중...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  <span>저장 및 등록</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}