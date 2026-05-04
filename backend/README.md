# Dropzone Backend

Найпростіший backend для Dropzone на `Node.js + Express + TypeScript + MySQL`.

Ідея спеціально проста:
- фронтенд лишається без змін;
- backend працює через той самий API контракт;
- збереження даних іде в MySQL;
- вся аплікація зберігає стан у **одному JSON-рядку в таблиці `app_state`**.

Це швидкий спосіб запустити реальний backend без ORM, без окремих міграцій і без складного domain-рівня.

---

## 1. Що тут є

- `src/server.ts` — HTTP API.
- `src/db.ts` — MySQL-обгортка, seed-дані, завантаження та збереження стану.
- `docker-compose.yml` — підйом MySQL одним викликом.
- `.env.example` — приклад змінних середовища.

---

## 2. Швидкий старт

### Варіант A: через Docker Compose

1. Підняти MySQL:

```bash
docker compose up -d
```

2. Створити `.env` на основі `.env.example`:

```env
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=root
MYSQL_DATABASE=dropzone
```

3. Запустити backend:

```bash
npm install
npm run dev
```

### Варіант B: свій MySQL

Якщо MySQL уже є, просто створіть базу `dropzone`, а потім вкажіть свої дані в `.env`.

---

## 3. Скрипти

```bash
npm install
npm run dev
npm run check
npm run start
```

---

## 4. Дефолтні акаунти

Після першого запуску backend сам створює seed-дані.

- `admin@dropzone.local` / `admin123`
- `support@dropzone.local` / `support123`
- `seller@dropzone.local` / `seller123`
- `user@dropzone.local` / `user123`

---

## 5. Як зберігаються дані

У MySQL створюється одна таблиця:

- `app_state`

Вона містить:
- `id` — завжди `1`
- `payload` — весь стан застосунку у вигляді JSON
- `updated_at` — час останнього збереження

Тобто це свідомо найпростіша схема: не ORM, не десяток таблиць, а один JSON-стан у MySQL.

---

## 6. Контракт API

Усі відповіді повертаються у форматі:

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

### Продукти

- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PUT /products/:id`
- `DELETE /products/:id`

### Відгуки

- `GET /reviews?product_id=...`
- `POST /reviews`

### Користувачі

- `GET /users`
- `GET /users/:id`
- `PUT /users/:id`

### Кошик

- `GET /cart`
- `POST /cart/items`
- `DELETE /cart/items/:productId`
- `POST /cart/checkout`

### Замовлення

- `GET /orders`
- `POST /orders`
- `GET /orders/:id`
- `PUT /orders/:id/status`

### Адмін / спори

- `GET /admin/disputes`
- `POST /admin/disputes/:id/resolve`

### Чат

- `GET /chat/threads`
- `POST /chat/threads`
- `GET /chat/threads/:id/messages`
- `POST /chat/threads/:id/messages`

### Healthcheck

- `GET /health`

---

## 7. Що важливо для фронтенду

Фронтенд уже очікує такі ключові речі:
- `auth_token` у `localStorage` після логіну;
- `Authorization: Bearer <token>` у запитах;
- поле `data` у всіх успішних відповідях;
- поля `items`, `total`, `page`, `pageSize` для каталогу;
- `seller` у відповіді товару;
- `username`, `role`, `balance`, `rating`, `reviews_count` у користувача.

---

## 8. Якщо захочеш ще простіше

Потім можна перейти від цього JSON-стану до повної реляційної схеми:
- Prisma + MySQL/PostgreSQL;
- окремі таблиці для users/products/orders/reviews/chats;
- міграції;
- JWT / refresh tokens;
- WebSocket для чату.

Для старту це не потрібно.

---

## 9. Перевірка

```bash
npm run check
```

```bash
npm run dev
```

Після запуску перевір:
- `GET http://localhost:3000/health`
- `POST http://localhost:3000/auth/login`
