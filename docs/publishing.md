# 公開まわりの設定

コードでは設定できない、GitHub 側の項目をまとめています。

## リポジトリの About（右上の歯車から）

**Description**（どちらか）

```
ブラウザだけでテキストファイルを編集して保存するツール。検索・置換、文字コードの自動判別、オフライン対応。
```

```
Edit text files in your browser and save them — find & replace, encoding detection, offline, 15 languages.
```

**Website**

```
https://masakiniwa.github.io/InBrowser-JustText/
```

**Topics**

```
text-editor  pwa  offline-first  javascript  no-dependencies  encoding
shift-jis  android  find-and-replace  json-formatter  i18n  vanilla-js
```

「Releases」「Packages」のチェックは、Releases だけ残すと見やすくなります。

## GitHub Pages

**Settings → Pages** で、Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にします。
ビルドは不要で、リポジトリの中身がそのまま配信されます。

## リリースを切る

1. `CHANGELOG.md` に今回の内容を書く
2. `package.json` と `src/version.js` の版を揃えて上げる（`npm test` が食い違いを検出します）
3. タグを打って push する

   ```
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```

4. GitHub の **Releases → Draft a new release** でそのタグを選び、
   `CHANGELOG.md` の該当部分を本文に貼る

版の付け方は [セマンティック バージョニング](https://semver.org/lang/ja/) に沿っています。
使い方が変わらない修正は 0.2.1、機能が増えたら 0.3.0 とします。
