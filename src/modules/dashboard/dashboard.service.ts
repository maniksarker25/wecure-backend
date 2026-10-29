import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Doctor, DoctorDocument } from '../doctors/schemas/doctor.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { Role } from 'src/common/enum/role.enum';
import { AppointmentStatus } from 'src/common/enum/appointment-status.enum';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Doctor.name) private doctorModel: Model<DoctorDocument>,
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
  ) {}

  async getAdminDashboardStats(filter: DashboardQueryDto): Promise<any> {
    const currentYear = new Date().getFullYear();
    const targetYear = filter.year || currentYear;
    const targetMonth = filter.month;

    // 1. Total Patients & Doctors (Lifetime)
    const [totalPatients, totalDoctors] = await Promise.all([
      this.userModel.countDocuments({ role: Role.USER }),
      this.doctorModel.countDocuments(),
    ]);

    // 2. Appointment Stats Filtered by Year/Month
    const appointmentMatch: any = {};
    if (targetMonth) {
      const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
      const endOfMonth = new Date(targetYear, targetMonth, 1);
      appointmentMatch.createdAt = { $gte: startOfMonth, $lt: endOfMonth };
    } else {
      const startOfYear = new Date(targetYear, 0, 1);
      const endOfYear = new Date(targetYear + 1, 0, 1);
      appointmentMatch.createdAt = { $gte: startOfYear, $lt: endOfYear };
    }

    const appointmentStats = await this.appointmentModel.aggregate([
      { $match: appointmentMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    let totalRequests = 0;
    let completeConsultations = 0;
    let canceledAppointments = 0;

    appointmentStats.forEach((stat) => {
      if (stat._id === AppointmentStatus.PENDING) totalRequests += stat.count;
      else if (stat._id === AppointmentStatus.COMPLETED)
        completeConsultations += stat.count;
      else if (stat._id === AppointmentStatus.CANCELLED)
        canceledAppointments += stat.count;
    });

    const totalAppointments =
      await this.appointmentModel.countDocuments(appointmentMatch);

    // 3. Revenue Activity for the target year
    const startOfYearForRevenue = new Date(targetYear, 0, 1);
    const endOfYearForRevenue = new Date(targetYear + 1, 0, 1);

    const revenuePipeline = await this.paymentModel.aggregate([
      {
        $match: {
          status: 'PAID',
          createdAt: {
            $gte: startOfYearForRevenue,
            $lt: endOfYearForRevenue,
          },
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' }, // 1 to 12
          totalAmount: { $sum: '$amount' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    let totalRevenue = 0;
    const monthlyRevenueRaw = new Array(12).fill(0);

    revenuePipeline.forEach((item) => {
      const monthIndex = item._id - 1; // 0 for Jan, 11 for Dec
      monthlyRevenueRaw[monthIndex] = item.totalAmount;
      totalRevenue += item.totalAmount;
    });

    // Format for easy UI rendering
    return {
      overview: {
        totalPatients,
        totalDoctors,
        totalAppointments,
        completeConsultations,
      },
      revenueActivity: {
        year: targetYear,
        monthly: monthlyRevenueRaw,
      },
      revenue: totalRevenue,
      status: {
        totalRequests, // e.g., PENDING
        completed: completeConsultations,
        canceled: canceledAppointments,
      },
    };
  }
}
