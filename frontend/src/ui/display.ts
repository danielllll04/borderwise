const accountLabels: Record<string, string> = { myr_funding: 'MYR Funding', krw_card: 'KRW Card', krw_cash: 'KRW Cash' }
export const accountName = (id: string) => accountLabels[id] ?? id
