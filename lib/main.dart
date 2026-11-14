import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const VillageApp());
}

class VillageApp extends StatelessWidget {
  const VillageApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'قرية العبيدية',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true),
      home: const GameScreen(),
    );
  }
}

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> with WidgetsBindingObserver {
  late final WebViewController _controller;
  SharedPreferences? _prefs;
  String? _error;
  static const _saveKey = 'obd_v1';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      // نسخة احتياطية للحفظ على الجهاز إن تعذّر تخزين الصفحة نفسها
      ..addJavaScriptChannel('OBStore', onMessageReceived: (m) {
        _prefs?.setString(_saveKey, m.message);
      })
      ..setNavigationDelegate(NavigationDelegate(
        onWebResourceError: (e) {
          // نعرض الخطأ فقط إذا فشل تحميل الصفحة الرئيسية نفسها
          if (mounted && e.isForMainFrame == true) setState(() => _error = e.description);
        },
      ));
    _start();
  }

  // أولًا التفضيلات (اختياريًا)، ثم تحميل اللعبة في كل الأحوال
  Future<void> _start() async {
    try {
      _prefs = await SharedPreferences.getInstance();
    } catch (_) {
      _prefs = null;
    }
    await _loadGame();
  }

  // تحميل اللعبة مع حقن الحفظ داخل الصفحة قبل أي سكربت، فلا يوجد سباق مع بدء اللعبة
  Future<void> _loadGame() async {
    try {
      final html = await rootBundle.loadString('assets/game/index.html');
      final saved = _prefs?.getString(_saveKey);
      final inject = saved == null ? '' : '<script>window.__obSaved=${jsonEncode(saved)};</script>';
      await _controller.loadHtmlString(html.replaceFirst('<head>', '<head>$inject'));
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // زر الرجوع: يُمرَّر إلى اللعبة، ويخرج التطبيق إذا أجابت 'exit'
  Future<void> _onBack() async {
    try {
      final r = await _controller.runJavaScriptReturningResult(
          "window.__back ? window.__back() : 'exit'");
      if (r.toString().contains('exit')) {
        await SystemNavigator.pop();
      }
    } catch (_) {
      await SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _onBack();
      },
      child: _buildBody(),
    );
  }

  Widget _buildBody() {
    return Scaffold(
      backgroundColor: Colors.black,
      body: _error != null
          ? Center(
              child: Text(
                'تعذّر تحميل اللعبة\n$_error',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white),
              ),
            )
          : WebViewWidget(
              controller: _controller,
              gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer()),
              },
            ),
    );
  }
}