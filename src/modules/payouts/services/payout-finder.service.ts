import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payout, PayoutDocument } from '../schemas/payout.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../../appointments/schemas/appointment.schema';
import { Doctor, DoctorDocument } from '../../doctors/schemas/doctor.schema';
import { PayoutHelperService } from '../helpers/payout.helper';

@Injectable()
export class PayoutFinderService {
  private readonly logger = new Logger(PayoutFinderService.name);

  constructor(
    @InjectModel(Payout.name) private payoutModel: Model<PayoutDocument>,
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    private readonly payoutHelper: PayoutHelperService,
  ) {}

  /**
   * Calculate doctor's earnings for a specific period
   * Finds all completed, unpaid appointments
   */
  async calculateEarnings(doctorId: string) {
    const results = await this.appointmentModel.aggregate(
      this.payoutHelper.getPendingEarningsAggregation(doctorId),
    );

    if (!results || results.length === 0) {
      return {
        totalEarnings: 0,
        platformCommission: 0,
        payoutAmount: 0,
        appointmentIds: [],
        count: 0,
      };
    }

    const res = results[0];
    const { platformCommission, payoutAmount } =
      this.payoutHelper.calculatePayoutAmount(res.totalEarnings);

    return {
      totalEarnings: res.totalEarnings,
      platformCommission,
      payoutAmount,
      appointmentIds: res.appointmentIds,
      count: res.count,
    };
  }

  /**
   * Get all doctors who are due for payout
   * (Completed appointments that haven't been paid out)
   */
  async getDuePayouts() {
    const results = await this.appointmentModel.aggregate(
      this.payoutHelper.getPendingEarningsAggregation(),
    );

    const enrichedResults: any[] = [];

    for (const res of results) {
      const doctor = await this.doctorModel
        .findById(res._id)
        .populate('userId', 'name email');

      if (!doctor) continue;

      const user = doctor.userId as any;
      const { platformCommission, payoutAmount } =
        this.payoutHelper.calculatePayoutAmount(res.totalEarnings);

      const { bankName, accountNumber } =
        this.payoutHelper.decryptBankDetails(doctor);

      enrichedResults.push({
        doctorId: res._id,
        doctorName: user?.name || 'Unknown',
        doctorEmail: user?.email,
        totalEarnings: res.totalEarnings,
        count: res.count,
        bankName,
        accountNumber,
        platformCommission,
        payoutAmount,
        hasRecipient: !!doctor.paystackRecipientCode,
        appointmentIds: res.appointmentIds,
      });
    }

    return enrichedResults;
  }

  /**
   * Get payout history for Admin
   */
  async getPayoutHistory(query: { doctorId?: string; batchId?: string }) {
    const filter: any = {};
    if (query.doctorId) filter.doctorId = new Types.ObjectId(query.doctorId);
    if (query.batchId) filter.batchId = query.batchId;

    return this.payoutModel
      .find(filter)
      .populate({
        path: 'doctorId',
        select: 'userId',
        populate: {
          path: 'userId',
          select: 'name email',
        },
      })
      .sort({ createdAt: -1 })
      .exec();
  }
}
