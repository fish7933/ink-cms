// 결재 관련 Web Push 알림을 보낸다. 클라이언트(approval-document.service.ts)가 세 시점에 호출한다:
//  - event: 'request' — 다음 결재자의 차례가 됐을 때 (document_id + step_order)
//  - event: 'complete' — 문서가 최종 승인됐을 때, 기안자에게 (document_id만)
//  - event: 'reference' — 문서가 기안/재상신되어 수신·참조 대상으로 지정된 시점에, 그 대상
//    전원(개인 + 수신·참조 부서 소속 전원)에게 (document_id만). 수신부서는 클라이언트에서 이미
//    참조 대상에 자동 포함시켜 저장하므로 여기선 approval_document_references 하나만 보면 된다.
// 수신자별로 해당 알림 종류를 꺼뒀으면(users.notify_approval_request/complete/reference) 보내지 않는다.
// 서비스 롤 키로 DB를 직접 조회해 수신자를 찾으므로, 클라이언트는 누가 받는지 몰라도 된다.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PrefKey = 'notify_approval_request' | 'notify_approval_complete' | 'notify_approval_reference';
interface Recipient { userId: string; prefKey: PrefKey; title: string; body: string }

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { document_id, step_order, event } = await req.json();
    const evt: 'request' | 'complete' | 'reference' = event === 'complete' || event === 'reference' ? event : 'request';
    if (!document_id || (evt === 'request' && !step_order)) {
      return new Response(JSON.stringify({ error: 'document_id 필요(요청 알림은 step_order도 필요)' }), { status: 400, headers: CORS_HEADERS });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: doc } = await supabase
      .from('approval_documents')
      .select('title, created_by, document_type_id, org_unit_id, created_at')
      .eq('id', document_id)
      .maybeSingle();
    if (!doc) {
      return new Response(JSON.stringify({ error: '문서를 찾을 수 없음' }), { status: 404, headers: CORS_HEADERS });
    }

    const [{ data: creator }, { data: docType }, { data: orgUnit }] = await Promise.all([
      doc.created_by ? supabase.from('users').select('name').eq('id', doc.created_by).maybeSingle() : Promise.resolve({ data: null }),
      doc.document_type_id ? supabase.from('approval_document_types').select('name').eq('id', doc.document_type_id).maybeSingle() : Promise.resolve({ data: null }),
      doc.org_unit_id ? supabase.from('org_units').select('name').eq('id', doc.org_unit_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const draftedDate = doc.created_at
      ? new Date(doc.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
      : null;

    const recipients: Recipient[] = [];

    if (evt === 'request') {
      const { data: step } = await supabase
        .from('approval_document_steps')
        .select('approver_id')
        .eq('document_id', document_id)
        .eq('step_order', step_order)
        .maybeSingle();
      if (!step) return new Response(JSON.stringify({ error: '결재 단계를 찾을 수 없음' }), { status: 404, headers: CORS_HEADERS });
      const { count: totalSteps } = await supabase.from('approval_document_steps').select('id', { count: 'exact', head: true }).eq('document_id', document_id);

      const bodyParts = [
        creator?.name ? `${creator.name}${orgUnit?.name ? `(${orgUnit.name})` : ''}님이 상신` : null,
        draftedDate,
        totalSteps ? `${step_order}/${totalSteps}차 결재` : null,
      ].filter(Boolean);
      recipients.push({
        userId: step.approver_id,
        prefKey: 'notify_approval_request',
        title: docType?.name ? `[${docType.name}] 결재 요청` : '결재 요청',
        body: `${doc.title}${bodyParts.length > 0 ? ` — ${bodyParts.join(' · ')}` : ''}`,
      });
    } else if (evt === 'complete') {
      if (doc.created_by) {
        recipients.push({
          userId: doc.created_by,
          prefKey: 'notify_approval_complete',
          title: docType?.name ? `[${docType.name}] 결재 완료` : '결재 완료',
          body: `${doc.title} — 최종 승인되었습니다.`,
        });
      }
    } else {
      // 수신/참조 — 수신부서는 문서 기안/재상신 시 이미 참조 대상에 함께 저장돼 있으므로 이 표
      // 하나만 보면 된다. 개인(user_id)과 부서(org_unit_id) 지정이 섞여 있어, 부서는 소속 인원
      // 전체로 편다.
      const { data: refs } = await supabase.from('approval_document_references').select('user_id, org_unit_id').eq('document_id', document_id);
      const directUserIds = (refs || []).map(r => r.user_id).filter((id): id is string => !!id);
      const orgUnitIds = [...new Set((refs || []).map(r => r.org_unit_id).filter((id): id is string => !!id))];
      let orgMemberIds: string[] = [];
      if (orgUnitIds.length > 0) {
        const { data: members } = await supabase.from('org_unit_members').select('user_id').in('org_unit_id', orgUnitIds);
        orgMemberIds = (members || []).map(m => m.user_id);
      }
      const refUserIds = [...new Set([...directUserIds, ...orgMemberIds])].filter(id => id !== doc.created_by);
      const bodyParts = [
        creator?.name ? `${creator.name}${orgUnit?.name ? `(${orgUnit.name})` : ''}님이 상신` : null,
        draftedDate,
      ].filter(Boolean);
      const refTitle = docType?.name ? `[${docType.name}] 수신/참조 문서 도착` : '수신/참조 문서 도착';
      const refBody = `${doc.title}${bodyParts.length > 0 ? ` — ${bodyParts.join(' · ')}` : ''}`;
      for (const uid of refUserIds) recipients.push({ userId: uid, prefKey: 'notify_approval_reference', title: refTitle, body: refBody });
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: CORS_HEADERS });
    }

    const recipientUserIds = [...new Set(recipients.map(r => r.userId))];
    const [{ data: prefRows }, { data: subRows }] = await Promise.all([
      supabase.from('users').select('id, notify_approval_request, notify_approval_complete, notify_approval_reference').in('id', recipientUserIds),
      supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', recipientUserIds),
    ]);
    const prefsByUser = new Map((prefRows || []).map(p => [p.id, p]));
    const subsByUser = new Map<string, typeof subRows>();
    for (const s of subRows || []) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
      subsByUser.get(s.user_id)!.push(s);
    }

    const staleIds: string[] = [];
    let sent = 0;
    await Promise.all(recipients.map(async r => {
      const pref = prefsByUser.get(r.userId);
      if (pref && pref[r.prefKey] === false) return; // 이 알림 종류를 꺼둠
      const subs = subsByUser.get(r.userId) || [];
      if (subs.length === 0) return;

      const payload = JSON.stringify({ title: r.title, body: r.body, url: `/documents/${document_id}` });
      await Promise.all(subs.map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (e) {
          // 410/404는 브라우저에서 구독이 만료/취소된 것 — 더 이상 보낼 수 없으니 정리해둔다.
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) staleIds.push(sub.id);
          else console.error('push send failed', sub.id, e);
        }
      }));
    }));

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(JSON.stringify({ sent }), { headers: CORS_HEADERS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
