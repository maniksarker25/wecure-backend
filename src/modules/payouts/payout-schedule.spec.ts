import {
  buildPayoutBatchId,
  resolvePayoutSchedule,
  resolvePayoutTimezone,
} from './payout-schedule';

describe('payout schedule', () => {
  it('defaults an empty schedule to weekly and rejects unknown values', () => {
    expect(resolvePayoutSchedule(undefined)).toBe('WEEKLY');
    expect(resolvePayoutSchedule(' weekly ')).toBe('WEEKLY');
    expect(resolvePayoutSchedule('monthly')).toBe('MONTHLY');
    expect(resolvePayoutSchedule('daily')).toBeNull();
  });

  it('falls back to the business timezone when PAYOUT_TIMEZONE is invalid', () => {
    expect(resolvePayoutTimezone(undefined)).toEqual({
      timezone: 'Africa/Lagos',
      invalid: false,
    });
    expect(resolvePayoutTimezone('Not/AZone')).toEqual({
      timezone: 'Africa/Lagos',
      invalid: true,
    });
  });

  it('builds the batch id in the payout timezone', () => {
    const mondayMidnightLagos = new Date('2026-11-08T23:00:00.000Z');

    expect(
      buildPayoutBatchId('WEEKLY', mondayMidnightLagos, 'Africa/Lagos'),
    ).toBe('2026-W46');
    expect(
      buildPayoutBatchId('MONTHLY', mondayMidnightLagos, 'Africa/Lagos'),
    ).toBe('2026-11');
  });

  it('uses the Lagos calendar month when UTC is still in the previous month', () => {
    const firstOfFebruaryLagos = new Date('2026-01-31T23:00:00.000Z');

    expect(
      buildPayoutBatchId('MONTHLY', firstOfFebruaryLagos, 'Africa/Lagos'),
    ).toBe('2026-02');
  });
});
