import 'package:json_annotation/json_annotation.dart';

part 'banner_model.g.dart';

@JsonSerializable()
class BannerModel {
  final int id;
  @JsonKey(name: 'image_url')
  final String imageUrl;
  final String? link;

  BannerModel({required this.id, required this.imageUrl, this.link});

  factory BannerModel.fromJson(Map<String, dynamic> json) => BannerModel(
    id: (json['id'] as num?)?.toInt() ?? 0,
    imageUrl: (json['image_url'] ?? json['image'] ?? '') as String,
    link: (json['link'] ?? json['link_url']) as String?,
  );
  Map<String, dynamic> toJson() => _$BannerModelToJson(this);
}
