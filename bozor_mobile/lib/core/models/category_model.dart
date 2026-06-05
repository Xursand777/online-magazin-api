import 'package:json_annotation/json_annotation.dart';

part 'category_model.g.dart';

@JsonSerializable()
class CategoryModel {
  final int id;
  final String name;
  @JsonKey(name: 'icon_url')
  final String? iconUrl;
  @JsonKey(name: 'parent')
  final int? parentId;
  final List<CategoryModel>? children;

  CategoryModel({
    required this.id, 
    required this.name, 
    this.iconUrl,
    this.parentId,
    this.children,
  });

  factory CategoryModel.fromJson(Map<String, dynamic> json) => CategoryModel(
    id: (json['id'] as num?)?.toInt() ?? 0,
    name: json['name'] as String? ?? '',
    iconUrl: (json['icon_url'] ?? json['image']) as String?,
    parentId: (json['parent'] ?? json['parent_id']) as int?,
    children: (json['children'] as List<dynamic>?)
        ?.map((e) => CategoryModel.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
  Map<String, dynamic> toJson() => _$CategoryModelToJson(this);
}
