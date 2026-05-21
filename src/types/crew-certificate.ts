export interface CrewCertificate {
  id: string;
  crew_id: string;
  certificate_type_id: string;
  certificate_number: string;
  issue_date: string;
  expiry_date: string;
  issuing_authority: string | null;
  file_url: string | null;
  file_name: string | null;
  status: 'valid' | 'expiring_soon' | 'expired' | 'pending';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificateAlert {
  id: string;
  certificate_id: string;
  alert_type: '30_days' | '60_days' | '90_days' | 'expired';
  alert_date: string;
  is_sent: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface CrewCertificateWithType extends CrewCertificate {
  certificate_type?: {
    id: string;
    type_name_ko: string;
    category: string;
  };
}