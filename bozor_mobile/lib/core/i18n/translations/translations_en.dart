/// English — all keys match translations_uz.dart structure.
const Map<String, String> translationsEn = {
  // ─── Navigation ──────────────────────────────────────────────────────────
  'nav.home': 'Home',
  'nav.catalog': 'Catalog',
  'nav.favorites': 'Favorites',
  'nav.cart': 'Cart',
  'nav.profile': 'Profile',

  // ─── Common ──────────────────────────────────────────────────────────────
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.retry': 'Retry',
  'common.loading': 'Loading...',
  'common.empty': 'Empty',
  'common.confirm': 'Confirm',
  'common.close': 'Close',
  'common.next': 'Next',
  'common.back': 'Back',
  'common.search': 'Search',
  'common.clear': 'Clear',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.remove': 'Remove',
  'common.total': 'Total',
  'common.done': 'Done',
  'common.success': 'Success',
  'common.understood': 'Got it',

  // ─── Auth ────────────────────────────────────────────────────────────────
  'auth.login': 'Sign in',
  'auth.logout': 'Sign out',
  'auth.logoutConfirm': 'Do you want to sign out?',
  'auth.phone': 'Phone number',
  'auth.phoneHint': '+998 90 123 45 67',
  'auth.password': 'Password',
  'auth.otp': 'Confirmation code',
  'auth.sendOtp': 'Send code',
  'auth.verifyOtp': 'Verify code',
  'auth.guest': 'Guest',
  'auth.guestGreeting': 'Hello, guest!',
  'auth.guestDescription':
      'Sign in to manage your orders and save favorite items',
  'auth.loginViaPhone': 'Via phone number in seconds',

  // ─── Home ────────────────────────────────────────────────────────────────
  'home.searchHint': 'Search products...',
  'home.searchHintFull': 'Products, brands or categories...',
  'catalog.loadError': 'Failed to load catalog',
  'catalog.noCategories': 'No categories found',
  'catalog.subcategoriesCount': '{count} subcategories',
  'common.error': 'Error',
  'home.categories': 'Categories',
  'home.discounts': 'Deals',
  'home.new': 'New arrivals',
  'home.popular': 'Popular',
  'home.recommended': 'Recommended for you',
  'home.recentlyViewed': 'Recently viewed',
  'home.viewAll': 'View all',

  // ─── Catalog ─────────────────────────────────────────────────────────────
  'catalog.title': 'Catalog',
  'catalog.allCategories': 'All categories',
  'catalog.empty': 'No products in this category',

  // ─── Cart ────────────────────────────────────────────────────────────────
  'cart.title': 'Cart',
  'cart.empty': 'Cart is empty',
  'cart.emptyDescription':
      'Add items from the home page to get started',
  'cart.goShopping': 'Start shopping',
  'cart.itemCount': '{count} items',
  'cart.subtotal': 'Items',
  'cart.delivery': 'Delivery',
  'cart.free': 'Free',
  'cart.totalAmount': 'Total amount',
  'cart.checkout': 'Checkout',
  'cart.removeAll': 'Clear cart',
  'cart.removeConfirm': 'Remove all items from the cart?',

  // ─── Checkout ────────────────────────────────────────────────────────────
  'checkout.title': 'Checkout',
  'checkout.receiverName': 'Full name',
  'checkout.receiverPhone': 'Phone number',
  'checkout.phoneLockedHint': 'Your login number — cannot be changed',
  'checkout.deliveryAddress': 'Delivery address',
  'checkout.addressHint': 'Region, district, street, house',
  'checkout.paymentType': 'Payment method',
  'checkout.cash': 'Cash',
  'checkout.card': 'Card',
  'checkout.credit': 'Installment',
  'checkout.cardSubtitle': 'Click / Payme (coming soon)',
  'checkout.creditDays': '{days} days',
  'checkout.creditDaysRange': '5 – 20 days',
  'checkout.creditInfo':
      'Installment is granted for 5 to 20 days. '
          'If you miss the due date, installment service will be blocked.',
  'checkout.confirmOrder': 'Confirm order',
  'checkout.totalPayable': 'Amount to pay:',
  'checkout.allFieldsRequired': 'Please fill in all fields',
  'checkout.phoneInvalid': 'Phone must be in +998XXXXXXXXX format',
  'checkout.orderSuccess': 'Order placed successfully!',
  'checkout.orderError': 'An error occurred',
  'checkout.masterOnlyHint':
      'Installment is for Masters only. Cash selected — please try again.',

  // ─── Profile ─────────────────────────────────────────────────────────────
  'profile.title': 'Profile',
  'profile.myOrders': 'My orders',
  'profile.favorites': 'Favorites',
  'profile.myAddress': 'My address',
  'profile.paymentMethods': 'Payment methods',
  'profile.settings': 'Settings',
  'profile.helpCenter': 'Help center',
  'profile.aboutApp': 'About app',
  'profile.editProfile': 'Edit profile',
  'profile.firstName': 'First name',
  'profile.lastName': 'Last name',
  'profile.required': 'Required',
  'profile.basicInfo': 'BASIC INFO',
  'profile.singleAddress':
      'Delivery address. Save it once and it will autofill at checkout.',
  'profile.unsavedChanges': 'Unsaved changes',
  'profile.discardChanges':
      'Your changes have not been saved. '
          'Are you sure you want to leave?',
  'profile.profileUpdated': 'Profile updated',

  // ─── Orders ──────────────────────────────────────────────────────────────
  'orders.title': 'My orders',
  'orders.empty': 'No orders',
  'orders.orderNumber': 'Order #{id}',
  'orders.status.pending': 'Pending',
  'orders.status.confirmed': 'Confirmed',
  'orders.status.packing': 'Packing',
  'orders.status.shipping': 'Shipping',
  'orders.status.delivered': 'Delivered',
  'orders.status.received': 'Received',
  'orders.status.cancelled': 'Cancelled',
  'orders.cancelOrder': 'Cancel order',

  // ─── Favorites ───────────────────────────────────────────────────────────
  'favorites.title': 'Favorites',
  'favorites.empty': 'No favorites yet',
  'favorites.emptyDescription':
      'Save items you like to find them easily later',

  // ─── Product ─────────────────────────────────────────────────────────────
  'product.addToCart': 'Add to cart',
  'product.buyNow': 'Buy now',
  'product.inStock': '{count} in stock',
  'product.outOfStock': 'Out of stock',
  'product.lowStock': 'Low stock',
  'product.description': 'Description',
  'product.specifications': 'Specifications',
  'product.variants': 'Variants',
  'product.reviews': 'Reviews',

  // ─── Settings ────────────────────────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageDescription':
      'Interface and product data language',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.themeSystem': 'System',
  'settings.notifications': 'Notifications',
  'settings.version': 'Version',

  // ─── Master + Credit ─────────────────────────────────────────────────────
  'master.title': 'Master status',
  'master.discountLabel': 'benefit strength',
  'master.baseDiscount': 'Base',
  'master.lowActivity': '(activity reduced)',
  'master.level': 'Level',
  'master.statusNew': 'NEW',
  'master.statusInactive': 'INACTIVE',
  'master.statusFull': 'FULL',
  'master.statusReduced': 'REDUCED',
  'master.firstPurchaseHint':
      'Your level grows from the first purchase',
  'master.todayPurchase': 'Purchased today — active!',
  'master.daysAgo': 'Last purchase {days} days ago',
  'master.longInactive':
      "It's been {days} days — purchase again to restore the level",

  'credit.title': 'Installment',
  'credit.available': 'Available to you',
  'credit.availableDescription':
      'Great! You can purchase with installment. '
          'Select 5–20 day term at checkout.',
  'credit.active': 'Active installment',
  'credit.activeDescription':
      'You have an unpaid installment order. '
          'Please pay within the due date.',
  'credit.overdue': 'Overdue',
  'credit.overdueDescription':
      'Your installment payment is overdue. '
          'Pay immediately — otherwise you will be blocked.',
  'credit.banned': 'Blocked',
  'credit.bannedDescription':
      'You have missed 3 payments. '
          'Installment is permanently disabled. '
          'Contact the store for help.',
  'credit.orderLabel': 'Order',
  'credit.dueLabel': 'Due',
  'credit.daysRemainingLabel': 'Remaining',
  'credit.daysOverdue': '{days} days overdue',
  'credit.today': 'Today!',
  'credit.tomorrow': 'Tomorrow',
  'credit.daysRemaining': '{days} days left',
  'credit.totalOverdue': 'Total overdue: ',
  'credit.viewOrder': 'View order',

  // ─── Errors ──────────────────────────────────────────────────────────────
  'error.network': 'No internet connection',
  'error.server': 'Server error',
  'error.unknown': 'Unknown error',
  'error.tryAgain': 'Try again',

  // ─── Coming soon ─────────────────────────────────────────────────────────
  'comingSoon.badge': 'COMING SOON',
  'comingSoon.notify':
      'Follow updates on App Store or Google Play.',

  // ─── About ───────────────────────────────────────────────────────────────
  'about.description':
      '700Mobile — online marketplace in Uzbekistan. '
          'Products, deals, and fast delivery all in one place.',
  'about.copyright': '© 2026 700Mobile. All rights reserved.',
};
