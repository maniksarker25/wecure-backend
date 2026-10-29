import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import {
  combineDateAndTime,
  formatUtcDate,
  getBusinessDayOfWeek,
  getBusinessNow,
  getUtcDayBounds,
  isSameUtcDate,
} from 'src/common/utils/business-time.util';
import { AvailabilityService } from '../../availability/availability.service';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../schemas/appointment.schema';

@Injectable()
export class AppointmentValidatorService {
  constructor(
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    private readonly availabilityService: AvailabilityService,
    @InjectModel(Doctor.name)
    private doctorModel: Model<DoctorDocument>,
  ) {}

  async validateGeneralAvailability(
    doctorId: string,
    appointmentDate: Date,
    appointmentTime: string,
    appointmentEndTime: string,
    availabilities: any[],
  ) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .populate('userId', 'timezone')
      .lean();
    const doctorTz = (doctor?.userId as any)?.timezone || 'Africa/Lagos';

    // 1. Check if date is in the past
    const now = new Date();
    const apptDateTime = combineDateAndTime(
      appointmentDate,
      appointmentTime,
      doctorTz,
    );

    if (apptDateTime < now) {
      throw new BadRequestException('Cannot book appointments in the past');
    }

    // 2. Get doctor availability
    if (!availabilities || availabilities.length === 0) {
      throw new BadRequestException('Doctor has no availability configured');
    }

    // 3. Check specific day
    const days = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const dayOfWeek = days[getBusinessDayOfWeek(appointmentDate)];

    const dayAvailabilities = availabilities.filter(
      (a) => a.dayOfWeek === dayOfWeek && a.isActive,
    );

    if (dayAvailabilities.length === 0) {
      throw new BadRequestException(`Doctor is not available on ${dayOfWeek}`);
    }

    // 4. Check time range
    const apptStartMinutes = this.timeToMinutes(appointmentTime);
    const apptEndMinutes = this.timeToMinutes(appointmentEndTime);

    const dayAvailability = dayAvailabilities.find((da) => {
      const startMinutes = this.timeToMinutes(da.startTime);
      const endMinutes = this.timeToMinutes(da.endTime);
      return apptStartMinutes >= startMinutes && apptEndMinutes <= endMinutes;
    });

    if (!dayAvailability) {
      const ranges = dayAvailabilities
        .map((da) => `${da.startTime} and ${da.endTime}`)
        .join(', or ');
      throw new BadRequestException(
        `Appointment time must be between ${ranges}`,
      );
    }

    return dayAvailability;
  }

  async checkOverlap(
    doctorId: string,
    appointmentDate: Date,
    appointmentTime: string,
    appointmentEndTime: string,
    session: any,
  ) {
    // 5. Fetch all non-cancelled appointments for the same day and check overlap in JS
    const { start: startOfDay, end: endOfDay } =
      getUtcDayBounds(appointmentDate);

    const appointments = await this.appointmentModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: { $gte: startOfDay, $lt: endOfDay },
        status: { $ne: AppointmentStatus.CANCELLED },
      })
      .select('appointmentTime appointmentEndTime')
      .session(session)
      .lean();

    const toMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };

    const apptStart = toMinutes(appointmentTime);
    const apptEnd = toMinutes(appointmentEndTime);

    for (const a of appointments) {
      const existingStart = toMinutes(a.appointmentTime);
      const existingEnd = toMinutes(a.appointmentEndTime || a.appointmentTime);

      // Overlap if S1 < E2 && E1 > S2
      if (apptStart < existingEnd && apptEnd > existingStart) {
        throw new BadRequestException(
          `This time slot overlaps with an existing appointment (${a.appointmentTime} - ${a.appointmentEndTime || a.appointmentTime})`,
        );
      }
    }
  }

  async getAvailableSlots(doctorId: string, date: Date) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .populate('userId', 'timezone')
      .lean();
    const doctorTz = (doctor?.userId as any)?.timezone || 'Africa/Lagos';

    // 1. Get doctor's availability for that day
    const days = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const dayOfWeek = days[getBusinessDayOfWeek(date)];

    const availability = await this.availabilityService.getByDoctor(
      new Types.ObjectId(doctorId),
    );
    // Gather all active availabilities for that day (support multiple timeframes)
    const dayAvailabilities = availability.filter(
      (a) => a.dayOfWeek === dayOfWeek && a.isActive,
    );

    if (!dayAvailabilities || dayAvailabilities.length === 0) {
      return [];
    }

    // 2. Generate all possible slots for each timeframe and merge
    const slotSet = new Set<string>();
    const slotMeta: Record<string, { fee: number; duration: number }> = {};

    for (const da of dayAvailabilities) {
      const s = this.availabilityService.generateSlots(
        da.startTime,
        da.endTime,
        da.slotSizeMinutes,
      );
      for (const t of s) {
        slotSet.add(t);
        // store fee/duration for this slot (last writer wins if overlaps)
        slotMeta[t] = { fee: da.fee, duration: da.slotSizeMinutes };
      }
    }

    const allSlots = Array.from(slotSet).sort((a, b) => {
      const ta = this.timeToMinutes(a);
      const tb = this.timeToMinutes(b);
      return ta - tb;
    });

    // 3. Get existing appointments for that day
    const { start: slotsDayStart, end: slotsDayEnd } = getUtcDayBounds(date);
    const existingAppointments = await this.appointmentModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: { $gte: slotsDayStart, $lt: slotsDayEnd },
        status: { $ne: AppointmentStatus.CANCELLED },
      })
      .select('appointmentTime appointmentEndTime')
      .lean();

    const bookedAppointments = existingAppointments.map((a) => ({
      start: this.timeToMinutes(a.appointmentTime),
      end: this.timeToMinutes(a.appointmentEndTime || a.appointmentTime),
    }));

    // 4. Filter out booked slots and past slots (if today, in business time)
    const { dateOnly: businessToday, minutesSinceMidnight: currentMinutes } =
      getBusinessNow(doctorTz);
    const isToday = isSameUtcDate(date, businessToday);

    return allSlots
      .filter((time) => {
        const slotStart = this.timeToMinutes(time);
        const slotEnd = slotStart + slotMeta[time].duration;

        if (isToday) {
          if (slotStart <= currentMinutes) {
            return false;
          }
        }

        // Check for overlap: S1 < E2 && E1 > S2
        const isOverlapping = bookedAppointments.some(
          (appt) => slotStart < appt.end && slotEnd > appt.start,
        );

        return !isOverlapping;
      })
      .map((time) => ({
        time,
        isAvailable: true,
        fee: slotMeta[time].fee,
        duration: slotMeta[time].duration,
        doctorTimezone: doctorTz,
      }));
  }

  async getAvailableDates(doctorId: string, daysToLookAhead: number = 30) {
    const doctor = await this.doctorModel
      .findById(doctorId)
      .populate('userId', 'timezone')
      .lean();
    const doctorTz = (doctor?.userId as any)?.timezone || 'Africa/Lagos';

    const { dateOnly: startDate, minutesSinceMidnight: currentMinutes } =
      getBusinessNow(doctorTz);
    const endDate = new Date(
      startDate.getTime() + daysToLookAhead * 24 * 60 * 60 * 1000,
    );

    // 1. Get doctor's availability
    const availabilities = await this.availabilityService.getByDoctor(
      new Types.ObjectId(doctorId),
    );

    if (!availabilities || availabilities.length === 0) {
      return [];
    }

    // 2. Normalize availability by Day of Week (allow multiple timeframes per day)
    const availabilityMap = new Map<string, any[]>();
    availabilities.forEach((a) => {
      if (a.isActive) {
        if (!availabilityMap.has(a.dayOfWeek))
          availabilityMap.set(a.dayOfWeek, []);
        availabilityMap.get(a.dayOfWeek)!.push(a);
      }
    });

    // 3. Get all existing appointments in the range
    const appointments = await this.appointmentModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: {
          $gte: startDate,
          $lt: endDate,
        },
        status: { $ne: AppointmentStatus.CANCELLED },
      })
      .select('appointmentDate appointmentTime appointmentEndTime')
      .lean();

    // Map: 'YYYY-MM-DD' -> [{start, end}]
    const bookedMap = new Map<string, { start: number; end: number }[]>();
    appointments.forEach((appt) => {
      const dateStr = formatUtcDate(appt.appointmentDate);
      if (!bookedMap.has(dateStr)) {
        bookedMap.set(dateStr, []);
      }
      bookedMap.get(dateStr)!.push({
        start: this.timeToMinutes(appt.appointmentTime),
        end: this.timeToMinutes(
          appt.appointmentEndTime || appt.appointmentTime,
        ),
      });
    });

    const results: any[] = [];
    const days = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];

    // 4. Iterate over each day
    let currentDate = new Date(startDate);
    while (currentDate < endDate) {
      const dayName = days[getBusinessDayOfWeek(currentDate)];
      const dayAvailability = availabilityMap.get(dayName);

      if (dayAvailability) {
        const dateStr = formatUtcDate(currentDate);
        const bookedAppts = bookedMap.get(dateStr) || [];

        // Build union of slots from all timeframes for the day
        const slotSet = new Set<string>();
        const slotDurations: Record<string, number> = {};

        for (const da of dayAvailability) {
          const s = this.availabilityService.generateSlots(
            da.startTime,
            da.endTime,
            da.slotSizeMinutes,
          );
          for (const t of s) {
            slotSet.add(t);
            slotDurations[t] = da.slotSizeMinutes;
          }
        }

        const allSlots = Array.from(slotSet).sort(
          (a, b) => this.timeToMinutes(a) - this.timeToMinutes(b),
        );

        // If today, filter out past slots from total available slots calculation
        const isToday = isSameUtcDate(currentDate, startDate);

        const availableSlots = allSlots.filter((time) => {
          const slotStart = this.timeToMinutes(time);
          const slotEnd = slotStart + (slotDurations[time] || 0);

          if (isToday && slotStart <= currentMinutes) return false;

          // Check for overlap: S1 < E2 && E1 > S2
          const isOverlapping = bookedAppts.some(
            (appt) => slotStart < appt.end && slotEnd > appt.start,
          );

          return !isOverlapping;
        });

        const availableCount = availableSlots.length;

        const totalPossibleSlots = allSlots.filter((time) => {
          const slotStart = this.timeToMinutes(time);
          if (isToday) return slotStart > currentMinutes;
          return true;
        }).length;

        if (availableCount > 0) {
          results.push({
            date: dateStr,
            day: dayName,
            availableSlots: availableCount,
            totalSlots: totalPossibleSlots,
            doctorTimezone: doctorTz,
          });
        }
      }
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }

    return results;
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
}
