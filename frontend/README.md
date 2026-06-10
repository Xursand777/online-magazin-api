# Bozor — Frontend

Bozor e-commerce platformasining web mijozi: **React 19 + TypeScript + Vite + TailwindCSS**.

## Texnologiyalar

- **React 19** + **TypeScript**
- **Vite** — build va dev server
- **TailwindCSS** — UI
- **React Router v7** — routing (SPA)
- **TanStack Query** — server state / caching
- **Zustand** — client state (auth, cart, language, theme)
- **Axios** — API client (`src/api/client.ts`)

## Ishga tushirish

```bash
npm install
npm run dev        # http://localhost:5173
```

## Buyruqlar

```bash
npm run dev        # dev server
npm run build      # tsc -b && vite build → dist/
npm run preview    # build'ni lokal ko'rib chiqish
npm run lint       # eslint
npx tsc --noEmit   # tezkor type-check
```

## Muhit o'zgaruvchilari

`.env.local` (git'ga qo'shilmaydi) yarating — `.env.example`'ga qarang:

```
VITE_API_URL=http://127.0.0.1:8000/api      # development
# Production: https://api.your-domain.com/api
```

`VITE_API_URL` o'rnatilmasa, `127.0.0.1:8000/api` default ishlatiladi.

## Deploy (statik host)

`npm run build` → `dist/` papkasini istalgan statik host'ga joylash mumkin
(Cloudflare Pages tavsiya etiladi). SPA routing va xavfsizlik header'lari uchun
`public/_redirects` va `public/_headers` fayllari `dist/`'ga ko'chiriladi.

> Backend va deployment bo'yicha to'liq qo'llanma: repodagi `DEPLOYMENT.md`.
