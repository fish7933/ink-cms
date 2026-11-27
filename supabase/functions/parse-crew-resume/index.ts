// 선원 이력서(PDF/엑셀, 양식이 회사마다 다름)를 업로드하면 Claude로 내용을 읽어 이름/생년월일/
// 국적/여권·선원수첩/신체정보/자격증 목록/승선 경력을 구조화된 JSON으로 뽑아낸다.
// 1단계: 추출만(DB에 아무것도 쓰지 않음) — 클라이언트가 결과를 검토용으로만 쓴다.
// Claude API 키를 브라우저에 두면 그대로 노출되므로, 반드시 이 서버(Edge Function)에서만 호출한다.
import Anthropic from 'npm:@anthropic-ai/sdk@0.75.0';
import { z } from 'npm:zod@4';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.75.0/helpers/zod';
import * as XLSX from 'npm:xlsx@0.18.5';
import { unzipSync } from 'npm:fflate@0.8.2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 선원 등록 화면(CrewInputPage)의 필드 + 승선 경력(sea_service_records, 별도 테이블) 구조에
// 맞춘 추출 스키마. optional/nullable은 전부 빼고 모든 필드를 required로 둔다 — Claude
// 구조화 출력(output_config.format)은 union/optional 타입이 섞이면 "too many optional
// parameters"(limit 24) 또는 "Schema is too complex"로 거부되는데, 특히 배열 안의 객체에
// optional 필드가 있으면 상태 조합이 커져서 더 쉽게 걸린다. 모르는 값은 문자열은 빈
// 문자열("")로, 숫자는 0으로 채우도록 프롬프트에서 지시한다(검토 단계에서 사람이 직접 입력).
const ExtractedResumeSchema = z.object({
  name: z.string(),
  name_english: z.string(),
  date_of_birth: z.string().describe('YYYY-MM-DD, 모르면 빈 문자열'),
  nationality: z.string().describe(
    '이력서에 국적이 명시돼 있으면 그 원문 그대로(코드로 변환하지 않음). 명시돼 있지 않으면 ' +
    '이름의 언어적 특징으로 보아 가장 가능성 높은 국적을 추정해서 적으세요(완전히 판단이 안 ' +
    '서는 경우에만 빈 문자열). 추정한 경우 notes_for_reviewer에 "국적은 이름을 보고 추정함 ' +
    '— 확인 필요"라고 반드시 남기세요.'
  ),
  gender: z.string(),
  passport_number: z.string(),
  passport_expiry: z.string().describe('YYYY-MM-DD'),
  seaman_book_number: z.string(),
  seaman_book_expiry: z.string().describe('YYYY-MM-DD'),
  height_cm: z.number(),
  weight_kg: z.number(),
  blood_type: z.string(),
  contact_phone: z.string(),
  contact_email: z.string(),
  emergency_contacts: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
  })),
  certificates: z.array(z.object({
    name: z.string(),
    number: z.string(),
    issued_date: z.string(),
    expiry_date: z.string(),
    issuing_authority: z.string(),
    // 요청 본문의 certificateCatalog 중 정확히 일치한다고 확신하는 항목의 이름 그대로(복사),
    // 확신이 없으면 빈 문자열 — 새 증서를 함부로 만들지 않고 기존 목록에서 찾아 매칭하기 위함.
    matched_certificate_type: z.string(),
  })),
  sea_service_records: z.array(z.object({
    ship_name: z.string(),
    ship_type: z.string(),
    rank: z.string(),
    sign_on_date: z.string(),
    sign_off_date: z.string(),
    // 요청 본문의 rankCatalog 중 가장 가까운 rank_code, 확신이 없으면 빈 문자열.
    matched_rank_code: z.string(),
    // 이 승선 건의 선주사(회사명) — 이력서에 "Company", "Owner" 등으로 적혀 있으면 그대로.
    owner_company_name: z.string(),
    // 선박관리사(있는 경우만 — 선주사와 다른 회사일 때).
    ship_manager_name: z.string(),
    // 매닝사(송출기관) — 있는 경우만.
    manning_agency_name: z.string(),
    // 하선 사유(예: 계약만료, Sign off, Contract finished 등) — 있는 경우만.
    sign_off_reason: z.string(),
  })),
  // 이력서에 현재/목표 직급이 명시되어 있으면 그 직급에 가장 가까운 rankCatalog의 rank_code,
  // 명시되어 있지 않으면 승선 경력 중 가장 최근(마지막) 항목의 직급 기준으로 판단. 확신 없으면 빈 문자열.
  suggested_rank_code: z.string(),
  // suggested_rank_code를 어떤 근거로 판단했는지 한 줄 설명(예: "이력서에 명시된 지원 직급",
  // "최근 승선 경력(2026-05 GAS UTOPIA, COOK) 기준"). suggested_rank_code가 빈 문자열이면 같이 빈 문자열.
  suggested_rank_source: z.string(),
  // 추출 과정에서 애매했거나 사람이 꼭 확인해야 할 부분을 모델이 직접 남기는 메모 — 검토
  // 화면/등록 화면에서 각 항목이 관련된 섹션(탭) 바로 아래에 표시되므로, 반드시 정확한
  // category로 분류해야 한다. 한 항목 = 한 줄(text 하나에 여러 내용을 이어 쓰지 말 것).
  notes_for_reviewer: z.array(z.object({
    category: z.string().describe(
      '다음 중 정확히 하나: "basic_info"(이름/생년월일/국적/여권/선원수첩/신체정보/연락처 관련), ' +
      '"certificates"(자격증/증서 관련), "emergency_contacts"(비상연락처 관련), ' +
      '"sea_service"(승선 경력/직급 관련), "other"(위 어디에도 안 맞는 일반 메모)'
    ),
    text: z.string().describe('이 메모 하나의 내용(한 줄). 번호를 붙이지 말 것 — 화면에서 자동으로 번호가 매겨짐.'),
  })),
});

// 엑셀은 Claude에 직접 문서로 못 넘기므로, 모든 시트를 텍스트(탭 구분)로 변환한다.
function excelToText(bytes: Uint8Array): string {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
    parts.push(`--- 시트: ${sheetName} ---\n${csv}`);
  }
  return parts.join('\n\n');
}

// 큰 배열도 콜스택 오버플로 없이 base64로 인코딩(btoa(String.fromCharCode(...bytes))는 배열이
// 크면 터진다 — 청크 단위로 나눠 문자열을 쌓은 뒤 한 번에 btoa).
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// 엑셀(.xlsx)은 사실 zip 압축 파일이라, 사진이 첨부돼 있으면 xl/media/ 안에 원본 이미지
// 파일(png/jpg 등)이 그대로 들어있다 — SheetJS 커뮤니티판은 이미지를 못 읽으므로 zip을
// 직접 풀어서 찾는다. 여러 장(증명사진 + 로고 등)이 있을 수 있어 가장 큰 파일을 증명사진으로
// 추정한다(이력서에서 제일 큰 이미지는 보통 얼굴 사진).
function extractLargestImageFromXlsx(bytes: Uint8Array): { data: Uint8Array; mime: string } | null {
  try {
    const files = unzipSync(bytes);
    let best: { data: Uint8Array; mime: string } | null = null;
    for (const [path, content] of Object.entries(files)) {
      if (!/^xl\/media\//i.test(path)) continue;
      const ext = path.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : null;
      if (!mime) continue; // emf/wmf(벡터 그림) 등은 건너뜀
      if (!best || content.length > best.data.length) best = { data: content, mime };
    }
    return best;
  } catch (e) {
    console.error('엑셀 이미지 추출 실패:', e);
    return null;
  }
}

// PDF는 전체 구조를 파싱하지 않고도, JPEG로 저장된 이미지(DCTDecode)는 PDF 바이너리 안에
// 원본 JPEG 바이트가 그대로(SOI 0xFFD8FFxx ~ EOI 0xFFD9) 들어있다는 점을 이용해 바로 찾는다.
// PNG/원본 픽셀로 저장된 이미지는 PDF 객체 딕셔너리(가로/세로/색공간 등)를 알아야 복원 가능해
// 이 방식으로는 못 뽑는다 — 이력서 사진은 대부분 JPEG라 실용적으로는 충분하다.
function extractLargestJpegFromPdf(bytes: Uint8Array): Uint8Array | null {
  let best: Uint8Array | null = null;
  let i = 0;
  while (i < bytes.length - 3) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      let j = i + 3;
      let end = -1;
      while (j < bytes.length - 1) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) { end = j + 2; break; }
        j++;
      }
      if (end > 0) {
        const candidate = bytes.subarray(i, end);
        if (!best || candidate.length > best.length) best = candidate;
        i = end;
        continue;
      }
    }
    i++;
  }
  // 너무 작은 건(아이콘·서명·도장 이미지 등) 증명사진이 아닐 가능성이 커서 제외.
  return best && best.length > 3000 ? best : null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { fileName, mimeType, fileBase64, certificateCatalog, rankCatalog } = await req.json() as {
      fileName?: string; mimeType?: string; fileBase64?: string;
      certificateCatalog?: string[]; rankCatalog?: { code: string; name: string }[];
    };
    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: 'fileBase64, mimeType가 필요합니다' }), { status: 400, headers: CORS_HEADERS });
    }

    const isPdf = mimeType === 'application/pdf';
    const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('excel') || /\.(xlsx?|xlsm)$/i.test(fileName || '');
    const fileBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));

    // 이력서에 붙어 있는 증명사진을 찾아 선원 등록 화면의 "사진 업로드"가 이미 된 상태로
    // 만들어준다(Claude 호출과 무관하게 바로 할 수 있는 작업이라 먼저 처리).
    let extractedPhoto: { base64: string; mime: string } | null = null;
    if (isExcel) {
      const img = extractLargestImageFromXlsx(fileBytes);
      if (img) extractedPhoto = { base64: toBase64(img.data), mime: img.mime };
    } else if (isPdf) {
      const jpeg = extractLargestJpegFromPdf(fileBytes);
      if (jpeg) extractedPhoto = { base64: toBase64(jpeg), mime: 'image/jpeg' };
    }

    const catalogInstruction = [
      certificateCatalog && certificateCatalog.length > 0
        ? `아래는 우리 시스템에 이미 등록된 증서(자격증) 종류 목록입니다: ${certificateCatalog.join(' | ')}\n` +
          '이력서의 각 증서가 이 목록 중 하나와 분명히 같은 것이라고 확신되면 matched_certificate_type에 그 ' +
          '이름을 토씨 하나 틀리지 않고 그대로 적으세요(목록에 없는 이름을 지어내지 마세요). 확신이 서지 않으면 ' +
          '반드시 빈 문자열로 두세요 — 잘못 매칭해서 다른 증서 데이터에 섞여 들어가는 것보다, 사람이 직접 확인하게 ' +
          '두는 쪽이 낫습니다.\n' +
          '특히 여권(Passport)과 국내 선원수첩(Seaman\'s Book, 외국 선원수첩이 아닌 경우)은 반드시 ' +
          'certificates 배열에도 각각 하나의 항목으로(번호=여권/수첩 번호, 발급일/만료일 포함) 넣고, ' +
          '목록에 "PASSPORT"와 "SEAMAN\'S BOOK"이 있으면 matched_certificate_type에 정확히 그 이름을 ' +
          '적으세요 — 여권/선원수첩은 유효기간 관리가 증서 데이터를 기준으로 이뤄지므로 절대 빠뜨리면 ' +
          '안 됩니다(passport_number/seaman_book_number 필드에만 적고 certificates에서 빠뜨리지 말 것).'
        : '',
      rankCatalog && rankCatalog.length > 0
        ? `아래는 우리 시스템의 직급 체계(rank_code: 이름)입니다: ${rankCatalog.map(r => `${r.code}: ${r.name}`).join(' | ')}\n` +
          '승선 경력의 각 직급(rank)에 대해, 위 직급 체계 중 가장 가까운 rank_code를 matched_rank_code에 적으세요 ' +
          '(예: "COOK(C)"나 "Cook/C" 같은 표기는 등급(Grade) 표시를 뺀 "COOK"으로). 확신이 없으면 빈 문자열로 두세요.\n' +
          '또한 후보자의 현재/목표 직급을 suggested_rank_code에 판단해 적으세요 — 이력서에 지원 직급이나 현재 ' +
          '직급이 명시되어 있으면 그것을 기준으로, 명시되어 있지 않으면 승선 경력 중 날짜상 가장 최근(마지막) ' +
          '항목의 직급을 기준으로 판단하세요. suggested_rank_source에는 그 판단 근거를 한국어 한 줄로 적으세요 ' +
          '(예: "이력서에 명시된 지원 직급" 또는 "최근 승선 경력(2026-05 GAS UTOPIA, COOK) 기준"). 확신이 없으면 ' +
          '둘 다 빈 문자열로 두세요.'
        : '',
    ].filter(Boolean).join('\n\n');

    const instruction = [
      '아래는 선원(해기사/부원) 이력서입니다. 양식은 회사마다 다를 수 있습니다.',
      '이름, 생년월일, 국적, 여권/선원수첩 번호·만료일, 신체정보(신장/체중/혈액형), 연락처,',
      '비상연락처, 자격증(증서) 목록, 승선 경력(선박명/직급/승선일/하선일/선주사/선박관리사/매닝사/하선사유) 을 최대한 정확히 뽑아주세요.',
      '이력서에 없는 항목은 추측하지 말고, 문자열 필드는 빈 문자열("")로, 숫자 필드는 0으로 두세요.',
      '날짜는 가능하면 YYYY-MM-DD로 변환하세요.',
      catalogInstruction,
    ].filter(Boolean).join(' ');

    const content: Anthropic.MessageParam['content'] = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } },
          { type: 'text', text: instruction },
        ]
      : isExcel
        ? [
            { type: 'text', text: `${instruction}\n\n--- 이력서 내용(엑셀을 텍스트로 변환함) ---\n${excelToText(fileBytes)}` },
          ]
        : null;

    if (!content) {
      return new Response(JSON.stringify({ error: `지원하지 않는 파일 형식입니다: ${mimeType} (PDF 또는 엑셀만 가능)` }), { status: 400, headers: CORS_HEADERS });
    }

    // Opus의 사고 시간이 150초를 넘으면 Edge Function의 "idle timeout"(클라이언트로 아무
    // 바이트도 안 나가는 상태)에 걸려 함수가 그대로 죽는다. 단순히 Claude 호출을 스트리밍으로
    // 바꾸는 것만으로는 안 된다 — 그 이벤트를 우리가 안에서만 소비하고 응답은 끝에 한 번에
    // 내려주면 클라이언트 쪽 커넥션은 똑같이 계속 idle이기 때문. 그래서 응답 자체를
    // ReadableStream으로 만들어, Claude가 생각하는 동안에도 주기적으로 빈 바이트(줄바꿈)를
    // 클라이언트에 흘려보내 커넥션을 계속 "활동 중" 상태로 유지한다. 줄바꿈은 JSON
    // 문법상 유효한 공백이라 맨 끝에 붙는 실제 JSON 앞에 섞여도 JSON.parse가 그대로 통과한다.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const keepAlive = setInterval(() => {
          try { controller.enqueue(encoder.encode('\n')); } catch { /* 이미 닫힌 컨트롤러 */ }
        }, 10000);

        (async () => {
          try {
            const stream = client.messages.stream({
              model: 'claude-opus-5-5',
              max_tokens: 16000,
              messages: [{ role: 'user', content }],
              output_config: { format: zodOutputFormat(ExtractedResumeSchema) },
            });
            for await (const _event of stream) {
              // 이벤트 자체는 쓰지 않음 — 업스트림에서도 활동이 있을 때마다 커넥션이 살아있게 함.
            }
            const message = await stream.finalMessage();

            const textBlock = message.content.find(b => b.type === 'text');
            if (!textBlock || textBlock.type !== 'text') {
              controller.enqueue(encoder.encode(JSON.stringify({ error: '추출 결과를 해석하지 못했습니다', stop_reason: message.stop_reason })));
              return;
            }

            try {
              const parsed = ExtractedResumeSchema.parse(JSON.parse(textBlock.text));
              controller.enqueue(encoder.encode(JSON.stringify({
                data: parsed,
                photo_base64: extractedPhoto?.base64,
                photo_mime: extractedPhoto?.mime,
              })));
            } catch (e) {
              controller.enqueue(encoder.encode(JSON.stringify({ error: `구조화된 출력 파싱 실패: ${String(e)}` })));
            }
          } catch (e) {
            console.error(e);
            controller.enqueue(encoder.encode(JSON.stringify({ error: String(e) })));
          } finally {
            clearInterval(keepAlive);
            controller.close();
          }
        })();
      },
    });

    return new Response(body, { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
