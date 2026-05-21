import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCertificateTypes } from '@/services/certificate-type.service';
import { addCrewCertificate, updateCrewCertificate, uploadCertificateFile } from '@/services/crew-certificate.service';
import type { CrewCertificate } from '@/types/crew-certificate';
import type { CertificateType } from '@/types/certificate-type';
import { Upload, FileText } from 'lucide-react';

interface CrewCertificateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewId: string;
  certificate?: CrewCertificate;
  onSuccess: () => void;
}

export default function CrewCertificateDialog({
  open,
  onOpenChange,
  crewId,
  certificate,
  onSuccess,
}: CrewCertificateDialogProps) {
  const [certificateTypes, setCertificateTypes] = useState<CertificateType[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [formData, setFormData] = useState({
    certificate_type_id: '',
    certificate_number: '',
    issue_date: '',
    expiry_date: '',
    issuing_authority: '',
    file_url: '',
    file_name: '',
    notes: '',
  });

  useEffect(() => {
    loadCertificateTypes();
  }, []);

  useEffect(() => {
    if (certificate) {
      setFormData({
        certificate_type_id: certificate.certificate_type_id,
        certificate_number: certificate.certificate_number,
        issue_date: certificate.issue_date,
        expiry_date: certificate.expiry_date,
        issuing_authority: certificate.issuing_authority || '',
        file_url: certificate.file_url || '',
        file_name: certificate.file_name || '',
        notes: certificate.notes || '',
      });
    } else {
      setFormData({
        certificate_type_id: '',
        certificate_number: '',
        issue_date: '',
        expiry_date: '',
        issuing_authority: '',
        file_url: '',
        file_name: '',
        notes: '',
      });
    }
    setSelectedFile(null);
  }, [certificate, open]);

  const loadCertificateTypes = async () => {
    try {
      const types = await getCertificateTypes();
      setCertificateTypes(types);
    } catch (error) {
      console.error('Error loading certificate types:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let fileUrl = formData.file_url;
      let fileName = formData.file_name;

      // Upload file if selected
      if (selectedFile) {
        setUploadingFile(true);
        fileUrl = await uploadCertificateFile(selectedFile, crewId);
        fileName = selectedFile.name;
        setUploadingFile(false);
      }

      const certificateData = {
        crew_id: crewId,
        certificate_type_id: formData.certificate_type_id,
        certificate_number: formData.certificate_number,
        issue_date: formData.issue_date,
        expiry_date: formData.expiry_date,
        issuing_authority: formData.issuing_authority || null,
        file_url: fileUrl || null,
        file_name: fileName || null,
        notes: formData.notes || null,
      };

      if (certificate) {
        await updateCrewCertificate(certificate.id, certificateData);
      } else {
        await addCrewCertificate(certificateData);
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving certificate:', error);
      alert('증서 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setUploadingFile(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {certificate ? '증서 수정' : '증서 추가'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            선원의 증서 정보를 {certificate ? '수정' : '등록'}합니다
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="certificate_type" className="text-xs">증서 유형 *</Label>
              <Select
                value={formData.certificate_type_id}
                onValueChange={(value) => setFormData({ ...formData, certificate_type_id: value })}
                required
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="증서 유형을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {certificateTypes.map(type => (
                    <SelectItem key={type.id} value={String(type.id)} className="text-sm">
                      {type.name} ({type.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="certificate_number" className="text-xs">증서 번호 *</Label>
              <Input
                id="certificate_number"
                value={formData.certificate_number}
                onChange={(e) => setFormData({ ...formData, certificate_number: e.target.value })}
                placeholder="증서 번호를 입력하세요"
                required
                className="h-9 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="issue_date" className="text-xs">발급일 *</Label>
                <Input
                  id="issue_date"
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                  required
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="expiry_date" className="text-xs">만료일 *</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                  required
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issuing_authority" className="text-xs">발급 기관</Label>
              <Input
                id="issuing_authority"
                value={formData.issuing_authority}
                onChange={(e) => setFormData({ ...formData, issuing_authority: e.target.value })}
                placeholder="발급 기관을 입력하세요"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="file" className="text-xs">증서 파일</Label>
              <div className="flex gap-2">
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="h-9 text-sm"
                />
                {formData.file_name && !selectedFile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(formData.file_url, '_blank')}
                    className="h-9 px-3"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    보기
                  </Button>
                )}
              </div>
              {selectedFile && (
                <p className="text-xs text-gray-500">
                  선택된 파일: {selectedFile.name}
                </p>
              )}
              {formData.file_name && !selectedFile && (
                <p className="text-xs text-gray-500">
                  현재 파일: {formData.file_name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">비고</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="추가 정보를 입력하세요"
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading || uploadingFile}
              className="h-8"
            >
              취소
            </Button>
            <Button 
              type="submit" 
              size="sm" 
              className="h-8"
              disabled={loading || uploadingFile}
            >
              {uploadingFile ? (
                <>
                  <Upload className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  업로드 중...
                </>
              ) : loading ? (
                '저장 중...'
              ) : (
                certificate ? '수정' : '추가'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}