-- Add application_deadline field to job_postings table
ALTER TABLE job_postings 
ADD COLUMN IF NOT EXISTS application_deadline DATE;

-- Add comment
COMMENT ON COLUMN job_postings.application_deadline IS '공고 마감일';