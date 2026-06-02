# ═══════════════════════════════════════════════════════════════════════════
#  Bozor Mobile — Phase 1.3 ProGuard / R8 qoidalar
# ═══════════════════════════════════════════════════════════════════════════
#
# NIMA QILADI:
#   R8 (Android obfuscation) release build paytida sinflar nomini qisqartiradi
#   va kerakmas kodni o'chiradi. Ba'zi kutubxonalar reflection ishlatadi —
#   ularning sinflarini saqlash kerak.
#
# MUAMMO BO'LMAGAN:
#   • Sentry Flutter — Sentry plugin avtomat saqlaydi
#   • Flutter framework — flutter-gradle-plugin saqlaydi
#   • Standart Android — proguard-android-optimize.txt o'rinli
#
# QO'SHIMCHA HIMOYA (qoidalar pastda):
#   • Hive: TypeAdapter reflection
#   • Dio + HttpClient: HTTPS sozlamalari
#   • JSON model'lar: fromJson/toJson reflection (build_runner generated)
# ═══════════════════════════════════════════════════════════════════════════

# ── Flutter (ehtimol redundant, lekin xavfsiz) ──────────────────────────────
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# ── Sentry ─────────────────────────────────────────────────────────────────
-keep class io.sentry.** { *; }
-keep class io.sentry.android.** { *; }

# ── Hive (offline cache + cart + search history) ───────────────────────────
-keep class * extends hive.HiveObject { *; }

# ── Dio / OkHttp ───────────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**

# ── Stack trace o'qiladigan bo'lishi uchun ─────────────────────────────────
# Line number va source file ma'lumotini saqlash (Sentry ko'rsatadi)
-keepattributes SourceFile,LineNumberTable

# Reflection orqali ishlatiladigan annotation'lar
-keepattributes *Annotation*
