import DOMPurify from 'dompurify';

// 기안서 양식의 'table' 필드(엑셀 붙여넣기 가능한 표) 값 처리.
// 엑셀에서 복사하면 클립보드에 text/html로 셀별 서식(글꼴/테두리/배경/정렬 등)이 포함된 <table>이
// 함께 담겨오므로, 이를 그대로 받아 서식을 보존한다 — 대신 신뢰할 수 없는 외부 HTML이므로
// DOMPurify로 표/서식 관련 태그·속성만 허용하고 스크립트/이벤트 핸들러 등은 모두 제거한다.
const ALLOWED_TAGS = ['table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'b', 'strong', 'i', 'em', 'u', 'span', 'div', 'p', 'font'];
const ALLOWED_ATTR = ['style', 'colspan', 'rowspan', 'align', 'valign', 'width', 'height'];

export function sanitizeTableHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}

// 엑셀은 글꼴 크기/굵기 등 서식 대부분을 인라인 style이 아니라 <head><style>의 클래스
// 규칙(.xl65 등)으로 내보내고 셀에는 class만 붙여둔다 — sanitize 단계에서 <style>/class를
// 통째로 제거하면 그 서식이 전부 사라지므로, 제거하기 전에 클래스 규칙을 각 셀의 인라인
// style로 먼저 합쳐넣는다(기존 인라인 style이 있으면 그게 더 구체적인 값이므로 뒤에 이어붙여 우선한다).
function inlineClassStyles(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const styleByClass = new Map<string, string>();
  doc.querySelectorAll('style').forEach(styleEl => {
    const cssText = styleEl.textContent || '';
    const ruleRe = /\.([\w-]+)\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(cssText))) {
      const [, cls, body] = m;
      styleByClass.set(cls, `${styleByClass.get(cls) || ''}${body.trim()};`);
    }
  });
  if (styleByClass.size > 0) {
    doc.querySelectorAll('[class]').forEach(el => {
      const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      const fromClasses = classes.map(c => styleByClass.get(c) || '').filter(Boolean).join('');
      if (fromClasses) el.setAttribute('style', `${fromClasses}${el.getAttribute('style') || ''}`);
      el.removeAttribute('class');
    });
  }
  return doc.body.innerHTML;
}

function removeWidthDeclarations(el: Element): void {
  el.removeAttribute('width');
  const style = el.getAttribute('style');
  if (style) {
    const cleaned = style.replace(/width\s*:\s*[^;]+;?/gi, '').trim();
    if (cleaned) el.setAttribute('style', cleaned);
    else el.removeAttribute('style');
  }
}

// 엑셀/구글시트/WPS 등은 원본 시트의 열 폭을 서로 다른 방식(<col> 유무, pt/px, mso-* 접두
// 속성 등)으로 내보내는데, 그 표기를 정규식으로 일일이 다 대응하려 하면 소스마다 놓치는
// 경우가 계속 나온다 — 대신 원래 폭 그대로(아직 페이지에 맞게 줄이기 전) 화면 밖에 실제로
// 렌더링해서 브라우저가 실제로 계산한 렌더링 폭을 그대로 읽어와 비율을 구한다. 어떤 소스에서
// 왔든 "브라우저가 그 표를 실제로 어떻게 그렸는지"를 그대로 재는 것이므로 서식/단위 차이에
// 관계없이 항상 정확하다. 반드시 정제(sanitize)된 안전한 HTML만 넘겨야 한다 — 살아있는 DOM에
// 붙이므로, 정제 전 원본을 여기 붙이면 onerror 등 이벤트 핸들러가 그대로 실행될 수 있다.
function fillPageWidth(safeTableHtml: string, containerWidthPx = 900): string {
  const container = document.createElement('div');
  container.style.cssText = `position:fixed; left:-99999px; top:0; visibility:hidden; width:${containerWidthPx}px;`;
  container.innerHTML = safeTableHtml;
  document.body.appendChild(container);
  try {
    const table = container.querySelector('table');
    const firstRow = table?.querySelector('tr');
    if (!table || !firstRow) return safeTableHtml;

    const headCells = Array.from(firstRow.children) as HTMLElement[];
    const measured = headCells.map(c => c.getBoundingClientRect().width);
    const total = measured.reduce((a, b) => a + b, 0);
    if (total <= 0) return safeTableHtml;

    removeWidthDeclarations(table);
    table.style.width = '100%';
    table.querySelectorAll('col').forEach(c => c.remove());
    headCells.forEach((cell, i) => {
      removeWidthDeclarations(cell);
      cell.style.width = `${((measured[i] / total) * 100).toFixed(2)}%`;
    });
    Array.from(table.querySelectorAll('tr')).forEach(row => {
      if (row === firstRow) return;
      Array.from(row.children).forEach(cell => removeWidthDeclarations(cell));
    });
    return table.outerHTML;
  } finally {
    document.body.removeChild(container);
  }
}

// 클립보드 text/html은 보통 <html><head><style>...</style></head><body><table>...</table></body></html>
// 형태(엑셀/구글시트 공통)이므로, 클래스 서식을 인라인으로 합치고 정제한 뒤, 그 안전한 표를
// 실제로 렌더링해 폭을 페이지에 맞게 재계산한다.
export function extractSanitizedTable(html: string): string {
  const doc = new DOMParser().parseFromString(inlineClassStyles(html), 'text/html');
  const table = doc.querySelector('table');
  if (!table) return '';
  const safe = sanitizeTableHtml(table.outerHTML);
  return sanitizeTableHtml(fillPageWidth(safe));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// text/html이 없는 붙여넣기(예: 메모장, 순수 텍스트)에 대한 대체 — 탭/줄바꿈 기준으로 소박한 표를 만든다.
export function plainTextToTableHtml(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const rows = lines
    .map(line => `<tr>${line.split('\t').map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<table>${rows}</table>`;
}

// 화면에 렌더링할 때만 각 셀을 직접 편집 가능하게 만든다 (저장되는 값 자체엔 넣지 않는다).
export function injectContentEditable(html: string): string {
  const doc = new DOMParser().parseFromString(sanitizeTableHtml(html), 'text/html');
  doc.querySelectorAll('td, th').forEach(cell => cell.setAttribute('contenteditable', 'true'));
  return doc.body.innerHTML;
}

// 편집 후 DOM에서 다시 읽어온 HTML에서 에디터 전용 속성을 제거하고 재정제해 저장용 값으로 되돌린다.
export function stripContentEditable(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('[contenteditable]').forEach(cell => cell.removeAttribute('contenteditable'));
  return sanitizeTableHtml(doc.body.innerHTML);
}
