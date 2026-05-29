import 'package:dio/dio.dart';

class MockInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.path.contains('/auth/send-otp')) {
      return handler.resolve(
        Response(
          requestOptions: options,
          statusCode: 200,
          data: {'success': true, 'message': 'OTP sent'},
        ),
      );
    }

    if (options.path.contains('/auth/verify')) {
      return handler.resolve(
        Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'tokens': {
              'access': 'mock_access_token',
              'refresh': 'mock_refresh_token',
            },
          },
        ),
      );
    }

    if (options.path.contains('/home/banners')) {
      return handler.resolve(
        Response(
          requestOptions: options,
          statusCode: 200,
          data: [
            {
              'id': 1,
              'imageUrl': 'https://picsum.photos/800/400?1',
              'linkUrl': '',
            },
            {
              'id': 2,
              'imageUrl': 'https://picsum.photos/800/400?2',
              'linkUrl': '',
            },
          ],
        ),
      );
    }

    if (options.path.contains('/categories')) {
      return handler.resolve(
        Response(
          requestOptions: options,
          statusCode: 200,
          data: [
            {'id': 1, 'name': 'Elektronika', 'iconUrl': '', 'parentId': null},
            {'id': 2, 'name': 'Kiyimlar', 'iconUrl': '', 'parentId': null},
            {'id': 3, 'name': 'Poyabzal', 'iconUrl': '', 'parentId': null},
          ],
        ),
      );
    }

    if (options.path.contains('/products')) {
      return handler.resolve(
        Response(
          requestOptions: options,
          statusCode: 200,
          data: [
            {
              'id': 1,
              'name': 'iPhone 15 Pro Max 256GB',
              'description': 'Eng yangi iPhone modeli ajoyib kamera bilan',
              'price': 14500000,
              'oldPrice': 15000000,
              'discountPercent': 5,
              'categoryId': 1,
              'imageUrl': 'https://picsum.photos/400/400?phone',
              'rating': 4.8,
            },
            {
              'id': 2,
              'name': 'Samsung Galaxy S24 Ultra',
              'description': 'Sun\'iy intellektga boy Samsung flahmani',
              'price': 13000000,
              'oldPrice': null,
              'discountPercent': null,
              'categoryId': 1,
              'imageUrl': 'https://picsum.photos/400/400?samsung',
              'rating': 4.9,
            },
            {
              'id': 3,
              'name': 'MacBook Pro M3 14"',
              'description': 'Kuchli protsessor va chiroyli ekran',
              'price': 25000000,
              'oldPrice': 27000000,
              'discountPercent': 7,
              'categoryId': 1,
              'imageUrl': 'https://picsum.photos/400/400?mac',
              'rating': 5.0,
            },
          ],
        ),
      );
    }

    handler.next(options);
  }
}
