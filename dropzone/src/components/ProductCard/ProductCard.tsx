import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { Product } from '../../types'
import { getReviewMetricsForSeller } from '../../utils/reviewMetrics'
import facade from '../../services/facade'
import './ProductCard.css'

interface ProductCardProps {
  product: Product
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  // Безпечно отримуємо дані продавця (може бути null)
  const seller = product.seller || { username: 'Unknown', rating: 0, reviews_count: 0 }
  const [sellerMetrics, setSellerMetrics] = useState({
    rating: Number(seller.rating || 0),
    reviewsCount: Number(seller.reviews_count || 0),
  })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const savedReviews = await facade.getReviewsBySeller(product.seller_id)
      if (!mounted) return
      const metrics = getReviewMetricsForSeller(
        product.seller_id,
        savedReviews,
        seller.rating || 0,
        seller.reviews_count || 0
      )
      setSellerMetrics(metrics)
    })()
    return () => { mounted = false }
  }, [product.seller_id, seller.rating, seller.reviews_count])

  return (
    <Link to={`/product/${product.id}`} className="product-card">
      <div className="product-image">
        <img src={product.image_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22250%22 height=%22150%22%3E%3Crect fill=%22%23e0e0e0%22 width=%22250%22 height=%22150%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2214%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3EProduct Image%3C/text%3E%3C/svg%3E'} alt={product.title} />
        {product.stock === 0 && <div className="out-of-stock">Немає в наявності</div>}
      </div>

      <div className="product-info">
        <h3 className="product-title">{product.title}</h3>

        <div className="product-seller">
          <span className="seller-name">{seller.username}</span>
          <span className="seller-rating">⭐ {sellerMetrics.rating} ({sellerMetrics.reviewsCount})</span>
        </div>

        <div className="product-footer">
          <div className="product-price">{product.price.toFixed(2)} ₴</div>
          {product.stock !== undefined && product.stock !== null && (
            <div className="product-stock" style={{ fontSize: '0.85em', color: product.stock > 3 ? '#666' : '#e74c3c' }}>
              {product.stock > 0 ? `${product.stock} в наявності` : 'Немає'}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export default ProductCard
