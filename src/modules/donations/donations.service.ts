import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationDto } from './dto/update-donation.dto';
import { Donation, DonationDocument } from './schemas/donation.schema';

@Injectable()
export class DonationsService {
  constructor(
    @InjectModel(Donation.name)
    private donationModel: Model<DonationDocument>,
  ) {}

  async create(createDonationDto: CreateDonationDto) {
    const createdDonation = new this.donationModel(createDonationDto);
    return createdDonation.save();
  }

  async findAll(query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.donationModel
        .find()
        .populate('userId', 'name email')
        .skip(skip)
        .limit(limit)
        .exec(),
      this.donationModel.countDocuments(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const donation = await this.donationModel.findById(id).exec();
    if (!donation) {
      throw new NotFoundException(`Donation with ID ${id} not found`);
    }
    return donation;
  }

  async update(id: string, updateDonationDto: UpdateDonationDto) {
    const updatedDonation = await this.donationModel
      .findByIdAndUpdate(id, updateDonationDto, { new: true })
      .exec();
    if (!updatedDonation) {
      throw new NotFoundException(`Donation with ID ${id} not found`);
    }
    return updatedDonation;
  }

  async remove(id: string) {
    const deletedDonation = await this.donationModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedDonation) {
      throw new NotFoundException(`Donation with ID ${id} not found`);
    }
    return deletedDonation;
  }

  async findByReference(reference: string) {
    return this.donationModel.findOne({ paystackReference: reference }).exec();
  }
}
