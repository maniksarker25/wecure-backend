export const bookingRulesConfig = () => ({
  allowSameDayBooking: true,

  // Minimum minutes before appointment can be booked
  minAdvanceMinutes: 60,

  // Appointment slot rules
  defaultSlotSizeMinutes: 30,

  // Appointment window enforcement
  enforceDoctorAvailability: true,

  // Review rules
  reviewAllowedOnlyAfterCompletion: true,
});
