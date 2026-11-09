import { DateTime } from 'luxon';
import { DEFAULT_BUSINESS_TIMEZONE } from '../../common/utils/business-time.util';

export const PAYOUT_SCHEDULES = {
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const;

export type PayoutSchedule =
  (typeof PAYOUT_SCHEDULES)[keyof typeof PAYOUT_SCHEDULES];

/**
 * Five-field cron, evaluated in the payout timezone.
 * Weekly: Monday 00:00. Monthly: the 1st at 00:00.
 */
export const PAYOUT_BATCH_CRON: Record<PayoutSchedule, string> = {
  WEEKLY: '0 0 * * 1',
  MONTHLY: '0 0 1 * *',
};

export const PAYOUT_BATCH_JOB = 'payout-batch';

export function resolvePayoutSchedule(raw: unknown): PayoutSchedule | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return PAYOUT_SCHEDULES.WEEKLY;
  }

  const value = String(raw).trim().toUpperCase();
  if (value === PAYOUT_SCHEDULES.WEEKLY || value === PAYOUT_SCHEDULES.MONTHLY) {
    return value;
  }

  return null;
}

export function resolvePayoutTimezone(raw: unknown): {
  timezone: string;
  invalid: boolean;
} {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { timezone: DEFAULT_BUSINESS_TIMEZONE, invalid: false };
  }

  const timezone = String(raw).trim();
  if (DateTime.now().setZone(timezone).isValid) {
    return { timezone, invalid: false };
  }

  return { timezone: DEFAULT_BUSINESS_TIMEZONE, invalid: true };
}

/**
 * Batch ids are calendar values in the payout timezone, not the host timezone.
 * Monday 00:00 in Africa/Lagos is still Sunday in UTC, so a UTC id would
 * attach that run to the previous week or month.
 */
export function buildPayoutBatchId(
  schedule: PayoutSchedule,
  now: Date,
  timezone: string,
): string {
  const current = DateTime.fromJSDate(now, { zone: timezone });
  if (!current.isValid) {
    throw new Error(`Invalid payout timezone: ${timezone}`);
  }

  if (schedule === PAYOUT_SCHEDULES.MONTHLY) {
    return current.toFormat('yyyy-MM');
  }

  const week = String(current.weekNumber).padStart(2, '0');
  return `${current.weekYear}-W${week}`;
}
