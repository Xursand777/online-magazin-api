# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bozor** — a full-stack Uzbek e-commerce platform.
- Backend: Django 4.2 + DRF + SimpleJWT (port 8000)
- Frontend: React 19 + TypeScript + Vite + TailwindCSS (port 5173)
- Mobile: Flutter Android (`bozor_mobile/`)
- Database: SQLite locally (`backend/db.sqlite3`), **PostgreSQL in production** (Docker `db` service on the Hetzner VPS)
- Cache: LocMemCache locally, **Redis in production** (Docker `redis` service on the Hetzner VPS)
- File storage: Cloudinary CDN in production (auto via `DEFAULT_FILE_STORAGE`)
- **No formal test suite**. Smoke tests are written ad-hoc via `manage.py shell <<'PY' ... PY`.

## Production Deployment

The stack was migrated **off Render/Vercel onto Hetzner + Cloudflare**. The full server runbook is `DEPLOYMENT_HETZNER.md`; the one-time migration history is `MIGRATION_RENDER_TO_HETZNER.md`.

- **Backend**: a **Hetzner VPS** running Django via **Docker Compose** at `/opt/bozor` — services `web` (Django/gunicorn), `worker` (Celery, sends status SMS), `db` (PostgreSQL) and `redis`. The origin sits **behind Cloudflare** (CDN · DDoS · WAF · SSL) on host `api.<domain>` (see `DJANGO_ALLOWED_HOSTS` in the server's `backend/.env`). The VPS firewall only accepts traffic from Cloudflare IPs, so the origin cannot be reached directly.
- **Deploy is manual over SSH** — there is **no dashboard auto-deploy**. Pull the code on the server and run `cd /opt/bozor && docker compose up -d --build` (migrate + collectstatic run automatically when the `web` service starts). After changing `backend/.env`, restart with `docker compose restart web worker`.
- **Frontend**: **Cloudflare Pages** (domain `<domain>` / `www`), built from `frontend/`.
- **Images / media**: **Cloudflare R2** bucket served via `cdn.<domain>` (`R2_PUBLIC_DOMAIN`).
- **Config & secrets** live in the server file `/opt/bozor/backend/.env` (template: `backend/.env.production.example`) — **not** a hosting dashboard. Edit it over SSH; never commit real values.
- Backend health can be verified via `curl https://api.<domain>/healthz/?deep=1` (uptime + DB + cache check), or on the box with `docker compose exec web python manage.py check_deployment`.

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

# Batch-translate existing products/categories (after adding new products
# or upgrading translation engine)
DJANGO_SETTINGS_MODULE=core.settings python manage.py translate_products
python manage.py translate_products --retranslate          # overwrite existing translations
python manage.py translate_products --dry-run              # preview without saving
python manage.py translate_products --model product        # only products

# Django shell
python manage.py shell
```

### Phase-based management commands (cron-ready)

```bash
# Phase 2.5 — mark expired credit orders past dispute window (hourly cron)
python manage.py mark_credit_overdue --dry-run --verbose
python manage.py mark_credit_overdue

# Phase 1.9 — daily admin Telegram digest
python manage.py send_daily_digest

# Phase 0.3 — daily DB backup to Backblaze B2
python manage.py backup_db

# Phase 1.4 — find duplicate phone numbers (no auto-merge)
python manage.py audit_phone_duplicates
python manage.py audit_phone_duplicates --fix

# Phase 1.1 — purge AuditLog rows older than 6 months
python manage.py purge_old_audit_logs

# Phase 0.7 — create/update an emergency superuser
python manage.py create_backup_superuser

# Misc operational
python manage.py check_sms_balance        # Eskiz balance + Telegram alert
python manage.py test_telegram            # send a test alert
python manage.py check_deployment         # sanity-check production env vars (Hetzner backend/.env)
python manage.py audit_migrations         # flag risky DDL in pending migrations
```

## Frontend Commands

```bash
cd frontend
npm run dev        # dev server on http://localhost:5173
npm run build      # tsc + vite build (use this to type-check)
npm run lint       # eslint
npx tsc --noEmit   # standalone type check (faster than full build)
```

## Testing pattern (no test framework)

There is no `pytest` / `vitest` setup. The repo uses **inline smoke tests via Django shell heredocs**:

```bash
DJANGO_SETTINGS_MODULE=core.settings python manage.py shell <<'PY'
from unittest.mock import patch
from rest_framework.test import APIClient
from orders.models import Order
from users.models import User

# Mock SMS so signals don't actually call Eskiz
patch('orders.signals.send_order_status_sms_task').start()

# Arrange / Act / Assert
...
print("✅ N/N test muvaffaqiyatli")
PY
```

When adding behaviour, accompany it with a numbered smoke block like this so the diff is self-verifying. Commit messages document the pass count (e.g. "Smoke 6/6 yashil").

## Architecture

### Backend (`backend/`)

Django apps:
- **`products`** — Category, Product, ProductImage, ProductVariant, HomeBanner, **`GlobalSetting`** (key-value config with 5-min Redis cache, see below). Smart translation engine.
- **`users`** — Custom `User` model (phone-based auth, no username). `UserProfile` for avatar/address. OTP + password login via JWT. **`AuditLog`** (Phase 1.1). `is_master` flag for credit eligibility (Phase 2.7 redesign).
- **`orders`** — Order lifecycle (PENDING → CONFIRMED → PACKING → SHIPPING → DELIVERED → RECEIVED). Credit (installment) order system with `credit_ban` enforcement and a 7-day dispute window. Admin POS orders. Kassa with withdrawal log. `OrderDispute` + `OrderDisputeImage` (Phase 2.6).
- **`cart`** — Session-based cart for guests (via `X-Guest-Session-Id` header), user cart. `sync-local/` endpoint merges guest cart on login.
- **`recommendations`** — Search tracking and product recommendations.
- **`core`** — `health.py` (UptimeRobot endpoint), `notifications.py` (Telegram `send_admin_alert`), `middleware.py` (`AuditMiddleware`, `RateLimitAlertMiddleware`).

Settings module: `core.settings` (always use `DJANGO_SETTINGS_MODULE=core.settings`).

API base URL: `http://127.0.0.1:8000/api/`. Swagger docs at `/api/docs/`. Health: `/healthz/?deep=1`.

Auth: JWT Bearer tokens. `ACCESS_TOKEN_LIFETIME=60min`, `REFRESH_TOKEN_LIFETIME=7days`, tokens rotate on refresh. Refresh token lives in `httpOnly` cookie in production web; localStorage fallback for mobile.

### `GlobalSetting` — the single source for tunable config

`products/models.py::GlobalSetting` is a key-value store backed by a 5-minute Redis cache. `save()` invalidates the cache. Use it for any "edit-once, read-everywhere" setting (USD rate, master discount %, shop info for receipts). Existing classmethods:

- `GlobalSetting.get_usd_rate()` → `Decimal`
- `GlobalSetting.get_master_discount_percent()` → `Decimal`
- `GlobalSetting.get_shop_info()` → `{shop_name, shop_phone, shop_address}` (Phase 2.7)
- `GlobalSetting.set_shop_info(name=, phone=, address=)` — partial update + cache invalidate

When adding a new setting key, follow the same pattern: classmethod with cache-hit / get_or_create / cache.set.

### Credit / Master gating (business-critical, do not weaken)

Phase 2.7 redesign locked muddatli to'lov (installment payment) to masters only.

- **Domain**: `User.can_use_credit` property returns `bool(self.is_master)`. Future rules go here, not at the call sites.
- **Backend authoritative**: `orders/services.py::check_credit_eligibility` rejects non-masters first with `code='master_required'`. `orders/views.py::AdminPOSOrderView` re-checks even when `skip_credit_check=True` (the admin POS path).
- **Frontend gating** (UX only, never relied upon for security):
  - `frontend/src/pages/Checkout.tsx` — the credit radio button is rendered only when `!!(user?.can_use_credit ?? user?.is_master)`.
  - `frontend/src/components/AdminPOS.tsx` — credit button rendered only when `userData?.can_use_credit`.
  - `frontend/src/App.tsx` — on every page load, `getProfile()` syncs `is_master` and `can_use_credit` back into the auth store, so a stale localStorage cache cannot bypass the gate after a refresh.

`UserProfileSerializer` and `AdminUserSearchView` both expose `is_master` + `can_use_credit` so the UI can render the correct payment options.

### Order lifecycle hooks (Phase 2)

`orders/services.py::transition_order_status` is the single chokepoint for status changes. Important side-effects wired in there:

- **SHIPPING → DELIVERED** (Phase 2.3): generates a 6-digit `received_code` via `secrets.randbelow`, sets `received_code_sent_at` and `dispute_deadline = now + 7 days` in the same `update_fields` save. The SMS template `STATUS_SMS_MESSAGES['DELIVERED']` uses `{code}`; `send_order_status_sms` accepts `code=` and the `post_save` signal on `OrderHistory` forwards `order.received_code`.
- **`POST /api/orders/<pk>/courier-confirm/`** (Phase 2.4): courier-only endpoint (`CanConfirmDelivery`). Validates the 6-digit code, on mismatch writes an audit row with `received_code_verified=False` inside a separate `transaction.atomic()` so the rejection raise does not roll the audit back. On success, calls `transition_order_status` to RECEIVED and marks the code one-time-used. **Code-only — no photo / no GPS** (see "SMS Notifications & Delivery Acceptance Code" below for the full flow and security model).

### SMS Notifications & Delivery Acceptance Code (Eskiz.uz) — authoritative

This is the **single source of truth** for the entire SMS subsystem: login OTP, order-status SMS, and the courier delivery-acceptance code. Read this whole section before touching anything SMS-related — the pieces are deliberately coupled.

#### 1. Provider & transport (`backend/orders/sms.py`)

- Provider is **Eskiz.uz** (`https://notify.eskiz.uz/api`). Auth is a JWT obtained from `/auth/login` with `ESKIZ_EMAIL` / `ESKIZ_PASSWORD`, cached in Redis/LocMemCache for **23 h** (`_ESKIZ_TOKEN_CACHE_KEY`). On a `401` the helpers invalidate the token cache and retry exactly once. So 100 parallel SMS = 1 login/day, not 100.
- Sender ID is `ESKIZ_SENDER` (default `4546`). Env vars live in `core/settings.py` (`ESKIZ_*`). Balance is polled at most every 30 min after each send (`check_balance_and_alert`) and fires a Telegram WARNING ≤ 50 000 UZS / CRITICAL ≤ 10 000 UZS.
- All sends are fire-and-forget through `orders/tasks.py::send_order_status_sms_task` → Celery if `CELERY_BROKER_URL` is set, else a `threading.Thread` fallback. OTP login SMS goes through `send_otp_sms` directly (synchronous, because the user is waiting on the login response).

#### 2. Eskiz requires pre-approved templates — the hard constraint

Eskiz moderates every message body **character-for-character**; only the variable slots (`{code}`, `{order_id}`) are treated as a free "mask". Sending an unapproved body returns *"message not allowed"*, which would make the Celery task fail and burn 3 retries + token quota. Two templates are currently submitted/approved, both branded **`700Mobile.uz`** (there is **no "Bozor UZ"** — that brand is fully retired across `sms.py`, `products/models.py::SHOP_INFO_DEFAULTS`, and `frontend/.../receiptPrinter.ts`):

| Purpose | Constant | Exact body (mask form) |
|---|---|---|
| Login OTP | `sms.py::OTP_SMS_TEMPLATE` | `700Mobile.uz marketga kirish kodingiz: 000000` |
| Delivery acceptance code | `sms.py::STATUS_SMS_MESSAGES['DELIVERED']` | `700Mobile.uz: 00000-buyurtmangizni qabul qilish kodi: 000000. Kodni faqat kuryerga ayting.` |

**If you change either body string you MUST re-submit it to Eskiz for moderation** — the code body and the cabinet body must stay byte-identical. There is an `# ESKIZ-TEMPLATE:` comment above each one as a reminder.

#### 3. The approval guardrail — `ESKIZ_APPROVED_STATUSES`

`STATUS_SMS_MESSAGES` still holds ready-to-use bodies for **all** order statuses (CONFIRMED, PACKING, SHIPPING, RECEIVED, cancellations…), but only the statuses listed in the `ESKIZ_APPROVED_STATUSES` frozenset are actually sent. Today that set is exactly `{'DELIVERED'}`. `is_status_sms_approved(status)` gates sending in **two** places (defense in depth):

1. `orders/signals.py::on_order_history_created` — skips early so the unapproved status never even enqueues a Celery task (keeps the dedup cache and logs clean).
2. `orders/sms.py::send_order_status_sms` — returns `True` (silently, no HTTP, no retry) for unapproved statuses, so any direct caller is also safe.

**To enable a new status SMS later:** (a) submit its `STATUS_SMS_MESSAGES` body to Eskiz, (b) once approved, add the status string to `ESKIZ_APPROVED_STATUSES`, (c) smoke-test. That one-line set edit is the whole switch — nothing else changes.

#### 4. The acceptance code lifecycle (login code is separate, see §6)

- **Generation** — `transition_order_status` on `SHIPPING → DELIVERED` calls `order.generate_received_code()` (`secrets.randbelow`, 10⁶ keyspace) and sets `received_code`, `received_code_sent_at`, `received_code_expires_at` (24 h TTL), `received_code_used_at = None`, and `dispute_deadline = now + 7 days` — all in one `update_fields` save. Idempotent: if `received_code` is already set it is not regenerated.
- **Delivery** — the `OrderHistory` post_save signal sends the DELIVERED template with `code=order.received_code` to the customer's `receiver_phone`.
- **Redemption** — `POST /api/orders/<pk>/courier-confirm/` with `{ "received_code": "NNNNNN" }` (**JSON, code only**). Permission `CanConfirmDelivery` = courier / admin / super_admin. Body is `CourierConfirmDeliverySerializer` (a single `RegexField(r'^\d{6}$', write_only=True)` — **no photo, no GPS fields**).

#### 5. Six-layer security in `services.py::courier_confirm_delivery` (do not weaken)

Validated in this order, each raising a `ValidationError` with a stable `code` the frontend switches on:

1. **Status guard** — order must be `DELIVERED` (`code='wrong_status'`).
2. **Brute-force lockout** — per-order counter `bozor:code_fails:{id}`; `RECEIVED_CODE_MAX_ATTEMPTS` (5) wrong tries → 1 h lock (`code='too_many_attempts'`). A Telegram fraud alert fires at the 3rd attempt.
3. **One-time-use** — `received_code_used_at IS NOT NULL` → reject (`code='code_used'`).
4. **Code presence** — `received_code` must exist (`code='no_code'`).
5. **TTL** — `received_code_expires_at < now` (24 h) → reject (`code='code_expired'`).
6. **Comparison** — mismatch increments the counter, writes a `received_code_verified=False` audit `OrderHistory` row inside its own `transaction.atomic()` (so the raise doesn't roll back the audit), and returns `code='wrong_code'` + `attempts_left`.

On success: an atomic block runs `transition_order_status → RECEIVED`, sets `received_code_used_at = now()`, marks the new history row `received_code_verified=True`, and clears the fail counter. **The function signature still accepts `delivery_photo=None, latitude=None, longitude=None` for backward compat, but the view never passes them** — they stay `None`.

#### 6. The login OTP flow (`backend/users/views.py`)

`SendOTPView` / `VerifyOTPView`, throttle scope `otp`. Gated by `_use_debug_otp()` which is true when `OTP_DEBUG=True` **or** `IS_TESTING` **or** `DEBUG`:
- **Debug mode** — uses the fixed code `121212`, returns `debug_code` in the response, sends **no** real SMS. This is the current production state while templates are in moderation.
- **Real mode** (`OTP_DEBUG=False`, Eskiz approved) — `generate_otp()` (crypto-random) + `send_otp_sms`. Code lives in cache `otp_{phone}` for 5 min, with a send cooldown and a per-code attempt cap. Switching to real SMS is **only** an env change — set `OTP_DEBUG=False` + `ESKIZ_EMAIL`/`ESKIZ_PASSWORD` in the Hetzner server's `/opt/bozor/backend/.env`, then `docker compose restart web worker` — no code edit.

#### 7. Frontend — where the courier types the code

The `DELIVERED → RECEIVED` transition is **the only status change not done through the normal status endpoint.** Two coupled pieces enforce this:

- **Backend guardrail** — `AdminOrderStatusUpdateView` rejects `DELIVERED → RECEIVED` with `400 code='courier_confirm_required'` (even for super_admin). This closes the hole where a courier could mark an order received without ever validating the code.
- **Frontend** — in `frontend/src/pages/admin/OrdersTab.tsx`, when the forward transition is `RECEIVED` the normal "save status" button is replaced by a **"Qabul kodini kiritish"** button that opens `frontend/src/components/CourierConfirmDialog.tsx`. That dialog is a 6-box segmented code input (auto-advance, paste-fill, Enter-to-submit) calling `endpoints.ts::courierConfirmDelivery(id, { received_code })`. It maps every backend `code` to a precise Uzbek message; only `wrong_code` lets the courier retry (clears + refocuses), all other errors auto-close after 1.5 s.

#### 8. Smoke tests (no framework — Django shell heredocs)

The SMS subsystem is covered by inline smoke blocks (patch `orders.signals.send_order_status_sms_task` + `orders.tasks.send_order_status_sms_task` to avoid real Eskiz calls; mock `orders.sms.requests.post` to assert the exact rendered body). Coverage: template byte-match, `ESKIZ_APPROVED_STATUSES` gating, the `AdminOrderStatusUpdateView` rejection, and the full courier-confirm 6-layer path (wrong code, brute-force lockout boundary at 5, one-time-use, idempotency). Re-run them after any change here.

### Dispute window respects credit_overdue (Phase 2.5)

`orders/services.py::mark_overdue_credits` is the shared helper used by both `check_credit_eligibility` and the `mark_credit_overdue` cron command. Filter includes:

```python
.filter(
    Q(dispute_deadline__isnull=True) | Q(dispute_deadline__lt=now)
)
```

Backwards compat: a NULL `dispute_deadline` (orders predating Phase 2.2) is treated as "no dispute window" and marked overdue. Never replicate the inline query in new call sites — extend the helper.

### Phase 1.1 AuditLog middleware

`core/middleware.py::AuditMiddleware` records every admin POST/PATCH/DELETE to the `users_auditlog` table (actor, action, target_type, target_id, data diff, IP, UA). The Super Admin sees it under `Admin Panel → Tizim → Audit log`. Locally the table may not exist (`WARNING: AuditLog yozishda xato: no such table` is benign in shell tests).

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

### Migration gotcha — `Order` AlterField bundling

`makemigrations` on the `orders` app frequently bundles unrelated `AlterField` operations on the `Order` model (because index annotations have drifted from older migrations). When writing a Phase-named migration (e.g. `0011_order_dispute_phase_2_6`), **manually delete** the `migrations.AlterField` blocks targeting `order.created_at`, `order.credit_due_date`, `order.is_credit`, `order.status` before committing. Keep only the `AddField` / `CreateModel` ops your change actually requires. This keeps each migration scoped to one phase and prevents accidental schema drift.

### Frontend (`frontend/src/`)

**Routing** (`App.tsx`): React Router v7. `/admin` renders `AdminPanel` standalone (lazy-loaded ~500KB chunk). All other routes use `MainLayout` (TopNavBar/MobileTopBar + BottomNavBar + Footer). `App.tsx` also runs a profile-sync `useEffect` that mirrors `is_master` / `can_use_credit` from the server into the auth store on every load (see "Credit / Master gating").

**State management** (Zustand, all persisted to localStorage):
- `authStore` — JWT tokens + user object (`is_admin`, `role`, `is_master`, `can_use_credit`).
- `cartStore` — cart items + guest sync.
- `languageStore` — current language (`uz`/`ru`/`en`), key `bozor-language`.
- `themeStore` — light/dark mode.
- `favoritesStore` — favorited product IDs.
- `recentlyViewedStore` — recently viewed product objects.

**Cross-component module caches** (`src/utils/`):
- `shopInfoCache.ts` — single source of truth for receipt header (name/phone/address). `loadShopInfo()` is the **synchronous** accessor that `printReceipt` / `printCreditAgreement` use; `useShopInfo()` is the React Query hook; `updateShopInfoCache()` is called from the mutation onSuccess. Backend is `GET/PATCH /api/admin/shop-info/` (PATCH is Super Admin only).
- `notificationSound.ts` — Web Audio synthesized "bing-bong" for new-order alerts (no MP3 asset). Honours the `localStorage` flag `admin:sound-muted`.

**Real-time orders polling** (`AdminPanel.tsx::useOrdersPolling`):
- React Query `refetchInterval: 10_000`, `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`.
- Backend endpoint `GET /api/orders/admin/poll/?since=<id>` returns `{ has_new, new_count, latest_id, server_time }` from a `Max(id)` + `Count(id__gt=since)` query.
- `lastSeenId` is persisted to `localStorage` (`admin:last-seen-order-id`). On first load a baseline is fetched so existing orders are not flagged "new". `prevNewCount` ref deduplicates toast/sound fires.
- Sidebar badge is wired through the `NAV_GROUPS` items array (`badge` field on `NavItem`). When `activeTab === 'orders'` the hook auto marks the latest id as seen.

**i18n system** (`src/i18n/`):
- `translations.ts` — static UI strings for all 3 languages (sections: `nav`, `topbar`, `search`, `home`, `auth`, `cart`, `checkout`, `profile`, `footer`, `product`, `favorites`, `sections`, `catalog`, `common`, `orderStatus`, `language`).
- `useTranslation()` hook returns `{ t, language }` from `languageStore`.
- Never hardcode Uzbek text in components — always use `t.*` keys.

**API client** (`src/api/client.ts`): Axios instance at `http://127.0.0.1:8000/api`. Request interceptor injects: `Authorization: Bearer <token>`, `X-Guest-Session-Id` (guests), `Accept-Language: <lang>` (from `bozor-language` localStorage). Response interceptor handles 401 by refreshing token automatically (single-flight refresh, see `client.ts` comments).

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

1. Add keys to all 3 language objects in `frontend/src/i18n/translations.ts`.
2. Use `const { t, language } = useTranslation()` in the component.
3. Reference as `t.section.key`.

### Adding a New Product Field with Translation

1. Add `field_ru` and `field_en` to the model.
2. Create and run a migration.
3. Add auto-translation logic to `save()` (follow the existing pattern in `Product.save()`).
4. Add `get_field(self, obj)` using `localized(obj, 'field', get_lang(self.context))` to the relevant serialiser.
5. Run `python manage.py translate_products --retranslate` to populate existing records.

### Working with PRs

Branches use the convention `feat/<name>`, `fix/<name>`, etc. The current workflow is one PR per Phase subtask (Phase 0.1, 1.1, 2.1, ...). Commit message bodies routinely include a smoke-test pass count (e.g. "Backend smoke 8/8 yashil") — keep this convention; it is the project's de-facto test report.
