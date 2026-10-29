import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LegalContent,
  LegalContentDocument,
  LegalContentType,
} from './schemas/legal-content.schema';

@Injectable()
export class LegalContentService {
  constructor(
    @InjectModel(LegalContent.name)
    private legalContentModel: Model<LegalContentDocument>,
  ) {}

  async getContentByType(type: LegalContentType): Promise<LegalContent> {
    const content = await this.legalContentModel
      .findOne({ type, isActive: true })
      .exec();

    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }

    return content;
  }

  async updateContent(
    type: LegalContentType,
    content: string,
  ): Promise<LegalContent> {
    const updatedContent = await this.legalContentModel
      .findOneAndUpdate(
        { type },
        { content, isActive: true },
        { new: true, upsert: true },
      )
      .exec();

    return updatedContent;
  }
}
