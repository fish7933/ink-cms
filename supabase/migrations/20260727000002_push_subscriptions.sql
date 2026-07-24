-- 브라우저 Web Push 구독 정보. 결재 차례가 된 사용자에게 알림을 보내기 위해, 사용자가 알림을
-- 허용할 때 브라우저가 발급하는 구독 정보(endpoint + 암호화 키)를 저장해둔다. 한 사용자가
-- 여러 기기/브라우저에서 구독할 수 있으므로 (user_id, endpoint) 조합이 키다.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_push_subscriptions ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
