import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { crewService } from '@/services/crew.service';
import { supabase } from '@/lib/supabase';
import type { Rank } from '@/types/models';
import { Upload, User, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CrewMember {
  id: string;
  name: string;
  rank_id: string;
  nationality?: string;
  date_of_birth?: string;
  passport_number?: string;
  seaman_book_number?: string;
  contact_phone?: string;
  contact_email?: string;
  emergency_contact?: string;
  current_status: 'registered' | 'available' | 'on_board' | 'on_leave' | 'retired';
  photo_url?: string;
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  place_of_birth?: string;
  next_of_kin?: string;
  next_of_kin_relationship?: string;
  next_of_kin_contact?: string;
}

interface CrewFormDialogProps {
  open: boolean;
  crew: CrewMember | null;
  onClose: (saved: boolean) => void;
}

export function CrewFormDialog({ open, crew, onClose }: CrewFormDialogProps) {
  const { toast } = useToast();
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  
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
  });

  useEffect(() => {
    if (open) {
      loadRanks();
      if (crew) {
        setFormData({
          name: crew.name,
          rank_id: crew.rank_id,
          nationality: crew.nationality || '',
          date_of_birth: crew.date_of_birth || '',
          passport_number: crew.passport_number || '',
          seaman_book_number: crew.seaman_book_number || '',
          contact_phone: crew.contact_phone || '',
          contact_email: crew.contact_email || '',
          emergency_contact: crew.emergency_contact || '',
          photo_url: crew.photo_url || '',
          height: crew.height?.toString() || '',
          weight: crew.weight?.toString() || '',
          blood_type: crew.blood_type || 'none',
          shoe_size: crew.shoe_size || '',
          coverall_size: crew.coverall_size || '',
          place_of_birth: crew.place_of_birth || '',
          next_of_kin: crew.next_of_kin || '',
          next_of_kin_relationship: crew.next_of_kin_relationship || '',
          next_of_kin_contact: crew.next_of_kin_contact || '',
        });
        setPreviewUrl(crew.photo_url || '');
      } else {
        setFormData({
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
        });
        setPreviewUrl('');
      }
      setSelectedFile(null);
    }
  }, [open, crew]);

  const loadRanks = async () => {
    const { data } = await supabase.from('ranks').select('*').order('display_order');
    if (data) setRanks(data);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    setFormData(prev => ({ ...prev, photo_url: '' }));
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!selectedFile) return formData.photo_url || null;

    try {
      setUploading(true);
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `crew-photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('crew-documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('crew-documents')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast({
        title: '사진 업로드 실패',
        description: '사진 업로드 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.rank_id) {
      toast({
        title: '필수 항목 누락',
        description: '이름과 직급은 필수 항목입니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Upload photo if selected
      let photoUrl = formData.photo_url;
      if (selectedFile) {
        const uploadedUrl = await uploadPhoto();
        if (uploadedUrl) {
          photoUrl = uploadedUrl;
        }
      }

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
      };

      if (crew) {
        await crewService.update(crew.id, crewData);
        toast({
          title: '수정 완료',
          description: '선원 정보가 수정되었습니다.',
        });
      } else {
        await crewService.create({
          ...crewData,
          current_status: 'registered',
        });
        toast({
          title: '등록 완료',
          description: '선원이 등록되었습니다.',
        });
      }
      onClose(true);
    } catch (error) {
      console.error('Failed to save crew member:', error);
      toast({
        title: '저장 실패',
        description: '선원 정보 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{crew ? '선원 정보 수정' : '선원 등록'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">기본 정보</TabsTrigger>
              <TabsTrigger value="biodata">Bio-Data</TabsTrigger>
              <TabsTrigger value="emergency">비상 연락처</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              {/* Photo Upload */}
              <div className="flex flex-col items-center space-y-3 pb-4 border-b">
                <div className="relative">
                  {previewUrl ? (
                    <div className="relative">
                      <img
                        src={previewUrl}
                        alt="선원 사진"
                        className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center border-4 border-gray-200">
                      <User className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="photo" className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                      <Upload className="w-4 h-4" />
                      <span className="text-sm">사진 업로드</span>
                    </div>
                  </Label>
                  <Input
                    id="photo"
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
                {selectedFile && (
                  <p className="text-xs text-gray-500">
                    선택된 파일: {selectedFile.name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>이름 *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label>직급 *</Label>
                  <Select value={formData.rank_id} onValueChange={(value) => setFormData(prev => ({ ...prev, rank_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="직급 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {ranks.map(rank => (
                        <SelectItem key={rank.id} value={String(rank.id)}>
                          {rank.name} ({rank.rank_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>국적</Label>
                  <Input
                    value={formData.nationality}
                    onChange={(e) => setFormData(prev => ({ ...prev, nationality: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>생년월일</Label>
                  <Input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData(prev => ({ ...prev, date_of_birth: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>여권번호</Label>
                  <Input
                    value={formData.passport_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, passport_number: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>선원수첩번호</Label>
                  <Input
                    value={formData.seaman_book_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, seaman_book_number: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>연락처</Label>
                  <Input
                    value={formData.contact_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>이메일</Label>
                  <Input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="biodata" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>출생지</Label>
                  <Input
                    value={formData.place_of_birth}
                    onChange={(e) => setFormData(prev => ({ ...prev, place_of_birth: e.target.value }))}
                    placeholder="예: 서울, 대한민국"
                  />
                </div>

                <div>
                  <Label>혈액형</Label>
                  <Select value={formData.blood_type} onValueChange={(value) => setFormData(prev => ({ ...prev, blood_type: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="혈액형 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      <SelectItem value="A+">A+</SelectItem>
                      <SelectItem value="A-">A-</SelectItem>
                      <SelectItem value="B+">B+</SelectItem>
                      <SelectItem value="B-">B-</SelectItem>
                      <SelectItem value="AB+">AB+</SelectItem>
                      <SelectItem value="AB-">AB-</SelectItem>
                      <SelectItem value="O+">O+</SelectItem>
                      <SelectItem value="O-">O-</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>키 (cm)</Label>
                  <Input
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                    placeholder="170"
                  />
                </div>

                <div>
                  <Label>몸무게 (kg)</Label>
                  <Input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                    placeholder="70"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>신발 사이즈</Label>
                  <Input
                    value={formData.shoe_size}
                    onChange={(e) => setFormData(prev => ({ ...prev, shoe_size: e.target.value }))}
                    placeholder="예: 270mm, US 9"
                  />
                </div>

                <div>
                  <Label>작업복 사이즈</Label>
                  <Input
                    value={formData.coverall_size}
                    onChange={(e) => setFormData(prev => ({ ...prev, coverall_size: e.target.value }))}
                    placeholder="예: L, XL"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="emergency" className="space-y-4 mt-4">
              <div>
                <Label>비상연락처 (본인)</Label>
                <Input
                  value={formData.emergency_contact}
                  onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact: e.target.value }))}
                  placeholder="비상 시 연락 가능한 본인 연락처"
                />
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-semibold mb-3">가족 연락처</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label>이름</Label>
                    <Input
                      value={formData.next_of_kin}
                      onChange={(e) => setFormData(prev => ({ ...prev, next_of_kin: e.target.value }))}
                      placeholder="가족 이름"
                    />
                  </div>

                  <div>
                    <Label>관계</Label>
                    <Input
                      value={formData.next_of_kin_relationship}
                      onChange={(e) => setFormData(prev => ({ ...prev, next_of_kin_relationship: e.target.value }))}
                      placeholder="예: 배우자, 부모, 형제"
                    />
                  </div>

                  <div>
                    <Label>연락처</Label>
                    <Input
                      value={formData.next_of_kin_contact}
                      onChange={(e) => setFormData(prev => ({ ...prev, next_of_kin_contact: e.target.value }))}
                      placeholder="가족 연락처"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onClose(false)} disabled={uploading}>
              취소
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? '업로드 중...' : (crew ? '수정' : '등록')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}