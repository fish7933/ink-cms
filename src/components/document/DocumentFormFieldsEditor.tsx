import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DocumentFormField, DocumentFormFieldType } from '@/types/approval-document';

interface DocumentFormFieldsEditorProps {
  fields: DocumentFormField[];
  onChange: (fields: DocumentFormField[]) => void;
  disabled?: boolean;
}

const FIELD_TYPE_LABELS: Record<DocumentFormFieldType, string> = {
  text: '한 줄 텍스트',
  textarea: '여러 줄 텍스트',
  number: '숫자',
  date: '날짜',
  select: '선택 목록',
};

const newField = (): DocumentFormField => ({ key: `field_${Date.now()}`, label: '', type: 'text', required: false });

// 문서 양식함: 문서유형별 입력 필드를 자유롭게 추가/수정/삭제/순서변경할 수 있는 범용 양식 빌더.
export default function DocumentFormFieldsEditor({ fields, onChange, disabled }: DocumentFormFieldsEditorProps) {
  const update = (i: number, patch: Partial<DocumentFormField>) =>
    onChange(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () => onChange([...fields, newField()]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {fields.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center border rounded-md">
          입력 필드가 없으면 제목/본문만 있는 자유 서식으로 동작합니다. 필드를 추가하면 그 필드들로 구성된 입력폼으로 바뀝니다.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={i} className="border rounded-md p-2.5 space-y-2 bg-gray-50">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <span className="text-[11px] text-gray-500">필드명</span>
                  <Input value={field.label} onChange={e => update(i, { label: e.target.value })} placeholder="예: 지출 항목" className="h-8 text-sm" disabled={disabled} />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-gray-500">입력 방식</span>
                  <Select value={field.type} onValueChange={v => update(i, { type: v as DocumentFormFieldType })} disabled={disabled}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(FIELD_TYPE_LABELS) as [DocumentFormFieldType, string][]).map(([v, label]) => (
                        <SelectItem key={v} value={v} className="text-sm">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-0.5 pb-1">
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => move(i, -1)} disabled={disabled || i === 0}><ArrowUp className="w-3.5 h-3.5" /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => move(i, 1)} disabled={disabled || i === fields.length - 1}><ArrowDown className="w-3.5 h-3.5" /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => remove(i)} disabled={disabled}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              {field.type === 'select' && (
                <div className="space-y-1">
                  <span className="text-[11px] text-gray-500">선택 항목 (쉼표로 구분)</span>
                  <Input
                    value={(field.options || []).join(', ')}
                    onChange={e => update(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="예: 여비교통비, 식비, 소모품비"
                    className="h-8 text-sm"
                    disabled={disabled}
                  />
                </div>
              )}
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer w-fit">
                <Checkbox checked={field.required} onCheckedChange={c => update(i, { required: c === true })} disabled={disabled} />
                필수 입력
              </label>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 w-full" onClick={add} disabled={disabled}>
        <Plus className="w-3.5 h-3.5" />필드 추가
      </Button>
    </div>
  );
}
