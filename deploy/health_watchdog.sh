#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Bozor — Soak Health Watchdog  (api.700mobile.uz)
#
#  Deep-health monitor → Telegram. Server/DB o'chsa darhol admin'ga 🔴,
#  cache muammosi 🟡, tiklanganda 🟢.
#
#  MUHIM DIZAYN: alert HOST'dan to'g'ridan-to'g'ri Telegram'ga yuboriladi
#  (web container orqali EMAS) — chunki web/Docker o'lganda ham, ya'ni aynan
#  alert kerak paytda, ogohlantirish yetib borishi shart. Token env fayldan.
#
#  KUCHLI MANTIQ:
#    • flock     — bir vaqtda ikki nusxa ishlamaydi (overlap yo'q)
#    • debounce  — CRITICAL faqat $FAIL_THRESHOLD ketma-ket fail'dan keyin
#    • ishonchli — alert YUBORILSA-GINA holat DOWN bo'ladi; aks holda keyingi
#                  siklda qayta uriniladi (ogohlantirish yo'qolmaydi)
#    • eslatma   — server hali o'lik bo'lsa, har $REMINDER_SECS da qayta yuboradi
#    • tiklanish — necha daqiqa o'chiq turgani hisoblanadi
#
#  Holat semantikasi (core/health.py):
#    HTTP 200 + "healthy"  → OK
#    HTTP 200 + "degraded" → DEGRADED (cache fail, sayt ishlayapti)
#    HTTP 503 / 000        → DOWN (DB/server kritik)
#
#  Foydalanish:  health_watchdog.sh        (cron: * * * * *)
#                health_watchdog.sh test   (sinov xabari yuboradi)
#  State: /opt/bozor/.health_state   |   Log: /var/log/bozor-health.log
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

URL="https://api.700mobile.uz/healthz/?deep=1"
ENV_FILE="/opt/bozor/backend/.env"
STATE_FILE="/opt/bozor/.health_state"
LOG="/var/log/bozor-health.log"
LOCK="/var/lock/bozor-health.lock"
FAIL_THRESHOLD=2        # nechta ketma-ket fail'dan keyin CRITICAL
REMINDER_SECS=1800      # davom etayotgan uzilishda qayta eslatma oralig'i (30 daq)
CURL_TIMEOUT=20
TG_TIMEOUT=12

# ── Telegram alert: HOST'dan to'g'ridan-to'g'ri (web'ga bog'liq emas) ──────
#    $1 = severity (CRITICAL|WARNING|INFO), $2 = matn  →  rc 0 = yetkazildi
send_alert() {
  local token chat emoji code
  token="$(grep -E '^TELEGRAM_BOT_TOKEN='     "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"
  chat="$(grep  -E '^TELEGRAM_ADMIN_CHAT_ID=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"
  [ -z "$token" ] || [ -z "$chat" ] && return 1
  case "$1" in
    CRITICAL) emoji='🔴' ;;
    WARNING)  emoji='🟡' ;;
    *)        emoji='🟢' ;;
  esac
  code="$(curl -sS -m "$TG_TIMEOUT" -o /dev/null -w '%{http_code}' \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=${emoji} ${1}: ${2}" \
    --data-urlencode "disable_web_page_preview=true" \
    "https://api.telegram.org/bot${token}/sendMessage" 2>/dev/null)"
  [ "$code" = "200" ]
}

# ── Self-test rejimi:  health_watchdog.sh test ─────────────────────────────
if [ "${1:-}" = "test" ]; then
  if send_alert INFO "Soak watchdog self-test — $(date '+%Y-%m-%d %H:%M:%S'). Monitoring ishlayapti, alert quvuri tirik."; then
    echo "self-test: ALERT YETKAZILDI ✓"; exit 0
  else
    echo "self-test: ALERT YUBORILMADI ✗"; exit 1
  fi
fi

# ── Overlap himoyasi: oldingi nusxa hali ishlayotgan bo'lsa, jim chiqamiz ──
exec 9>"$LOCK" 2>/dev/null || exit 0
flock -n 9 || exit 0

NOW_EPOCH="$(date +%s)"
NOW_TS="$(date '+%Y-%m-%d %H:%M:%S')"

# ── Joriy holatni aniqlash ─────────────────────────────────────────────────
RESP="$(curl -s -m "$CURL_TIMEOUT" -w $'\n%{http_code}' "$URL" 2>/dev/null)"
HTTP="${RESP##*$'\n'}"
BODY="${RESP%$'\n'*}"
[ -z "$HTTP" ] && HTTP="000"

if [ "$HTTP" = "200" ]; then
  if printf '%s' "$BODY" | grep -q '"status": *"degraded"'; then
    CUR="DEGRADED"
  else
    CUR="OK"
  fi
else
  CUR="DOWN"
fi

# ── Oldingi holatni yuklash:  ALERTED FAILS DOWN_SINCE LAST_ALERT ──────────
ALERTED="NEW"; FAILS=0; DOWN_SINCE=0; LAST_ALERT=0
if [ -f "$STATE_FILE" ]; then
  read -r ALERTED FAILS DOWN_SINCE LAST_ALERT < "$STATE_FILE" || true
fi
ALERTED="${ALERTED:-NEW}"; FAILS="${FAILS:-0}"
DOWN_SINCE="${DOWN_SINCE:-0}"; LAST_ALERT="${LAST_ALERT:-0}"

# ── Holat mashinasi ────────────────────────────────────────────────────────
case "$CUR" in
  DOWN)
    FAILS=$((FAILS + 1))
    [ "$DOWN_SINCE" -eq 0 ] && DOWN_SINCE="$NOW_EPOCH"

    if [ "$ALERTED" != "DOWN" ]; then
      if [ "$FAILS" -ge "$FAIL_THRESHOLD" ]; then
        if send_alert CRITICAL "api.700mobile.uz JAVOB BERMAYAPTI yoki DB ishlamayapti (HTTP $HTTP, $FAILS marta ketma-ket). Soak watchdog — $NOW_TS."; then
          ALERTED="DOWN"; LAST_ALERT="$NOW_EPOCH"
        fi
        # send muvaffaqiyatsiz → ALERTED o'zgarmaydi, keyingi siklda qayta uriniladi
      fi
    else
      # Allaqachon DOWN e'lon qilingan → davom etayotgan uzilish eslatmasi
      if [ $((NOW_EPOCH - LAST_ALERT)) -ge "$REMINDER_SECS" ]; then
        DUR_MIN=$(( (NOW_EPOCH - DOWN_SINCE) / 60 ))
        if send_alert CRITICAL "api.700mobile.uz HALI HAM ishlamayapti — ~${DUR_MIN} daqiqadan beri o'chiq (HTTP $HTTP). Soak watchdog — $NOW_TS."; then
          LAST_ALERT="$NOW_EPOCH"
        fi
      fi
    fi
    ;;

  DEGRADED)
    FAILS=0; DOWN_SINCE=0
    if [ "$ALERTED" != "DEGRADED" ]; then
      if send_alert WARNING "api.700mobile.uz degraded — cache ishlamayapti, lekin sayt ishlayapti (HTTP 200). Soak watchdog — $NOW_TS."; then
        ALERTED="DEGRADED"; LAST_ALERT="$NOW_EPOCH"
      fi
    fi
    ;;

  OK)
    if [ "$ALERTED" = "DOWN" ] || [ "$ALERTED" = "DEGRADED" ]; then
      DUR_MIN=0
      [ "$DOWN_SINCE" -gt 0 ] && DUR_MIN=$(( (NOW_EPOCH - DOWN_SINCE) / 60 ))
      send_alert INFO "api.700mobile.uz TIKLANDI — health OK (~${DUR_MIN} daqiqa muammodan keyin). Soak watchdog — $NOW_TS." || true
    fi
    ALERTED="OK"; FAILS=0; DOWN_SINCE=0; LAST_ALERT=0
    ;;
esac

# ── Holat va log'ni saqlash ────────────────────────────────────────────────
printf '%s %s %s %s\n' "$ALERTED" "$FAILS" "$DOWN_SINCE" "$LAST_ALERT" > "$STATE_FILE"
printf '%s http=%s cur=%s alerted=%s fails=%s\n' "$NOW_TS" "$HTTP" "$CUR" "$ALERTED" "$FAILS" >> "$LOG"

# ── Log trim (oxirgi 5000 qator) ──────────────────────────────────────────
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 6000 ]; then
  tail -n 5000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
fi

exit 0
