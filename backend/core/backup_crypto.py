"""
core/backup_crypto.py — DB backup'lar uchun client-side shifrlash.

═══════════════════════════════════════════════════════════════════════════════
NIMA UCHUN CLIENT-SIDE SHIFRLASH?

Backblaze B2 serverda SSE (server-side encryption) qo'llab-quvvatlanadi, lekin
u CRENDENTIAL'GA BOG'LIQ — agar B2 application key kim oshkor qilsa, ma'lumot
o'qib bo'ladi. Bizning yondashuv (defense-in-depth):

  1. B2 bucket PRIVATE
  2. Application Key faqat backup bucket'iga, alohida
  3. **Client-side AES-256-GCM** — passphrase serverda alohida, B2 da emas
  4. Server-side encryption (B2) — qo'shimcha qatlam

Natija: B2 bucket'i va creds birga oshkor qilingan taqdirda HAM dump'lar
o'qilmaydi. Faqat `BACKUP_ENCRYPTION_PASSPHRASE` env (Hetzner .env'da, B2'da
emas) bo'lgan tomon decrypt qila oladi.

═══════════════════════════════════════════════════════════════════════════════
ALGORITM TANLOVI

  AES-256-GCM:  AEAD (authenticated encryption) — buzilishni aniqlaydi
                NIST/FIPS tasdiqlangan, hardware accelerated (AES-NI)
  PBKDF2-SHA256: parol'dan kalit chiqarish — 600 000 iteratsiya (OWASP 2023)
  Random salt:  har bir backup'da YANGI 16-baytli salt (rainbow-table yo'q)
  Random nonce: har bir CHUNK uchun YANGI 12-baytli nonce (counter-mode hujum yo'q)

  ⚠ Counter-mode (CTR/GCM) bilan bir xil (key, nonce) PAIR'ni TAKRORLAMASLIK
    SHART — aks holda XOR'lab plaintext'ni tiklash mumkin. Har chunk uchun
    URANDOM nonce ishlatamiz.

═══════════════════════════════════════════════════════════════════════════════
FAYL FORMATI (streaming-friendly)

┌────────────────────────────────────────────────────┐
│ HEADER (37 bayt)                                   │
├────────────────────────────────────────────────────┤
│  4 b magic    'BZE1'  (Bozor encrypted, v1)        │
│  1 b version  0x01                                 │
│ 16 b salt     PBKDF2 uchun random salt             │
│  4 b chunk    big-endian uint32 (= CHUNK_SIZE)     │
│  4 b kdf_ver  big-endian uint32 (= 1, kelajak uchun)│
│  8 b kdf_iter big-endian uint64 (= 600_000)        │
├────────────────────────────────────────────────────┤
│ CHUNKS (N ta)                                      │
├────────────────────────────────────────────────────┤
│ Har chunk:                                         │
│ 12 b nonce  (random per chunk)                     │
│  4 b ct_len big-endian uint32                      │
│ ct_len b  ciphertext (auth tag bilan)              │
└────────────────────────────────────────────────────┘

Plaintext har CHUNK_SIZE bayt bo'lib bo'linadi. So'nggi chunk 1 baytdan
ortiq bo'lsa — yagona o'zgarish u to'lgan emas (lekin shifrlash farqi yo'q).

Decryption oqimi STREAMING — fayl tartibida o'qiladi, har chunk dekodlandi
va keyingiga o'tiladi. RAM ishlatish: chunk_size + nonce + tag (~ 64 MB).

═══════════════════════════════════════════════════════════════════════════════
ISHLATISH (boshqa kodlardan)

    from core.backup_crypto import encrypt_stream, decrypt_stream

    # Shifrlab yozish:
    with open('dump.sql.gz', 'rb') as src, open('dump.sql.gz.enc', 'wb') as dst:
        encrypt_stream(src, dst, passphrase='...')

    # Deshifrlab o'qish:
    with open('dump.sql.gz.enc', 'rb') as src, open('dump.sql.gz', 'wb') as dst:
        decrypt_stream(src, dst, passphrase='...')

XATOLAR (custom exceptions):
    BackupCryptoConfigError      — sozlama xato (passphrase yo'q yoki zaif)
    BackupCryptoFormatError      — fayl formati noto'g'ri (eski/buzilgan)
    BackupCryptoIntegrityError   — auth tag mos kelmadi (buzilgan yoki noto'g'ri parol)
"""
from __future__ import annotations

import os
import secrets
import struct
from typing import BinaryIO

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# ── KONSTANTALAR (versiyalanadi — kelajakda kuchaytirsh mumkin) ──────────────

MAGIC = b'BZE1'           # Bozor encrypted backup v1
FORMAT_VERSION = 0x01
KDF_VERSION = 1            # PBKDF2-SHA256
KDF_ITERATIONS = 600_000   # OWASP 2023 (SHA256)
SALT_SIZE = 16
NONCE_SIZE = 12            # GCM standart (96-bit)
KEY_SIZE = 32              # AES-256
CHUNK_SIZE = 64 * 1024 * 1024  # 64 MB — RAM va throughput balansi
MIN_PASSPHRASE_LEN = 20    # OWASP minimum (256-bit entropy ~32 chars random)
HEADER_SIZE = 37           # magic(4) + ver(1) + salt(16) + chunk(4) + kdf_ver(4) + kdf_iter(8)
CHUNK_HEADER_SIZE = 16     # nonce(12) + ct_len(4)


# ── EXCEPTIONS ────────────────────────────────────────────────────────────────

class BackupCryptoError(Exception):
    """Backup shifrlash umumiy xato — pastdagilari shu yerdan keladi."""


class BackupCryptoConfigError(BackupCryptoError):
    """Konfiguratsiya xatosi: passphrase yo'q, zaif yoki noto'g'ri."""


class BackupCryptoFormatError(BackupCryptoError):
    """Fayl formati xato: magic mos kelmadi yoki versiya qo'llab-quvvatlanmaydi."""


class BackupCryptoIntegrityError(BackupCryptoError):
    """Auth tag mos kelmadi: fayl buzilgan yoki noto'g'ri passphrase."""


# ── KONFIG TEKSHIRUV ─────────────────────────────────────────────────────────

def is_enabled() -> bool:
    """`BACKUP_ENCRYPTION_PASSPHRASE` env borligini tekshiradi."""
    return bool(os.environ.get('BACKUP_ENCRYPTION_PASSPHRASE', '').strip())


def get_passphrase(*, required: bool = True) -> str | None:
    """
    Env'dan passphrase oladi va minimal uzunlik / entropy tekshiradi.

    `required=True` — passphrase yo'q yoki zaif bo'lsa ConfigError ko'tariladi.
    `required=False` — passphrase yo'q bo'lsa None qaytadi (legacy fallback).
    """
    passphrase = os.environ.get('BACKUP_ENCRYPTION_PASSPHRASE', '').strip()
    if not passphrase:
        if required:
            raise BackupCryptoConfigError(
                "BACKUP_ENCRYPTION_PASSPHRASE env o'rnatilmagan.\n"
                "Hetzner serverda /opt/bozor/backend/.env ichida sozlang:\n"
                "  BACKUP_ENCRYPTION_PASSPHRASE=<minimal 20 belgi, tasodifiy>\n\n"
                "Yangi parol yaratish: `python -c \"import secrets; "
                "print(secrets.token_urlsafe(32))\"`\n"
                "Va parolni AYRIM xavfsiz joyda saqlang — bu yo'qolsa, "
                "barcha shifrlangan backup'lar O'QIB BO'LMAYDI."
            )
        return None

    if len(passphrase) < MIN_PASSPHRASE_LEN:
        raise BackupCryptoConfigError(
            f"BACKUP_ENCRYPTION_PASSPHRASE juda kalta "
            f"({len(passphrase)} belgi). Minimal {MIN_PASSPHRASE_LEN} belgi.\n"
            "Brute-force hujumiga qarshi yetarli entropy uchun "
            "tasodifiy uzun parol kerak."
        )

    return passphrase


# ── KALITNI DERIVATSIYA QILISH ────────────────────────────────────────────────

def _derive_key(passphrase: str, salt: bytes, iterations: int = KDF_ITERATIONS) -> bytes:
    """PBKDF2-SHA256 orqali passphrase'dan 32-baytli AES-256 kaliti chiqaradi."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_SIZE,
        salt=salt,
        iterations=iterations,
    )
    return kdf.derive(passphrase.encode('utf-8'))


# ── HEADER YOZISH / O'QISH ────────────────────────────────────────────────────

def _write_header(dst: BinaryIO, salt: bytes) -> None:
    """Fayl boshiga 37 baytli header yozadi (format yuqorida)."""
    dst.write(MAGIC)
    dst.write(bytes([FORMAT_VERSION]))
    dst.write(salt)
    dst.write(struct.pack('>I', CHUNK_SIZE))
    dst.write(struct.pack('>I', KDF_VERSION))
    dst.write(struct.pack('>Q', KDF_ITERATIONS))


def _read_header(src: BinaryIO) -> dict:
    """Header'ni o'qib parametrlarni qaytaradi; format xato bo'lsa exception."""
    header = src.read(HEADER_SIZE)
    if len(header) != HEADER_SIZE:
        raise BackupCryptoFormatError(
            f"Header noto'liq: {len(header)} bayt o'qildi, {HEADER_SIZE} kutilgan"
        )
    if header[:4] != MAGIC:
        raise BackupCryptoFormatError(
            f"Magic mos kelmadi: kutilgan {MAGIC!r}, topilgan {header[:4]!r}. "
            "Bu Bozor shifrlangan backup emas (ehtimol oddiy .gz fayl)."
        )
    version = header[4]
    if version != FORMAT_VERSION:
        raise BackupCryptoFormatError(
            f"Format versiyasi qo'llab-quvvatlanmaydi: {version}. "
            f"Bu modul faqat v{FORMAT_VERSION} ni biladi."
        )
    salt = header[5:5 + SALT_SIZE]
    chunk_size = struct.unpack('>I', header[21:25])[0]
    kdf_version = struct.unpack('>I', header[25:29])[0]
    kdf_iterations = struct.unpack('>Q', header[29:37])[0]
    if kdf_version != KDF_VERSION:
        raise BackupCryptoFormatError(
            f"KDF versiyasi qo'llab-quvvatlanmaydi: {kdf_version}"
        )
    if not (1 <= chunk_size <= 256 * 1024 * 1024):
        raise BackupCryptoFormatError(
            f"Chunk size shubhali: {chunk_size}"
        )
    return {
        'salt': salt,
        'chunk_size': chunk_size,
        'kdf_iterations': kdf_iterations,
    }


# ── ASOSIY API: ENCRYPT / DECRYPT STREAMING ──────────────────────────────────

def encrypt_stream(
    src: BinaryIO,
    dst: BinaryIO,
    passphrase: str,
    *,
    chunk_size: int = CHUNK_SIZE,
) -> int:
    """
    `src` dan plaintext'ni STREAMING tarzda o'qib, `dst` ga shifrlangan
    holda yozadi. Yozilgan jami baytlar sonini qaytaradi.

    Har CHUNK_SIZE plaintext bayt alohida AES-GCM bilan shifrlanadi —
    nonce har chunk uchun yangi. Bu (1) RAM tejaydi va (2) qisman buzilgan
    fayl uchun decryption qaerda to'xtashini aniq bildiradi.
    """
    if not passphrase or len(passphrase) < MIN_PASSPHRASE_LEN:
        raise BackupCryptoConfigError(
            f"Passphrase juda kalta yoki bo'sh (minimal {MIN_PASSPHRASE_LEN} belgi)"
        )

    salt = secrets.token_bytes(SALT_SIZE)
    key = _derive_key(passphrase, salt)
    aead = AESGCM(key)

    _write_header(dst, salt)
    total_written = HEADER_SIZE

    while True:
        plaintext = src.read(chunk_size)
        if not plaintext:
            break

        # Har chunk uchun YANGI nonce — (key, nonce) pair takrorlanmasin.
        nonce = secrets.token_bytes(NONCE_SIZE)
        ciphertext = aead.encrypt(nonce, plaintext, associated_data=None)

        dst.write(nonce)
        dst.write(struct.pack('>I', len(ciphertext)))
        dst.write(ciphertext)
        total_written += NONCE_SIZE + 4 + len(ciphertext)

    return total_written


def decrypt_stream(
    src: BinaryIO,
    dst: BinaryIO,
    passphrase: str,
) -> int:
    """
    `src` dan shifrlangan fayl'ni STREAMING o'qib, `dst` ga plaintext yozadi.
    Yozilgan jami plaintext baytlar sonini qaytaradi.

    Har chunk uchun auth tag tekshiriladi — buzilgan bo'lsa
    BackupCryptoIntegrityError ko'tariladi (PARTIAL yozuvni o'chirish
    chaqiruvchi kodning vazifasi).
    """
    if not passphrase:
        raise BackupCryptoConfigError("Passphrase bo'sh — deshifrlab bo'lmaydi")

    header = _read_header(src)
    key = _derive_key(passphrase, header['salt'], header['kdf_iterations'])
    aead = AESGCM(key)
    chunk_size = header['chunk_size']
    total_written = 0

    while True:
        nonce = src.read(NONCE_SIZE)
        if not nonce:
            break  # fayl tugadi
        if len(nonce) != NONCE_SIZE:
            raise BackupCryptoFormatError(
                f"Nonce noto'liq: {len(nonce)} bayt o'qildi, {NONCE_SIZE} kutilgan. "
                "Fayl buzilgan."
            )
        ct_len_bytes = src.read(4)
        if len(ct_len_bytes) != 4:
            raise BackupCryptoFormatError("ct_len noto'liq, fayl buzilgan")
        ct_len = struct.unpack('>I', ct_len_bytes)[0]
        # Chunk ciphertext = chunk_size plaintext + 16 b tag
        max_ct = chunk_size + 16
        if not (1 <= ct_len <= max_ct):
            raise BackupCryptoFormatError(
                f"ct_len shubhali: {ct_len} (max {max_ct})"
            )
        ciphertext = src.read(ct_len)
        if len(ciphertext) != ct_len:
            raise BackupCryptoFormatError(
                f"Ciphertext noto'liq: {len(ciphertext)}/{ct_len}"
            )
        try:
            plaintext = aead.decrypt(nonce, ciphertext, associated_data=None)
        except InvalidTag as exc:
            raise BackupCryptoIntegrityError(
                "Auth tag mos kelmadi — fayl buzilgan yoki passphrase noto'g'ri. "
                "Hech narsa yozilmaydi (faylga tegmaymiz)."
            ) from exc

        dst.write(plaintext)
        total_written += len(plaintext)

    return total_written


# ── HELPER: shifrlangan faylni aniqlash ──────────────────────────────────────

def is_encrypted_file(path: str) -> bool:
    """Fayl boshiga qarab Bozor encrypted format'i ekanligini aniqlaydi."""
    try:
        with open(path, 'rb') as f:
            head = f.read(4)
    except (OSError, IOError):
        return False
    return head == MAGIC
