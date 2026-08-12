import { useState } from 'react';
import { Plus, Trash2, Paperclip, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DocumentFormField, LineItemRow, ApprovalDocumentAttachment } from '@/types/approval-document';

interface LineItemsFieldProps {
  field: DocumentFormField; // field.columns가 항목(행) 하나의 열 구성
  value: LineItemRow[];
  onChange: (rows: LineItemRow[]) => void;
  disabled?: boolean;
  // type === 'file' 컬럼에서 파일을 실제로 업로드하는 함수 — 호출부(DocumentDraftPage)가 스토리지 업로드를 담당한다.
  onUploadFile?: (file: File) => Promise<ApprovalDocumentAttachment>;
}

function emptyRow(columns: DocumentFormField[]): LineItemRow {
  return Object.fromEntries(columns.map(c => [c.key, c.type === 'number' ? null : c.type === 'file' ? [] : '']));
}

function attachmentsOf(v: LineItemRow[string] | undefined): ApprovalDocumentAttachment[] {
  return Array.isArray(v) ? v as ApprovalDocumentAttachment[] : [];
}

// 항목을 계속 추가/삭제해가며 한 문서 안에 여러 건(예: 지출결의 여러 건)을 담을 수 있게 하는
// 반복 입력 필드. 지출결의서처럼 "지출일은 문서 전체에 하나, 항목별로 목적/금액/지급처는 다름"
// 같은 구조에서 field_schema의 나머지 필드와 함께 쓰인다.
export default function LineItemsField({ field, value, onChange, disabled, onUploadFile }: LineItemsFieldProps) {
  const columns = field.columns || [];
  const rows = value || [];
  const [uploadingCell, setUploadingCell] = useState<string | null>(null);

  const updateCell = (idx: number, key: string, v: string | number | null | ApprovalDocumentAttachment[]) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, [key]: v } : r)));
  };
  const addRow = () => onChange([...rows, emptyRow(columns)]);
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  const handleFilePick = async (idx: number, key: string, files: FileList | null) => {
    if (!files || files.length === 0 || !onUploadFile) return;
    const cellId = `${idx}-${key}`;
    setUploadingCell(cellId);
    try {
      const uploaded: ApprovalDocumentAttachment[] = [];
      for (const file of Array.from(files)) uploaded.push(await onUploadFile(file));
      const current = attachmentsOf(rows[idx]?.[key]);
      updateCell(idx, key, [...current, ...uploaded]);
    } finally {
      setUploadingCell(null);
    }
  };
  const removeFile = (idx: number, key: string, fileIdx: number) => {
    const current = attachmentsOf(rows[idx]?.[key]);
    updateCell(idx, key, current.filter((_, i) => i !== fileIdx));
  };

  const numberColumns = columns.filter(c => c.type === 'number');
  const totalByColumn = new Map(numberColumns.map(c => [c.key, rows.reduce((sum, r) => sum + (Number(r[c.key]) || 0), 0)]));

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {columns.map(c => (
                <th key={c.key} className="text-left p-2 text-xs font-medium text-gray-600 whitespace-nowrap">
                  {c.label}{c.required && ' *'}
                </th>
              ))}
              {!disabled && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="p-4 text-center text-gray-400 text-sm">항목이 없습니다. 아래 버튼으로 추가하세요.</td></tr>
            ) : rows.map((row, idx) => (
              <tr key={idx} className="border-b last:border-0">
                {columns.map(c => (
                  <td key={c.key} className="p-1.5 min-w-[8rem]">
                    {c.type === 'select' ? (
                      <Select value={String(row[c.key] ?? '')} onValueChange={v => updateCell(idx, c.key, v)} disabled={disabled}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {(c.options || []).map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : c.type === 'file' ? (
                      <div className="space-y-1 min-w-[10rem]">
                        {attachmentsOf(row[c.key]).map((a, fi) => (
                          <div key={fi} className="flex items-center gap-1 text-[11px] bg-gray-50 rounded px-1.5 py-1">
                            <FileText className="h-3 w-3 shrink-0 text-gray-400" />
                            <span className="truncate flex-1" title={a.name}>{a.name}</span>
                            {!disabled && (
                              <button type="button" className="text-gray-400 hover:text-red-500 shrink-0" onClick={() => removeFile(idx, c.key, fi)}>×</button>
                            )}
                          </div>
                        ))}
                        {!disabled && (
                          <label className="flex items-center gap-1 h-7 px-2 text-[11px] border rounded-md cursor-pointer text-gray-500 hover:bg-gray-50 w-fit">
                            {uploadingCell === `${idx}-${c.key}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                            첨부
                            <input type="file" multiple className="hidden" disabled={uploadingCell === `${idx}-${c.key}`} onChange={e => { handleFilePick(idx, c.key, e.target.files); e.target.value = ''; }} />
                          </label>
                        )}
                      </div>
                    ) : (
                      <Input
                        type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                        value={row[c.key] as string | number ?? ''}
                        onChange={e => updateCell(idx, c.key, c.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
                        className="h-8 text-xs"
                        disabled={disabled}
                      />
                    )}
                  </td>
                ))}
                {!disabled && (
                  <td className="p-1.5 text-center">
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => removeRow(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && numberColumns.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-medium border-t">
                {columns.map(c => (
                  <td key={c.key} className="p-2 text-xs whitespace-nowrap">
                    {totalByColumn.has(c.key) ? `합계 ${totalByColumn.get(c.key)!.toLocaleString('ko-KR')}` : ''}
                  </td>
                ))}
                {!disabled && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!disabled && (
        <div className="p-2 border-t bg-white">
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />항목 추가
          </Button>
        </div>
      )}
    </div>
  );
}
