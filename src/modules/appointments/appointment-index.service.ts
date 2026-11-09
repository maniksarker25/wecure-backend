import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { APPOINTMENT_SLOT_HELD_STATUSES } from 'src/common/enum/appointment-status.enum';

const UNIQUE_SLOT_INDEX = 'idx_appt_doctor_date_time_unique';
const LEGACY_SLOT_INDEX = 'doctorId_1_appointmentDate_1_appointmentTime_1';

@Injectable()
export class AppointmentIndexService implements OnModuleInit {
  private readonly logger = new Logger(AppointmentIndexService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit() {
    try {
      await this.syncUniqueSlotIndex();
    } catch (error) {
      this.logger.error('Failed to sync the appointment slot index', error);
    }
  }

  private async syncUniqueSlotIndex() {
    const collection = this.connection.collection('appointments');
    const indexes = await collection.indexes();
    const desired = [...APPOINTMENT_SLOT_HELD_STATUSES].sort();
    const current = indexes.find(
      (index) =>
        index.name === UNIQUE_SLOT_INDEX || index.name === LEGACY_SLOT_INDEX,
    );
    const currentSlots = [
      ...((current?.partialFilterExpression as { status?: { $in?: string[] } })
        ?.status?.$in || []),
    ].sort();

    if (
      current?.name === UNIQUE_SLOT_INDEX &&
      current.unique &&
      currentSlots.join() === desired.join()
    ) {
      if (indexes.some((index) => index.name === LEGACY_SLOT_INDEX)) {
        await collection.dropIndex(LEGACY_SLOT_INDEX);
        this.logger.log(`Dropped appointment index ${LEGACY_SLOT_INDEX}`);
      }
      return;
    }

    for (const name of [UNIQUE_SLOT_INDEX, LEGACY_SLOT_INDEX]) {
      if (!indexes.some((index) => index.name === name)) continue;
      await collection.dropIndex(name);
      this.logger.log(`Dropped appointment index ${name}`);
    }

    await collection.createIndex(
      { doctorId: 1, appointmentDate: 1, appointmentTime: 1 },
      {
        unique: true,
        name: UNIQUE_SLOT_INDEX,
        partialFilterExpression: {
          status: { $in: [...APPOINTMENT_SLOT_HELD_STATUSES] },
        },
      },
    );
    this.logger.log(
      'Appointment slot index now ignores EXPIRED and CANCELLED bookings',
    );
  }
}
