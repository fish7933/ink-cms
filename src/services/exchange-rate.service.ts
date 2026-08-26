import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';

function monthRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const end = new Date(y, m, 0).getDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(end).padStart(2, '0')}` };
}

export interface RequiredCurrency {
  currency_code: string;
  label: string; // 예: "인도네시아 (IDR)", "원화 (KRW)"
}

export interface ManagementFeeExchangeRate {
  id: string;
  year_month: string;
  currency_code: string;
  rate_to_usd: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export const exchangeRateService = {
  // 그 달 승선 중인 선원의 국적으로 필요한 통화를 자동 산출한다. KRW는 모든 청구서의
  // 원화 환산에 쓰이므로 국적과 무관하게 항상 포함한다.
  async getRequiredCurrenciesForMonth(yearMonth: string): Promise<RequiredCurrency[]> {
    const { start, end } = monthRange(yearMonth);
    const { data: records } = await supabase
      .from('crew_embarkation_records')
      .select('crew_member_id')
      .lte('embark_date', end)
      .or(`disembark_date.is.null,disembark_date.gte.${start}`);
    const crewMemberIds = [...new Set((records || []).map(r => r.crew_member_id))];

    const { data: crewMembers } = crewMemberIds.length > 0
      ? await supabase.from('crew_members').select('nationality').in('id', crewMemberIds)
      : { data: [] as { nationality?: string }[] };
    const nationalityCodes = [...new Set((crewMembers || []).map(c => c.nationality).filter((v): v is string => !!v))];

    const { data: nationalities } = nationalityCodes.length > 0
      ? await supabase.from('nationalities').select('country_code, country_name_ko, currency_code').in('country_code', nationalityCodes)
      : { data: [] as { country_code: string; country_name_ko: string; currency_code: string | null }[] };

    const result = new Map<string, RequiredCurrency>();
    result.set('KRW', { currency_code: 'KRW', label: '원화 (KRW)' });
    for (const n of nationalities || []) {
      if (!n.currency_code || result.has(n.currency_code)) continue;
      result.set(n.currency_code, { currency_code: n.currency_code, label: `${n.country_name_ko} (${n.currency_code})` });
    }
    return [...result.values()];
  },

  async getExchangeRates(yearMonth: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('management_fee_exchange_rates')
      .select('currency_code, rate_to_usd')
      .eq('year_month', yearMonth);
    if (error) { console.error('Error fetching exchange rates:', error); return {}; }
    const result: Record<string, number> = {};
    for (const r of data || []) result[r.currency_code] = Number(r.rate_to_usd);
    return result;
  },

  async saveExchangeRates(yearMonth: string, rates: { currency_code: string; rate_to_usd: number }[]): Promise<boolean> {
    if (rates.length === 0) return true;
    const currentUser = await getCurrentUser();
    const { error } = await supabase
      .from('management_fee_exchange_rates')
      .upsert(
        rates.map(r => ({ year_month: yearMonth, currency_code: r.currency_code, rate_to_usd: r.rate_to_usd, created_by: currentUser?.id })),
        { onConflict: 'year_month,currency_code' },
      );
    if (error) { console.error('Error saving exchange rates:', error); return false; }
    return true;
  },

  // 그 달에 값이 없으면 그 이전 가장 최근 달 값으로 폴백한다(완전히 없으면 null).
  async getLatestRate(currencyCode: string, onOrBeforeYearMonth: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('management_fee_exchange_rates')
      .select('rate_to_usd')
      .eq('currency_code', currencyCode)
      .lte('year_month', onOrBeforeYearMonth)
      .order('year_month', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { console.error('Error fetching latest exchange rate:', error); return null; }
    return data ? Number(data.rate_to_usd) : null;
  },
};
