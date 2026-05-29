import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injection_container.dart';
import '../bloc/admin_bloc.dart';

/// Admin bo'limining umumiy "qobig'i".
///
/// • `AdminBloc`ni (mahsulot/kategoriya/banner CRUD) butun admin daraxtiga
///   ta'minlaydi — singleton, sahifalar orasida bitta holatni baham ko'radi.
/// • CRUD natijalarini (muvaffaqiyat / xato) global SnackBar orqali ko'rsatadi.
///
/// Har bir admin sahifasi o'z `Scaffold`iga ega bo'lib, `drawer: AdminDrawer`
/// orqali saytdagidek yon-menyu (sidebar) navigatsiyasini taqdim etadi.
class AdminShell extends StatefulWidget {
  const AdminShell({super.key, required this.child});

  final Widget child;

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  late final AdminBloc _adminBloc;

  @override
  void initState() {
    super.initState();
    _adminBloc = sl<AdminBloc>();
    // Katalog ma'lumotlari hali yuklanmagan bo'lsa — bir marta yuklab olamiz.
    final s = _adminBloc.state;
    final empty =
        s.products.isEmpty && s.categories.isEmpty && s.banners.isEmpty;
    if (empty && !s.isLoading) {
      _adminBloc.add(LoadAdminData());
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return BlocProvider.value(
      value: _adminBloc,
      child: BlocListener<AdminBloc, AdminState>(
        listenWhen: (prev, curr) =>
            prev.successMessage != curr.successMessage ||
            prev.error != curr.error,
        listener: (context, state) {
          final messenger = ScaffoldMessenger.of(context);
          if (state.successMessage != null) {
            messenger
              ..hideCurrentSnackBar()
              ..showSnackBar(
                _snack(
                  icon: Icons.check_circle_outline,
                  message: state.successMessage!,
                  color: const Color(0xFF0A7C55),
                ),
              );
          }
          if (state.error != null) {
            messenger
              ..hideCurrentSnackBar()
              ..showSnackBar(
                _snack(
                  icon: Icons.error_outline,
                  message: state.error!,
                  color: theme.colorScheme.error,
                ),
              );
          }
        },
        child: widget.child,
      ),
    );
  }

  SnackBar _snack({
    required IconData icon,
    required String message,
    required Color color,
  }) {
    return SnackBar(
      content: Row(
        children: [
          Icon(icon, color: Colors.white, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
        ],
      ),
      backgroundColor: color,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    );
  }
}
