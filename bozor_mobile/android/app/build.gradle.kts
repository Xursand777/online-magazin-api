import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Phase 1.3 — Sentry Gradle plugin (NDK crash + R8 mapping upload)
    id("io.sentry.android.gradle")
}

// Release signing — android/key.properties (git'da YO'Q, maxfiy)
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "uz.mobile700.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // 700Mobile.uz — Play Store uchun doimiy Application ID (o'zgartirilmaydi)
        applicationId = "uz.mobile700.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = (keystoreProperties["storeFile"] as String?)?.let { rootProject.file(it) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }

    buildTypes {
        release {
            // key.properties bor → release keystore bilan imzolanadi.
            // Yo'q bo'lsa (CI/boshqa mashina) → debug (build baribir ishlaydi).
            signingConfig = if (keystorePropertiesFile.exists())
                signingConfigs.getByName("release")
            else
                signingConfigs.getByName("debug")
            // Phase 1.3 — Release'da R8 obfuscation + Sentry mapping yuklash
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

flutter {
    source = "../.."
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1.3 — SENTRY ANDROID NDK + R8 MAPPING
// ─────────────────────────────────────────────────────────────────────────────
//
// NIMA QILADI:
//   1. Native Android crash'lar (NDK, signal SIGSEGV, OOM kill) Sentry'ga yuboradi
//   2. R8/ProGuard mapping faylini yuklaydi — stack trace o'qiladigan bo'ladi
//   3. .so fayllar debug simvolar'ini yuklaydi — native frame'lar bilan
//
// NIMA UCHUN KERAK:
//   sentry_flutter paketi (Phase 0.1) Dart exception'larni ushlaydi, lekin
//   native Android crash'lar (masalan, video/audio kodek xato, OOM kill,
//   3rd-party native kutubxonalar xatolari) Dart darajasiga yetib bormaydi.
//   Bu plugin native qatlamda ushlab, Sentry'ga yuboradi.
//
// SOZLASH (foydalanuvchi qiladi):
//   1. https://sentry.io/settings/account/api/auth-tokens/
//      → Create New Token → scope: project:releases
//   2. android/sentry.properties faylini yarating (sentry.properties.example dan)
//      defaults.url=https://sentry.io/
//      defaults.org=<sizning org>
//      defaults.project=<flutter project>
//      auth.token=<token>
//   3. .gitignore'da — sentry.properties git'ga commit qilinmasin
//
// QACHON UPLOAD QILADI:
//   • flutter build apk --release  → R8 mapping + native symbols Sentry'ga
//   • flutter build appbundle      → xuddi shu
//   • flutter run --debug          → upload qilmaydi (debug uchun shart emas)
// ─────────────────────────────────────────────────────────────────────────────
// Sentry'ga upload faqat AUTH TOKEN mavjud bo'lganda bajariladi.
// Mahalliy build (token yo'q) → upload o'tkazib yuboriladi, build muvaffaqiyatli.
// CI/release (SENTRY_AUTH_TOKEN env yoki android/sentry.properties bor) → yuklaydi.
val sentryUploadEnabled =
    !System.getenv("SENTRY_AUTH_TOKEN").isNullOrBlank() ||
        rootProject.file("sentry.properties").exists()

sentry {
    // R8/ProGuard mapping fayli — release crash trace'lari o'qiladigan bo'lishi uchun
    includeProguardMapping.set(true)
    autoUploadProguardMapping.set(sentryUploadEnabled)

    // Native debug symbols (NDK .so fayllari)
    // Native crash trace'lari "?" yo'q, real funksiya nomlari bilan keladi
    uploadNativeSymbols.set(sentryUploadEnabled)
    includeNativeSources.set(false)  // Source kod yuklamaymiz (xavfsizlik)

    // Auto-instrumentatsiya — kelajakda performance monitoring uchun foydali
    // Hozircha o'chirilgan (Phase 0.1 da app code'da kerakli joylar instrument qilingan)
    tracingInstrumentation {
        enabled.set(false)
    }

    // Debug build'da Sentry'ga upload qilmaymiz (mahalliy dev uchun shart emas)
    // Faqat release build (--release) yoki appbundle build'da uploads bo'ladi.
    autoInstallation {
        enabled.set(false)  // sentry_flutter o'rnatdi (pubspec.yaml)
    }
}
