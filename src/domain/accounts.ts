export const DEMO_PROFILE_ID = 'demo-profile';

export const ACCOUNTS = {
  myr_funding: { id: 'myr_funding', display_name: 'MYR Funding', currency: 'MYR' },
  krw_card: { id: 'krw_card', display_name: 'KRW Card', currency: 'KRW' },
  krw_cash: { id: 'krw_cash', display_name: 'KRW Cash', currency: 'KRW' },
} as const;

export type AccountId = keyof typeof ACCOUNTS;
