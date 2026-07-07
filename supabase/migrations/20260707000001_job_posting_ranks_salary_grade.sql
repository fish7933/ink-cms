-- 급여템플릿에 등급(A/B/C 등)별 급여가 있는 직급은 공고 등록 시 어떤 등급 기준으로
-- 급여를 제시했는지 남겨야 수정 화면에서 그대로 복원할 수 있다.
ALTER TABLE job_posting_ranks
  ADD COLUMN IF NOT EXISTS salary_grade TEXT;
