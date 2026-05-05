# Dropzone Backend

Це основний сервер проєкту Dropzone. Він піднімає API, працює з MySQL, зберігає стан застосунку та в production-style режимі віддає вже зібраний фронтенд із `dropzone/dist`.

---

## Що тут є

- `src/server.ts` — HTTP API, статична віддача фронтенда, логіка замовлень, чату, спорів і homepage summary.
- `src/db.ts` — MySQL-шар, seed-дані, завантаження та збереження стану.
- `docker-compose.yml` — підйом MySQL через Docker Compose.
- `.env.example` — шаблон для локального `.env`; його можна скопіювати та підставити свої значення.

---

## Запуск

### Варіант 1: локальний MySQL

1. Підготувати `.env` у директорії `backend/`:

```env
PORT=3007
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=root
MYSQL_DATABASE=dropzone
```

2. Запустити сервер:

```bash
npm install
npm run dev
```

### Варіант 2: Docker Compose для MySQL

```bash
docker compose up -d
```

Після цього backend запускається тим самим способом:

```bash
npm install
npm run dev
```

---

## Скрипти

```bash
npm run dev
npm run start
npm run check
```

---

## Як працює застосунок

- backend запускається одним процесом із `src/server.ts`
- фронтенд окремо збирається у `dropzone/dist`
- після збірки backend віддає фронтенд як статичний сайт
- у розробці фронтенд може ходити в API через `VITE_API_BASE_URL`
- якщо `.env` ще не створено, за основу можна взяти `.env.example`

У проєкті вже враховані:

- stock для товарів
- списання stock під час checkout
- глобальна homepage summary для однакових метрик у всіх акаунтів
- популярні товари, які рахуються з бекенда
- support/admin flow для спорів
- чат покупець / продавець

---

## Модель даних

Поточна схема зберігання побудована навколо MySQL і JSON-стану застосунку.

Ключові сутності:

- users
- products
- orders
- reviews
- chats
- sessions
- catalog categories

Під час seed-ініціалізації створюються базові демо-акаунти та стартові дані для каталогу.

---

## Демо-акаунти

- `admin@dropzone.local` / `admin123`
- `support@dropzone.local` / `support123`
- `seller@dropzone.local` / `seller123`
- `user@dropzone.local` / `user123`

---

## API

Відповіді мають стандартний формат:

```json
{ "success": true, "data": ... }
```

Помилки:

```json
{ "success": false, "error": "..." }
```

### Автентифікація

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/logout`
- `GET /auth/me`

### Товари

- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PUT /products/:id`
- `DELETE /products/:id`

### Кошик і checkout

- `GET /cart`
- `POST /cart/items`
- `DELETE /cart/items/:productId`
- `POST /cart/checkout`

### Замовлення

- `GET /orders`
- `POST /orders`
- `GET /orders/:id`
- `PUT /orders/:id/status`

### Відгуки

- `GET /reviews?product_id=...`
- `POST /reviews`

### Чат

- `GET /chat/threads`
- `POST /chat/threads`
- `GET /chat/threads/:id/messages`
- `POST /chat/threads/:id/messages`

### Адмін і спори

- `GET /admin/disputes`
- `POST /admin/disputes/:id/resolve`

### Головна сторінка

- `GET /public/home-summary`
- `GET /public/popular-products`

### Службові маршрути

- `GET /health`

---

## Що важливо для фронтенду

Фронтенд очікує такі речі:

- `Authorization: Bearer <token>` у запитах після логіну
- `auth_token` у `localStorage`
- `seller` у відповіді товару
- `data` у всіх успішних відповідях
- `items`, `total`, `page`, `pageSize` для каталогу
- `username`, `role`, `balance`, `rating`, `reviews_count` у користувача

---

## Production-style запуск

1. Зібрати фронтенд:

```bash
cd ../dropzone
npm run build
```

2. Запустити backend:

```bash
cd ../backend
npm run start
```

Після цього сервер віддає фронтенд із `dropzone/dist`.

---

## Перевірка

```bash
npm run check
```

```bash
npm run dev
```

Корисні запити після запуску:

- `GET http://localhost:3007/health`
- `POST http://localhost:3007/auth/login`
- `GET http://localhost:3007/public/home-summary`

