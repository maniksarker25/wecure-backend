import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  beforeEach(() => {
    service = new AvailabilityService({} as any, {} as any, {} as any);
  });

  it('generates slots within the requested availability window', () => {
    expect(service.generateSlots('09:00', '10:30', 30)).toEqual([
      '09:00',
      '09:30',
      '10:00',
    ]);
  });
});
