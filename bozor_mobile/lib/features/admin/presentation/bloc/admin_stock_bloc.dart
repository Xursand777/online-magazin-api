import 'package:bloc/bloc.dart';
import '../../data/models/admin_stock_model.dart';
import '../../data/repositories/admin_repository.dart';

// ─── Events ──────────────────────────────────────────────────────────────────

abstract class AdminStockEvent {}

class LoadAdminStock extends AdminStockEvent {}

class UpdateStockFilters extends AdminStockEvent {
  final int? minStock;
  final int? maxStock;
  final String? searchQuery;

  UpdateStockFilters({this.minStock, this.maxStock, this.searchQuery});
}

// ─── States ──────────────────────────────────────────────────────────────────

abstract class AdminStockState {
  final int minStock;
  final int maxStock;
  final String searchQuery;

  const AdminStockState({
    this.minStock = 0,
    this.maxStock = 10,
    this.searchQuery = '',
  });
}

class AdminStockInitial extends AdminStockState {
  const AdminStockInitial() : super();
}

class AdminStockLoading extends AdminStockState {
  const AdminStockLoading({super.minStock, super.maxStock, super.searchQuery});
}

class AdminStockLoaded extends AdminStockState {
  final AdminStockReport report;

  const AdminStockLoaded(
    this.report, {
    super.minStock,
    super.maxStock,
    super.searchQuery,
  });

  List<AdminStockItem> get filteredItems {
    final q = searchQuery.toLowerCase().trim();
    if (q.isEmpty) return report.items;
    return report.items.where((item) {
      return item.name.toLowerCase().contains(q) ||
          item.sku.toLowerCase().contains(q) ||
          (item.variantInfo?.toLowerCase().contains(q) ?? false);
    }).toList();
  }
}

class AdminStockError extends AdminStockState {
  final String message;
  const AdminStockError(this.message, {super.minStock, super.maxStock, super.searchQuery});
}

// ─── Bloc ────────────────────────────────────────────────────────────────────

class AdminStockBloc extends Bloc<AdminStockEvent, AdminStockState> {
  final AdminRepository repository;

  AdminStockBloc({required this.repository}) : super(const AdminStockInitial()) {
    on<LoadAdminStock>(_onLoad);
    on<UpdateStockFilters>(_onUpdateFilters);
  }

  Future<void> _onLoad(LoadAdminStock event, Emitter<AdminStockState> emit) async {
    emit(AdminStockLoading(
      minStock: state.minStock,
      maxStock: state.maxStock,
      searchQuery: state.searchQuery,
    ));
    try {
      final report = await repository.getAdminStockReport(
        minStock: state.minStock,
        maxStock: state.maxStock,
      );
      emit(AdminStockLoaded(
        report,
        minStock: state.minStock,
        maxStock: state.maxStock,
        searchQuery: state.searchQuery,
      ));
    } catch (e) {
      emit(AdminStockError(
        AdminRepository.parseError(e),
        minStock: state.minStock,
        maxStock: state.maxStock,
        searchQuery: state.searchQuery,
      ));
    }
  }

  Future<void> _onUpdateFilters(UpdateStockFilters event, Emitter<AdminStockState> emit) async {
    final min = event.minStock ?? state.minStock;
    final max = event.maxStock ?? state.maxStock;
    final search = event.searchQuery ?? state.searchQuery;

    // If limits changed, we need to fetch from server again
    if (min != state.minStock || max != state.maxStock) {
      emit(AdminStockLoading(minStock: min, maxStock: max, searchQuery: search));
      try {
        final report = await repository.getAdminStockReport(minStock: min, maxStock: max);
        emit(AdminStockLoaded(report, minStock: min, maxStock: max, searchQuery: search));
      } catch (e) {
        emit(AdminStockError(AdminRepository.parseError(e), minStock: min, maxStock: max, searchQuery: search));
      }
    } else {
      // Just local search update
      if (state is AdminStockLoaded) {
        emit(AdminStockLoaded((state as AdminStockLoaded).report, minStock: min, maxStock: max, searchQuery: search));
      } else if (state is AdminStockError) {
        emit(AdminStockError((state as AdminStockError).message, minStock: min, maxStock: max, searchQuery: search));
      } else {
        emit(AdminStockLoading(minStock: min, maxStock: max, searchQuery: search));
      }
    }
  }
}
