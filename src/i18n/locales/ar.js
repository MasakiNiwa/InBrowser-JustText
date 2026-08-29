/**
 * Arabic strings.
 * Keys must match locales/en.js (checked by test/i18n.test.js).
 * This language is written right to left; the UI mirrors, the editing area stays left to right.
 */
export default {
  /* Header */
  'header.file': 'الملف الحالي',
  'header.dirty': 'تغييرات غير محفوظة',
  'header.settings': 'الإعدادات',
  'header.help': 'المساعدة',

  /* Toolbar */
  'toolbar.region': 'الإجراءات',
  'toolbar.open': 'فتح',
  'toolbar.save': 'حفظ',
  'toolbar.undo': 'تراجع',
  'toolbar.redo': 'إعادة',
  'toolbar.search': 'بحث',
  'toolbar.tools': 'أدوات',
  'toolbar.copy': 'نسخ',
  'toolbar.new': 'جديد',

  /* Find and replace */
  'search.region': 'البحث والاستبدال',
  'search.query': 'ابحث عن',
  'search.replacement': 'استبدل بـ',
  'search.prev': 'النتيجة السابقة',
  'search.next': 'النتيجة التالية',
  'search.close': 'إغلاق البحث',
  'search.replace': 'استبدال',
  'search.replaceAll': 'الكل',
  'search.matchCase': 'Aa حالة الأحرف',
  'search.wholeWord': 'كلمة كاملة',
  'search.regex': 'تعبير نمطي',
  'search.count': '{count} نتيجة',
  'search.position': '{index} / {total}',
  'search.notFound': 'لا توجد نتائج',
  'search.noReplaceTarget': 'لا شيء لاستبداله',
  'search.replaced': 'تم استبدال {count} موضعًا',
  'search.invalidRegex': 'التعبير النمطي غير صالح: {detail}',

  /* Editor */
  'editor.label': 'محرّر النصوص',
  'editor.placeholder': 'اكتب هنا، أو حمّل ملفًا من «فتح».',
  'editor.drop': 'أفلت ملفًا هنا لفتحه',

  /* Status bar */
  'status.goToLine': 'الانتقال إلى سطر',
  'status.encodingHint': 'ترميز المحارف (اضغط لإعادة الفتح بترميز آخر)',
  'status.newlineHint': 'نهاية السطر عند الحفظ (اضغط للتبديل)',
  'status.counts': '{lines} سطرًا / {chars} محرفًا',

  /* Files */
  'file.untitled': 'بدون-عنوان.txt',
  'file.opened': 'تم فتح {name} ({encoding}، {size})',
  'file.openFailed': 'تعذّرت قراءة الملف: {detail}',
  'file.largeConfirm': 'حجم هذا الملف {size} وقد يصبح التحرير بطيئًا. هل تريد فتحه على أي حال؟',
  'file.binaryConfirm': 'يبدو أنه ملف ثنائي ({reason}). فتحه كنص قد يُفسد محتواه. هل تريد فتحه على أي حال؟',
  'file.binaryReasonNul': 'يحتوي على بايتات لا يمكن قراءتها كنص',
  'file.binaryReasonControl': 'يحتوي على كثير من محارف التحكّم',
  'file.binaryReasonBroken': 'جزء كبير منه لا يمكن فكّ ترميزه بأي ترميز مدعوم',
  'file.discardOpen': 'هناك تغييرات غير محفوظة. هل تتجاهلها وتفتح ملفًا آخر؟',
  'file.discardNew': 'هناك تغييرات غير محفوظة. هل تتجاهلها وتبدأ ملفًا جديدًا؟',
  'file.discardReopen': 'هناك تغييرات غير محفوظة. هل تتجاهلها وتعيد فتح الملف؟',
  'file.noReopen': 'لا يوجد ملف لإعادة فتحه',
  'file.reopened': 'أُعيد فتحه بترميز {encoding}',
  'file.newlineChanged': 'نهاية السطر عند الحفظ: {newline}',

  /* Saving */
  'save.title': 'حفظ باسم',
  'save.name': 'اسم الملف',
  'save.rename': 'إعادة تسمية',
  'save.renameHint': 'يضيف رقمًا في النهاية',
  'save.encoding': 'ترميز المحارف',
  'save.newline': 'نهاية السطر',
  'save.bom': 'إضافة BOM',
  'save.cancel': 'إلغاء',
  'save.download': 'تنزيل',
  'save.pick': 'اختيار الموقع',
  'save.pickHint': 'اختر ملفًا موجودًا للكتابة فوقه',
  'save.overwrite': 'الكتابة فوقه',
  'save.overwriteHint': 'يكتب مباشرة في {name}',
  'save.noteChars': '{chars} محرفًا',
  'save.noteEncoding': 'سيُكتب بترميز {encoding}',
  'save.noteOriginal': 'كان أصلاً {encoding}',
  'save.done': 'تم تنزيل {name}',
  'save.savedTo': 'تم الحفظ في {name}',
  'save.overwritten': 'تمت الكتابة فوق {name}',
  'save.failed': 'تعذّر الحفظ: {detail}',
  'save.cancelled': 'أُلغي الحفظ',
  'save.overwriteConfirm': 'سيُستبدل محتوى {name} ولا يمكن استرجاع الأصل. هل تتابع؟',
  'save.permissionDenied': 'لم يُمنح إذن الكتابة في الملف',
  'save.lossyNote': 'في الملف المحفوظ، صارت المحارف التي تعذّر تمثيلها «؟».',

  /* Characters that cannot be saved */
  'loss.title': 'بعض المحارف لا يمكن حفظها',
  'loss.body': 'الترميز {encoding} لا يستطيع تمثيل المحارف التالية.',
  'loss.more': 'و{count} محرفًا آخر',
  'loss.explain': 'الحفظ هكذا يستبدلها بعلامة «؟» وتضيع المحارف الأصلية.',
  'loss.cancel': 'إلغاء',
  'loss.replace': 'الحفظ مع «؟»',
  'loss.utf8': 'الحفظ بترميز UTF-8',

  /* استعادة مسودة */
  'draft.title': 'عمل غير محفوظ من المرة السابقة',
  'draft.body': 'ما زالت تعديلات {name} من {time} موجودة. هل تستعيدها؟',
  'draft.restore': 'استعادة',
  'draft.discard': 'تجاهل',
  'draft.restored': 'تمت استعادة تعديلاتك غير المحفوظة',
  'draft.tooLarge': 'هذا المستند أكبر من أن نحتفظ له بمسودة. احفظ عملك بنفسك بين الحين والآخر.',
  'draft.failed': 'تعذّرت كتابة المسودة. احفظ عملك بنفسك بين الحين والآخر.',

  /* Clipboard */
  'copy.all': 'تم نسخ النص كاملاً ({chars} محرفًا)',
  'copy.selection': 'تم نسخ التحديد ({chars} محرفًا)',
  'copy.empty': 'لا يوجد ما يُنسخ',
  'copy.failed': 'تعذّر النسخ إلى الحافظة',

  /* Tools */
  'tools.title': 'أدوات',
  'tools.close': 'إغلاق',
  'group.text': 'نص',
  'group.line': 'الأسطر',
  'group.json': 'JSON',
  'group.file': 'ملف',
  'group.other': 'أخرى',
  'cmd.json.format2': 'تنسيق JSON (مسافتان)',
  'cmd.json.format4': 'تنسيق JSON (٤ مسافات)',
  'cmd.json.formatTab': 'تنسيق JSON (جدولة)',
  'cmd.json.minify': 'ضغط JSON',
  'cmd.json.minifyHint': 'يزيل الأسطر والمسافات',
  'cmd.json.validate': 'التحقق من JSON',
  'cmd.json.validateHint': 'يفحص البنية دون تغيير المحتوى',
  'cmd.text.trimTrailing': 'إزالة المسافات في نهاية الأسطر',
  'cmd.text.removeEmptyLines': 'إزالة الأسطر الفارغة',
  'cmd.line.sortAsc': 'ترتيب الأسطر تصاعديًا',
  'cmd.line.sortDesc': 'ترتيب الأسطر تنازليًا',
  'cmd.line.unique': 'إزالة الأسطر المكرّرة',
  'cmd.text.tabsToSpaces': 'جدولة ← مسافات',
  'cmd.text.spacesToTabs': 'المسافات في البداية ← جدولة',
  'cmd.text.indent': 'زيادة الإزاحة',
  'cmd.text.outdent': 'إنقاص الإزاحة',
  'cmd.app.goto': 'الانتقال إلى سطر',
  'cmd.app.reopen': 'إعادة الفتح بترميز آخر',
  'cmd.app.copy': 'نسخ الكل',
  'json.formatted': 'تم تنسيق JSON',
  'json.minified': 'تم ضغط JSON',
  'json.valid': 'هذا JSON صحيح',
  'json.error': 'خطأ في JSON: {detail}',
  'json.parseFailed': 'تعذّر تحليله كـ JSON: {detail}',

  /* Settings */
  'settings.title': 'الإعدادات',
  'settings.language': 'اللغة',
  'settings.theme': 'المظهر',
  'settings.themeAuto': 'حسب الجهاز',
  'settings.themeLight': 'فاتح',
  'settings.themeDark': 'داكن',
  'settings.fontSize': 'حجم الخط',
  'settings.smaller': 'تصغير',
  'settings.larger': 'تكبير',
  'settings.tabSize': 'عرض الجدولة',
  'settings.wrap': 'لفّ الأسطر الطويلة',
  'settings.gutter': 'إظهار أرقام الأسطر (عند إيقاف اللفّ)',
  'settings.insertSpaces': 'إدراج مسافات بمفتاح Tab',
  'settings.autoIndent': 'الحفاظ على الإزاحة في السطر الجديد',
  'settings.close': 'إغلاق',

  /* Reopen with another encoding */
  'reopen.title': 'إعادة الفتح بترميز آخر',
  'reopen.note': 'يعيد قراءة الملف المحمَّل بالترميز الذي تختاره. ستُفقد تعديلاتك.',
  'reopen.encoding': 'ترميز المحارف',
  'reopen.cancel': 'إلغاء',
  'reopen.submit': 'إعادة الفتح',

  /* Go to line */
  'goto.title': 'الانتقال إلى سطر',
  'goto.line': 'رقم السطر',
  'goto.cancel': 'إلغاء',
  'goto.submit': 'انتقال',

  /* Help */
  'help.title': 'InBrowser JustText',
  'help.lead': 'حرّر النص في المتصفح واحفظه، لا أكثر. ملفاتك لا تغادر جهازك أبدًا.',
  'help.open': 'يحمّل ملفًا نصيًا من جهازك، ويتعرّف على الترميز تلقائيًا.',
  'help.save': 'ينزّل النص المحرَّر كملف منفصل، ولا يمسّ الملف الأصلي.',
  'help.overwrite': 'حيث يدعم المتصفح ذلك، يمكنك أيضًا اختيار موقع والكتابة فوق ملف موجود.',
  'help.search': 'بحث واستبدال، مع التعابير النمطية ومطابقة الكلمة الكاملة وحالة الأحرف.',
  'help.tools': 'تنسيق JSON وترتيب الأسطر وغير ذلك.',
  'help.status': 'يمكن تغيير ترميز المحارف ونهاية السطر أسفل الشاشة بالضغط عليهما.',
  'help.pwa': 'أضِفه إلى الشاشة الرئيسية ليعمل كتطبيق، ويعمل أيضًا دون اتصال.',
  'help.share': 'على أندرويد، شارك ملفًا مع هذا التطبيق ليُفتح مباشرة.',
  'help.shortcuts': 'لوحة المفاتيح: Ctrl+O فتح / Ctrl+S حفظ / Ctrl+F بحث / Ctrl+G الانتقال إلى سطر / Ctrl+Z تراجع / Ctrl+Shift+Z إعادة',
  'help.close': 'إغلاق',
  'help.version': 'الإصدار {version}',

  /* Line endings */
  'newline.lf': 'LF (Unix)',
  'newline.crlf': 'CRLF (Windows)',
  'newline.cr': 'CR (ماك القديم)',

  /* Shared */
  'common.noChange': 'لم يتغيّر شيء',
  'common.commandFailed': 'تعذّر التنفيذ: {detail}',
  'common.noscript': 'يُرجى تفعيل JavaScript لاستخدام هذه الأداة.',

  /* التحديثات */
  'update.available': 'تتوفّر نسخة جديدة',
  'update.reload': 'إعادة التحميل',
};
