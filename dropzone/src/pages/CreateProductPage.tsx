import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, ArrowLeft, Edit2 } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useToast } from '../components/Toast'
import CustomSelect from '../components/CustomSelect/CustomSelect'
import facade from '../services/facade'
import { catalogService } from '../services/api'
import { CatalogCategory } from '../types'
import { getStoredCatalogCategories, saveStoredCatalogCategories } from '../utils/adminData'
import './CreateProductPage.css'

interface ProductFormData {
  title: string
  description: string
  price: number
  category: string
  subcategory: string
  stock: number
  image_url: string
}

const DEFAULT_CATALOG_CATEGORIES: CatalogCategory[] = [
  { id: 'games', name: 'Ігри', parent_id: null, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'subscriptions', name: 'Підписки', parent_id: null, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'keys', name: 'Ключі і Коди', parent_id: null, sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cs2', name: 'CS2', parent_id: 'games', sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'dota2', name: 'Dota 2', parent_id: 'games', sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'valorant', name: 'Valorant', parent_id: 'games', sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'pubg', name: 'PUBG', parent_id: 'games', sort_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'fortnite', name: 'Fortnite', parent_id: 'games', sort_order: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'telegram', name: 'Telegram', parent_id: 'subscriptions', sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'spotify', name: 'Spotify', parent_id: 'subscriptions', sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'discord', name: 'Discord', parent_id: 'subscriptions', sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'youtube', name: 'YouTube', parent_id: 'subscriptions', sort_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'windows', name: 'Windows', parent_id: 'keys', sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'office', name: 'Office', parent_id: 'keys', sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

const resolveCategoryId = (categories: CatalogCategory[], value: string) => {
  const normalized = value.trim().toLowerCase()
  const match = categories.find((category) => category.id.toLowerCase() === normalized || category.name.toLowerCase() === normalized)
  return match?.id || value
}

const flattenCatalogCategories = (categories: CatalogCategory[]) => {
  const flat: CatalogCategory[] = []
  const walk = (items: CatalogCategory[]) => {
    items.forEach((item) => {
      flat.push({ ...item, children: item.children || [] })
      if (item.children?.length) {
        walk(item.children)
      }
    })
  }
  walk(categories)
  return flat
}

const CreateProductPage: React.FC = () => {
  const navigate = useNavigate()
  const { productId } = useParams<{ productId?: string }>()
  const { user, isAuthenticated, isInitialized } = useAuthStore()
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isEditMode, setIsEditMode] = useState(!!productId)
  const [originalProduct, setOriginalProduct] = useState<any>(null)
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>(DEFAULT_CATALOG_CATEGORIES)
  const TITLE_MAX = 56
  const DESCRIPTION_MAX = 512

  const [formData, setFormData] = useState<ProductFormData>({
    title: '',
    description: '',
    price: 0,
    category: '',
    subcategory: '',
    stock: 1,
    image_url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23e0e0e0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3EProduct%3C/text%3E%3C/svg%3E',
  })

  const topCategories = catalogCategories.filter((category) => !category.parent_id)
  const selectedCategoryNode = catalogCategories.find((category) => category.id === formData.category) || null
  const subcategories = catalogCategories.filter((category) => category.parent_id === selectedCategoryNode?.id)

  useEffect(() => {
    if (!isInitialized) return
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    const loadCategories = async () => {
      try {
        const response = await catalogService.getTaxonomy()
        const payload = response.data?.data
        const loaded = flattenCatalogCategories(payload?.categories || [])
        if (loaded.length > 0) {
          setCatalogCategories(loaded)
          saveStoredCatalogCategories(loaded)
          setFormData((current) => ({
            ...current,
            category: current.category || loaded.find((category) => !category.parent_id)?.id || '',
          }))
          return
        }
      } catch (error) {
        console.error('Failed to load catalog taxonomy from backend, using local fallback:', error)
      }

      const stored = getStoredCatalogCategories()
      if (stored.length > 0) {
        setCatalogCategories(stored)
        setFormData((current) => ({
          ...current,
          category: current.category || stored.find((category) => !category.parent_id)?.id || '',
        }))
      } else {
        setCatalogCategories(DEFAULT_CATALOG_CATEGORIES)
        setFormData((current) => ({
          ...current,
          category: current.category || DEFAULT_CATALOG_CATEGORIES.find((category) => !category.parent_id)?.id || '',
        }))
      }
    }

    void loadCategories()

    // Якщо редагування, завантажити товар
    if (isEditMode && productId) {
      ;(async () => {
        const product = await facade.fetchProductById(productId)

        if (!product) {
          showToast('❌ Товар не знайдений', 'error')
          navigate('/catalog')
          return
        }

        if (product.seller_id !== user?.id) {
          showToast('❌ Ви не можете редагувати цей товар', 'error')
          navigate('/catalog')
          return
        }

        setOriginalProduct(product)
        setFormData({
          title: product.title,
          description: product.description,
          price: product.price,
          category: resolveCategoryId(catalogCategories.length ? catalogCategories : DEFAULT_CATALOG_CATEGORIES, product.category || ''),
          subcategory: resolveCategoryId(catalogCategories.length ? catalogCategories : DEFAULT_CATALOG_CATEGORIES, product.subcategory || ''),
          stock: product.stock,
          image_url: product.image_url,
        })
      })()
    }
  }, [isEditMode, productId, isAuthenticated, isInitialized, navigate, user?.id, showToast])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target

    // Enforce limits and special formatting
    if (name === 'title') {
      // keep title small letters and trim to max
      const v = value.toLowerCase().slice(0, TITLE_MAX)
      setFormData(prev => ({ ...prev, title: v }))
      return
    }

    if (name === 'description') {
      const v = value.slice(0, DESCRIPTION_MAX)
      setFormData(prev => ({ ...prev, description: v }))
      return
    }

    setFormData(prev => ({
      ...prev,
      [name]: name === 'price' || name === 'stock' ? parseFloat(value) || 0 : value
    }))
  }

  const handleCategoryChange = (category: string) => {
    setFormData(prev => ({
      ...prev,
      category,
      subcategory: ''
    }))
  }

  const handleSubcategoryChange = (subcategory: string) => {
    setFormData(prev => ({ ...prev, subcategory }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (isEditMode && originalProduct) {
        const updated = await facade.updateProduct(originalProduct.id, { ...formData })
        if (updated) {
          showToast('✅ Товар успішно оновлено!', 'success')
          navigate(`/product/${originalProduct.id}`)
        } else {
          showToast('❌ Не вдалося оновити товар', 'error')
        }
      } else {
        const newProduct = await facade.createProduct({ ...formData, seller_id: user?.id })
        if (newProduct) {
          showToast('✅ Товар успішно створено!', 'success')
          navigate('/catalog')
        } else {
          showToast('❌ Не вдалося створити товар', 'error')
        }
      }
    } catch (error) {
      showToast('❌ Помилка: ' + (error as any).message, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="create-product-page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} /> Назад
        </button>
        <h1>{isEditMode ? '✏️ Редагувати товар' : '➕ Створити новий товар'}</h1>
      </div>

      <form className="product-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2>📋 Основна інформація</h2>

          <div className="form-group">
            <label htmlFor="title">Назва товару *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="напр. CS2 Account Premium"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Опис * <span className="char-counter">{formData.description.length}/{DESCRIPTION_MAX}</span></label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Детальний опис товару..."
              rows={5}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="price">Ціна (₴) *</label>
              <input
                type="text"
                inputMode="decimal"
                id="price"
                name="price"
                value={formData.price || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '')
                  handleChange({ target: { name: 'price', value: val } } as any)
                }}
                placeholder="0"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="stock">Кількість на складі *</label>
              <input
                type="text"
                inputMode="numeric"
                id="stock"
                name="stock"
                value={formData.stock || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '')
                  handleChange({ target: { name: 'stock', value: val } } as any)
                }}
                placeholder="1"
                required
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>🏷️ Категорія</h2>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="category">Категорія *</label>
              <CustomSelect
                id="category"
                options={topCategories.map((category) => ({ value: category.id, label: category.name }))}
                value={formData.category}
                onChange={handleCategoryChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="subcategory">Підкатегорія *</label>
              <CustomSelect
                id="subcategory"
                options={subcategories.map((category) => ({ value: category.id, label: category.name }))}
                value={formData.subcategory}
                placeholder="Виберіть підкатегорію"
                onChange={handleSubcategoryChange}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>🖼️ Зображення</h2>

          <div className="form-group">
            <label htmlFor="image_url">URL зображення</label>
            <input
              type="url"
              id="image_url"
              name="image_url"
              value={formData.image_url}
              onChange={handleChange}
              placeholder="https://..."
            />
          </div>

          {formData.image_url && (
            <div className="image-preview">
              <img src={formData.image_url} alt="Preview" />
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={() => navigate(-1)}>
            Скасувати
          </button>
          <button
            type="submit"
            className="btn-submit"
            disabled={isLoading || !formData.title || !formData.description || formData.title.length > TITLE_MAX || formData.description.length > DESCRIPTION_MAX}
          >
            {isEditMode ? (
              <>
                <Edit2 size={20} /> {isLoading ? 'Збереження...' : 'Зберегти зміни'}
              </>
            ) : (
              <>
                <Plus size={20} /> {isLoading ? 'Створення...' : 'Створити товар'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateProductPage
