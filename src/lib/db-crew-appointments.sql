-- Crew Appointment System (승선/하선 발령)
-- This SQL creates tables for managing crew boarding and disembarking appointments

BEGIN;

-- Create crew_appointments table
CREATE TABLE IF NOT EXISTS app_5975fc7b1f_crew_appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id UUID NOT NULL,
  ship_id UUID REFERENCES app_5975fc7b1f_ships(id) ON DELETE CASCADE NOT NULL,
  rank_id UUID REFERENCES app_5975fc7b1f_ranks(id) ON DELETE CASCADE NOT NULL,
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('boarding', 'disembarking')),
  appointment_date DATE NOT NULL,
  port_name TEXT,
  port_country TEXT,
  contract_start_date DATE,
  contract_end_date DATE,
  salary_amount DECIMAL(12, 2),
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'executed', 'cancelled')) DEFAULT 'draft',
  approval_line_id UUID REFERENCES app_5975fc7b1f_approval_lines(id) ON DELETE SET NULL,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  executed_by UUID,
  executed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create appointment_documents table for storing generated documents
CREATE TABLE IF NOT EXISTS app_5975fc7b1f_appointment_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES app_5975fc7b1f_crew_appointments(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('appointment_letter', 'contract', 'travel_order', 'other')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crew_appointments_crew ON app_5975fc7b1f_crew_appointments(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_appointments_ship ON app_5975fc7b1f_crew_appointments(ship_id);
CREATE INDEX IF NOT EXISTS idx_crew_appointments_status ON app_5975fc7b1f_crew_appointments(status);
CREATE INDEX IF NOT EXISTS idx_crew_appointments_type ON app_5975fc7b1f_crew_appointments(appointment_type);
CREATE INDEX IF NOT EXISTS idx_crew_appointments_date ON app_5975fc7b1f_crew_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointment_documents_appointment ON app_5975fc7b1f_appointment_documents(appointment_id);

-- Enable RLS
ALTER TABLE app_5975fc7b1f_crew_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_5975fc7b1f_appointment_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "allow_all_crew_appointments" ON app_5975fc7b1f_crew_appointments FOR ALL USING (true);
CREATE POLICY "allow_all_appointment_documents" ON app_5975fc7b1f_appointment_documents FOR ALL USING (true);

-- Function to update crew status when appointment is executed
CREATE OR REPLACE FUNCTION update_crew_status_on_appointment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'executed' AND OLD.status != 'executed' THEN
    IF NEW.appointment_type = 'boarding' THEN
      -- Update crew status to on_board
      INSERT INTO app_5975fc7b1f_crew_status_history (crew_id, status, effective_date, notes, changed_by)
      VALUES (NEW.crew_id, 'on_board', NEW.appointment_date, '승선 발령 실행', NEW.executed_by);
    ELSIF NEW.appointment_type = 'disembarking' THEN
      -- Update crew status to on_leave
      INSERT INTO app_5975fc7b1f_crew_status_history (crew_id, status, effective_date, notes, changed_by)
      VALUES (NEW.crew_id, 'on_leave', NEW.appointment_date, '하선 발령 실행', NEW.executed_by);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update crew status
CREATE TRIGGER trigger_update_crew_status_on_appointment
  AFTER UPDATE ON app_5975fc7b1f_crew_appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_crew_status_on_appointment();

COMMIT;