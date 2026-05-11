export interface ReviewLike {
  seller_id?: string
  seller_name?: string
  rating?: number
}

export interface ReviewMetrics {
  rating: number
  reviewsCount: number
}

export const getReviewMetricsForSeller = (
  sellerId: string | undefined,
  reviews: ReviewLike[] | null | undefined,
  fallbackRating = 0,
  fallbackCount = 0
): ReviewMetrics => {
  if (!sellerId || !Array.isArray(reviews)) {
    return {
      rating: fallbackRating,
      reviewsCount: fallbackCount,
    }
  }

  const sellerReviews = reviews.filter((review) => review.seller_id === sellerId)
  const reviewsCount = sellerReviews.length

  if (reviewsCount === 0) {
    return {
      rating: fallbackRating,
      reviewsCount: fallbackCount,
    }
  }

  const totalRating = sellerReviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0)

  return {
    rating: Math.round((totalRating / reviewsCount) * 10) / 10,
    reviewsCount,
  }
}
