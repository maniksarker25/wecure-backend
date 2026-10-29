import { Injectable } from '@nestjs/common';
import { getBusinessDayOfWeek, getBusinessNow } from 'src/common/utils/business-time.util';
import { AvailabilityService } from '../../availability/availability.service';

export interface AvailabilityRule {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  slotSizeMinutes: number;
  isActive: boolean;
  fee?: number;
}

export interface DoctorSlot {
  date: string; // YYYY-MM-DD
  day: string;
  slots: string[];
  totalSlots: number;
}

/**
 * Helper class for generating and managing doctor availability slots
 */
@Injectable()
export class DoctorSlotsHelper {
  /**
   * Day index to name mapping
   */
  private readonly daysMap = {
    0: 'SUNDAY',
    1: 'MONDAY',
    2: 'TUESDAY',
    3: 'WEDNESDAY',
    4: 'THURSDAY',
    5: 'FRIDAY',
    6: 'SATURDAY',
  };

  /**
   * Generate array of next N days starting from today
   * @param days - Number of days to generate (default: 7)
   * @returns Array of Date objects
   */
  /**
   * Generate array of next N days starting from today in the target timezone
   * @param days - Number of days to generate (default: 7)
   * @param timezone - Timezone string
   * @returns Array of Date objects
   */
  getNext7Days(days = 7, timezone?: string): Date[] {
    const { dateOnly: today } = getBusinessNow(timezone);
    const nextDays: Date[] = [];

    for (let i = 0; i < days; i++) {
      nextDays.push(new Date(today.getTime() + i * 24 * 60 * 60 * 1000));
    }

    return nextDays;
  }

  /**
   * Get day name mapping
   * @returns Object mapping day index to day name
   */
  getDayNameMap(): Record<number, string> {
    return this.daysMap;
  }

  /**
   * Build a map of dayOfWeek to availability rule for active availabilities
   * @param availabilities - Array of availability rules
   * @returns Map of day name to availability rule
   */
  buildAvailabilityMap(
    availabilities: AvailabilityRule[],
  ): Record<string, AvailabilityRule> {
    const availabilityMap: Record<string, AvailabilityRule> = {};

    if (!availabilities || availabilities.length === 0) {
      return availabilityMap;
    }

    availabilities.forEach((availability) => {
      if (availability.isActive) {
        availabilityMap[availability.dayOfWeek] = availability;
      }
    });

    return availabilityMap;
  }

  /**
   * Filter out past time slots if it's today
   * @param slots - Array of time slots (HH:MM format)
   * @param isToday - Whether the slots are for today
   * @param timezone - Timezone string
   * @returns Filtered array of valid slots
   */
  filterPastSlots(slots: string[], isToday: boolean, timezone?: string): string[] {
    if (!isToday) {
      return slots;
    }

    const { minutesSinceMidnight: currentMinutes } = getBusinessNow(timezone);

    return slots.filter((time) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m > currentMinutes;
    });
  }

  /**
   * Generate next available slots for a doctor
   * @param doctor - Doctor object with availabilities
   * @param availabilityService - Service to generate slots
   * @param maxDays - Maximum number of days to show (default: 3)
   * @param slotsPerDay - Maximum slots per day to show (default: 5)
   * @returns Array of doctor slots
   */
  generateNextAvailableSlots(
    doctor: any,
    availabilityService: AvailabilityService,
    maxDays = 3,
    slotsPerDay = 5,
  ): DoctorSlot[] {
    const slots: DoctorSlot[] = [];

    if (!doctor.availabilities || doctor.availabilities.length === 0) {
      return slots;
    }

    const doctorTz = doctor.userId?.timezone || 'Africa/Lagos';
    const availabilityMap = this.buildAvailabilityMap(doctor.availabilities);
    const next7Days = this.getNext7Days(7, doctorTz);

    for (let i = 0; i < next7Days.length; i++) {
      const date = next7Days[i];
      const dayName = this.daysMap[getBusinessDayOfWeek(date)];
      const rule = availabilityMap[dayName];

      if (rule) {
        // Generate slots for this day
        const daySlots = availabilityService.generateSlots(
          rule.startTime,
          rule.endTime,
          rule.slotSizeMinutes,
        );

        // Filter out past times if today
        const validSlots = this.filterPastSlots(daySlots, i === 0, doctorTz);

        if (validSlots.length > 0) {
          slots.push({
            date: date.toISOString().split('T')[0], // YYYY-MM-DD
            day: dayName,
            slots: validSlots.slice(0, slotsPerDay),
            totalSlots: validSlots.length,
          });
        }
      }

      // Stop if we have enough days with slots
      if (slots.length >= maxDays) {
        break;
      }
    }

    return slots;
  }
}
