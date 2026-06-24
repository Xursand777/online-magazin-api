#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Origin firewall tuzatish — DOCKER-USER chiquvchi 80/443 blokini bartaraf etish
#
#  MUAMMO: DOCKER-USER'dagi origin-himoya qoidasi yo'nalishni ajratmagan:
#     -A DOCKER-USER -p tcp -m multiport --dports 80,443 -j DROP
#  Bu container TASHQARIGA HTTPS (443) yuborganda ham bloklaydi
#  (Telegram, SMS/Eskiz, Cloudinary — hammasi ishlamay qoladi).
#
#  YECHIM: CF-allow + DROP qoidalarini faqat KIRUVCHI trafik (-i <WAN>) ga
#  cheklash. Origin himoya saqlanadi (CF'ni chetlab hech kim kira olmaydi),
#  container'ning chiquvchi trafigi ochiladi.
#
#  Xavfsiz: backup oladi, faqat DOCKER-USER'ga tegadi, xato bo'lsa avto-rollback.
#  Ishga tushirish (server'da, root):  bash fix_origin_firewall.sh
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

F=/etc/iptables/rules.v4
COMPOSE_DIR=/opt/bozor
TEST_SERVICE=web

# WAN (tashqi) interfeysni avtomatik aniqlash (odatda eth0)
WAN="$(ip route show default 2>/dev/null | awk '/default/{print $5; exit}')"
[ -z "$WAN" ] && WAN=eth0

BK="$F.bak.$(date +%F_%H%M%S)"

rollback() {
  echo ">> ROLLBACK: backup tiklanmoqda ($BK)"
  cp "$BK" "$F"
  iptables -F DOCKER-USER
  while read -r r; do iptables $r; done < <(grep '^-A DOCKER-USER ' "$F")
  echo ">> rollback tugadi — eski holat qaytarildi."
}

echo "== WAN interfeys: $WAN =="

echo "== 1) Backup =="
cp "$F" "$BK" && echo "backup: $BK"

echo "== 2) rules.v4 tahrirlash (-i $WAN qo'shish) =="
sed -i -E "/^-A DOCKER-USER .*--dports 80,443/ s/^-A DOCKER-USER /-A DOCKER-USER -i $WAN /" "$F"
N=$(grep -cE "^-A DOCKER-USER -i $WAN .*--dports 80,443" "$F")
echo "scoped qatorlar soni: $N  (kutilgan: 15 CF RETURN + 1 DROP = 16)"
if [ "$N" -lt 2 ]; then
  echo "XATO: sed kutilganidek mos kelmadi. O'zgarish bekor qilinmoqda."
  cp "$BK" "$F"
  exit 1
fi

echo "== 3) Jonli qo'llash (DOCKER-USER qayta qurish) =="
iptables -F DOCKER-USER
while read -r r; do iptables $r; done < <(grep '^-A DOCKER-USER ' "$F")
echo "jonli DOCKER-USER qoida soni: $(iptables -S DOCKER-USER | grep -c '^-A')"

echo "== 4) Origin himoya hali tirikmi? (DROP qoidasi) =="
if iptables -S DOCKER-USER | grep -q -- "-i $WAN -p tcp -m multiport --dports 80,443 -j DROP"; then
  echo "origin DROP qoidasi: MAVJUD ✓ (himoya saqlandi)"
else
  echo "XATO: DROP qoidasi yo'qoldi! Rollback."
  rollback
  exit 1
fi

echo "== 5) Tekshiruv: container -> tashqi (Telegram) =="
cd "$COMPOSE_DIR"
CODE=$(docker compose exec -T "$TEST_SERVICE" curl -4 -sS -m 12 -o /dev/null -w '%{http_code}' https://api.telegram.org 2>/dev/null || echo 000)
echo "container -> api.telegram.org: HTTP $CODE"

case "$CODE" in
  200|301|302)
    echo
    echo "✅ NATIJA: TUZATILDI — container endi tashqariga chiqadi, origin himoya saqlandi."
    echo "   (rules.v4 yangilandi → reboot'dan keyin ham saqlanadi)"
    echo "   backup: $BK"
    ;;
  *)
    echo
    echo "⚠️ container hali chiqmadi (HTTP $CODE) — kutilmagan holat. Avto-rollback bajarilmoqda."
    rollback
    echo "Iltimos natijani Claude'ga ko'rsating."
    exit 1
    ;;
esac
