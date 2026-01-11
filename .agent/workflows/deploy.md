---
description: random-generatorアプリをCloudflare Pagesにデプロイする方法
---

# デプロイワークフロー

## 重要：パス設定

このプロジェクトはCloudflare Pages（https://random-generator-8l7.pages.dev/）にデプロイされます。

**パス設定は必ず `/`（ルート）を使用すること：**

vite.config.js:
- `base: '/'`
- `start_url: '/'`
- `scope: '/'`
- `id: '/'`
- アイコンパス: `/icon-192.png`, `/icon-512.png`

## デプロイ手順

// turbo-all

1. 変更をコミット
```bash
git add .
git commit -m "変更内容の説明"
```

2. mainブランチにプッシュ
```bash
git push origin main
```

3. Cloudflare Pagesが自動的にデプロイを開始（1-2分で完了）

4. 確認URL: https://random-generator-8l7.pages.dev/

## PWA設定チェックリスト

- [ ] vite.config.jsのbaseが `/` になっている
- [ ] manifest内のstart_url, scope, idが `/` になっている
- [ ] アイコンパスが `/icon-192.png` 形式になっている
- [ ] index.htmlのアイコンリンクが `/` から始まっている

## 注意

- GitHub Pages（/random-generator/）とCloudflare Pages（/）ではパスが異なる
- このプロジェクトはCloudflare Pagesを使用するため、常に `/` パスを使用する
