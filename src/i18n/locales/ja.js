/**
 * 日本語の文言。
 * index.html に書かれている文言は、この辞書と一致している必要がある
 * （test/i18n.test.js で照合している）。
 */
export default {
  /* ヘッダ */
  'header.file': '編集中のファイル',
  'header.dirty': '未保存の変更あり',
  'header.settings': '設定',
  'header.help': '使い方',

  /* ツールバー */
  'toolbar.region': '操作',
  'toolbar.open': '開く',
  'toolbar.save': '保存',
  'toolbar.undo': '戻す',
  'toolbar.redo': '進む',
  'toolbar.search': '検索',
  'toolbar.tools': 'ツール',
  'toolbar.copy': 'コピー',
  'toolbar.new': '新規',

  /* 検索と置換 */
  'search.region': '検索と置換',
  'search.query': '検索する文字列',
  'search.replacement': '置換後の文字列',
  'search.prev': '前を検索',
  'search.next': '次を検索',
  'search.close': '検索を閉じる',
  'search.replace': '置換',
  'search.replaceAll': 'すべて',
  'search.matchCase': 'Aa 区別',
  'search.wholeWord': '単語単位',
  'search.regex': '正規表現',
  'search.count': '{count} 件',
  'search.position': '{index} / {total}',
  'search.notFound': '見つかりませんでした',
  'search.noReplaceTarget': '置換対象が見つかりませんでした',
  'search.replaced': '{count} 件を置換しました',
  'search.invalidRegex': '正規表現が不正です: {detail}',

  /* 編集面 */
  'editor.label': 'テキスト編集',
  'editor.placeholder': 'ここにテキストを入力するか、「開く」からファイルを読み込んでください。',
  'editor.drop': 'ドロップしてファイルを開く',

  /* ステータスバー */
  'status.goToLine': '行へ移動',
  'status.encodingHint': '文字コード（押すと指定して開き直せます）',
  'status.newlineHint': '保存時の改行コード（押すと切り替わります）',
  'status.counts': '{lines} 行 / {chars} 文字',

  /* ファイル */
  'file.untitled': '無題.txt',
  'file.opened': '{name} を開きました（{encoding}・{size}）',
  'file.openFailed': '読み込みに失敗しました: {detail}',
  'file.largeConfirm': '{size} と大きなファイルです。動作が重くなることがあります。開きますか？',
  'file.binaryConfirm': 'バイナリファイルのようです（{reason}）。テキストとして開くと内容が壊れることがあります。開きますか？',
  'file.binaryReasonNul': '文字として読めないバイトを含みます',
  'file.binaryReasonControl': '制御文字が多く含まれます',
  'file.binaryReasonBroken': '文字コードとして解釈できない箇所が多くあります',
  'file.discardOpen': '未保存の変更があります。破棄して開きますか？',
  'file.discardNew': '未保存の変更があります。破棄して新規作成しますか？',
  'file.discardReopen': '未保存の変更があります。破棄して開き直しますか？',
  'file.noReopen': '開き直せるファイルがありません',
  'file.reopened': '{encoding} として読み直しました',
  'file.newlineChanged': '保存時の改行コードを {newline} にしました',

  /* 保存 */
  'save.title': '名前を付けて保存',
  'save.name': 'ファイル名',
  'save.rename': '別名',
  'save.renameHint': '末尾に連番を付ける',
  'save.encoding': '文字コード',
  'save.newline': '改行コード',
  'save.bom': 'BOM を付ける',
  'save.cancel': 'キャンセル',
  'save.download': 'ダウンロード',
  'save.pick': '保存先を選ぶ',
  'save.pickHint': '既存のファイルを選べば上書きできます',
  'save.overwrite': '上書き保存',
  'save.overwriteHint': '{name} を直接書き換えます',
  'save.noteChars': '{chars} 文字',
  'save.noteEncoding': '{encoding} で書き出します',
  'save.noteOriginal': '元は {encoding} でした',
  'save.done': '{name} をダウンロードしました',
  'save.savedTo': '{name} に保存しました',
  'save.overwritten': '{name} を上書きしました',
  'save.failed': '保存できませんでした: {detail}',
  'save.cancelled': '保存を取りやめました',
  'save.overwriteConfirm': '{name} の内容を書き換えます。元の内容は戻せません。続けますか？',
  'save.permissionDenied': '書き込みの許可が得られませんでした',
  'save.lossyNote': '保存したファイルでは、表せない文字が ? に置き換わっています。',

  /* 保存できない文字 */
  'loss.title': '保存できない文字があります',
  'loss.body': '{encoding} では次の文字を表せません。',
  'loss.more': 'ほか {count} 文字',
  'loss.explain': 'このまま保存すると ? に置き換わり、元の文字は失われます。',
  'loss.cancel': 'キャンセル',
  'loss.replace': '? に置き換えて保存',
  'loss.utf8': 'UTF-8 で保存',

  /* 下書きの復元 */
  'draft.title': '前回の続きがあります',
  'draft.body': '{name}（{time}）の編集内容が残っています。復元しますか？',
  'draft.restore': '復元する',
  'draft.discard': '破棄する',
  'draft.restored': '前回の編集内容を復元しました',

  /* コピー */
  'copy.all': '全文をコピーしました（{chars} 文字）',
  'copy.selection': '選択範囲をコピーしました（{chars} 文字）',
  'copy.empty': 'コピーする内容がありません',
  'copy.failed': 'コピーできませんでした',

  /* ツール */
  'tools.title': 'ツール',
  'tools.close': '閉じる',
  'group.text': 'テキスト',
  'group.line': '行の操作',
  'group.json': 'JSON',
  'group.file': 'ファイル',
  'group.other': 'その他',

  'cmd.json.format2': 'JSON を整形（スペース 2）',
  'cmd.json.format4': 'JSON を整形（スペース 4）',
  'cmd.json.formatTab': 'JSON を整形（タブ）',
  'cmd.json.minify': 'JSON を最小化',
  'cmd.json.minifyHint': '改行と空白を取り除く',
  'cmd.json.validate': 'JSON を検証',
  'cmd.json.validateHint': '内容は変えずに構文だけ確認する',
  'cmd.text.trimTrailing': '行末の空白を削除',
  'cmd.text.removeEmptyLines': '空行を削除',
  'cmd.line.sortAsc': '行を昇順で並べ替え',
  'cmd.line.sortDesc': '行を降順で並べ替え',
  'cmd.line.unique': '重複行を削除',
  'cmd.text.tabsToSpaces': 'タブ → 空白',
  'cmd.text.spacesToTabs': '行頭の空白 → タブ',
  'cmd.text.indent': 'インデントを深くする',
  'cmd.text.outdent': 'インデントを浅くする',
  'cmd.app.goto': '行へ移動',
  'cmd.app.reopen': '文字コードを指定して開き直す',
  'cmd.app.copy': '全文をコピー',

  'json.formatted': 'JSON を整形しました',
  'json.minified': 'JSON を最小化しました',
  'json.valid': 'JSON として正しい形式です',
  'json.error': 'JSON エラー: {detail}',
  'json.parseFailed': 'JSON として解析できません: {detail}',

  /* 設定 */
  'settings.title': '設定',
  'settings.language': '言語',
  'settings.theme': 'テーマ',
  'settings.themeAuto': '端末に合わせる',
  'settings.themeLight': 'ライト',
  'settings.themeDark': 'ダーク',
  'settings.fontSize': '文字サイズ',
  'settings.smaller': '小さく',
  'settings.larger': '大きく',
  'settings.tabSize': 'タブ幅',
  'settings.wrap': '長い行を折り返す',
  'settings.gutter': '行番号を表示（折り返しオフのとき）',
  'settings.insertSpaces': 'Tab キーでスペースを入力',
  'settings.autoIndent': '改行時にインデントを引き継ぐ',
  'settings.close': '閉じる',

  /* 文字コードを指定して開き直す */
  'reopen.title': '文字コードを指定して開き直す',
  'reopen.note': '読み込んだファイルを、選んだ文字コードで解釈し直します。編集内容は破棄されます。',
  'reopen.encoding': '文字コード',
  'reopen.cancel': 'キャンセル',
  'reopen.submit': '開き直す',

  /* 行へ移動 */
  'goto.title': '行へ移動',
  'goto.line': '行番号',
  'goto.cancel': 'キャンセル',
  'goto.submit': '移動',

  /* 使い方 */
  'help.title': 'InBrowser JustText',
  'help.lead': 'ブラウザだけでテキストをいじって保存するツールです。ファイルは端末の外に出ません。',
  'help.open': '端末内のテキストファイルを読み込みます。文字コードは自動判別します。',
  'help.save': '編集後の内容を別ファイルとしてダウンロードします。元のファイルは変更しません。',
  'help.overwrite': '対応している環境では、保存先を選んで既存ファイルへ上書きすることもできます。',
  'help.search': '検索と置換。正規表現・単語単位・大文字小文字の区別を切り替えられます。',
  'help.tools': 'JSON の整形や行の並べ替えなど。',
  'help.status': '画面下の文字コードと改行コードは、押すと変更できます。',
  'help.pwa': 'ホーム画面に追加するとアプリとして起動でき、オフラインでも使えます。',
  'help.share': 'Android の「共有」メニューからこのアプリを選ぶと、そのファイルを直接開けます。',
  'help.shortcuts': 'キーボード操作: Ctrl+O 開く / Ctrl+S 保存 / Ctrl+F 検索 / Ctrl+G 行へ移動 / Ctrl+Z 戻す / Ctrl+Shift+Z 進む',
  'help.close': '閉じる',
  'help.version': 'バージョン {version}',

  /* 改行コード */
  'newline.lf': 'LF (Unix)',
  'newline.crlf': 'CRLF (Windows)',
  'newline.cr': 'CR (旧 Mac)',

  /* 共通 */
  'common.noChange': '変更はありませんでした',
  'common.commandFailed': '実行できませんでした: {detail}',
  'common.noscript': 'このツールは JavaScript を有効にしてお使いください。',

  /* 更新 */
  'update.available': '新しい版があります',
  'update.reload': '再読み込み',
};
