-- Crew Certificates Management System
-- This SQL creates tables for managing crew member certificates and documents

BEGIN;

-- Create crew_certificates table for storing certificate information
CREATE TABLE IF NOT EXISTS app_5975fc7b1f_crew_certificates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id UUID NOT NULL,
  certificate_type_id UUID REFERENCES app_5975fc7b1f_certificate_types(id) ON DELETE CASCADE NOT NULL,
  certificate_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  issuing_authority TEXT,
  file_url TEXT,
  file_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('valid', 'expiring_soon', 'expired', 'pending')) DEFAULT 'valid',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(crew_id, certificate_type_id, certificate_number)
);

-- Create certificate_alerts table for tracking expiry alerts
CREATE TABLE IF NOT EXISTS app_5975fc7b1f_certificate_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  certificate_id UUID REFERENCES app_5975fc7b1f_crew_certificates(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('30_days', '60_days', '90_days', 'expired')),
  alert_date DATE NOT NULL,
  is_sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_crew_certificates_crew ON app_5975fc7b1f_crew_certificates(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_certificates_type ON app_5975fc7b1f_crew_certificates(certificate_type_id);
CREATE INDEX IF NOT EXISTS idx_crew_certificates_status ON app_5975fc7b1f_crew_certificates(status);
CREATE INDEX IF NOT EXISTS idx_crew_certificates_expiry ON app_5975fc7b1f_crew_certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_certificate_alerts_cert ON app_5975fc7b1f_certificate_alerts(certificate_id);
CREATE INDEX IF NOT EXISTS idx_certificate_alerts_date ON app_5975fc7b1f_certificate_alerts(alert_date);

-- Enable RLS
ALTER TABLE app_5975fc7b1f_crew_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_5975fc7b1f_certificate_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "allow_all_crew_certificates" ON app_5975fc7b1f_crew_certificates FOR ALL USING (true);
CREATE POLICY "allow_all_certificate_alerts" ON app_5975fc7b1f_certificate_alerts FOR ALL USING (true);

-- Function to update certificate status based on expiry date
CREATE OR REPLACE FUNCTION update_certificate_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expiry_date < CURRENT_DATE THEN
    NEW.status := 'expired';
  ELSIF NEW.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN
    NEW.status := 'expiring_soon';
  ELSE
    NEW.status := 'valid';
  END IF;
  
  NEW.updated_at := TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update certificate status
CREATE TRIGGER trigger_update_certificate_status
  BEFORE INSERT OR UPDATE ON app_5975fc7b1f_crew_certificates
  FOR EACH ROW
  EXECUTE FUNCTION update_certificate_status();

COMMIT;