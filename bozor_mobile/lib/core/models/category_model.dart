import 'package:json_annotation/json_annotation.dart';

part 'category_model.g.dart';

@JsonSerializable()
class CategoryModel {
  final int id;
  final String name;
  @JsonKey(name: 'icon_url')
  final String? iconUrl;

  CategoryModel({required this.id, required this.name, this.iconUrl});

  factory CategoryModel.fromJson(Map<String, dynamic> json) => CategoryModel(
    id: (json['id'] as num?)?.toInt() ?? 0,
    name: json['name'] as String? ?? '',
    iconUrl: (json['icon_url'] ?? json['image']) as String?,
  );
  Map<String, dynamic> toJson() => _$CategoryModelToJson(this);
}
