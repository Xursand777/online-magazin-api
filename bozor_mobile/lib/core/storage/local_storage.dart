import 'package:hive_flutter/hive_flutter.dart';

class LocalStorage {
  static const String cartBoxName = 'cartBox';
  static const String settingsBoxName = 'settingsBox';
  static const String searchHistoryBoxName = 'searchHistoryBox';

  static Future<void> init() async {
    // Open necessary boxes here
    await Hive.openBox(cartBoxName);
    await Hive.openBox(settingsBoxName);
    await Hive.openBox<String>(searchHistoryBoxName);
  }

  // Cart operations
  static Box get cartBox => Hive.box(cartBoxName);

  // Settings (Theme, etc)
  static Box get settingsBox => Hive.box(settingsBoxName);

  static bool get isDarkMode =>
      settingsBox.get('isDarkMode', defaultValue: false);
  static Future<void> setDarkMode(bool isDark) async =>
      await settingsBox.put('isDarkMode', isDark);

  // Search History
  static Box<String> get searchHistoryBox =>
      Hive.box<String>(searchHistoryBoxName);
}
