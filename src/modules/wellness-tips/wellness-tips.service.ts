import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateWellnessTipDto } from './dto/create-wellness-tip.dto';
import { UpdateWellnessTipDto } from './dto/update-wellness-tip.dto';
import {
  WellnessTip,
  WellnessTipDocument,
} from './schemas/wellness-tip.schema';
import {
  WellnessTipLike,
  WellnessTipLikeDocument,
} from './schemas/wellness-tip-like.schema';

@Injectable()
export class WellnessTipsService {
  constructor(
    @InjectModel(WellnessTip.name)
    private wellnessTipModel: Model<WellnessTipDocument>,
    @InjectModel(WellnessTipLike.name)
    private wellnessTipLikeModel: Model<WellnessTipLikeDocument>,
  ) {}

  async toggleLike(tipId: string, userId: string) {
    const existingLike = await this.wellnessTipLikeModel.findOne({
      tipId,
      userId,
    });

    if (existingLike) {
      await this.wellnessTipLikeModel.deleteOne({ _id: existingLike._id });
      return { liked: false };
    } else {
      await this.wellnessTipLikeModel.create({ tipId, userId });
      return { liked: true };
    }
  }

  async create(createWellnessTipDto: CreateWellnessTipDto) {
    const createdTip = new this.wellnessTipModel(createWellnessTipDto);
    return createdTip.save();
  }

  async findAll(query: any, userId?: string) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [data, total]: [any[], number] = await Promise.all([
      this.wellnessTipModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.wellnessTipModel.countDocuments(),
    ]);

    let tipsWithFavourite: any[] = data;
    if (userId) {
      const userLikes = await this.wellnessTipLikeModel.find({ userId });
      const likedTipIds = new Set(
        userLikes.map((like) => like.tipId.toString()),
      );

      tipsWithFavourite = data.map((tip) => ({
        ...tip,
        isFavourite: likedTipIds.has(tip._id.toString()),
      }));
    } else {
      tipsWithFavourite = data.map((tip) => ({
        ...tip,
        isFavourite: false,
      }));
    }

    return {
      data: tipsWithFavourite,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId?: string) {
    const tip = await this.wellnessTipModel.findById(id).lean().exec();
    if (!tip) {
      throw new NotFoundException(`Wellness tip with ID ${id} not found`);
    }

    let isFavourite = false;
    if (userId) {
      const like = await this.wellnessTipLikeModel.findOne({
        tipId: id,
        userId,
      });
      isFavourite = !!like;
    }

    return {
      ...tip,
      isFavourite,
    } as any;
  }

  async update(id: string, updateWellnessTipDto: UpdateWellnessTipDto) {
    const updatedTip = await this.wellnessTipModel
      .findByIdAndUpdate(id, updateWellnessTipDto, { new: true })
      .exec();
    if (!updatedTip) {
      throw new NotFoundException(`Wellness tip with ID ${id} not found`);
    }
    return updatedTip;
  }

  async remove(id: string) {
    const deletedTip = await this.wellnessTipModel.findByIdAndDelete(id).exec();
    if (!deletedTip) {
      throw new NotFoundException(`Wellness tip with ID ${id} not found`);
    }
    return deletedTip;
  }
}
