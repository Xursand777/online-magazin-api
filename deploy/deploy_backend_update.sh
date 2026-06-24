#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Hetzner backend kodini yangilash (kod drift tuzatish)
#
#  MUAMMO: server image'lari ~2 hafta eski koddan build qilingan, DB esa yangi
#  (Render'dan). Yangi funksiyalar (Qaytarish, received-code, courier nav,
#  Favorite) kodda yo'q. Bu script kodni lokal main HEAD ga keltiradi.
#
#  XAVFSIZLIK:
#   • DB backup + joriy image'lar :rollback tag (build'dan oldin)
#   • rsync .env / db.sqlite3 / media / venv / test_* ni TEGMAYDI
#   • migrate = no-op kutilgan (DB allaqachon shu migratsiyalarda)
#   • health/kod tekshiruvi muvaffaqiyatsiz bo'lsa → AVTO-ROLLBACK (eski image)
#   • Render hali tirik — oxirgi himoya sifatida (DNS flip)
#
#  Mac'da ishga tushiriladi:  bash deploy/deploy_backend_update.sh
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

LOCAL_BACKEND="/Users/xursand/Online Magazin API/backend"
IP="$(awk '/ssh-ed25519/ && $1 ~ /^46\./ {print $1; exit}' ~/.ssh/known_hosts)"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=25 root@$IP"

[ -z "$IP" ] && { echo "XATO: server IP topilmadi (~/.ssh/known_hosts)"; exit 1; }
[ -d "$LOCAL_BACKEND" ] || { echo "XATO: lokal backend topilmadi: $LOCAL_BACKEND"; exit 1; }
echo "Server: $IP"

# ── 1) Pre-flight: DB backup + joriy image'larni :rollback tag ──────────────
echo "== 1) DB backup + image rollback-tag =="
$SSH 'set -e; cd /opt/bozor
  docker compose exec -T web python manage.py backup_db >/dev/null 2>&1 && echo "DB backup: OK" || echo "DB backup: o\047tkazib yuborildi (cron bor)"
  for s in web worker beat; do
    docker tag "bozor-$s:latest" "bozor-$s:rollback" && echo "rollback tag: bozor-$s:rollback"
  done'

# ── 2) Kodni rsync (xavfsiz exclude bilan) ─────────────────────────────────
echo "== 2) Backend kodini rsync (push) =="
rsync -az \
  --exclude 'venv/' --exclude '__pycache__/' --exclude '*.pyc' \
  --exclude '.env' --exclude '.env.*' --exclude 'db.sqlite3' \
  --exclude 'media/' --exclude 'staticfiles/' \
  --exclude 'test_*.py' --exclude 'get_orders.py' --exclude '.DS_Store' \
  -e "ssh -o BatchMode=yes" \
  "$LOCAL_BACKEND/" "root@$IP:/opt/bozor/backend/" \
  && echo "rsync: OK" || { echo "XATO: rsync muvaffaqiyatsiz"; exit 1; }

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

echo ""
echo "✅ DEPLOY MUVAFFAQIYATLI — kod drift tuzatildi, hammasi tekshirildi."
echo "   Eski image'lar :rollback tag'da saqlanmoqda (kerak bo'lsa qaytarish mumkin)."
REMOTE
