export enum AppointmentStatus {
  PENDING = 'PENDING',
  UPCOMING = 'UPCOMING',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/** Statuses that still occupy a doctor's time slot. */
export const APPOINTMENT_SLOT_HELD_STATUSES = [
  AppointmentStatus.PENDING,
  AppointmentStatus.UPCOMING,
  AppointmentStatus.ONGOING,
  AppointmentStatus.COMPLETED,
] as const;
