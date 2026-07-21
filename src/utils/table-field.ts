// 기안서 양식의 'table' 필드(엑셀 붙여넣기 가능한 표) 값 처리.
// form_data에는 문자열만 저장 가능하므로 2차원 배열을 JSON 문자열로 직렬화해 담는다.
export type TableFieldGrid = string[][];

const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 4;

export function parseTableFieldValue(raw: unknown): TableFieldGrid {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(r => Array.isArray(r))) {
        return parsed as TableFieldGrid;
      }
    } catch {
      // JSON이 아니면(과거 데이터 등) 빈 표로 대체
    }
  }
  return Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));
}

export function stringifyTableFieldValue(grid: TableFieldGrid): string {
  return JSON.stringify(grid);
}

// 엑셀 등 스프레드시트에서 복사한 범위를 붙여넣기(Ctrl+V)했을 때 오는 탭/줄바꿈 구분 텍스트를 셀 그리드로 변환.
export function parseClipboardGrid(text: string): TableFieldGrid {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop(); // 엑셀 복사 시 붙는 마지막 빈 줄 제거
  return lines.map(line => line.split('\t'));
}

// pasted 그리드를 (startRow, startCol) 위치부터 grid에 덮어쓰며, 필요하면 행/열을 늘린다.
export function pasteIntoGrid(grid: TableFieldGrid, startRow: number, startCol: number, pasted: TableFieldGrid): TableFieldGrid {
  const rows = Math.max(grid.length, startRow + pasted.length);
  const cols = Math.max(grid[0]?.length || 0, startCol + Math.max(...pasted.map(r => r.length)));
  const next: TableFieldGrid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => grid[r]?.[c] ?? '')
  );
  pasted.forEach((prow, ri) => {
    prow.forEach((val, ci) => {
      next[startRow + ri][startCol + ci] = val;
    });
  });
  return next;
}
