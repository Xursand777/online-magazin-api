# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bozor** — a full-stack Uzbek e-commerce platform.
- Backend: Django 4.2 + DRF + SimpleJWT (port 8000)
- Frontend: React 19 + TypeScript + Vite + TailwindCSS (port 5173)
- Database: SQLite (`backend/db.sqlite3`)
- No test suite exists in the codebase.

## Running the Project

```bash
# Start both servers at once
./run_project.sh

# Or individually:

# Backend
cd backend && source venv/bin/activate
python manage.py migrate
python manage.py runserver

# Frontend
cd frontend && npm run dev
```

## Common Backend Commands

```bash
cd backend && source venv/bin/activate

# Migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Batch-translate existing products/categories (after adding new products or upgrading translation engine)
DJANGO_SETTINGS_MODULE=core.settings python manage.py translate_products
python manage.py translate_products --retranslate          # overwrite existing translations
python manage.py translate_products --dry-run              # preview without saving
python manage.py translate_products --model product        # only products

# Django shell
python manage.py shell
```

## Frontend Commands

```bash
cd frontend
npm run dev        # dev server on http://localhost:5173
npm run build      # tsc + vite build (use this to type-check)
npm run lint       # eslint
```

## Architecture

### Backend (`backend/`)

Django apps:
- **`products`** — Category, Product, ProductImage, ProductVariant, HomeBanner, GlobalSetting models. Contains the smart translation engine (see below).
- **`users`** — Custom `User` model (phone-based auth, no username). `UserProfile` for avatar/address. OTP login + password login via JWT.
- **`orders`** — Order lifecycle (PENDING → CONFIRMED → PACKING → SHIPPING → DELIVERED). Credit (installment) order system with `credit_ban` enforcement. Admin POS orders. Kassa (cash register) with withdrawal log.
- **`cart`** — Session-based cart for guests (via `X-Guest-Session-Id` header), user cart. `sync-local/` endpoint merges guest cart on login.
- **`recommendations`** — Search tracking and product recommendations.

Settings module: `core.settings` (always use `DJANGO_SETTINGS_MODULE=core.settings`).

API base URL: `http://127.0.0.1:8000/api/`. Swagger docs at `/api/docs/`.

Auth: JWT Bearer tokens. `ACCESS_TOKEN_LIFETIME=60min`, `REFRESH_TOKEN_LIFETIME=7days`, tokens rotate on refresh.

### Smart Translation Engine (`backend/products/models.py`)

Auto-translates Uzbek product names/descriptions to Russian and English on `save()`. Uses a 3-layer protection system so brand names are never corrupted:

1. **`_BRANDS` frozenset** — known brand names + English model-suffix words (`Pro`, `Max`, `Note`, `Ultra`, `Air`...) + English color words (`Black`, `Titanium`, `Desert`...) + Roman numerals (`V`, `II`...).
2. **`_SPEC_RE`** — regex for alphanumeric model codes (`RS90F65D1FWT`, `GC-B459SECL`) and technical specs (`128GB`, `165W`, `4K`).
3. **Fully-protected gate** — if no alphabetic character remains after removing protected spans, skip translation entirely (e.g. "iPhone 17 Pro Max" → `name_ru=''`, serialiser falls back to original).

For mixed strings (e.g. "Smartfon Apple iPhone 16 128GB Qora"), a segment-based approach translates only the Uzbek parts and stitches results back around the protected terms.

Backend serialisers (`products/serializers.py`) return language-aware fields:
- `get_lang(context)` reads `Accept-Language` header or `?lang=` query param.
- `localized(obj, field, lang)` returns `{field}_{lang}` with fallback to `{field}` (Uzbek).
- Applied in: `CategorySerializer`, `ProductListSerializer`, `ProductSearchSerializer`, `ProductDetailSerializer`.

### Frontend (`frontend/src/`)

**Routing** (`App.tsx`): React Router v7. `/admin` renders `AdminPanel` standalone (no layout). All other routes use `MainLayout` (TopNavBar/MobileTopBar + BottomNavBar + Footer).

**State management** (Zustand, all persisted to localStorage):
- `authStore` — JWT tokens + user object
- `cartStore` — cart items + guest sync
- `languageStore` — current language (`uz`/`ru`/`en`), key `bozor-language`
- `themeStore` — light/dark mode
- `favoritesStore` — favorited product IDs
- `recentlyViewedStore` — recently viewed product objects

**i18n system** (`src/i18n/`):
- `translations.ts` — static UI strings for all 3 languages (sections: `nav`, `topbar`, `search`, `home`, `auth`, `cart`, `checkout`, `profile`, `footer`, `product`, `favorites`, `sections`, `catalog`, `common`, `orderStatus`, `language`)
- `useTranslation()` hook returns `{ t, language }` from `languageStore`
- Never hardcode Uzbek text in components — always use `t.*` keys

**API client** (`src/api/client.ts`): Axios instance at `http://127.0.0.1:8000/api`. Request interceptor injects: `Authorization: Bearer <token>`, `X-Guest-Session-Id` (guests), `Accept-Language: <lang>` (from `bozor-language` localStorage). Response interceptor handles 401 by refreshing token automatically.

### React Query Cache Keys — Critical Rule

Every query that fetches product/category data **must include `language` in its `queryKey`** so the cache is invalidated and data re-fetched when the user switches language:

```ts
// ✅ Correct
queryKey: ['product', id, language]
queryKey: ['mainPage', language]
queryKey: ['categories-home', language]
queryKey: ['category-products', category?.id, language]

// ❌ Wrong — stale translated data persists after language switch
queryKey: ['product', id]
```

### Adding New UI Text

1. Add keys to all 3 language objects in `frontend/src/i18n/translations.ts`
2. Use `const { t, language } = useTranslation()` in the component
3. Reference as `t.section.key`

### Adding a New Product Field with Translation

1. Add `field_ru` and `field_en` to the model
2. Create and run a migration
3. Add auto-translation logic to `save()` (follow the existing pattern in `Product.save()`)
4. Add `get_field(self, obj)` using `localized(obj, 'field', get_lang(self.context))` to the relevant serialiser
5. Run `python manage.py translate_products --retranslate` to populate existing records
