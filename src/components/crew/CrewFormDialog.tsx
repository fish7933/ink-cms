import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import type { Rank } from '@/types/models';
import { Upload, User, X, Plus, Trash2, Edit, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getNationalities } from '@/services/nationality.service';
import type { Nationality } from '@/types/nationality';
import CrewStatusBadge from './CrewStatusBadge';

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

interface CrewMember {
  id: string;
  name?: string;
  rank_id?: string;
  rank?: string;
  nationality?: string;
  date_of_birth?: string;
  contact_phone?: string;
  contact_email?: string;
  current_status?: string;
  photo_url?: string;
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  place_of_birth?: string;
  emergency_contacts?: EmergencyContact[];
  certificates?: Certificate[];
  rank_name?: string;
  rank_code?: string;
  ship_name?: string;
  owner_name?: string;
  fleet_name?: string;
  manning_agency_name?: string;
  age?: number;
  [key: string]: unknown;
}

interface CrewFormDialogProps {
  open: boolean;
  crew: CrewMember | null;
  onClose: (saved: boolean, crewId?: string) => void;
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

export function CrewFormDialog({ open, crew, onClose }: CrewFormDialogProps) {
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certFiles, setCertFiles] = useState<Record<number, File>>({});
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);

  const [formData, setFormData] = useState({
    name: '', rank_id: '', nationality: '', date_of_birth: '',
    contact_phone: '', contact_email: '', photo_url: '',
    height: '', weight: '', blood_type: 'none',
    shoe_size: '', coverall_size: '', place_of_birth: '',
  });

  useEffect(() => {
    if (open) {
      // 신규 등록이면 바로 편집 모드, 수정이면 보기 모드
      setEditMode(!crew);
      supabase.from('ranks').select('*').order('display_order').then(({ data }) => { if (data) setRanks(data); });
      getNationalities(true).then(setNationalities).catch(console.error);
      loadCrewData();
      setSelectedFile(null);
      setCertFiles({});
    }
  }, [open, crew]);

  const loadCrewData = () => {
    if (crew) {
      setFormData({
        name: crew.name || '',
        rank_id: crew.rank_id || '',
        nationality: crew.nationality || '',
        date_of_birth: crew.date_of_birth || '',
        contact_phone: (crew.contact_phone as string) || '',
        contact_email: (crew.contact_email as string) || '',
        photo_url: (crew.photo_url as string) || '',
        height: crew.height?.toString() || '',
        weight: crew.weight?.toString() || '',
        blood_type: (crew.blood_type as string) || 'none',
        shoe_size: (crew.shoe_size as string) || '',
        coverall_size: (crew.coverall_size as string) || '',
        place_of_birth: (crew.place_of_birth as string) || '',
      });
      setPreviewUrl((crew.photo_url as string) || '');
      try {
        const certs = typeof crew.certificates === 'string' ? JSON.parse(crew.certificates) : (crew.certificates || []);
        setCertificates(Array.isArray(certs) ? certs : []);
      } catch { setCertificates([]); }
      try {
        const contacts = typeof crew.emergency_contacts === 'string' ? JSON.parse(crew.emergency_contacts as string) : (crew.emergency_contacts || []);
        setEmergencyContacts(Array.isArray(contacts) ? contacts : []);
      } catch { setEmergencyContacts([]); }
    } else {
      setFormData({ name: '', rank_id: '', nationality: '', date_of_birth: '', contact_phone: '', contact_email: '', photo_url: '', height: '', weight: '', blood_type: 'none', shoe_size: '', coverall_size: '', place_of_birth: '' });
      setPreviewUrl('');
      setCertificates([]);
      setEmergencyContacts([]);
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

  const formatDate = (d?: string) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('ko-KR'); } catch { return d; } };

  const openCertFile = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  const handleSave = async () => {
    if (!formData.name || !formData.rank_id) {
      toast({ title: '필수 항목 누락', description: '이름과 직급은 필수 항목입니다.', variant: 'destructive' });
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

      if (crew) {
        const { error } = await supabase.from('crew_members').update(updateData).eq('id', crew.id);
        if (error) throw new Error(error.message);
        toast({ title: '수정 완료', description: '선원 정보가 수정되었습니다.' });
        setEditMode(false);
        onClose(true, crew.id);
      } else {
        const { data: newCrew, error } = await supabase.from('crew_members').insert({ ...updateData, current_status: 'registered', created_at: new Date().toISOString() }).select().single();
        if (error) throw new Error(error.message);
        toast({ title: '등록 완료', description: '선원이 등록되었습니다.' });
        onClose(true, newCrew?.id);
      }
    } catch (error) {
      console.error('Failed to save crew member:', error);
      toast({ title: '저장 실패', description: String(error instanceof Error ? error.message : error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const viewRow = (label: string, value: string | undefined | null) =>
    <div className="flex py-1.5 border-b last:border-0">
      <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-sm">{value || '-'}</span>
    </div>;

  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{!crew ? '선원 등록' : editMode ? '선원 정보 수정' : '선원 상세 정보'}</DialogTitle>
            {crew && !editMode && (
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-1.5 mr-6">
                <Edit className="w-4 h-4" />수정
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* 상단 요약 (보기 모드) */}
        {crew && !editMode && (
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg mb-2">
            {crew.photo_url ? (
              <img src={crew.photo_url as string} alt={crew.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-bold">{crew.name}</span>
                <Badge variant="outline" className="text-xs">{crew.rank_code}</Badge>
                {crew.current_status && <CrewStatusBadge status={crew.current_status as string} />}
              </div>
              <div className="text-sm text-gray-500">{crew.rank_name} · {crew.manning_agency_name}</div>
            </div>
          </div>
        )}

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-9">
            <TabsTrigger value="basic" className="text-xs">기본 정보</TabsTrigger>
            <TabsTrigger value="biodata" className="text-xs">Bio-Data</TabsTrigger>
            <TabsTrigger value="emergency" className="text-xs">연락처</TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs">
              증서{certificates.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 rounded-full px-1.5 text-xs">{certificates.length}</span>}
            </TabsTrigger>
          </TabsList>

          {/* ── 기본 정보 ── */}
          <TabsContent value="basic" className="mt-4">
            {editMode ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center space-y-3 pb-4 border-b">
                  <div className="relative">
                    {previewUrl ? (
                      <div className="relative">
                        <img src={previewUrl} alt="" className="w-28 h-28 rounded-full object-cover border-4 border-gray-200" />
                        <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(''); f('photo_url', ''); }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center border-4 border-gray-200"><User className="w-14 h-14 text-gray-400" /></div>
                    )}
                  </div>
                  <Label htmlFor="photo-edit" className="cursor-pointer">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-md hover:bg-gray-200 text-sm"><Upload className="w-4 h-4" />사진 업로드</div>
                  </Label>
                  <Input id="photo-edit" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleFileSelect} className="hidden" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">이름 *</Label><Input value={formData.name} onChange={e => f('name', e.target.value)} className="mt-1" /></div>
                  <div>
                    <Label className="text-xs">직급 *</Label>
                    <Select value={formData.rank_id} onValueChange={v => f('rank_id', v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                      <SelectContent>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.rank_code})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">국적</Label>
                    <Select value={formData.nationality} onValueChange={v => f('nationality', v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="국적 선택" /></SelectTrigger>
                      <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_name_ko}>{n.country_name_ko} ({n.country_name_en})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">생년월일</Label><Input type="date" value={formData.date_of_birth} onChange={e => f('date_of_birth', e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">연락처</Label><Input value={formData.contact_phone} onChange={e => f('contact_phone', e.target.value)} className="mt-1" /></div>
                  <div><Label className="text-xs">이메일</Label><Input type="email" value={formData.contact_email} onChange={e => f('contact_email', e.target.value)} className="mt-1" /></div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-md px-3">
                  {viewRow('국적', crew?.nationality)}
                  {viewRow('생년월일', crew?.date_of_birth ? `${formatDate(crew.date_of_birth)} (${crew.age}세)` : undefined)}
                  {viewRow('연락처', crew?.contact_phone as string)}
                  {viewRow('이메일', crew?.contact_email as string)}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">배정 정보</h4>
                  <div className="bg-gray-50 rounded-md px-3">
                    {viewRow('선주사', crew?.owner_name)}
                    {viewRow('플릿', crew?.fleet_name)}
                    {viewRow('선박', crew?.ship_name)}
                    {viewRow('매닝사', crew?.manning_agency_name)}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Bio-Data ── */}
          <TabsContent value="biodata" className="mt-4">
            {editMode ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">출생지</Label><Input value={formData.place_of_birth} onChange={e => f('place_of_birth', e.target.value)} className="mt-1" placeholder="예: Jakarta, Indonesia" /></div>
                <div>
                  <Label className="text-xs">혈액형</Label>
                  <Select value={formData.blood_type} onValueChange={v => f('blood_type', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">선택 안함</SelectItem>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">키 (cm)</Label><Input type="number" value={formData.height} onChange={e => f('height', e.target.value)} className="mt-1" placeholder="170" /></div>
                <div><Label className="text-xs">몸무게 (kg)</Label><Input type="number" value={formData.weight} onChange={e => f('weight', e.target.value)} className="mt-1" placeholder="70" /></div>
                <div>
                  <Label className="text-xs">신발 사이즈 (mm)</Label>
                  <Select value={formData.shoe_size} onValueChange={v => f('shoe_size', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="신발 사이즈" /></SelectTrigger>
                    <SelectContent>{SHOE_SIZES.map(s => <SelectItem key={s} value={s}>{s} mm</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">작업복 사이즈</Label>
                  <Select value={formData.coverall_size} onValueChange={v => f('coverall_size', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="작업복 사이즈" /></SelectTrigger>
                    <SelectContent>{COVERALL_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-md px-3">
                {viewRow('출생지', crew?.place_of_birth as string)}
                {viewRow('혈액형', crew?.blood_type as string)}
                {viewRow('키', crew?.height ? `${crew.height} cm` : undefined)}
                {viewRow('몸무게', crew?.weight ? `${crew.weight} kg` : undefined)}
                {viewRow('신발 사이즈', crew?.shoe_size as string)}
                {viewRow('작업복 사이즈', crew?.coverall_size as string)}
                {!crew?.height && !crew?.weight && !crew?.blood_type && !crew?.place_of_birth && (
                  <div className="text-center py-4 text-sm text-gray-400">입력된 Bio-Data가 없습니다.</div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── 연락처 ── */}
          <TabsContent value="emergency" className="mt-4">
            {editMode ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">비상 연락처 및 가족 연락처</span>
                  <Button type="button" variant="outline" size="sm" onClick={addContact} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />추가</Button>
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
            ) : (
              emergencyContacts.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">입력된 연락처가 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {emergencyContacts.map((c, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-md">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{c.name}</span>
                        {c.relationship && <Badge variant="outline" className="text-xs">{c.relationship}</Badge>}
                      </div>
                      <div className="text-sm text-gray-600">{c.phone}</div>
                      {c.note && <div className="text-xs text-gray-400 mt-0.5">{c.note}</div>}
                    </div>
                  ))}
                </div>
              )
            )}
          </TabsContent>

          {/* ── 증서 ── */}
          <TabsContent value="certificates" className="mt-4">
            {editMode ? (
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
                                <span className="flex-1 truncate text-blue-700">{cert.file_name}</span>
                                <button type="button" onClick={() => { updateCert(idx, 'file_path', ''); updateCert(idx, 'file_name', ''); setCertFiles(prev => { const n = { ...prev }; delete n[idx]; return n; }); }} className="text-red-400"><X className="h-3 w-3" /></button>
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
            ) : (
              certificates.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">등록된 증서가 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {certificates.map((cert, idx) => (
                    <div key={idx} className="border rounded-md p-3 bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{cert.name}</span>
                            {cert.no_expiry && <Badge variant="outline" className="text-xs">만료일 없음</Badge>}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600">
                            {cert.number && <div><span className="text-gray-400">번호: </span>{cert.number}</div>}
                            {cert.issuing_authority && <div><span className="text-gray-400">발급기관: </span>{cert.issuing_authority}</div>}
                            {cert.issued_date && <div><span className="text-gray-400">발급일: </span>{formatDate(cert.issued_date)}</div>}
                            {!cert.no_expiry && cert.expiry_date && (
                              <div>
                                <span className="text-gray-400">만료일: </span>
                                <span className={new Date(cert.expiry_date) < new Date() ? 'text-red-500 font-medium' : ''}>
                                  {formatDate(cert.expiry_date)}{new Date(cert.expiry_date) < new Date() && ' (만료)'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        {cert.file_path && (
                          <Button variant="ghost" size="sm" onClick={() => openCertFile(cert.file_path!)} className="h-7 text-xs gap-1 text-blue-600">
                            <ExternalLink className="h-3.5 w-3.5" />사본
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </TabsContent>
        </Tabs>

        {/* 하단 버튼 */}
        <div className="flex justify-between pt-4 border-t">
          {editMode && crew ? (
            <>
              <Button variant="outline" onClick={() => { setEditMode(false); loadCrewData(); }} disabled={saving}>취소</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
            </>
          ) : editMode && !crew ? (
            <>
              <Button variant="outline" onClick={() => onClose(false)} disabled={saving}>취소</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '등록'}</Button>
            </>
          ) : (
            <div className="flex w-full justify-between">
              <div />
              <Button variant="outline" onClick={() => onClose(false)}>닫기</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CrewFormDialog;