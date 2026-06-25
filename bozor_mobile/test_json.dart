import 'dart:convert';
void main() {
  try {
    var data = jsonDecode('{"lat": NaN}');
    print("Success: $data");
  } catch (e) {
    print("Error: $e");
  }
}
