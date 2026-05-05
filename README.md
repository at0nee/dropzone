# Dropzone

Dropzone — маркетплейс цифрових товарів у форматі монорепозиторію.

- `backend/` — основний застосунок, який піднімає API, працює з MySQL і в продакшн-режимі віддає зібраний фронтенд.
- `dropzone/` — фронтенд на React, TypeScript і Vite.

У проєкті вже зібрані каталог, картка товару, кошик, замовлення, чат, профіль, адмін-панель, спори, популярні товари та спільна статистика головної сторінки.

---

## Як працює запуск

Основний сценарій запуску йде через `backend`: він піднімає API і в production-style режимі віддає готовий фронтенд із `dropzone/dist`.

Окремий фронтенд-девсервер потрібен лише для локальної розробки інтерфейсу.

### Бекенд

```bash
cd backend
npm install
npm run dev
```

### Фронтенд

```bash
cd dropzone
npm install
npm run dev
```

Цей режим потрібен тільки тоді, коли потрібно працювати саме з фронтендом окремо від backend-запуску.

---

## Основні можливості

- каталог товарів із пошуком і категоріями
- сторінка товару з відображенням stock
- кошик і checkout
- логін, реєстрація, профіль та ролі користувачів
- замовлення, спори та support/admin flow
- чат між покупцем і продавцем
- спільні метрики головної сторінки
- популярні товари, які не залежать від акаунта

---

## Структура репозиторію

```text
dropzone/
├─ backend/      # API, MySQL state, static hosting of frontend build
└─ dropzone/     # Vite frontend
```

---

## Змінні середовища

### `backend/.env`

```env
PORT=3007
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=root
MYSQL_DATABASE=dropzone
```

### `dropzone/.env`

```env
VITE_API_BASE_URL=http://localhost:3007
```

Якщо `VITE_API_BASE_URL` не задано, фронтенд використовує відносні шляхи до API.

---

## Команди

### `backend/`

```bash
npm run dev
npm run start
npm run check
```

### `dropzone/`

```bash
npm run dev
npm run build
npm run preview
```

---

## Продакшн-режим

```bash
cd dropzone
npm run build
```

```bash
cd backend
npm run start
```

Після цього бекенд віддає готовий фронтенд із `dropzone/dist`.

---

## Демо-акаунти

Після першого запуску бекенд створює seed-дані для тестування:

- `admin@dropzone.local` / `admin123`
- `support@dropzone.local` / `support123`
- `seller@dropzone.local` / `seller123`
- `user@dropzone.local` / `user123`

---

## Документація по API

Детальний опис бекендового API знаходиться у [backend/README.md](backend/README.md).

