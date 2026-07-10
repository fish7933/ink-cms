-- 홈페이지(inkmarine.co.kr) 콘텐츠 소스화: 게시판 + 대외 공개용 뷰
-- 이 프로젝트는 RLS를 FOR ALL USING (true)로 열어두는 컨벤션이라(anon key로 전 테이블 접근 가능),
-- 아래 public_* 뷰는 실질적인 접근 제어가 아니라 "홈페이지는 원본 테이블이 아니라 이 뷰만 쓴다"는
-- API 계약 역할이다 — 급여 등 민감 컬럼을 원본 테이블에서 실수로 노출하지 않기 위한 장치.

-- 1) 게시판 (공지사항/뉴스)
CREATE TABLE IF NOT EXISTS homepage_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'notice' CHECK (category IN ('notice', 'news')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE homepage_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_homepage_posts ON homepage_posts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_homepage_posts_published ON homepage_posts(is_published, published_at DESC);

-- 2) 공개 통계 (선원 수 등)
CREATE OR REPLACE VIEW public_homepage_stats AS
SELECT
  (SELECT COUNT(*) FROM crew_members) AS total_crew_count,
  (SELECT COUNT(DISTINCT crew_member_id) FROM crew_embarkation_records WHERE status = 'active') AS active_crew_count,
  (SELECT COUNT(*) FROM ships) AS ships_count;

-- 3) 공개 채용공고 (그룹 공고 job_posting_groups 기준 — 개별 공고 job_postings는 제외)
-- 급여(salary_amount 등)와 visible_to_agencies(매닝사 공개범위)는 대외 공개 대상이 아니므로 제외한다.
CREATE OR REPLACE VIEW public_job_posting_groups AS
SELECT
  g.id AS group_id,
  s.name AS ship_name,
  g.embarkation_date,
  g.application_deadline,
  g.urgency,
  g.requirements,
  r.id AS rank_posting_id,
  rk.name AS rank_name,
  rk.rank_category,
  rk.department,
  r.positions_available,
  r.contract_months
FROM job_posting_groups g
LEFT JOIN ships s ON s.id = g.ship_id
JOIN job_posting_ranks r ON r.group_id = g.id
JOIN ranks rk ON rk.id = r.rank_id
WHERE g.status = 'active';
