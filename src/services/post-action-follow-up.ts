/** Static read instruction only: optional risk reads never run inside a financial posting. */
export const ASSESSMENT_FOLLOW_UP = {
  status: 'refresh_required', method: 'GET', url: '/api/plans/assessments',
  financial_action_succeeded: true, retry_financial_action: false,
} as const;
