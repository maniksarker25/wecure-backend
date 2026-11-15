import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { EncryptionService } from '../../../common/services/encryption.service';
import { Doctor } from '../../doctors/schemas/doctor.schema';

@Injectable()
export class PayoutHelperService {
  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Decrypt doctor bank details
   */
  decryptBankDetails(doctor: Doctor) {
    return {
      bankName: this.encryptionService.isEncrypted(doctor.bankName)
        ? this.encryptionService.decrypt(doctor.bankName)
        : doctor.bankName,
      bankCode: this.encryptionService.isEncrypted(doctor.bankCode)
        ? this.encryptionService.decrypt(doctor.bankCode)
        : doctor.bankCode,
      accountName: this.encryptionService.isEncrypted(doctor.accountName)
        ? this.encryptionService.decrypt(doctor.accountName)
        : doctor.accountName,
      accountNumber: this.encryptionService.isEncrypted(doctor.accountNumber)
        ? this.encryptionService.decrypt(doctor.accountNumber)
        : doctor.accountNumber,
    };
  }

  /**
   * Calculate platform commission and payout amount
   */
  calculatePayoutAmount(totalEarnings: number) {
    const commissionPercent = parseInt(
      this.configService.get<string>('PLATFORM_COMMISSION_PERCENT') || '10',
    );
    const platformCommission = (totalEarnings * commissionPercent) / 100;
    const payoutAmount = totalEarnings - platformCommission;

    return { platformCommission, payoutAmount };
  }

  /**
   * Common aggregation logic for pending earnings
   */
  getPendingEarningsAggregation(doctorId?: string) {
    const match: any = {
      status: 'COMPLETED',
      isPaidOut: false,
      payoutId: { $exists: false },
      paymentId: { $exists: true },
    };

    if (doctorId) {
      match.doctorId = new Types.ObjectId(doctorId);
    }

    return [
      { $match: match },
      {
        // Exclude appointments whose payment has since been refunded (or whose
        // payment record is missing) so doctors are never paid out for
        // consultations the platform has already returned money on.
        $lookup: {
          from: 'payments',
          localField: 'paymentId',
          foreignField: '_id',
          as: 'payment',
        },
      },
      { $unwind: '$payment' },
      { $match: { 'payment.isRefunded': { $ne: true } } },
      {
        $group: {
          _id: '$doctorId',
          totalEarnings: { $sum: '$consultationFee' },
          appointmentIds: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
    ];
  }
}
