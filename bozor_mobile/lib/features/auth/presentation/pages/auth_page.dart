import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/di/injection_container.dart';
import '../bloc/auth_bloc.dart';

class AuthPage extends StatelessWidget {
  const AuthPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider<AuthBloc>.value(
      value: sl<AuthBloc>(),
      child: const AuthView(),
    );
  }
}

class AuthView extends StatefulWidget {
  const AuthView({super.key});

  @override
  State<AuthView> createState() => _AuthViewState();
}

class _AuthViewState extends State<AuthView> {
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _otpController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmPasswordController = TextEditingController();

  bool _isLogin = true;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _termsAccepted = false;

  // Server uxlab qolgan bo'lishi mumkinligi haqida ogohlantirish uchun timer
  Timer? _slowServerTimer;
  bool _showSlowServerHint = false;

  @override
  void dispose() {
    _slowServerTimer?.cancel();
    _phoneController.dispose();
    _otpController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _startSlowServerTimer() {
    _slowServerTimer?.cancel();
    setState(() => _showSlowServerHint = false);
    _slowServerTimer = Timer(const Duration(seconds: 8), () {
      if (mounted) setState(() => _showSlowServerHint = true);
    });
  }

  void _stopSlowServerTimer() {
    _slowServerTimer?.cancel();
    if (_showSlowServerHint) {
      setState(() => _showSlowServerHint = false);
    }
  }

  void _showTermsDialog(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        final theme = Theme.of(context);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  "Foydalanish shartlari va qoidalari",
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                const Expanded(
                  child: SingleChildScrollView(
                    child: Text(
                      "1. Umumiy shartlar:\n"
                      "Ushbu ilova orqali siz mahsulotlarni buyurtma qilishingiz va xarid qilishingiz mumkin. "
                      "Siz taqdim etgan barcha ma'lumotlar (telefon raqami, yetkazib berish manzili va h.k.) haqiqiy bo'lishi shart.\n\n"
                      "2. Maxfiylik siyosati:\n"
                      "Biz sizning shaxsiy ma'lumotlaringiz xavfsizligini ta'minlaymiz. Ma'lumotlaringiz uchinchi shaxslarga berilmaydi.\n\n"
                      "3. Buyurtmalarni rasmiylashtirish:\n"
                      "Savatga qo'shilgan mahsulotlar 3 kun davomida saqlanadi. Ro'yxatdan o'tgandan so'ng, savatcha server bilan sinxronlashtiriladi.\n\n"
                      "Keyinchalik bu yerga to'liq qoidalar yozib chiqiladi.",
                      style: TextStyle(height: 1.5),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text("Tushunarli"),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: BlocConsumer<AuthBloc, AuthState>(
          listener: (context, state) {
            if (state is AuthLoading) {
              _startSlowServerTimer();
            } else {
              _stopSlowServerTimer();
            }

            if (state is AuthAuthenticated) {
              _stopSlowServerTimer();
              if (state.isAdmin) {
                context.go('/admin');
              } else {
                // Foydalanuvchi muvaffaqiyatli kirganda doim Home (/) sahifasiga yo'naltiriladi
                context.go('/');
              }
            }

            if (state is AuthFailure) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(state.message),
                  backgroundColor: theme.colorScheme.error,
                  behavior: SnackBarBehavior.floating,
                ),
              );
            }
          },
          builder: (context, state) {
            final isLoading = state is AuthLoading;

            return Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Bozor',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.displayMedium?.copyWith(
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      state is AuthOtpSent
                          ? 'Verification Code'
                          : (_isLogin ? 'Welcome Back' : 'Akkaunt yaratish'),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      state is AuthOtpSent
                          ? 'We sent a verification code to +998 ${_phoneController.text}'
                          : (_isLogin 
                              ? 'Sign in to continue to your account.'
                              : 'Ro\'yxatdan o\'tgandan keyin telefon orqali tasdiqlaysiz.'),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 32),

                    Container(
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: theme.colorScheme.outlineVariant,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.05),
                            blurRadius: 24,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(24),
                      child: state is AuthOtpSent
                          ? _buildOtpForm(theme, state.debugCode, isLoading)
                          : (_isLogin
                              ? _buildPhoneForm(theme, isLoading)
                              : _buildRegisterForm(theme, isLoading)),
                    ),

                    // Server cold start ogohlantirishi
                    if (_showSlowServerHint && isLoading) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: theme.colorScheme.outlineVariant),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.info_outline,
                                size: 18,
                                color: theme.colorScheme.onSurfaceVariant),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                "Server uyg'onmoqda... Bu 30 soniyaga cho'zilishi mumkin.",
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildPhoneForm(ThemeData theme, bool isLoading) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Phone Number', style: theme.textTheme.labelSmall),
        const SizedBox(height: 8),
        Container(
          height: 48,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: theme.colorScheme.outlineVariant),
            color: theme.colorScheme.surfaceContainerLowest,
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  border: Border(
                    right: BorderSide(color: theme.colorScheme.outlineVariant),
                  ),
                  color: theme.colorScheme.surfaceContainerLow,
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.call,
                      size: 20,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Text('+998', style: theme.textTheme.bodyLarge),
                  ],
                ),
              ),
              Expanded(
                child: TextField(
                  controller: _phoneController,
                  enabled: !isLoading,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(9),
                  ],
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    hintText: '90 123 45 67',
                    contentPadding: EdgeInsets.symmetric(horizontal: 16),
                  ),
                  style: theme.textTheme.bodyLarge,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: isLoading
              ? null
              : () {
                  if (_phoneController.text.length == 9) {
                    context
                        .read<AuthBloc>()
                        .add(SendOtpEvent(_phoneController.text));
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text(
                            "Telefon raqami 9 ta raqamdan iborat bo'lishi kerak"),
                        backgroundColor: theme.colorScheme.error,
                      ),
                    );
                  }
                },
          child: isLoading
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : const Text('Continue'),
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: isLoading ? null : () => setState(() => _isLogin = false),
          child: Text(
            'Akkauntingiz yo\'qmi? Ro\'yxatdan o\'ting',
            style: TextStyle(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRegisterForm(ThemeData theme, bool isLoading) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Telefon raqami
        Text('Telefon raqami', style: theme.textTheme.labelSmall),
        const SizedBox(height: 8),
        Container(
          height: 48,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: theme.colorScheme.outlineVariant),
            color: theme.colorScheme.surfaceContainerLowest,
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  border: Border(
                    right: BorderSide(color: theme.colorScheme.outlineVariant),
                  ),
                  color: theme.colorScheme.surfaceContainerLow,
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.call,
                      size: 20,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Text('+998', style: theme.textTheme.bodyLarge),
                  ],
                ),
              ),
              Expanded(
                child: TextField(
                  controller: _phoneController,
                  enabled: !isLoading,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(9),
                  ],
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    hintText: '90 123 45 67',
                    contentPadding: EdgeInsets.symmetric(horizontal: 16),
                  ),
                  style: theme.textTheme.bodyLarge,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Parol
        Text('Parol', style: theme.textTheme.labelSmall),
        const SizedBox(height: 8),
        Container(
          height: 48,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: theme.colorScheme.outlineVariant),
            color: theme.colorScheme.surfaceContainerLowest,
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _passwordController,
                  enabled: !isLoading,
                  obscureText: _obscurePassword,
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    hintText: '••••••••',
                    contentPadding: EdgeInsets.symmetric(horizontal: 16),
                  ),
                  style: theme.textTheme.bodyLarge,
                ),
              ),
              IconButton(
                icon: Icon(
                  _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Parolni tasdiqlash
        Text('Parolni tasdiqlang', style: theme.textTheme.labelSmall),
        const SizedBox(height: 8),
        Container(
          height: 48,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: theme.colorScheme.outlineVariant),
            color: theme.colorScheme.surfaceContainerLowest,
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _confirmPasswordController,
                  enabled: !isLoading,
                  obscureText: _obscureConfirmPassword,
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    hintText: '••••••••',
                    contentPadding: EdgeInsets.symmetric(horizontal: 16),
                  ),
                  style: theme.textTheme.bodyLarge,
                ),
              ),
              IconButton(
                icon: Icon(
                  _obscureConfirmPassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                onPressed: () => setState(() => _obscureConfirmPassword = !_obscureConfirmPassword),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Shartlar va qoidalar checkbox
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Checkbox(
              value: _termsAccepted,
              activeColor: theme.colorScheme.primary,
              onChanged: isLoading
                  ? null
                  : (val) {
                      setState(() {
                        _termsAccepted = val ?? false;
                      });
                    },
            ),
            Expanded(
              child: RichText(
                text: TextSpan(
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  children: [
                    TextSpan(
                      text: 'Shartlar va qoidalar',
                      style: TextStyle(
                        color: Colors.green.shade600,
                        fontWeight: FontWeight.bold,
                        decoration: TextDecoration.underline,
                      ),
                      recognizer: TapGestureRecognizer()
                        ..onTap = () {
                          _showTermsDialog(context);
                        },
                    ),
                    const TextSpan(text: ' ga roziman.'),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Ro'yxatdan o'tish tugmasi
        ElevatedButton(
          onPressed: isLoading
              ? null
              : () {
                  final phone = _phoneController.text.trim();
                  final password = _passwordController.text;
                  final confirm = _confirmPasswordController.text;

                  if (phone.length != 9) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text(
                            "Telefon raqami 9 ta raqamdan iborat bo'lishi kerak"),
                        backgroundColor: theme.colorScheme.error,
                      ),
                    );
                    return;
                  }
                  if (password.length < 6) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text("Parol kamida 6 ta belgidan iborat bo'lishi kerak"),
                        backgroundColor: theme.colorScheme.error,
                      ),
                    );
                    return;
                  }
                  if (password != confirm) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text("Kiritilgan parollar bir-biriga mos kelmadi"),
                        backgroundColor: theme.colorScheme.error,
                      ),
                    );
                    return;
                  }
                  if (!_termsAccepted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text("Davom etish uchun shartlar va qoidalarga rozi bo'ling"),
                        backgroundColor: theme.colorScheme.error,
                      ),
                    );
                    return;
                  }

                  context.read<AuthBloc>().add(RegisterEvent(
                        phone: phone,
                        password: password,
                        confirmPassword: confirm,
                        termsAccepted: _termsAccepted,
                      ));
                },
          child: isLoading
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : const Text('Ro\'yxatdan o\'tish'),
        ),
        const SizedBox(height: 16),

        // Switch to login
        TextButton(
          onPressed: isLoading ? null : () => setState(() => _isLogin = true),
          child: Text(
            'Akkauntingiz bormi? Tizimga kirish',
            style: TextStyle(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildOtpForm(ThemeData theme, String? debugCode, bool isLoading) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (debugCode != null) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'Local OTP: $debugCode',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onPrimaryContainer,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
        TextField(
          controller: _otpController,
          enabled: !isLoading,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          maxLength: 6,
          style: theme.textTheme.displayMedium,
          decoration: InputDecoration(
            counterText: '',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: isLoading
              ? null
              : () {
                  final otp = _otpController.text.trim();
                  if (otp.length >= 4 && otp.length <= 6) {
                    context.read<AuthBloc>().add(
                          VerifyOtpEvent(_phoneController.text, otp),
                        );
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text(
                          "Kod 4 dan 6 tagacha raqamdan iborat bo'lishi kerak",
                        ),
                        backgroundColor: theme.colorScheme.error,
                      ),
                    );
                  }
                },
          child: isLoading
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : const Text('Verify & Login'),
        ),
      ],
    );
  }
}
