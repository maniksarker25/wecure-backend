import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Payment, PaymentDocument } from './schemas/payment.schema';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
  ) {}

  async create(createPaymentDto: CreatePaymentDto) {
    const createdPayment = new this.paymentModel(createPaymentDto);
    return createdPayment.save();
  }

  async findAll() {
    return this.paymentModel.find().exec();
  }

  async findOne(id: number) {
    // This method was scaffolded with number ID, but we use ObjectId strings.
    // Leaving as is or removing if not used, but better to fix or ignore for now.
    return `This action returns a #${id} payment`;
  }

  async findByReference(reference: string) {
    return this.paymentModel.findOne({ paystackReference: reference }).exec();
  }

  async updateStatus(reference: string, status: string) {
    const payment = await this.paymentModel.findOneAndUpdate(
      { paystackReference: reference },
      { status },
      { new: true },
    );
    if (!payment) {
      throw new NotFoundException(
        `Payment with reference ${reference} not found`,
      );
    }
    return payment;
  }

  // Keeping scaffold methods to avoid breaking if used elsewhere, but they likely aren't.
  update(id: number, _updatePaymentDto: UpdatePaymentDto) {
    return `This action updates a #${id} payment`;
  }

  remove(id: number) {
    return `This action removes a #${id} payment`;
  }
}
