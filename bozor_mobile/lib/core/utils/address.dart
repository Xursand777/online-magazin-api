/// address.dart — Yetkazib berish manzili bilan ishlash uchun yordamchilar.
///
/// SAYTDAGI utils/address.ts BILAN BIR XIL XULQ:
///   • parse/format — 4 maydon ↔ string
///   • addressFromNominatim — Nominatim API javobini parse
///   • reverseGeocode — Nominatim API chaqiruv
///
/// BACKEND MUVOFIQLIGI:
///   Backend `delivery_address` ni bitta matn (string) sifatida saqlaydi.
///   Frontend uni 4 maydonga ajratadi:
///     "Viloyat, Tuman/Shahar, Mahalla, Uy/Ko'cha"
library;

import 'dart:convert';
import 'package:dio/dio.dart';

/// Strukturalangan manzil — 4 ta maydon.
class StructuredAddress {
  final String viloyat;
  final String tumanShahar;
  final String mahalla;
  final String domUy;

  const StructuredAddress({
    this.viloyat = '',
    this.tumanShahar = '',
    this.mahalla = '',
    this.domUy = '',
  });

  static const empty = StructuredAddress();

  /// Strukturalangan manzilni bitta satrga yig'adi.
  /// Bo'sh maydonlarni o'tkazib yuboradi (vergullar to'g'ri qo'yiladi).
  String get full {
    return [viloyat, tumanShahar, mahalla, domUy]
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .join(', ');
  }

  StructuredAddress copyWith({
    String? viloyat,
    String? tumanShahar,
    String? mahalla,
    String? domUy,
  }) {
    return StructuredAddress(
      viloyat: viloyat ?? this.viloyat,
      tumanShahar: tumanShahar ?? this.tumanShahar,
      mahalla: mahalla ?? this.mahalla,
      domUy: domUy ?? this.domUy,
    );
  }

  /// Asosiy maydonlar to'ldirilganmi (viloyat + tuman + uy/ko'cha).
  bool get isValid =>
      viloyat.trim().isNotEmpty &&
      tumanShahar.trim().isNotEmpty &&
      domUy.trim().isNotEmpty;

  /// Hech qanday maydon to'ldirilmaganmi?
  bool get isEmpty =>
      viloyat.trim().isEmpty &&
      tumanShahar.trim().isEmpty &&
      mahalla.trim().isEmpty &&
      domUy.trim().isEmpty;

  /// String'dan parse (backend'dan kelgan manzilni 4 maydonga ajratish).
  ///
  /// Algoritm:
  ///   • Bo'sh bo'lsa — empty
  ///   • 4+ qism: birinchi 3 ta alohida, qolgani domUy'ga birlashadi
  ///   • Kam qism: imkon qadar to'ldiradi
  static StructuredAddress parse(String? full) {
    if (full == null || full.trim().isEmpty) return empty;
    final parts = full
        .split(',')
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return empty;

    if (parts.length >= 4) {
      return StructuredAddress(
        viloyat: parts[0],
        tumanShahar: parts[1],
        mahalla: parts[2],
        domUy: parts.sublist(3).join(', '),
      );
    }
    return StructuredAddress(
      viloyat: parts.isNotEmpty ? parts[0] : '',
      tumanShahar: parts.length > 1 ? parts[1] : '',
      mahalla: parts.length > 2 ? parts[2] : '',
      domUy: '',
    );
  }
}

/// Nominatim API javobining `address` maydon strukturasi.
class NominatimAddress {
  final String? state;
  final String? region;
  final String? province;
  final String? city;
  final String? cityDistrict;
  final String? district;
  final String? county;
  final String? town;
  final String? suburb;
  final String? neighbourhood;
  final String? residential;
  final String? village;
  final String? hamlet;
  final String? road;
  final String? street;
  final String? houseNumber;
  final String? building;

  const NominatimAddress({
    this.state,
    this.region,
    this.province,
    this.city,
    this.cityDistrict,
    this.district,
    this.county,
    this.town,
    this.suburb,
    this.neighbourhood,
    this.residential,
    this.village,
    this.hamlet,
    this.road,
    this.street,
    this.houseNumber,
    this.building,
  });

  factory NominatimAddress.fromJson(Map<String, dynamic> json) {
    return NominatimAddress(
      state: json['state'] as String?,
      region: json['region'] as String?,
      province: json['province'] as String?,
      city: json['city'] as String?,
      cityDistrict: json['city_district'] as String?,
      district: json['district'] as String?,
      county: json['county'] as String?,
      town: json['town'] as String?,
      suburb: json['suburb'] as String?,
      neighbourhood: json['neighbourhood'] as String?,
      residential: json['residential'] as String?,
      village: json['village'] as String?,
      hamlet: json['hamlet'] as String?,
      road: json['road'] as String?,
      street: json['street'] as String?,
      houseNumber: json['house_number'] as String?,
      building: json['building'] as String?,
    );
  }
}

/// Nominatim javobidan 4 maydonni to'ldirish.
/// Toshkent shahri uchun maxsus normalizatsiya — saytdagi bilan bir xil.
StructuredAddress addressFromNominatim(NominatimAddress addr) {
  var detectedViloyat = addr.state ?? addr.region ?? addr.province ?? '';

  // Toshkent shahri uchun maxsus normalizatsiya
  if (detectedViloyat.isEmpty &&
      (addr.city == 'Toshkent' || addr.city == 'Tashkent')) {
    detectedViloyat = 'Toshkent shahri';
  }
  final lowered = detectedViloyat.toLowerCase();
  if (lowered.contains('tashkent') || lowered.contains('toshkent')) {
    detectedViloyat = 'Toshkent shahri';
  }

  var detectedTuman = addr.cityDistrict ??
      addr.district ??
      addr.county ??
      addr.town ??
      addr.city ??
      '';
  if (detectedTuman == detectedViloyat) {
    detectedTuman = addr.cityDistrict ?? addr.district ?? '';
  }

  final detectedMahalla = addr.suburb ??
      addr.neighbourhood ??
      addr.residential ??
      addr.village ??
      addr.hamlet ??
      '';

  final road = addr.road ?? addr.street ?? '';
  final houseNo = addr.houseNumber ?? addr.building ?? '';
  final detectedDom = [road, houseNo]
      .where((s) => s.isNotEmpty)
      .join(' ');

  return StructuredAddress(
    viloyat: detectedViloyat,
    tumanShahar: detectedTuman,
    mahalla: detectedMahalla,
    domUy: detectedDom,
  );
}

/// Reverse geocoding — koordinatadan manzil olish (Nominatim API).
///
/// Til parametri ('uz' yoki 'ru') — Nominatim natijani lokalizatsiya qiladi.
/// Xato yoki nul javob → null.
///
/// MUHIM: Nominatim public servisi minutiga 1 ta so'rovni cheklamaydi, lekin
/// User-Agent header'i tavsiya etiladi. Production'da o'z proxy/cache kerak
/// bo'lishi mumkin (haftalik > 1M so'rov bo'lsa).
Future<NominatimAddress?> reverseGeocode(
  double lat,
  double lng, {
  String lang = 'uz',
  Duration timeout = const Duration(seconds: 10),
}) async {
  try {
    final dio = Dio(BaseOptions(
      connectTimeout: timeout,
      receiveTimeout: timeout,
      headers: {
        'User-Agent': 'BozorMobile/1.0 (https://online-magazin-api.vercel.app)',
      },
    ));
    final response = await dio.get(
      'https://nominatim.openstreetmap.org/reverse',
      queryParameters: {
        'lat': lat.toString(),
        'lon': lng.toString(),
        'format': 'json',
        'addressdetails': '1',
        'accept-language': lang,
      },
    );
    if (response.statusCode != 200) return null;

    // Ba'zan dio JSON'ni o'zi parse qiladi, ba'zan string qaytaradi
    final data = response.data is String
        ? jsonDecode(response.data as String) as Map<String, dynamic>
        : response.data as Map<String, dynamic>;
    final addrJson = data['address'] as Map<String, dynamic>?;
    if (addrJson == null) return null;
    return NominatimAddress.fromJson(addrJson);
  } catch (e) {
    // Tarmoq xato yoki timeout — null
    return null;
  }
}
