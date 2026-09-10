import DOMPurify from 'dompurify';

// 기안서 본문(자유서식 content, 구조화 양식의 'rich_text' 필드) 처리.
// 워드/한글 등에서 복사하면 클립보드에 text/html로 문단/제목/목록/굵게 등 서식이 담겨오므로,
// table-field.ts의 표 전용 정제와는 별도로(허용 태그 목적이 서로 달라 한쪽을 고치다 다른 쪽에
// 영향 주는 걸 막기 위해 독립 파일로 둔다) 문서 본문에 맞는 태그만 허용해 정제한다.
const ALLOWED_TAGS = [
  'p', 'div', 'br', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'a',
  'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'td', 'th',
  'font',
];
const ALLOWED_ATTR = ['style', 'href', 'target', 'rel', 'colspan', 'rowspan', 'align', 'valign'];

// 워드의 "변경 내용 추적" 표시나 단(column)/인용 블록 서식은 문단/글자에 border(주로
// border-left)를 넣어 화면에 세로 줄(막대)이 그대로 붙어 나온다 — 표(table/tr/td/th) 밖에서는
// 이런 레이아웃성 속성을 허용하지 않고, 실제로 필요한 글자 서식(굵게/기울임/밑줄/정렬/색상)만
// 남긴다. 표 안에서는 테두리/폭/배경이 표 모양 자체에 필요하므로 그대로 둔다.
const TABLE_TAGS = new Set(['table', 'tr', 'td', 'th', 'colgroup', 'col', 'thead', 'tbody']);
const SAFE_STYLE_PROPS = ['font-weight', 'font-style', 'text-decoration', 'text-align', 'color'];
const SAFE_STYLE_PROPS_TABLE = [...SAFE_STYLE_PROPS, 'border', 'border-collapse', 'vertical-align', 'width', 'background-color'];

function sanitizeInlineStyles(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('[style]').forEach(el => {
    const allowed = TABLE_TAGS.has(el.tagName.toLowerCase()) ? SAFE_STYLE_PROPS_TABLE : SAFE_STYLE_PROPS;
    const kept = (el.getAttribute('style') || '')
      .split(';')
      .map(decl => decl.trim())
      .filter(decl => {
        const prop = decl.split(':')[0]?.trim().toLowerCase();
        return prop && allowed.includes(prop);
      });
    if (kept.length > 0) el.setAttribute('style', `${kept.join(';')};`);
    else el.removeAttribute('style');
  });
}

// 워드/한글에서 표를 붙여넣으면 원본 문서의 고정 폭(pt/px)이 style="width:..."/width="..."로
// 그대로 딸려와, 본문 폭보다 좁게(또는 넘치게) 보인다 — 화면 표는 항상 문서 전체 폭을 쓰도록
// 표와 그 바로 아래 열(col/td/th)의 폭 지정을 제거하고 100%로 강제한다.
function forceFullWidthTables(doc: Document): void {
  doc.querySelectorAll('table').forEach(table => {
    table.removeAttribute('width');
    const style = table.getAttribute('style') || '';
    table.setAttribute('style', `${style.replace(/width\s*:\s*[^;]+;?/gi, '')};width:100%;`);
  });
  doc.querySelectorAll('col').forEach(col => col.removeAttribute('width'));
}

export function sanitizeRichTextHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.querySelectorAll('a[href]').forEach(a => {
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('target', '_blank');
  });
  sanitizeInlineStyles(doc);
  forceFullWidthTables(doc);
  return doc.body.innerHTML;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// text/html이 없는 붙여넣기(메모장 등)에 대한 대체 — 줄바꿈 기준으로 문단을 만든다.
export function plainTextToRichTextHtml(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  return lines.map(line => `<p>${line ? escapeHtml(line) : '<br>'}</p>`).join('');
}

// 저장된 값이 새로 도입된 HTML 서식인지, 예전부터 있던 순수 텍스트(줄바꿈 문자만 있는)인지
// 판별한다 — 마이그레이션 없이 읽는 시점에만 분기해 기존 문서를 그대로 보여주기 위함.
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

// 읽기전용 렌더용 — HTML이면 정제해서, 순수 텍스트면 이스케이프 후 줄바꿈을 <br>로 바꿔 반환한다.
export function renderRichTextReadOnlyHtml(value: string): string {
  return looksLikeHtml(value) ? sanitizeRichTextHtml(value) : escapeHtml(value).replace(/\n/g, '<br>');
}
