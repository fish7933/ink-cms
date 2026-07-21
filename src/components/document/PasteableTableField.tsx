import { Plus, Minus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseTableFieldValue, stringifyTableFieldValue, parseClipboardGrid, pasteIntoGrid, type TableFieldGrid } from '@/utils/table-field';

interface Props {
  value: string;
  onChange: (json: string) => void;
  disabled?: boolean;
}

const DEFAULT_COLS_FALLBACK = 4;

// 엑셀 등에서 셀 범위를 복사해 그대로 붙여넣을 수 있는 표 입력 컨트롤 (기안서 동적 양식 field.type === 'table').
export default function PasteableTableField({ value, onChange, disabled }: Props) {
  const grid = parseTableFieldValue(value);

  const setGrid = (next: TableFieldGrid) => onChange(stringifyTableFieldValue(next));

  const handleCellChange = (r: number, c: number, v: string) => {
    const next = grid.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? v : cell) : row);
    setGrid(next);
  };

  const handlePaste = (r: number, c: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const pasted = parseClipboardGrid(text);
    setGrid(pasteIntoGrid(grid, r, c, pasted));
  };

  const addRow = () => setGrid([...grid, Array(grid[0]?.length || DEFAULT_COLS_FALLBACK).fill('')]);
  const addCol = () => setGrid(grid.map(row => [...row, '']));
  const removeLastRow = () => grid.length > 1 && setGrid(grid.slice(0, -1));
  const removeLastCol = () => (grid[0]?.length || 0) > 1 && setGrid(grid.map(row => row.slice(0, -1)));
  const clearAll = () => setGrid(grid.map(row => row.map(() => '')));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 flex-wrap">
        <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[11px] gap-0.5" onClick={addRow} disabled={disabled}><Plus className="w-3 h-3" />행</Button>
        <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[11px] gap-0.5" onClick={addCol} disabled={disabled}><Plus className="w-3 h-3" />열</Button>
        <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[11px] gap-0.5" onClick={removeLastRow} disabled={disabled || grid.length <= 1}><Minus className="w-3 h-3" />행</Button>
        <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[11px] gap-0.5" onClick={removeLastCol} disabled={disabled || (grid[0]?.length || 0) <= 1}><Minus className="w-3 h-3" />열</Button>
        <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] gap-0.5 text-red-500" onClick={clearAll} disabled={disabled}><Trash2 className="w-3 h-3" />전체 지우기</Button>
        <span className="text-[10px] text-gray-400 ml-auto">엑셀에서 범위를 복사(Ctrl+C)한 뒤 셀을 클릭하고 붙여넣기(Ctrl+V)하세요</span>
      </div>
      <div className="border rounded-md overflow-x-auto">
        <table className="border-collapse w-full">
          <tbody>
            {grid.map((row, r) => (
              <tr key={r}>
                {row.map((cellVal, c) => (
                  <td key={c} className="border p-0">
                    <input
                      value={cellVal}
                      disabled={disabled}
                      onChange={e => handleCellChange(r, c, e.target.value)}
                      onPaste={e => handlePaste(r, c, e)}
                      className="w-full h-7 px-1.5 text-xs outline-none bg-transparent focus:bg-blue-50 min-w-[70px]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
