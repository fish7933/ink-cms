import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Upload, User, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { getNationalities } from '@/services/nationality.service';
import type { Nationality } from '@/types/nationality';
import CrewStatusBadge from '@/components/crew/CrewStatusBadge';

interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  note?: string;
}

interface Certificate {
  name: string;
  number?: string;
  issued_date?: string;
  expiry_date?: string;
  issuing_authority?: string;
  no_expiry?: boolean;
  file_path?: string;
  file_name?: string;
}

interface Rank {
  id: string;
  name: string;
  rank_code: string;
}

interface CrewDetailPanelProps {
  id?: string;
  onBack: () => void;
  onSaved: (id: string) => void;
  embedded?: boolean;
}

const CERT_TEMPLATES = [
  'Passport',
  'Continuous Discharge Certificate (Seaman Book)',
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
];

const RELATIONSHIPS = ['배우자', '부', '모', '자', '녀', '형', '제', '자매', '친구', '기타'];
const SHOE_SIZES = ['235','240','245','250','255','260','265','270','275','280','285','290','295','300'];
const COVERALL_SIZES = ['XS','S','M','L','XL','XXL','XXXL'];

export function CrewDetailPanel({ id, onBack, onSaved, embedded = false }: CrewDetailPanelProps) {
  const { toast } = useToast();

  const isNew = !id;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certFiles, setCertFiles] = useState<Record<number, File>>({});
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [crewStatus, setCrewStatus] = useState('registered');

  const [formData, setFormData] = useState({
    name: '', rank_id: '', nationality: '', date_of_birth: '',
    contact_phone: '', contact_email: '', photo_url: '',
    height: '', weight: '', blood_type: 'none',
    shoe_size: '', coverall_size: '', place_of_birth: '',
  });

  useEffect(() => {
    supabase.from('ranks').select('*').order('display_order').then(({ data }) => { if (data) setRanks(data); });
    getNationalities(true).then(setNationalities).catch(console.error);
    if (!isNew) loadCrew(id!);
    else {
      setLoading(false);
      setFormData({ name: '', rank_id: '', nationality: '', date_of_birth: '', contact_phone: '', contact_email: '', photo_url: '', height: '', weight: '', blood_type: 'none', shoe_size: '', coverall_size: '', place_of_birth: '' });
      setPreviewUrl('');
      setCertificates([]);
      setEmergencyContacts([]);
      setCrewStatus('registered');
    }
  }, [id]);

  const loadCrew = async (crewId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('crew_members').select('*').eq('id', crewId).single();
      if (error) throw error;
      if (!data) { toast({ title: '선원을 찾을 수 없습니다.', variant: 'destructive' }); onBack(); return; }

      setCrewStatus(data.current_status || data.status || 'registered');
      setFormData({
        name: data.name || '',
        rank_id: data.rank_id || '',
        nationality: data.nationality || '',
        date_of_birth: data.date_of_birth || '',
        contact_phone: data.phone || '',
        contact_email: data.email || '',
        photo_url: data.photo_url || '',
        height: data.height?.toString() || '',
        weight: data.weight?.toString() || '',
        blood_type: data.blood_type || 'none',
        shoe_size: data.shoe_size || '',
        coverall_size: data.coverall_size || '',
        place_of_birth: data.place_of_birth || '',
      });
      setPreviewUrl(data.photo_url || '');

      try {
        const certs = typeof data.certificates === 'string' ? JSON.parse(data.certificates) : (data.certificates || []);
        setCertificates(Array.isArray(certs) ? certs : []);
      } catch { setCertificates([]); }

      try {
        const contacts = typeof data.emergency_contacts === 'string' ? JSON.parse(data.emergency_contacts) : (data.emergency_contacts || []);
        setEmergencyContacts(Array.isArray(contacts) ? contacts : []);
      } catch { setEmergencyContacts([]); }

    } catch (e) {
      console.error(e);
      toast({ title: '데이터 로드 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const allowed = ['image/jpeg','image/jpg','image/png','image/webp'];
      if (!allowed.includes(file.type)) { alert('JPG, PNG, WEBP 형식만 가능합니다.'); return; }
      if (file.size > 5 * 1024 * 1024) { alert('5MB 이하만 가능합니다.'); return; }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!selectedFile) return formData.photo_url || null;
    try {
      const ext = selectedFile.name.split('.').pop();
      const path = `crew-photos/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from('crew-documents').upload(path, selectedFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('crew-documents').getPublicUrl(path);
      return publicUrl;
    } catch (e) { console.error(e); return null; }
  };

  const addCert = (name?: string) => setCertificates(prev => [...prev, { name: name || '', number: '', issued_date: '', expiry_date: '', issuing_authority: '', no_expiry: false }]);
  const updateCert = (idx: number, field: keyof Certificate, value: string | boolean) => setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  const removeCert = (idx: number) => setCertificates(prev => prev.filter((_, i) => i !== idx));
  const handleIssuedDate = (idx: number, value: string) => {
    setCertificates(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      let expiry = c.expiry_date;
      if (value && !c.no_expiry) { const d = new Date(value); d.setFullYear(d.getFullYear() + 5); expiry = d.toISOString().split('T')[0]; }
      return { ...c, issued_date: value, expiry_date: expiry };
    }));
  };
  const handleNoExpiry = (idx: number, checked: boolean) => setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, no_expiry: checked, expiry_date: checked ? '' : c.expiry_date } : c));
  const addContact = () => setEmergencyContacts(prev => [...prev, { name: '', relationship: '', phone: '', note: '' }]);
  const updateContact = (idx: number, field: keyof EmergencyContact, value: string) => setEmergencyContacts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  const removeContact = (idx: number) => setEmergencyContacts(prev => prev.filter((_, i) => i !== idx));
  const f = (field: string, value: string) => setFormData(p => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!formData.name || !formData.rank_id) {
      toast({ title: '필수 항목 누락', description: '이름과 직급은 필수입니다.', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      let photoUrl = formData.photo_url;
      if (selectedFile) { const u = await uploadPhoto(); if (u) photoUrl = u; }

      const certsWithFiles = await Promise.all(
        certificates.filter(c => c.name.trim()).map(async (cert, idx) => {
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

      let rankName = '';
      if (formData.rank_id) {
        const { data: rd } = await supabase.from('ranks').select('name').eq('id', formData.rank_id).single();
        if (rd) rankName = rd.name;
      }

      const updateData: Record<string, unknown> = {
        name: formData.name,
        rank_id: formData.rank_id,
        rank: rankName,
        nationality: formData.nationality || null,
        date_of_birth: formData.date_of_birth || null,
        phone: formData.contact_phone || null,
        email: formData.contact_email || null,
        photo_url: photoUrl || null,
        height: formData.height ? parseFloat(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        blood_type: formData.blood_type !== 'none' ? formData.blood_type : null,
        shoe_size: formData.shoe_size || null,
        coverall_size: formData.coverall_size || null,
        place_of_birth: formData.place_of_birth || null,
        emergency_contacts: emergencyContacts.filter(c => c.name || c.phone),
        certificates: certsWithFiles,
        updated_at: new Date().toISOString(),
      };

      if (isNew) {
        const { data: newCrew, error } = await supabase
          .from('crew_members')
          .insert({ ...updateData, current_status: 'registered', status: 'registered', created_at: new Date().toISOString() })
          .select().single();
        if (error) throw new Error(error.message);
        toast({ title: '등록 완료', description: '선원이 등록되었습니다.' });
        onSaved(newCrew.id);
      } else {
        const { error } = await supabase.from('crew_members').update(updateData).eq('id', id!);
        if (error) throw new Error(error.message);
        await loadCrew(id!);
        setSelectedFile(null);
        setCertFiles({});
        toast({ title: '저장 완료', description: '선원 정보가 수정되었습니다.' });
        onSaved(id!);
      }
    } catch (error) {
      console.error(error);
      toast({ title: '저장 실패', description: String(error instanceof Error ? error.message : error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openCertFile = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  const selectedRank = ranks.find(r => r.id === formData.rank_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 폼 콘텐츠 (사진 + 탭) - embedded/standalone 공용
  const formBody = (
    <>
      {/* 사진 */}
      <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
        <div className="relative">
          {previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
              <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(''); f('photo_url', ''); }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-200">
              <User className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="photo-input" className="cursor-pointer">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-md hover:bg-gray-50 text-xs">
              <Upload className="w-3.5 h-3.5" />사진 업로드
            </div>
          </Label>
          <Input id="photo-input" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleFileSelect} className="hidden" />
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · 최대 5MB</p>
        </div>
      </div>

      {/* 탭 */}
      <Tabs defaultValue="basic">
        <TabsList className="grid w-full grid-cols-4 h-8">
          <TabsTrigger value="basic" className="text-xs">기본 정보</TabsTrigger>
          <TabsTrigger value="biodata" className="text-xs">Bio-Data</TabsTrigger>
          <TabsTrigger value="emergency" className="text-xs">연락처</TabsTrigger>
          <TabsTrigger value="certificates" className="text-xs">
            증서{certificates.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 rounded-full px-1.5">{certificates.length}</span>}
          </TabsTrigger>
        </TabsList>

        {/* 기본 정보 */}
        <TabsContent value="basic">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">이름 *</Label><Input value={formData.name} onChange={e => f('name', e.target.value)} className="mt-1 h-9" /></div>
            <div>
              <Label className="text-xs">직급 *</Label>
              <Select value={formData.rank_id} onValueChange={v => f('rank_id', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                <SelectContent>{ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.rank_code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">국적</Label>
              <Select value={formData.nationality} onValueChange={v => f('nationality', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="국적 선택" /></SelectTrigger>
                <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_name_ko}>{n.country_name_ko} ({n.country_name_en})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">생년월일</Label><Input type="date" value={formData.date_of_birth} onChange={e => f('date_of_birth', e.target.value)} className="mt-1 h-9" /></div>
            <div><Label className="text-xs">연락처</Label><Input value={formData.contact_phone} onChange={e => f('contact_phone', e.target.value)} className="mt-1 h-9" /></div>
            <div><Label className="text-xs">이메일</Label><Input type="email" value={formData.contact_email} onChange={e => f('contact_email', e.target.value)} className="mt-1 h-9" /></div>
          </div>
        </TabsContent>

        {/* Bio-Data */}
        <TabsContent value="biodata">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">출생지</Label><Input value={formData.place_of_birth} onChange={e => f('place_of_birth', e.target.value)} className="mt-1 h-9" placeholder="예: Jakarta, Indonesia" /></div>
            <div>
              <Label className="text-xs">혈액형</Label>
              <Select value={formData.blood_type} onValueChange={v => f('blood_type', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">키 (cm)</Label><Input type="number" value={formData.height} onChange={e => f('height', e.target.value)} className="mt-1 h-9" placeholder="170" /></div>
            <div><Label className="text-xs">몸무게 (kg)</Label><Input type="number" value={formData.weight} onChange={e => f('weight', e.target.value)} className="mt-1 h-9" placeholder="70" /></div>
            <div>
              <Label className="text-xs">신발 사이즈 (mm)</Label>
              <Select value={formData.shoe_size} onValueChange={v => f('shoe_size', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="신발 사이즈" /></SelectTrigger>
                <SelectContent>{SHOE_SIZES.map(s => <SelectItem key={s} value={s}>{s} mm</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">작업복 사이즈</Label>
              <Select value={formData.coverall_size} onValueChange={v => f('coverall_size', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="작업복 사이즈" /></SelectTrigger>
                <SelectContent>{COVERALL_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* 연락처 */}
        <TabsContent value="emergency">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">비상 연락처 및 가족 연락처</span>
              <Button type="button" variant="outline" size="sm" onClick={addContact} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" />추가
              </Button>
            </div>
            {emergencyContacts.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">연락처를 추가하세요.</div>
            ) : emergencyContacts.map((contact, idx) => (
              <div key={idx} className="p-3 border rounded-md bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600">연락처 {idx + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeContact(idx)} className="h-6 w-6 p-0 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs text-gray-500">이름</Label><Input value={contact.name} onChange={e => updateContact(idx, 'name', e.target.value)} className="h-8 text-xs mt-0.5" /></div>
                  <div>
                    <Label className="text-xs text-gray-500">관계</Label>
                    <Select value={contact.relationship} onValueChange={v => updateContact(idx, 'relationship', v)}>
                      <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="관계 선택" /></SelectTrigger>
                      <SelectContent>{RELATIONSHIPS.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs text-gray-500">연락처</Label><Input value={contact.phone} onChange={e => updateContact(idx, 'phone', e.target.value)} className="h-8 text-xs mt-0.5" /></div>
                  <div><Label className="text-xs text-gray-500">비고</Label><Input value={contact.note || ''} onChange={e => updateContact(idx, 'note', e.target.value)} className="h-8 text-xs mt-0.5" /></div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* 증서 */}
        <TabsContent value="certificates">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">보유 증서 ({certificates.length}건)</span>
              <div className="flex gap-2">
                <Select onValueChange={v => addCert(v)}>
                  <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="증서 선택 추가" /></SelectTrigger>
                  <SelectContent>{CERT_TEMPLATES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => addCert()} className="h-8 text-xs gap-1"><Plus className="h-3 w-3" />직접 입력</Button>
              </div>
            </div>
            {certificates.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">증서를 추가하세요.</div>
            ) : certificates.map((cert, idx) => (
              <div key={idx} className="p-3 border rounded-md bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600">증서 {idx + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeCert(idx)} className="h-6 w-6 p-0 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs text-gray-500">증서명 *</Label><Input value={cert.name} onChange={e => updateCert(idx, 'name', e.target.value)} className="h-7 text-xs mt-0.5" /></div>
                    <div><Label className="text-xs text-gray-500">증서 번호</Label><Input value={cert.number || ''} onChange={e => updateCert(idx, 'number', e.target.value)} className="h-7 text-xs mt-0.5" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs text-gray-500">발급일</Label><Input type="date" value={cert.issued_date || ''} onChange={e => handleIssuedDate(idx, e.target.value)} className="h-7 text-xs mt-0.5" /></div>
                    <div>
                      <div className="flex items-center justify-between mt-0.5 mb-0.5">
                        <Label className="text-xs text-gray-500">만료일</Label>
                        <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                          <input type="checkbox" checked={cert.no_expiry || false} onChange={e => handleNoExpiry(idx, e.target.checked)} className="accent-blue-600 w-3 h-3" />만료일 없음
                        </label>
                      </div>
                      <Input type="date" value={cert.expiry_date || ''} onChange={e => updateCert(idx, 'expiry_date', e.target.value)} className="h-7 text-xs" disabled={cert.no_expiry} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs text-gray-500">발급 기관</Label><Input value={cert.issuing_authority || ''} onChange={e => updateCert(idx, 'issuing_authority', e.target.value)} className="h-7 text-xs mt-0.5" /></div>
                    <div>
                      <Label className="text-xs text-gray-500">증서 사본</Label>
                      <div className="mt-0.5">
                        {cert.file_name ? (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs h-7">
                            <span className="flex-1 truncate text-blue-700 cursor-pointer" onClick={() => cert.file_path && openCertFile(cert.file_path)}>{cert.file_name}</span>
                            <button type="button" onClick={() => { updateCert(idx, 'file_path', ''); updateCert(idx, 'file_name', ''); }} className="text-red-400"><X className="h-3 w-3" /></button>
                          </div>
                        ) : certFiles[idx] ? (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded text-xs h-7">
                            <span className="flex-1 truncate text-green-700">{certFiles[idx].name}</span>
                            <button type="button" onClick={() => setCertFiles(prev => { const n = { ...prev }; delete n[idx]; return n; })} className="text-red-400"><X className="h-3 w-3" /></button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-1.5 px-2 py-1 border border-dashed rounded cursor-pointer hover:bg-gray-50 text-xs text-gray-400 h-7">
                            <Upload className="h-3 w-3 shrink-0" /><span className="truncate">파일 선택</span>
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) { if (file.size > 10 * 1024 * 1024) { alert('10MB 초과'); return; } setCertFiles(prev => ({ ...prev, [idx]: file })); } }} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );

  // embedded 모드: Card 없이 폼 콘텐츠만 반환 (저장 버튼 하단 포함)
  if (embedded) {
    return (
      <div className="space-y-4 pt-3 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedRank && <Badge variant="outline" className="text-xs">{selectedRank.rank_code}</Badge>}
            {!isNew && <CrewStatusBadge status={crewStatus} />}
            <span className="text-sm font-medium text-gray-700">
              {isNew ? '새 선원 등록' : formData.name || '선원 정보 수정'}
            </span>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 h-8">
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : isNew ? '등록' : '저장'}
          </Button>
        </div>
        {formBody}
      </div>
    );
  }

  // standalone 모드: 기존 Card 래퍼 포함
  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <CardTitle className="text-base">
                  {isNew ? '선원 등록' : formData.name || '선원 정보'}
                </CardTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  {selectedRank && <Badge variant="outline" className="text-xs">{selectedRank.rank_code}</Badge>}
                  {!isNew && <CrewStatusBadge status={crewStatus} />}
                </div>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 h-8">
              <Save className="w-4 h-4" />
              {saving ? '저장 중...' : isNew ? '등록' : '저장'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {formBody}
        </CardContent>
      </Card>
    </div>
  );
}
