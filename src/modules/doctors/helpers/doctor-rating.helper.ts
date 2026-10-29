import { Injectable } from '@nestjs/common';

export interface RatingBreakdown {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface RatingStats {
  average: number;
  total: number;
  breakdown: RatingBreakdown;
}

/**
 * Helper class for calculating doctor ratings and statistics
 */
@Injectable()
export class DoctorRatingHelper {
  /**
   * Calculate average rating from reviews array
   * @param reviews - Array of review objects with rating property
   * @returns Average rating rounded to 1 decimal place
   */
  calculateAverageRating(reviews: Array<{ rating: number }>): number {
    if (!reviews || reviews.length === 0) {
      return 0;
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    return parseFloat((totalRating / reviews.length).toFixed(1));
  }

  /**
   * Build rating breakdown showing count for each star rating (1-5)
   * @param reviews - Array of review objects with rating property
   * @returns Object with counts for each rating level
   */
  buildRatingBreakdown(reviews: Array<{ rating: number }>): RatingBreakdown {
    const breakdown: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (!reviews || reviews.length === 0) {
      return breakdown;
    }

    reviews.forEach((review) => {
      if (review.rating >= 1 && review.rating <= 5) {
        breakdown[review.rating]++;
      }
    });

    return breakdown;
  }

  /**
   * Get complete rating statistics including average, total, and breakdown
   * @param reviews - Array of review objects with rating property
   * @returns Complete rating statistics object
   */
  getRatingStats(reviews: Array<{ rating: number }>): RatingStats {
    return {
      average: this.calculateAverageRating(reviews),
      total: reviews?.length || 0,
      breakdown: this.buildRatingBreakdown(reviews),
    };
  }
}
