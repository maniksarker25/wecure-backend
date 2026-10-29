import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import {
  getBusinessDayOfWeek,
  getBusinessNow,
} from 'src/common/utils/business-time.util';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import {
  AvailabilityDocument,
  DoctorAvailability,
} from './schemas/availability.schema';

import { DoctorsService } from '../doctors/doctors.service';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(DoctorAvailability.name)
    private availabilityModel: Model<AvailabilityDocument>,
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @Inject(forwardRef(() => DoctorsService))
    private readonly doctorsService: DoctorsService,
  ) {}

  /** Resolves to the doctor's ObjectId or throws NotFoundException. */
  private async resolveDoctorId(userId: string): Promise<Types.ObjectId> {
    const doctor = await this.doctorsService.getDoctorLean(userId);
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    return doctor._id;
  }

  // ---------------- Create ----------------
  async create(userId: string, dto: CreateAvailabilityDto) {
    const doctorId = await this.resolveDoctorId(userId);

    this.validateTimeRange(dto.startTime, dto.endTime, dto.slotSizeMinutes);

    const results: any[] = [];
    for (const day of dto.days) {
      // Ensure new timeframe does not overlap existing availabilities for that day
      const existingForDay = await this.availabilityModel.find({
        doctorId,
        dayOfWeek: day,
      });

      const newStart = this.timeToMinutes(dto.startTime);
      const newEnd = this.timeToMinutes(dto.endTime);

      for (const ex of existingForDay) {
        const exStart = this.timeToMinutes(ex.startTime);
        const exEnd = this.timeToMinutes(ex.endTime);
        // Overlap exists unless one ends before the other starts
        if (!(newEnd <= exStart || newStart >= exEnd)) {
          throw new BadRequestException(
            `New availability (${dto.startTime}-${dto.endTime}) overlaps existing availability (${ex.startTime}-${ex.endTime}) for ${day}`,
          );
        }
      }

      // Create a new availability entry for each selected day.
      const created = await this.availabilityModel.create({
        doctorId,
        dayOfWeek: day,
        slotSizeMinutes: dto.slotSizeMinutes,
        startTime: dto.startTime,
        endTime: dto.endTime,
        fee: dto.fee,
        isActive: true,
      });
      results.push(created as any);
    }

    return results;
  }

  // ---------------- Get ----------------
  async getByDoctor(doctorId: Types.ObjectId) {
    return this.availabilityModel
      .find({ doctorId })
      .sort({ dayOfWeek: 1 })
      .lean();
  }

  async getMyAvailability(userId: string) {
    const doctorId = await this.resolveDoctorId(userId);
    return this.getByDoctor(doctorId);
  }

  // ---------------- Update ----------------
  async toggleAvailability(
    userId: string,
    availabilityId: string,
    isActive: boolean,
  ) {
    const doctorId = await this.resolveDoctorId(userId);

    const availability = await this.availabilityModel.findOne({
      _id: availabilityId,
      doctorId,
    });

    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    availability.isActive = isActive;
    return availability.save();
  }

  async deactivateAllForDoctor(doctorId: string) {
    return this.availabilityModel.updateMany(
      { doctorId: new Types.ObjectId(doctorId) },
      { isActive: false },
    );
  }

  // ---------------- Update ----------------
  async updateAvailability(
    userId: string,
    availabilityId: string,
    dto: UpdateAvailabilityDto,
  ) {
    const doctorId = await this.resolveDoctorId(userId);
    const existing = await this.availabilityModel.findOne({
      _id: availabilityId,
      doctorId,
    });
    if (!existing) throw new NotFoundException('Availability not found');

    // Determine new values
    const newStart = dto.startTime ?? existing.startTime;
    const newEnd = dto.endTime ?? existing.endTime;
    const newSlot = dto.slotSizeMinutes ?? existing.slotSizeMinutes;

    // Validate time range
    this.validateTimeRange(newStart, newEnd, newSlot);

    // Check for conflicting booked appointments on this doctor's availability day
    const doctorProfile = await this.doctorsService.getMyProfile(userId);
    const doctorTz = (doctorProfile?.userId as any)?.timezone || 'Africa/Lagos';
    const { dateOnly: today } = getBusinessNow(doctorTz);

    const candidateApts = await this.appointmentModel
      .find({
        doctorId: new Types.ObjectId(doctorId),
        appointmentDate: { $gte: today },
        status: { $in: ['PENDING', 'UPCOMING', 'ONGOING'] },
      })
      .select('appointmentDate appointmentTime appointmentEndTime')
      .lean();

    const dayMap: Record<string, number> = {
      SUNDAY: 0,
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
    };
    const targetDay = dayMap[existing.dayOfWeek as string];

    const newStartMin = this.timeToMinutes(newStart);
    const newEndMin = this.timeToMinutes(newEnd);

    // Ensure the updated timeframe does not overlap other availabilities for the same day
    const otherAvailabilities = await this.availabilityModel.find({
      doctorId,
      dayOfWeek: existing.dayOfWeek,
      _id: { $ne: existing._id },
    });

    for (const oa of otherAvailabilities) {
      const oaStart = this.timeToMinutes(oa.startTime);
      const oaEnd = this.timeToMinutes(oa.endTime);
      if (!(newEndMin <= oaStart || newStartMin >= oaEnd)) {
        throw new BadRequestException(
          `Updated availability (${newStart}-${newEnd}) overlaps another availability (${oa.startTime}-${oa.endTime}) for ${existing.dayOfWeek}`,
        );
      }
    }

    const conflicting = candidateApts.filter((apt: any) => {
      if (getBusinessDayOfWeek(apt.appointmentDate) !== targetDay) return false;

      const aptStart = this.timeToMinutes(apt.appointmentTime);
      const aptEnd = this.timeToMinutes(
        apt.appointmentEndTime || apt.appointmentTime,
      );

      // Conflict if existing appointment is not fully contained within new window
      if (aptStart < newStartMin || aptEnd > newEndMin) return true;
      return false;
    });

    if (conflicting.length > 0) {
      throw new BadRequestException(
        `There are ${conflicting.length} existing appointments on ${existing.dayOfWeek} that would fall outside the new availability window. Cancel or reschedule those appointments before editing availability.`,
      );
    }

    const updated = await this.availabilityModel.findOneAndUpdate(
      { _id: availabilityId, doctorId },
      { $set: dto },
      { new: true },
    );

    return updated;
  }

  // ---------------- Delete ----------------
  async remove(userId: string, availabilityId: string) {
    const doctorId = await this.resolveDoctorId(userId);

    return this.availabilityModel.deleteOne({
      _id: availabilityId,
      doctorId,
    });
  }

  // ---------------- Slot Generation ----------------
  generateSlots(startTime: string, endTime: string, slotSizeMinutes: number) {
    const slots: string[] = [];

    let current = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    while (current + slotSizeMinutes <= end) {
      slots.push(this.minutesToTime(current));
      current += slotSizeMinutes;
    }

    return slots;
  }

  // ---------------- Helpers ----------------
  private validateTimeRange(
    startTime: string,
    endTime: string,
    slotSize: number,
  ) {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    if (start >= end) {
      throw new BadRequestException('Start time must be before end time');
    }

    if (end - start < slotSize) {
      throw new BadRequestException('Time range is too small for slot size');
    }
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
