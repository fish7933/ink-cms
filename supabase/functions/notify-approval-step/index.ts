// 결재 관련 Web Push 알림을 보낸다. 클라이언트(approval-document.service.ts)가 두 시점에 호출한다:
//  - event: 'request' — 다음 결재자의 차례가 됐을 때 (document_id + step_order)
//  - event: 'complete' — 문서가 최종 승인됐을 때, 기안자에게 (document_id만)
// 수신자가 해당 알림 종류를 꺼뒀으면(users.notify_approval_request/complete) 보내지 않는다.
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { document_id, step_order, event } = await req.json();
    const evt: 'request' | 'complete' = event === 'complete' ? 'complete' : 'request';
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

    // event별로 수신자와 그 사람이 이 알림 종류를 켜뒀는지를 정한다.
    let recipientId: string;
    let totalSteps: number | null = null;
    if (evt === 'request') {
      const { data: step } = await supabase
        .from('approval_document_steps')
        .select('approver_id')
        .eq('document_id', document_id)
        .eq('step_order', step_order)
        .maybeSingle();
      if (!step) return new Response(JSON.stringify({ error: '결재 단계를 찾을 수 없음' }), { status: 404, headers: CORS_HEADERS });
      recipientId = step.approver_id;
      const { count } = await supabase.from('approval_document_steps').select('id', { count: 'exact', head: true }).eq('document_id', document_id);
      totalSteps = count ?? null;
    } else {
      if (!doc.created_by) return new Response(JSON.stringify({ sent: 0 }), { headers: CORS_HEADERS });
      recipientId = doc.created_by;
    }

    const { data: recipient } = await supabase
      .from('users')
      .select('notify_approval_request, notify_approval_complete')
      .eq('id', recipientId)
      .maybeSingle();
    const wantsThis = evt === 'request' ? recipient?.notify_approval_request : recipient?.notify_approval_complete;
    if (recipient && wantsThis === false) {
      return new Response(JSON.stringify({ sent: 0, skipped: 'preference_off' }), { headers: CORS_HEADERS });
    }

    const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', recipientId);
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: CORS_HEADERS });
    }

    const [{ data: creator }, { data: docType }, { data: orgUnit }] = await Promise.all([
      doc.created_by ? supabase.from('users').select('name').eq('id', doc.created_by).maybeSingle() : Promise.resolve({ data: null }),
      doc.document_type_id ? supabase.from('approval_document_types').select('name').eq('id', doc.document_type_id).maybeSingle() : Promise.resolve({ data: null }),
      doc.org_unit_id ? supabase.from('org_units').select('name').eq('id', doc.org_unit_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const draftedDate = doc.created_at
      ? new Date(doc.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
      : null;

    let title: string;
    let body: string;
    if (evt === 'request') {
      const bodyParts = [
        creator?.name ? `${creator.name}${orgUnit?.name ? `(${orgUnit.name})` : ''}님이 상신` : null,
        draftedDate,
        totalSteps ? `${step_order}/${totalSteps}차 결재` : null,
      ].filter(Boolean);
      title = docType?.name ? `[${docType.name}] 결재 요청` : '결재 요청';
      body = `${doc.title}${bodyParts.length > 0 ? ` — ${bodyParts.join(' · ')}` : ''}`;
    } else {
      title = docType?.name ? `[${docType.name}] 결재 완료` : '결재 완료';
      body = `${doc.title} — 최종 승인되었습니다.`;
    }

    const payload = JSON.stringify({ title, body, url: `/documents/${document_id}` });

    const staleIds: string[] = [];
    let sent = 0;
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

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(JSON.stringify({ sent }), { headers: CORS_HEADERS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
