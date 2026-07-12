import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Upload, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import {
  getMedicalRecordLogs, addMedicalRecordLog, deleteMedicalRecordLog, updateMedicalRecord,
} from '@/services/crew-extended.service';
import type { MedicalAttachment, MedicalRecordLog } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';

interface MedicalRecordFollowUpProps {
  medicalRecordId: string;
  attachments: MedicalAttachment[];
  onChanged?: () => void;
}

// 상병 기록 하나에 계속 쌓아나가는 치료 경과 로그와 첨부파일(진단서/청구서/영수증 등)을 관리한다.
// 기록 자체가 저장된 뒤(medicalRecordId가 있을 때)에만 사용할 수 있다.
// 첨부파일 목록은 부모가 다시 그려주지 않아도 즉시 반영되도록 내부 상태로 들고 있는다
// (medicalRecordId가 바뀔 때만 prop 값으로 다시 초기화).
export default function MedicalRecordFollowUp({ medicalRecordId, attachments, onChanged }: MedicalRecordFollowUpProps) {
  const { toast } = useToast();
  const [localAttachments, setLocalAttachments] = useState<MedicalAttachment[]>(attachments);
  const [logs, setLogs] = useState<MedicalRecordLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [newLogDate, setNewLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [newLogNote, setNewLogNote] = useState('');
  const [addingLog, setAddingLog] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setLocalAttachments(attachments); }, [medicalRecordId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try { setLogs(await getMedicalRecordLogs(medicalRecordId)); }
    finally { setLoadingLogs(false); }
  }, [medicalRecordId]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleAddLog = async () => {
    if (!newLogNote.trim()) { toast({ title: '내용을 입력하세요', variant: 'destructive' }); return; }
    try {
      setAddingLog(true);
      await addMedicalRecordLog(medicalRecordId, newLogDate, newLogNote.trim());
      setNewLogNote('');
      await loadLogs();
      onChanged?.();
    } catch (e) {
      toast({ title: '로그 추가 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setAddingLog(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm('이 로그를 삭제하시겠습니까?')) return;
    try { await deleteMedicalRecordLog(logId); await loadLogs(); onChanged?.(); }
    catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  const getAttachmentUrl = (path: string) => supabase.storage.from('documents').getPublicUrl(path).data.publicUrl;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter(f => {
      if (f.size > 10 * 1024 * 1024) { toast({ title: `${f.name}은 10MB를 초과합니다.`, variant: 'destructive' }); return false; }
      return true;
    });
    e.target.value = '';
    if (files.length === 0) return;
    try {
      setUploading(true);
      const uploaded: MedicalAttachment[] = [];
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `medical-records/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error } = await supabase.storage.from('documents').upload(path, file);
        if (error) throw new Error(`${file.name} 업로드 실패`);
        uploaded.push({ name: file.name, path, size: file.size, type: file.type });
      }
      const next = [...localAttachments, ...uploaded];
      await updateMedicalRecord(medicalRecordId, { attachments: next });
      setLocalAttachments(next);
      onChanged?.();
      toast({ title: '첨부파일이 추가되었습니다.' });
    } catch (e) {
      toast({ title: '업로드 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (idx: number) => {
    if (!confirm('이 첨부파일을 삭제하시겠습니까?')) return;
    try {
      const next = localAttachments.filter((_, i) => i !== idx);
      await updateMedicalRecord(medicalRecordId, { attachments: next });
      setLocalAttachments(next);
      onChanged?.();
    } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600">치료 경과 로그</p>
        <div className="flex gap-2">
          <Input type="date" value={newLogDate} onChange={e => setNewLogDate(e.target.value)} className="h-8 text-xs w-32 shrink-0" disabled={addingLog} />
          <Textarea value={newLogNote} onChange={e => setNewLogNote(e.target.value)} placeholder="경과 내용을 입력하세요" rows={1} className="text-xs resize-none min-h-8 py-1.5" disabled={addingLog} />
          <Button type="button" size="sm" className="h-8 gap-1 shrink-0" onClick={handleAddLog} disabled={addingLog}><Plus className="w-3.5 h-3.5" />추가</Button>
        </div>
        {loadingLogs ? (
          <p className="text-xs text-gray-400 py-2">로딩 중...</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">등록된 로그가 없습니다.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {logs.map(l => (
              <div key={l.id} className="flex items-start justify-between gap-2 p-2 bg-gray-50 rounded-md">
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-500">{l.log_date}</p>
                  <p className="text-xs whitespace-pre-wrap break-words">{l.note}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 shrink-0" onClick={() => handleDeleteLog(l.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-semibold text-gray-600">첨부파일 <span className="text-gray-400 font-normal">(진단서, 청구서, 영수증 등 — 계속 추가 가능)</span></p>
        <div className="border-2 border-dashed rounded-md p-3 text-center">
          <input type="file" id="medical-attachment-upload" multiple onChange={handleFileChange} className="hidden" disabled={uploading} />
          <label htmlFor="medical-attachment-upload" className={`cursor-pointer flex flex-col items-center gap-1.5 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-5 h-5 text-gray-400" />
            <div className="text-xs text-gray-600"><span className="text-blue-600 font-medium">{uploading ? '업로드 중...' : '파일 선택'}</span> 또는 드래그 앤 드롭 (최대 10MB)</div>
          </label>
        </div>
        {localAttachments.length > 0 && (
          <div className="space-y-1.5">
            {localAttachments.map((a, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs truncate">{a.name}</span>
                  <span className="text-xs text-gray-500 shrink-0">({(a.size / 1024).toFixed(1)} KB)</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(getAttachmentUrl(a.path), '_blank')}><Download className="h-3.5 w-3.5" /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeAttachment(idx)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
