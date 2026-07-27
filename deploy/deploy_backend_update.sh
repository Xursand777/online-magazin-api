#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  ⚠️  FAQAT FAVQULODDA (EMERGENCY-ONLY) — ODATIY DEPLOY UCHUN ISHLATMANG  ⚠️
# ═══════════════════════════════════════════════════════════════════════════
#
#  NORMAL DEPLOY = shunchaki `git push` (main).
#    • backend/**  → `.github/workflows/deploy-backend.yml` avtomat deploy qiladi
#    • frontend/** → `.github/workflows/deploy-frontend.yml` avtomat deploy qiladi
#  Bu skript QO'LDA rsync qiladi — auto-deploy (git reset --hard) bilan DRIFT
#  keltirib chiqarishi mumkin. Faqat GitHub Actions ishlamay qolganда (favqulodda)
#  yoki bir martalik maxsus holatда ishlating.
#
#  ── Nima qiladi (tarixiy: Render→Hetzner migratsiya drift tuzatuvchisi) ──
#  Lokal kodni serverga rsync qiladi va Docker'ni qayta quradi.
#
#  XAVFSIZLIK:
#   • DB backup + joriy image'lar :rollback tag (build'dan oldin)
#   • rsync .env / db.sqlite3 / media / logs / venv / test_* ni TEGMAYDI
#   • health/kod tekshiruvi muvaffaqiyatsiz bo'lsa → AVTO-ROLLBACK (eski image)
#   • DIQQAT: Render endi O'CHIRILGAN — eski "DNS flip" himoyasi yo'q.
#
#  Mac'da ishga tushiriladi:  bash deploy/deploy_backend_update.sh
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

# ── FAVQULODDA TASDIQLASH ───────────────────────────────────────────────────
# Odatiy deploy `git push` orqali. Bu skript tasodifan ishlamasligi uchun
# tasdiqlash so'raydi. Avtomatlashtirishда o'chirish: DEPLOY_FORCE=1 bering.
if [ "${DEPLOY_FORCE:-0}" != "1" ]; then
  echo "⚠️  Bu — FAQAT FAVQULODDA qo'lда deploy skripti."
  echo "    Odatiy deploy: git push (GitHub Actions avtomat chiqaradi)."
  printf "    Davom etish uchun 'favqulodda' deb yozing: "
  read -r _confirm
  if [ "$_confirm" != "favqulodda" ]; then
    echo "Bekor qilindi. (To'g'ri yo'l: git commit + git push)"
    exit 1
  fi
fi

LOCAL_BACKEND="/Users/xursand/Online Magazin API/backend"
LOCAL_FRONTEND="/Users/xursand/Online Magazin API/frontend"
LOCAL_DEPLOY="/Users/xursand/Online Magazin API/deploy"
LOCAL_DOCKER_COMPOSE="/Users/xursand/Online Magazin API/docker-compose.yml"
IP="$(awk '/ssh-ed25519/ && $1 ~ /^46\./ {print $1; exit}' ~/.ssh/known_hosts)"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=25 root@$IP"

[ -z "$IP" ] && { echo "XATO: server IP topilmadi (~/.ssh/known_hosts)"; exit 1; }
[ -d "$LOCAL_BACKEND" ] || { echo "XATO: lokal backend topilmadi: $LOCAL_BACKEND"; exit 1; }
[ -d "$LOCAL_FRONTEND" ] || { echo "XATO: lokal frontend topilmadi: $LOCAL_FRONTEND"; exit 1; }
echo "Server: $IP"

# ── 1) Pre-flight: DB backup + joriy image'larni :rollback tag ──────────────
echo "== 1) DB backup + image rollback-tag =="
$SSH 'set -e; cd /opt/bozor
  docker compose exec -T web python manage.py backup_db >/dev/null 2>&1 && echo "DB backup: OK" || echo "DB backup: o\047tkazib yuborildi (cron bor)"
  for s in web worker beat; do
    docker tag "bozor-$s:latest" "bozor-$s:rollback" && echo "rollback tag: bozor-$s:rollback"
  done'

# ── 2) Backend kodini rsync (xavfsiz exclude bilan) ────────────────────────
echo "== 2) Backend kodini rsync (push) =="
rsync -az \
  --exclude 'venv/' --exclude '__pycache__/' --exclude '*.pyc' \
  --exclude '.env' --exclude '.env.*' --exclude 'db.sqlite3' \
  --exclude 'media/' --exclude 'staticfiles/' --exclude 'logs/' \
  --exclude 'test_*.py' --exclude 'get_orders.py' --exclude '.DS_Store' \
  -e "ssh -o BatchMode=yes" \
  "$LOCAL_BACKEND/" "root@$IP:/opt/bozor/backend/" \
  && echo "rsync: OK" || { echo "XATO: rsync muvaffaqiyatsiz"; exit 1; }

# ── 2b) FRONTEND build + rsync (Phase 4.1+ — Cloudflare Pages'dan ko'chirildi)
# Vite production build lokalda → dist papkasi serverga rsync → nginx serve qiladi.
# Bu Hetzner backend+frontend BIR sahada ishlashini ta'minlaydi (CF auto-deploy
# muammosi yo'q, har deploy aniq bitta script bilan).
echo "== 2b) Frontend build (Vite) + rsync =="
(
  cd "$LOCAL_FRONTEND"
  echo "  npm ci (lockfile bo'yicha aniq versiyalar) ..."
  if [ ! -d node_modules ]; then
    npm ci --silent 2>&1 | tail -3 || { echo "XATO: npm ci"; exit 1; }
  fi
  echo "  vite build ..."
  # VITE_API_URL bu yerda MAJBURIY o'rnatiladi. Ilgari bu qiymat Vercel
  # dashboard'idan kelardi; Hetzner'ga ko'chgach build lokal bo'lgani uchun,
  # aks holda frontend `localhost:8000` ga tushib, production sayt API'ga
  # ulanolmay qoladi. (frontend/.env.production ham bor, lekin gitignore'da —
  # shuning uchun yagona ishonchli manba shu commit qilingan qator.)
  VITE_API_URL="${VITE_API_URL:-https://api.700mobile.uz/api}" npm run build 2>&1 | tail -5 || { echo "XATO: vite build"; exit 1; }
  [ -f dist/index.html ] || { echo "XATO: dist/index.html topilmadi"; exit 1; }
  bundle=$(grep -oE 'assets/index-[a-zA-Z0-9_-]+\.js' dist/index.html | head -1)
  echo "  build OK — bundle: $bundle"
) || exit 1

echo "  frontend/dist → server'ga rsync ..."
rsync -az --delete \
  -e "ssh -o BatchMode=yes" \
  "$LOCAL_FRONTEND/dist/" "root@$IP:/opt/bozor/frontend/dist/" \
  && echo "  frontend rsync: OK" || { echo "XATO: frontend rsync"; exit 1; }

# ── 2c) Nginx config + docker-compose.yml ham rsync (site.conf yangi) ──────
echo "== 2c) deploy/nginx + docker-compose.yml rsync =="
rsync -az -e "ssh -o BatchMode=yes" \
  "$LOCAL_DEPLOY/nginx/" "root@$IP:/opt/bozor/deploy/nginx/" \
  --exclude 'certs/' \
  && echo "  nginx config rsync: OK" || { echo "XATO: nginx rsync"; exit 1; }
rsync -az -e "ssh -o BatchMode=yes" \
  "$LOCAL_DOCKER_COMPOSE" "root@$IP:/opt/bozor/docker-compose.yml" \
  && echo "  docker-compose.yml rsync: OK" || { echo "XATO: compose rsync"; exit 1; }

# ── 3) Build + up + migrate + verify (+ avto-rollback) ─────────────────────
echo "== 3) Build + deploy + verify (server'da) =="
$SSH 'bash -s' <<"REMOTE"
set -uo pipefail
cd /opt/bozor

rollback() {
  echo ">> ROLLBACK boshlandi (eski image qaytarilyapti)"
  for s in web worker beat; do docker tag "bozor-$s:rollback" "bozor-$s:latest"; done
  docker compose up -d --no-build --force-recreate web worker beat
  echo ">> ROLLBACK tugadi — eski (ishlaydigan) holat qaytarildi."
}

echo "-- build (web worker beat) --"
if ! docker compose build web worker beat; then
  echo "XATO: build muvaffaqiyatsiz — running containerlar tegilmadi (eski image)."
  exit 1
fi

echo "-- up -d --"
docker compose up -d web worker beat

echo "-- web healthy bo'lguncha kutish --"
ok=0
for i in $(seq 1 20); do
  code=$(docker compose exec -T web curl -s -m 5 -o /dev/null -w '%{http_code}' http://localhost:8000/healthz/ 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then ok=1; echo "web tayyor (~$((i*3))s)"; break; fi
  sleep 3
done
[ "$ok" = "1" ] || { echo "XATO: web sog'lom bo'lmadi"; rollback; exit 1; }

echo "-- migrate (no-op kutilgan) --"
docker compose exec -T web python manage.py migrate --noinput 2>&1 | tail -5 || { echo "XATO: migrate"; rollback; exit 1; }

echo "-- VERIFY 1: deep health --"
dh=$(docker compose exec -T web curl -s -m 8 "http://localhost:8000/healthz/?deep=1" 2>/dev/null)
echo "$dh" | grep -q '"status": "healthy"' || { echo "XATO: deep health healthy emas: $dh"; rollback; exit 1; }

echo "-- VERIFY 2: yangi kod (_send_telegram) --"
docker compose exec -T web sh -c "grep -q _send_telegram core/notifications.py" || { echo "XATO: yangi kod yuklanmadi"; rollback; exit 1; }

echo "-- VERIFY 3: Qaytarish endpoint mavjud (404 EMAS) --"
rc=$(docker compose exec -T web curl -s -m 8 -o /dev/null -w '%{http_code}' "http://localhost:8000/api/orders/admin/returns/" 2>/dev/null || echo 000)
echo "returns endpoint: HTTP $rc"
case "$rc" in 404|000) echo "XATO: returns endpoint yo'q (HTTP $rc)"; rollback; exit 1 ;; esac

echo "-- VERIFY 4: app Telegram --"
docker compose exec -T -e M="Deploy OK — Hetzner backend kodi main HEAD ga yangilandi (Qaytarish, received-code, courier nav, Favorite endi jonli). $(date '+%F %H:%M')" web \
  python manage.py shell -c "import os; from core.notifications import send_admin_alert, AlertSeverity; print('tg=', send_admin_alert(os.environ['M'], severity=AlertSeverity.INFO, dedup=False))"

# ── FRONTEND nginx — yangi site.conf + dist papkani qabul qilish ─────────
# nginx konteyneri docker-compose.yml o'zgargandagina qayta yaratiladi.
# Volume mountlar (frontend/dist va deploy/nginx/site.conf) o'zgartirilgan
# bo'lsa, konteynerni `up -d` orqali qayta yaratish kerak.
echo "-- nginx: site.conf va frontend/dist mountlarini olish uchun recreate --"
docker compose up -d --no-build --force-recreate nginx
sleep 2

# Frontend smoke test — nginx /usr/share/nginx/html/index.html topadi?
echo "-- VERIFY 5: Frontend index.html mavjud --"
docker compose exec -T nginx test -f /usr/share/nginx/html/index.html \
  || { echo "XATO: frontend index.html nginx ichida topilmadi"; rollback; exit 1; }

# Frontend qachondan beri build qilingan — bundle hash chiqarib ko'rsatamiz
new_bundle=$(docker compose exec -T nginx sh -c "grep -oE 'assets/index-[a-zA-Z0-9_-]+\.js' /usr/share/nginx/html/index.html | head -1")
echo "-- yangi frontend bundle: $new_bundle --"

# Nginx config tekshiruvi
echo "-- nginx config sintaksis tekshiruvi --"
docker compose exec -T nginx nginx -t 2>&1 | tail -3 \
  || { echo "XATO: nginx config sintaksisi"; rollback; exit 1; }
docker compose exec -T nginx nginx -s reload && echo "nginx reload: OK"

echo ""
echo "✅ DEPLOY MUVAFFAQIYATLI — backend + frontend ham yangilandi."
echo "   Eski image'lar :rollback tag'da saqlanmoqda (kerak bo'lsa qaytarish mumkin)."
echo "   Frontend yangi bundle: $new_bundle"
REMOTE
