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

// 클립보드 text/html은 보통 <html><head><style>...</style></head><body><table>...</table></body></html>
// 형태(엑셀/구글시트 공통)이므로, 클래스 서식을 인라인으로 합친 뒤 그 안의 <table>만 뽑아 정제한다.
export function extractSanitizedTable(html: string): string {
  const doc = new DOMParser().parseFromString(inlineClassStyles(html), 'text/html');
  const table = doc.querySelector('table');
  if (!table) return '';
  return sanitizeTableHtml(table.outerHTML);
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
