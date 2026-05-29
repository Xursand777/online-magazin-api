import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  // Server uxlab qolgan bo'lishi mumkinligi haqida ogohlantirish uchun timer
  Timer? _slowServerTimer;
  bool _showSlowServerHint = false;

  @override
  void dispose() {
    _slowServerTimer?.cancel();
    _phoneController.dispose();
    _otpController.dispose();
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
              context.go(state.isAdmin ? '/admin' : '/');
            } else if (state is AuthFailure) {
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
                          : 'Welcome Back',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      state is AuthOtpSent
                          ? 'We sent a verification code to +998 ${_phoneController.text}'
                          : 'Sign in to continue to your account.',
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
                          : _buildPhoneForm(theme, isLoading),
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
          // KRITIK: yuklanish paytida tugma o'chiriladi — bu foydalanuvchining
          // bir nechta marta bosib qo'yishini va serverga ortiqcha so'rovlarni
          // oldini oladi. Render cold start (50+ soniya) ga kuting.
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
