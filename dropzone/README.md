# Dropzone Frontend

Клієнтська частина маркетплейсу на `Vite + React + TypeScript`. Репозиторій підготовлений так, щоб бекенд-розробник міг просто підключити API, не розбираючись у старих моках і тестових файлах.

Цей документ — повна технічна довідка по проєкту: структура, змінні середовища, точні функції сервісного шару, контракт API, очікувані форми даних, fallback-механіка, а також що саме треба реалізувати на бекенді.

---

## 1. Що це за проєкт

Це SPA для магазину цифрових товарів:
- каталог товарів;
- сторінка товару;
- створення та редагування товарів;
- авторизація та реєстрація;
- замовлення;
- чат між покупцем і продавцем;
- профіль користувача;
- адмін-панель;
- розділ спорів / модерації.

Фронтенд уже має шар-адаптер для API, тому основна робота зараз — підняти бекенд з правильними маршрутами та формами JSON.

---

## 2. Стек і запуск

### Залежності
- `react`
- `react-dom`
- `react-router-dom`
- `axios`
- `zustand`
- `lucide-react`

### Скрипти
```bash
npm install
npm run dev
npm run build
npm run preview
```

### Змінна середовища
- `VITE_API_BASE_URL` — базова URL для бекенду.

Приклад:
```env
VITE_API_BASE_URL=http://localhost:3000
```

Якщо змінна не задана, фронтенд використовує `http://localhost:3000`.

---

## 3. Архітектура фронтенду

### Важливі шари
- `src/services/api.ts` — чистий `axios`-клієнт і низькорівневі API-сервіси.
- `src/services/facade.ts` — фасад для сторінок: спочатку API, потім fallback на локальне сховище.
- `src/utils/adminData.ts` — централізоване локальне сховище для fallback-даних і адмін-стану.
- `src/stores/authStore.ts` — Zustand store для поточного користувача.
- `src/pages/*` — сторінки UI.

### Принцип роботи
1. Сторінка викликає метод з `facade.ts`.
2. `facade.ts` намагається сходити в бекенд через `api.ts`.
3. Якщо бекенд недоступний або повернув помилку, фасад бере дані з `adminData.ts`.
4. `adminData.ts` читає / пише `localStorage` лише як тимчасовий fallback.

Тобто прямий `localStorage` вже не повинен бути розкиданий по сторінках — він сконцентрований у `adminData.ts`.

---

## 4. Структура проєкту

### Ключові файли
- `src/services/api.ts`
- `src/services/facade.ts`
- `src/utils/adminData.ts`
- `src/stores/authStore.ts`
- `src/pages/CatalogPage.tsx`
- `src/pages/ProductDetailPage.tsx`
- `src/pages/CreateProductPage.tsx`
- `src/pages/OrdersPage.tsx`
- `src/pages/ChatPage.tsx`
- `src/pages/ProfilePage.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/AdminPage.tsx`
- `src/pages/LoginPage.tsx`

### Видалені / очищені артефакти
- публічні mock JSON були прибрані з `public/`;
- тимчасові генераторні / тестові helper-скрипти видалено;
- залишились лише робочі файли застосунку.

---

## 5. Сервісний шар: точні функції

## 5.1 `src/services/api.ts`

Це низькорівневий HTTP-клієнт. Тут налаштовано:
- `axios` instance з `baseURL = VITE_API_BASE_URL`;
- `Authorization: Bearer <token>` через interceptor;
- авторизаційні / товарні / кошикові / відгуки / користувачі сервіси.

### Експорти

#### `authService`
- `login(email, password)`
- `register(email, password, username)`
- `logout()`
- `getCurrentUser()`

#### `productService`
- `getAll(params?)`
- `getById(id)`
- `create(data)`
- `update(id, data)`
- `delete(id)`

#### `cartService`
- `getCart()`
- `addItem(product_id, quantity)`
- `removeItem(product_id)`
- `checkout()`

#### `reviewService`
- `getByProduct(product_id)`
- `create(product_id, rating, text)`

#### `userService`
- `getById(id)`
- `update(id, data)`

### Поведінка авторизації
- `login()` і `register()` зберігають токен у `localStorage` під ключем `auth_token`.
- `logout()` видаляє `auth_token` і очищає збереженого користувача.
- `getCurrentUser()` очікує `/auth/me`.

---

## 5.2 `src/services/facade.ts`

Фасад потрібен, щоб сторінки не знали, чи зараз відповідає бекенд, чи fallback.

### Експорти фасаду

#### Продукти
- `fetchProducts(params?)`
- `fetchProductById(id)`
- `createProduct(data)`
- `updateProduct(id, data)`
- `deleteProduct(id)`

#### Користувачі
- `getUser(id)`
- `updateUser(id, data)`

#### Відгуки
- `getReviewsByProduct(productId)`
- `createReview(productId, rating, text)`
- `getAllReviews()`
- `getReviewsBySeller(sellerId)`

#### Чат
- `getChats()`
- `createOrGetChatForSeller(sellerId)`
- `sendMessageToSeller(sellerId, message)`

#### Замовлення
- `getOrders()`
- `saveOrders(orders)`
- `updateOrderStatus(orderId, status)`

### Логіка fallback
- якщо API працює — повертаються дані з бекенду;
- якщо API не доступний — використовуються дані з `adminData.ts`;
- для відгуків і чату fallback також централізований через `adminData.ts`.

---

## 5.3 `src/utils/adminData.ts`

Це єдине місце, де зараз дозволений прямий доступ до `localStorage`.

### Ключі сховища
- `mock-users`
- `auth_user`
- `mock-orders`
- `mock-chats`
- `mock-products`
- `mock-reviews`
- `admin-debug-logs`

### Експорти

#### Користувачі
- `getStoredUsers()`
- `saveStoredUsers(users)`
- `findStoredUserById(userId)`
- `upsertStoredUser(user)`
- `updateStoredUserRole(userId, role)`
- `refreshStoredUser(nextUser)`
- `getStoredAuthUser()`
- `setStoredAuthUser(user)`

#### Замовлення
- `getStoredOrders()`
- `saveStoredOrders(orders)`

#### Чати
- `getStoredChats()`
- `saveStoredChats(chats)`
- `appendChatMessageToSellerThread(sellerId, message)`

#### Товари
- `getStoredProducts()`
- `saveStoredProducts(products)`

#### Відгуки
- `getStoredReviews()`
- `saveStoredReviews(reviews)`

#### Адмін-логи
- `getAdminLogs()`
- `appendAdminLog(entry)`
- `clearAdminLogs()`

#### Додаткові хелпери
- `getUserRole(role?)`
- `canAccessAdminPanel(role?)`
- `resolveDispute(orderId, resolution, resolverName)`

### Поведінка логів
- логи зберігаються локально;
- максимум 25 записів;
- `resolveDispute()` також оновлює замовлення, користувачів і чат системним повідомленням.

---

## 6. Контракт API: що повинен вміти бекенд

Нижче — рекомендований контракт. Якщо у вас інші маршрути, можна адаптувати `src/services/api.ts`, але бажано залишити ці форми.

### 6.1 Аутентифікація

#### `POST /auth/login`
Request:
```json
{ "email": "user@example.com", "password": "secret" }
```
Response:
```json
{
  "success": true,
  "data": {
    "token": "jwt-or-session-token",
    "user": {
      "id": "user-1",
      "email": "user@example.com",
      "name": "TestUser",
      "role": "user"
    }
  }
}
```

#### `POST /auth/register`
Request:
```json
{ "email": "user@example.com", "password": "secret", "username": "TestUser" }
```
Response:
```json
{
  "success": true,
  "data": {
    "token": "jwt-or-session-token",
    "user": { "id": "user-1", "email": "user@example.com", "name": "TestUser", "role": "user" }
  }
}
```

#### `POST /auth/logout`
- бажано повернути `200` або `204`.

#### `GET /auth/me`
- повертає поточного користувача за токеном.

### 6.2 Продукти

#### `GET /products`
Підтримка query params:
- `search`
- `category`
- `page`
- `pageSize`

Response:
```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 12
  }
}
```

#### `GET /products/:id`
Response:
```json
{ "success": true, "data": { "id": "prod-1", "title": "..." } }
```

#### `POST /products`
- створення товару;
- зазвичай доступно адміну або продавцю.

#### `PUT /products/:id`
- редагування товару.

#### `DELETE /products/:id`
- видалення товару.

### 6.3 Відгуки

#### `GET /reviews?product_id=...`
Повертає список відгуків для товару.

#### `POST /reviews`
Request:
```json
{ "product_id": "prod-1", "rating": 5, "text": "Все супер" }
```
Response:
```json
{ "success": true, "data": { "id": "rev-1", "product_id": "prod-1", "rating": 5, "text": "Все супер" } }
```

### 6.4 Кошик

#### `GET /cart`
#### `POST /cart/items`
Request:
```json
{ "product_id": "prod-1", "quantity": 1 }
```

#### `DELETE /cart/items/:product_id`
#### `POST /cart/checkout`
- очікується створення замовлень і очищення кошика.

### 6.5 Користувачі

#### `GET /users/:id`
#### `PUT /users/:id`

Для адмінки також зручно мати:
- `GET /users`

### 6.6 Спори / підтримка

Рекомендовані ендпоінти:
- `GET /admin/disputes`
- `POST /admin/disputes/:id/resolve`

### 6.7 Чат

Рекомендований контракт:
- `GET /chat/threads`
- `POST /chat/threads`
- `GET /chat/threads/:id/messages`
- `POST /chat/threads/:id/messages`

Якщо хочете realtime — можна додати WebSocket, але фронтенд вже готовий і до REST-fallback.

---

## 7. Моделі даних, які очікує UI

### `Product`
Мінімально:
```ts
{
  id: string
  title: string
  description: string
  price: number
  stock: number
  category: string
  subcategory?: string
  image_url?: string
  images?: string[]
  seller_id: string
  seller: {
    id: string
    username: string
    rating?: number
    reviews_count?: number
  }
  rating?: number
  reviews_count?: number
  created_at: string
  updated_at?: string
}
```

### `User`
```ts
{
  id: string
  username: string
  email: string
  avatar?: string
  role: 'user' | 'admin' | 'support'
  balance: number
  rating: number
  reviews_count: number
  created_at: string
}
```

### `Order`
```ts
{
  id: string
  product_id: string
  product_name: string
  seller_id: string
  seller_name: string
  buyer_id: string
  price: number
  status: 'pending' | 'completed' | 'disputed' | 'refunded'
  created_at: string
  completed_at?: string
  dispute_resolution?: 'refund' | 'seller'
  dispute_resolved_by?: string
  dispute_resolved_at?: string
}
```

### `Review`
```ts
{
  id: string
  product_id: string
  seller_id?: string
  buyer_id?: string
  buyer_name?: string
  rating: number
  text?: string
  comment?: string
  created_at: string
  order_id?: string
  product_title?: string
}
```

### `Chat thread`
```ts
{
  id: string
  seller_id: string
  seller_name: string
  created_at: string
  messages: Array<{
    id: string
    sender_id: string
    sender_name: string
    sender_role?: string
    text: string
    timestamp: string
    isSystemMessage?: boolean
  }>
}
```

---

## 8. Як підключати бекенд покроково

1. Підняти API та задати `VITE_API_BASE_URL`.
2. Реалізувати `/auth/login`, `/auth/register`, `/auth/me`, `/auth/logout`.
3. Реалізувати `/products` з пагінацією та фільтрами.
4. Реалізувати `/reviews` і `/users/:id`.
5. Реалізувати `/cart`, `/orders`, `/chat`.
6. Якщо потрібен адмін-доступ — додати `/admin/disputes` та resolve маршрут.
7. Перевірити, що токен передається у заголовку `Authorization: Bearer ...`.
8. Запустити фронтенд та пройти основні сценарії:
   - логін;
   - каталог;
   - картка товару;
   - створення товару;
   - покупки;
   - чат;
   - адмін-панель.

---

## 9. Що ще важливо для бекенду

### Не ламайте форму JSON
Фронтенд очікує стабільні поля. Особливо важливі:
- `data` у відповіді;
- `items`, `total`, `page`, `pageSize` для каталогу;
- `token` і `user` при авторизації.

### Рекомендація по помилках
Повертайте структуру типу:
```json
{ "success": false, "error": "Validation error", "details": [] }
```

### Якщо хочете cookie-based auth
Можна перейти на cookie/HTTP-only режим, але тоді треба буде змінити `src/services/api.ts` і прибрати зберігання токена в `localStorage`.

---

## 10. Що залишилось у fallback-режимі

- локальний стан для відгуків / чатів / замовлень / адмін-логів живе в `adminData.ts`;
- це лише тимчасова підстраховка, поки бекенд не готовий або під час локальної розробки;
- після повного підключення бекенду fallback можна поступово прибирати.

---

## 11. Швидка перевірка після підключення

```bash
npm run dev
```

Потім перевірити:
- логін;
- каталог;
- сторінку товару;
- замовлення;
- чат;
- створення товару;
- адмін-панель.

---