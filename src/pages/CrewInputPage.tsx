import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Upload, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { crewService } from '@/services/crew.service';
import Layout from '@/components/Layout';
import type { CrewRecommendationWithDetails, Rank } from '@/types/models';

export default function CrewInputPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const recommendation = location.state?.recommendation as CrewRecommendationWithDetails;

  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

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
    
    // Additional fields from recommendation
    owner_id: '',
    fleet_id: '',
    current_ship_id: '',
    manning_agency_id: '',
  });

  useEffect(() => {
    if (!recommendation) {
      toast({
        title: '잘못된 접근',
        description: '추천 선원 정보가 없습니다.',
        variant: 'destructive',
      });
      navigate('/my-recommendations');
      return;
    }

    loadRanks();
    
    // Pre-fill form with recommendation data
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
  }, [recommendation, navigate, toast]);

  const loadRanks = async () => {
    const { data } = await supabase.from('ranks').select('*').order('display_order');
    if (data) setRanks(data);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
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
    if (!selectedFile) return null;

    try {
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
      return null;
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
      setLoading(true);

      let photoUrl = formData.photo_url;
      if (selectedFile) {
        const uploadedUrl = await uploadPhoto();
        if (uploadedUrl) photoUrl = uploadedUrl;
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
        
        // Assignment info
        owner_id: formData.owner_id || undefined,
        fleet_id: formData.fleet_id || undefined,
        current_ship_id: formData.current_ship_id || undefined,
        manning_agency_id: formData.manning_agency_id,
        current_status: 'registered' as const,
      };

      await crewService.create(crewData);

      toast({
        title: '등록 완료',
        description: '선원 정보가 성공적으로 등록되었습니다.',
      });

      navigate('/crew/management');
    } catch (error) {
      console.error('Failed to save crew member:', error);
      toast({
        title: '저장 실패',
        description: '선원 정보 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!recommendation) return null;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">선원 상세 정보 입력</h1>
            <p className="text-sm text-muted-foreground">
              추천된 선원의 상세 정보를 입력하여 등록합니다.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Assignment Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">배정 정보</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">선주사</Label>
                <div className="font-medium mt-1">{recommendation.company_name || '-'}</div>
              </div>
              <div>
                <Label className="text-muted-foreground">선박</Label>
                <div className="font-medium mt-1">{recommendation.ship_name || '-'}</div>
              </div>
              <div>
                <Label className="text-muted-foreground">직급</Label>
                <div className="font-medium mt-1">
                  {recommendation.rank_code} ({recommendation.rank_name})
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">매닝사</Label>
                <div className="font-medium mt-1">{recommendation.manning_agency_name}</div>
              </div>
            </CardContent>
          </Card>

          {/* Crew Details Tabs */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="basic">기본 정보</TabsTrigger>
                  <TabsTrigger value="biodata">Bio-Data</TabsTrigger>
                  <TabsTrigger value="emergency">비상 연락처</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-6">
                  {/* Photo Upload */}
                  <div className="flex flex-col items-center space-y-4 pb-6 border-b">
                    <div className="relative">
                      {previewUrl ? (
                        <div className="relative">
                          <img
                            src={previewUrl}
                            alt="선원 사진"
                            className="w-32 h-32 rounded-full object-cover border-4 border-gray-100 shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={removePhoto}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 shadow-sm"
                          >
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
                      <Input
                        id="photo"
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      {selectedFile && (
                        <p className="text-xs text-gray-500 mt-2">
                          {selectedFile.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>이름 *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>직급 *</Label>
                      <Select 
                        value={formData.rank_id} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, rank_id: value }))}
                        disabled // Rank is fixed from recommendation
                      >
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

                    <div className="space-y-2">
                      <Label>국적</Label>
                      <Input
                        value={formData.nationality}
                        onChange={(e) => setFormData(prev => ({ ...prev, nationality: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>생년월일</Label>
                      <Input
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => setFormData(prev => ({ ...prev, date_of_birth: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>여권번호</Label>
                      <Input
                        value={formData.passport_number}
                        onChange={(e) => setFormData(prev => ({ ...prev, passport_number: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>선원수첩번호</Label>
                      <Input
                        value={formData.seaman_book_number}
                        onChange={(e) => setFormData(prev => ({ ...prev, seaman_book_number: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>연락처</Label>
                      <Input
                        value={formData.contact_phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>이메일</Label>
                      <Input
                        type="email"
                        value={formData.contact_email}
                        onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="biodata" className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>출생지</Label>
                      <Input
                        value={formData.place_of_birth}
                        onChange={(e) => setFormData(prev => ({ ...prev, place_of_birth: e.target.value }))}
                        placeholder="예: 서울, 대한민국"
                      />
                    </div>

                    <div className="space-y-2">
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

                    <div className="space-y-2">
                      <Label>키 (cm)</Label>
                      <Input
                        type="number"
                        value={formData.height}
                        onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                        placeholder="170"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>몸무게 (kg)</Label>
                      <Input
                        type="number"
                        value={formData.weight}
                        onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                        placeholder="70"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>신발 사이즈</Label>
                      <Input
                        value={formData.shoe_size}
                        onChange={(e) => setFormData(prev => ({ ...prev, shoe_size: e.target.value }))}
                        placeholder="예: 270mm, US 9"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>작업복 사이즈</Label>
                      <Input
                        value={formData.coverall_size}
                        onChange={(e) => setFormData(prev => ({ ...prev, coverall_size: e.target.value }))}
                        placeholder="예: L, XL"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="emergency" className="space-y-6">
                  <div className="space-y-2">
                    <Label>비상연락처 (본인)</Label>
                    <Input
                      value={formData.emergency_contact}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact: e.target.value }))}
                      placeholder="비상 시 연락 가능한 본인 연락처"
                    />
                  </div>

                  <div className="pt-6 border-t">
                    <h3 className="font-semibold mb-4 text-lg">가족 연락처</h3>
                    
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label>이름</Label>
                        <Input
                          value={formData.next_of_kin}
                          onChange={(e) => setFormData(prev => ({ ...prev, next_of_kin: e.target.value }))}
                          placeholder="가족 이름"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>관계</Label>
                        <Input
                          value={formData.next_of_kin_relationship}
                          onChange={(e) => setFormData(prev => ({ ...prev, next_of_kin_relationship: e.target.value }))}
                          placeholder="예: 배우자, 부모, 형제"
                        />
                      </div>

                      <div className="space-y-2">
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
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={loading}>
              취소
            </Button>
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
    </Layout>
  );
}