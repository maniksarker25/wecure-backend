import { Injectable } from '@nestjs/common';
import { PipelineStage } from 'mongoose';

/**
 * Helper class for building reusable MongoDB aggregation pipeline stages
 * for doctor queries. Reduces code duplication across service methods.
 */
@Injectable()
export class DoctorAggregationHelper {
  /**
   * Adds a doctorIdString field for type conversion compatibility
   */
  addDoctorIdStringField(): PipelineStage {
    return {
      $addFields: {
        doctorIdString: { $toString: '$_id' },
      },
    };
  }

  /**
   * Lookup reviews with type conversion handling for ObjectId/string mismatch
   */
  lookupReviews(): PipelineStage {
    return {
      $lookup: {
        from: 'reviews',
        let: { doctorId: '$_id', doctorIdStr: '$doctorIdString' },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$doctorId', '$$doctorId'] },
                  { $eq: [{ $toString: '$doctorId' }, '$$doctorIdStr'] },
                ],
              },
            },
          },
        ],
        as: 'reviews',
      },
    };
  }

  /**
   * Calculate average rating and total reviews count
   */
  calculateRatings(): PipelineStage {
    return {
      $addFields: {
        averageRating: {
          $cond: {
            if: { $gt: [{ $size: '$reviews' }, 0] },
            then: { $avg: '$reviews.rating' },
            else: 0,
          },
        },
        totalReviews: { $size: '$reviews' },
      },
    };
  }

  /**
   * Lookup experiences with type conversion handling
   */
  lookupExperiences(): PipelineStage {
    return {
      $lookup: {
        from: 'doctorexperiences',
        let: { doctorId: '$_id', doctorIdStr: '$doctorIdString' },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$doctorId', '$$doctorId'] },
                  { $eq: [{ $toString: '$doctorId' }, '$$doctorIdStr'] },
                ],
              },
            },
          },
        ],
        as: 'experiences',
      },
    };
  }

  /**
   * Calculate total experience years from experience documents
   */
  calculateExperience(): PipelineStage {
    return {
      $addFields: {
        calculatedExperienceYears: {
          $floor: {
            $divide: [
              {
                $reduce: {
                  input: '$experiences',
                  initialValue: 0,
                  in: {
                    $add: [
                      '$$value',
                      {
                        $let: {
                          vars: {
                            start: '$$this.startDate',
                            end: {
                              $cond: {
                                if: {
                                  $or: [
                                    { $eq: ['$$this.isCurrent', true] },
                                    { $not: ['$$this.endDate'] },
                                  ],
                                },
                                then: '$$NOW',
                                else: '$$this.endDate',
                              },
                            },
                          },
                          in: {
                            $let: {
                              vars: {
                                months: {
                                  $add: [
                                    {
                                      $multiply: [
                                        {
                                          $subtract: [
                                            { $year: '$$end' },
                                            { $year: '$$start' },
                                          ],
                                        },
                                        12,
                                      ],
                                    },
                                    {
                                      $subtract: [
                                        { $month: '$$end' },
                                        { $month: '$$start' },
                                      ],
                                    },
                                  ],
                                },
                              },
                              in: {
                                $cond: {
                                  if: { $gt: ['$$months', 0] },
                                  then: '$$months',
                                  else: 0,
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
              12,
            ],
          },
        },
      },
    };
  }

  /**
   * Lookup user details (name, profileImage) with type conversion
   */
  lookupUserDetails(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: 'users',
          let: { userId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$_id', '$$userId'] },
                    { $eq: [{ $toString: '$_id' }, { $toString: '$$userId' }] },
                  ],
                },
              },
            },
            {
              $project: {
                name: 1,
                profileImage: 1,
              },
            },
          ],
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
  }

  /**
   * Lookup specialty details with type conversion
   */
  lookupSpecialtyDetails(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: 'specialists',
          let: {
            sId1: '$specialtyId',
            sId2: '$specialistId', // Fallback for data inconsistency
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$_id', '$$sId1'] },
                    { $eq: ['$_id', '$$sId2'] },
                    { $eq: [{ $toString: '$_id' }, { $toString: '$$sId1' }] },
                    { $eq: [{ $toString: '$_id' }, { $toString: '$$sId2' }] },
                  ],
                },
              },
            },
            {
              $project: {
                name: 1,
              },
            },
          ],
          as: 'specialty',
        },
      },
      {
        $unwind: {
          path: '$specialty',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
  }

  /**
   * Lookup availabilities and calculate minimum fee
   */
  lookupAvailabilities(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: 'doctoravailabilities',
          localField: '_id',
          foreignField: 'doctorId',
          as: 'availabilities',
        },
      },
      {
        $addFields: {
          minFee: {
            $cond: {
              if: { $gt: [{ $size: '$availabilities' }, 0] },
              then: { $min: '$availabilities.fee' },
              else: 0,
            },
          },
        },
      },
    ];
  }

  /**
   * Project fields for doctor card view
   * @param includeAvailabilities - Whether to include raw availability data array
   * @param includeMinFee - Whether to include the minFee field (defaults to true if includeAvailabilities is true)
   */
  projectDoctorCard(
    includeAvailabilities = false,
    includeMinFee = true,
  ): PipelineStage {
    const baseProjection: any = {
      _id: 1,
      name: '$user.name',
      profileImage: { $ifNull: ['$user.profileImage', null] },
      specialty: { $ifNull: ['$specialty.name', null] },
      currentOrganization: 1,
      experienceYears: 1,
      totalExperienceYears: {
        $max: [
          { $ifNull: ['$experienceYears', 0] },
          { $ifNull: ['$calculatedExperienceYears', 0] },
        ],
      },
      averageRating: { $round: ['$averageRating', 1] },
      totalReviews: 1,
    };

    if (includeMinFee || includeAvailabilities) {
      baseProjection.minFee = 1;
    }

    if (includeAvailabilities) {
      baseProjection.availabilities = 1;
    }

    return {
      $project: baseProjection,
    };
  }

  /**
   * Sort by average rating descending
   */
  sortByRating(): PipelineStage {
    return {
      $sort: { averageRating: -1 },
    };
  }
}
