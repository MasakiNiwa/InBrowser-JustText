# InBrowser JustText

ブラウザだけでテキストをいじって保存する、それだけのツール。

Android の標準機能では JSON や設定ファイルのようなテキストを編集できないことが多く、
そのためだけにアプリを入れたくない、という動機で作っています。
ファイルは端末の外に出ません。読み込みも保存もすべてブラウザの中で完結します。

<p>
  <img src="docs/screenshot-light.png" alt="ライトテーマの画面" width="330">
  <img src="docs/screenshot-dark.png" alt="ダークテーマの画面" width="330">
</p>

## できること

- **開く** — 端末内のテキストファイルを読み込む。文字コードは自動判別（UTF-8 / Shift_JIS / EUC-JP / ISO-2022-JP / UTF-16 / Windows-1252）
- **編集** — 元に戻す・やり直す、行番号、折り返しの切り替え、Tab でのインデント、改行時のインデント引き継ぎ
- **検索と置換** — 大文字小文字の区別、単語単位、正規表現（`$1` などの後方参照つき）、一致件数の表示と該当箇所の強調
- **保存** — 別ファイルとしてダウンロード。文字コードと改行コード（LF / CRLF / CR）、BOM の有無を選べる
- **ツール** — JSON の整形・最小化・検証、行の並べ替え、重複行の削除、行末の空白削除など
- **オフライン動作** — ホーム画面に追加すれば、通信がなくても起動する
- **共有から起動** — Android の「共有」メニューからこのアプリを選ぶと、そのファイルを直接開ける

元のファイルを上書きすることはありません。編集結果は必ず新しいファイルとして書き出します。

## 使い方

### 公開する（GitHub Pages）

ビルドは不要です。リポジトリをそのまま配信すれば動きます。

1. GitHub のリポジトリの **Settings → Pages** を開く
2. **Source** を「Deploy from a branch」、**Branch** を `main` / `/ (root)` にして保存
3. 数分後に `https://<ユーザー名>.github.io/InBrowser-JustText/` で開けるようになる

### Android で使う

- 上の URL を Chrome で開き、メニューから **ホーム画面に追加** を選ぶと、アプリとして起動できるようになります（オフラインでも動きます）
- ファイル管理アプリなどでテキストファイルの **共有** から「JustText」を選ぶと、そのファイルを直接開けます
- 保存すると端末のダウンロードフォルダに保存されます。同名のファイルがあれば `名前 (1).json` のように別名で保存されます

### 手元で動かす

ES モジュールを使っているため `file://` では動きません。付属の簡易サーバを使ってください。

```
npm run serve      # http://localhost:8080/
```

## キーボード操作

| 操作 | キー |
| --- | --- |
| 開く | `Ctrl` + `O` |
| 保存 | `Ctrl` + `S` |
| 検索 | `Ctrl` + `F` |
| 行へ移動 | `Ctrl` + `G` |
| 元に戻す / やり直す | `Ctrl` + `Z` / `Ctrl` + `Shift` + `Z` |
| 次を検索 / 前を検索 | 検索欄で `Enter` / `Shift` + `Enter` |
| インデント / 逆インデント | `Tab` / `Shift` + `Tab` |
| 検索を閉じる | `Esc` |

ソフトキーボードには `Ctrl` がないため、主要な操作はすべて画面のボタンからも実行できます。

## 文字コードについて

読み込み時は BOM、エスケープシーケンス、バイト列の妥当性、日本語らしさの度合いを順に見て判定します。
判定を間違えたときは、画面下部の文字コード表示をタップして指定し直せます。

保存できる文字コードは UTF-8 / UTF-16 / Shift_JIS / EUC-JP / Windows-1252 です。
ブラウザ内蔵の変換表から逆引き表を組み立てているため、変換表のずれは起きません。
選んだ文字コードで表せない文字があるときは `?` に置き換え、どの文字が失われたかを画面に表示します。

ISO-2022-JP は読み込みのみ対応しています（保存時は他の文字コードを選んでください）。

## 開発

依存パッケージはありません。Node.js 22 以降で動きます。

```
npm test           # 単体テスト（文字コード判定・検索置換・履歴・行番号・ツール）
npm run serve      # 開発用サーバ
npm run test:browser   # ブラウザでの通し確認（要 Playwright）
```

ブラウザ側の確認には Playwright が必要です。

```
npm i -D playwright && npx playwright install chromium
```

### 構成

```
index.html            画面の骨格
styles/app.css        見た目
sw.js                 Service Worker（オフライン動作・共有の受け取り）
manifest.webmanifest  ホーム画面への追加、共有ターゲットの定義
src/
  core/               DOM に依存しない処理。単体テストの対象
    encoding.js         文字コードの判別とデコード
    encoder.js          テキスト → バイト列（保存用）
    newline.js          改行コードの判別と変換
    search.js           検索と置換
    history.js          元に戻す / やり直す
    position.js         オフセット ⇔ 行・桁
  io/                 ファイルの読み込み・ダウンロード・共有の受け取り
  ui/                 画面まわり（エディタ、検索パネル、設定など）
  tools/              編集コマンドと、その登録簿
  util/               小さな道具
```

`core/` は DOM を触らないため、Node からそのまま読み込んでテストできます。
機能を足すときも、判断のいる処理はここに置くと確認が楽になります。

### 編集機能を足す

コマンドは `src/tools/registry.js` に登録すると、ツールメニューに自動で並びます。
用途に応じて 3 通りの書き方があります。

```js
import { register } from './registry.js';

// 1. 選択行（無選択なら全文）を変換する
register({
  id: 'text.upper',
  group: 'text',
  label: '大文字にする',
  lineTransform: (text) => text.toUpperCase(),
});

// 2. 全文を変換する
register({
  id: 'text.reverse',
  group: 'text',
  label: '行を逆順にする',
  transform: (text) => text.split('\n').reverse().join('\n'),
});

// 3. カーソル移動や通知など、細かく制御する
register({
  id: 'text.count',
  group: 'text',
  label: '文字数を数える',
  run: (ctx) => ctx.notify(`${ctx.getText().length} 文字`),
});
```

`ctx` から使えるもの:

| 名前 | 内容 |
| --- | --- |
| `getText()` / `setText(text, opts)` | 本文の取得と差し替え（差し替えは履歴に 1 手として積まれる） |
| `getSelection()` / `setSelection(start, end, { reveal })` | 選択範囲。`reveal` を付けるとその位置まで移動する |
| `applyToSelectedLines(fn, label)` | 選択行だけに変換をかける |
| `notify(message, type)` | 画面下部にメッセージを出す（`type` に `'error'` を指定可） |
| `settings` / `indentUnit()` | タブ幅などの設定 |
| `document` | 開いているファイルの情報（名前、文字コード、改行コード） |

ファイルを新しく追加したときは、オフラインでも読めるよう `sw.js` の `APP_SHELL` にも追加し、
`VERSION` を上げてください。

### 設計上の判断

- 編集面は素の `<textarea>`。Android の IME・選択ハンドル・カーソル操作をそのまま使えるのが理由です。
  検索の強調表示は、同じ字送りで文字を重ねた「鏡」レイヤーで行っています
  （`src/ui/editor.js`。この 2 つの字送りがずれると強調位置がずれるため、CSS では必ず同じ値を使ってください）
- 行番号は折り返しをオフにしたときだけ表示します。折り返し中は「1 行 = 1 表示行」が崩れ、行番号が揃わないためです
- 元に戻す操作はブラウザ標準の undo に頼らず自前で持っています。ソフトキーボードには `Ctrl` + `Z` がないためです
- 検索の現在位置はパネル側で保持しています。フォーカスが検索欄にある間、
  ブラウザが `textarea` の選択範囲を巻き戻すことがあり、それに影響されないようにするためです

## ライセンス

MIT License
