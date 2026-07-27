/// Русский язык — все ключи совпадают с translations_uz.dart.
const Map<String, String> translationsRu = {
  // ─── Navigation ──────────────────────────────────────────────────────────
  'nav.home': 'Главная',
  'nav.catalog': 'Каталог',
  'nav.favorites': 'Избранное',
  'nav.cart': 'Корзина',
  'nav.profile': 'Профиль',

  // ─── Common ──────────────────────────────────────────────────────────────
  'common.yes': 'Да',
  'common.no': 'Нет',
  'common.ok': 'ОК',
  'common.cancel': 'Отмена',
  'common.save': 'Сохранить',
  'common.retry': 'Повторить',
  'common.loading': 'Загрузка...',
  'common.empty': 'Пусто',
  'common.confirm': 'Подтвердить',
  'common.close': 'Закрыть',
  'common.next': 'Далее',
  'common.back': 'Назад',
  'common.search': 'Поиск',
  'common.clear': 'Очистить',
  'common.delete': 'Удалить',
  'common.edit': 'Редактировать',
  'common.add': 'Добавить',
  'common.remove': 'Убрать',
  'common.total': 'Итого',
  'common.done': 'Готово',
  'common.success': 'Успешно',
  'common.understood': 'Понятно',

  // ─── Auth ────────────────────────────────────────────────────────────────
  'auth.login': 'Войти',
  'auth.logout': 'Выйти',
  'auth.logoutConfirm': 'Вы хотите выйти из аккаунта?',
  'auth.phone': 'Номер телефона',
  'auth.phoneHint': '+998 90 123 45 67',
  'auth.password': 'Пароль',
  'auth.otp': 'Код подтверждения',
  'auth.sendOtp': 'Отправить код',
  'auth.verifyOtp': 'Подтвердить код',
  'auth.guest': 'Гость',
  'auth.guestGreeting': 'Здравствуйте, гость!',
  'auth.guestDescription':
      'Войдите в систему, чтобы управлять заказами и сохранять избранные товары',
  'auth.loginViaPhone': 'Через номер телефона за несколько секунд',

  // ─── Home ────────────────────────────────────────────────────────────────
  'home.searchHint': 'Поиск товаров...',
  'home.searchHintFull': 'Товары, бренды или категории...',
  'catalog.loadError': 'Не удалось загрузить каталог',
  'catalog.noCategories': 'Категории не найдены',
  'catalog.subcategoriesCount': '{count} подкатегорий',
  'common.error': 'Ошибка',
  'home.categories': 'Категории',
  'home.discounts': 'Скидки',
  'home.new': 'Новинки',
  'home.popular': 'Популярное',
  'home.recommended': 'Рекомендуем вам',
  'home.recentlyViewed': 'Вы смотрели',
  'home.viewAll': 'Все',

  // ─── Catalog ─────────────────────────────────────────────────────────────
  'catalog.title': 'Каталог',
  'catalog.allCategories': 'Все категории',
  'catalog.empty': 'В этой категории нет товаров',

  // ─── Cart ────────────────────────────────────────────────────────────────
  'cart.title': 'Корзина',
  'cart.empty': 'Корзина пуста',
  'cart.emptyDescription':
      'Чтобы начать, добавьте товары с главной страницы',
  'cart.goShopping': 'Начать покупки',
  'cart.itemCount': '{count} товаров',
  'cart.subtotal': 'Товары',
  'cart.delivery': 'Доставка',
  'cart.free': 'Бесплатно',
  'cart.totalAmount': 'Итоговая сумма',
  'cart.checkout': 'Оформить',
  // Окно приёма заказов (9:00–19:00)
  'orderWindow.title': 'Пока закрыто 🌙',
  'orderWindow.body':
      'Заказы принимаются ежедневно с {open} до {close}. '
          'Возвращайтесь в рабочее время — мы будем рады вас видеть! 💚',
  'orderWindow.gotIt': 'Понятно',
  'cart.removeAll': 'Очистить корзину',
  'cart.removeConfirm':
      'Вы хотите удалить все товары из корзины?',

  // ─── Checkout ────────────────────────────────────────────────────────────
  'checkout.title': 'Оформление',
  'checkout.receiverName': 'Имя и фамилия',
  'checkout.receiverPhone': 'Номер телефона',
  'checkout.phoneLockedHint': 'Ваш логин-номер — изменить нельзя',
  'checkout.deliveryAddress': 'Адрес доставки',
  'checkout.addressHint': 'Область, район, улица, дом',
  'checkout.paymentType': 'Способ оплаты',
  'checkout.cash': 'Наличные',
  'checkout.card': 'Банковская карта',
  'checkout.credit': 'Рассрочка',
  'checkout.cardSubtitle': 'Click / Payme (скоро)',
  'checkout.creditDays': '{days} дн.',
  'checkout.creditDaysRange': '5 – 20 дней',
  'checkout.creditInfo':
      'Рассрочка предоставляется на 5–20 дней. '
          'При просрочке услуга рассрочки блокируется.',
  'checkout.confirmOrder': 'Подтвердить заказ',
  'checkout.totalPayable': 'Сумма к оплате:',
  'checkout.allFieldsRequired': 'Заполните все поля',
  'checkout.phoneInvalid': 'Номер должен быть в формате +998XXXXXXXXX',
  'checkout.orderSuccess': 'Заказ успешно создан!',
  'checkout.orderError': 'Произошла ошибка',
  'checkout.masterOnlyHint':
      'Рассрочка только для Мастеров. Выбрана оплата наличными — попробуйте снова.',

  // ─── Profile ─────────────────────────────────────────────────────────────
  'profile.title': 'Профиль',
  'profile.myOrders': 'Мои заказы',
  'profile.favorites': 'Избранное',
  'profile.myAddress': 'Мой адрес',
  'profile.paymentMethods': 'Способы оплаты',
  'profile.settings': 'Настройки',
  'profile.helpCenter': 'Помощь',
  'profile.aboutApp': 'О приложении',
  'profile.editProfile': 'Редактировать профиль',
  'profile.firstName': 'Имя',
  'profile.lastName': 'Фамилия',
  'profile.required': 'Обязательно',
  'profile.basicInfo': 'ОСНОВНАЯ ИНФОРМАЦИЯ',
  'profile.singleAddress':
      'Адрес доставки. Сохранив однажды, '
          'он автоматически подставится при оформлении заказа.',
  'profile.unsavedChanges': 'Несохранённые изменения',
  'profile.discardChanges':
      'Введённые данные не сохранены. '
          'Хотите выйти без сохранения?',
  'profile.profileUpdated': 'Профиль обновлён',

  // ─── Orders ──────────────────────────────────────────────────────────────
  'orders.title': 'Мои заказы',
  'orders.empty': 'Нет заказов',
  'orders.orderNumber': 'Заказ №{id}',
  'orders.status.pending': 'Ожидание',
  'orders.status.confirmed': 'Подтверждён',
  'orders.status.packing': 'Упаковка',
  'orders.status.shipping': 'Доставка',
  'orders.status.delivered': 'Доставлен',
  'orders.status.received': 'Получен',
  'orders.status.cancelled': 'Отменён',
  'orders.cancelOrder': 'Отменить заказ',

  // ─── Favorites ───────────────────────────────────────────────────────────
  'favorites.title': 'Избранное',
  'favorites.empty': 'Список избранного пуст',
  'favorites.emptyDescription':
      'Добавляйте понравившиеся товары — потом легко найдёте',

  // ─── Product ─────────────────────────────────────────────────────────────
  'product.addToCart': 'В корзину',
  'product.buyNow': 'Купить сейчас',
  'product.inStock': '{count} шт. в наличии',
  'product.outOfStock': 'Нет в наличии',
  'product.lowStock': 'Заканчивается',
  'product.description': 'Описание',
  'product.specifications': 'Характеристики',
  'product.variants': 'Варианты',
  'product.reviews': 'Отзывы',

  // ─── Settings ────────────────────────────────────────────────────────────
  'settings.title': 'Настройки',
  'settings.language': 'Язык',
  'settings.languageDescription':
      'Язык интерфейса и данных о товарах',
  'settings.theme': 'Тема',
  'settings.themeLight': 'Светлая',
  'settings.themeDark': 'Тёмная',
  'settings.themeSystem': 'Системная',
  'settings.notifications': 'Уведомления',
  'settings.version': 'Версия',

  // ─── Master + Credit ─────────────────────────────────────────────────────
  'master.title': 'Статус Мастера',
  'master.discountLabel': 'сила привилегии',
  'master.baseDiscount': 'Базовая',
  'master.lowActivity': '(активность снижена)',
  'master.level': 'Уровень',
  'master.statusNew': 'НОВЫЙ',
  'master.statusInactive': 'НЕАКТИВНЫЙ',
  'master.statusFull': 'ПОЛНАЯ',
  'master.statusReduced': 'СНИЖЕНА',
  'master.firstPurchaseHint':
      'Уровень будет расти с первой покупки',
  'master.todayPurchase': 'Сегодня была покупка — активны!',
  'master.daysAgo': 'Покупали {days} дн. назад',
  'master.longInactive':
      'Прошло {days} дн. — купите снова, уровень восстановится',

  'credit.title': 'Рассрочка',
  'credit.available': 'Доступна вам',
  'credit.availableDescription':
      'Отлично! Вы можете оформить рассрочку. '
          'При заказе выбирается срок 5–20 дней.',
  'credit.active': 'Активная рассрочка',
  'credit.activeDescription':
      'У вас есть неоплаченный заказ в рассрочку. '
          'Нужно оплатить в установленный срок.',
  'credit.overdue': 'Просрочена',
  'credit.overdueDescription':
      'Срок оплаты рассрочки истёк. '
          'Срочно оплатите — иначе будете заблокированы.',
  'credit.banned': 'Заблокирована',
  'credit.bannedDescription':
      'Вы 3 раза просрочили оплату. '
          'Рассрочка постоянно заблокирована. '
          'Свяжитесь с магазином для решения.',
  'credit.orderLabel': 'Заказ',
  'credit.dueLabel': 'Срок',
  'credit.daysRemainingLabel': 'Осталось',
  'credit.daysOverdue': '{days} дн. просрочки',
  'credit.today': 'Сегодня!',
  'credit.tomorrow': 'Завтра',
  'credit.daysRemaining': '{days} дн. осталось',
  'credit.totalOverdue': 'Всего просрочек: ',
  'credit.viewOrder': 'Посмотреть заказ',

  // ─── Errors ──────────────────────────────────────────────────────────────
  'error.network': 'Нет подключения к интернету',
  'error.server': 'Ошибка сервера',
  'error.unknown': 'Неизвестная ошибка',
  'error.tryAgain': 'Попробуйте снова',

  // ─── Coming soon ─────────────────────────────────────────────────────────
  'comingSoon.badge': 'СКОРО',
  'comingSoon.notify':
      'Следите за обновлениями в App Store или Google Play.',

  // ─── About ───────────────────────────────────────────────────────────────
  'about.description':
      '700Mobile — онлайн-торговая платформа Узбекистана. '
          'Товары, скидки и быстрая доставка в одном месте.',
  'about.copyright': '© 2026 700Mobile. Все права защищены.',
};
