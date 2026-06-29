import { supabase } from '@/lib/supabase';

export interface CertExpiryItem {
  crew_id: string;
  crew_name: string;
  rank_name: string;
  rank_code: string;
  cert_name: string;
  cert_number?: string;
  expiry_date: string;
  days_remaining: number;
  status: 'expired' | 'critical' | 'warning' | 'caution' | 'valid';
}

export interface CertExpiryStats {
  expired: number;
  critical: number;
  warning: number;
  caution: number;
  valid: number;
  total: number;
}

function getExpiryStatus(daysRemaining: number): CertExpiryItem['status'] {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 30) return 'critical';
  if (daysRemaining <= 60) return 'warning';
  if (daysRemaining <= 90) return 'caution';
  return 'valid';
}

export async function getExpiringCertificates(): Promise<CertExpiryItem[]> {
  const { data, error } = await supabase
    .from('crew_members')
    .select('id, name, rank, certificates, rank_id, ranks:rank_id(name, rank_code)')
    .not('certificates', 'is', null);

  if (error) { console.error(error); return []; }
  if (!data) return [];

  const today = new Date();
  const items: CertExpiryItem[] = [];

  for (const crew of data) {
    let certs: Array<{ name: string; number?: string; expiry_date?: string; no_expiry?: boolean }> = [];
    try {
      certs = typeof crew.certificates === 'string' ? JSON.parse(crew.certificates) : (crew.certificates || []);
    } catch { continue; }

    if (!Array.isArray(certs)) continue;

    const rankInfo = crew.ranks as unknown as { name: string; rank_code: string } | null;

    for (const cert of certs) {
      if (!cert.name || !cert.expiry_date || cert.no_expiry) continue;
      const expiry = new Date(cert.expiry_date);
      const diffMs = expiry.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      items.push({
        crew_id: crew.id,
        crew_name: crew.name || '',
        rank_name: rankInfo?.name || crew.rank || '',
        rank_code: rankInfo?.rank_code || '',
        cert_name: cert.name,
        cert_number: cert.number,
        expiry_date: cert.expiry_date,
        days_remaining: daysRemaining,
        status: getExpiryStatus(daysRemaining),
      });
    }
  }

  items.sort((a, b) => a.days_remaining - b.days_remaining);
  return items;
}

export function calcExpiryStats(items: CertExpiryItem[]): CertExpiryStats {
  const stats: CertExpiryStats = { expired: 0, critical: 0, warning: 0, caution: 0, valid: 0, total: items.length };
  for (const item of items) {
    stats[item.status]++;
  }
  return stats;
}
