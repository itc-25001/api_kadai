# フォーラムシステム（スレッドフロート型掲示板・REST API）

授業の期末制作課題用バックエンド。**Node.js互換のBun環境でTypeScriptを実行し、Express 5 / Prisma 7 / PostgreSQL 18 / argon2** を使用します。仕様は `docs/forum.yaml`（受領したOpenAPI定義）およびテーブル定義に準拠しています。

- **画面を表示するアプリではありません。** `http://localhost:3000/api/...` でJSONを返すREST APIです。
- 返信すると `Topic.updatedAt` を更新し、`GET /api/topic` で新しい順に並べることでスレッドが浮上します。
- すべてのIDは **UUID v7**（Prismaの `@default(uuid(7))`）です。
- パスワードは平文で保存せず、**argon2id** でハッシュ化します。
- 認証は `express-session` のCookieセッション方式です。未ログインの保護されたAPIはHTTP 401を返します。
- 削除は `deletedAt` をセットする**論理削除**です。

## 1. 環境と必須技術

| 指定技術 | 採用バージョン・役割 |
| --- | --- |
| TypeScript (Bun) | Bunで`.ts`を直接実行 |
| Express | **5.3.0** HTTP API |
| Prisma | **7.10.1** ORM / マイグレーション |
| PostgreSQL | **18.7**（`postgres:18.7-alpine`）DB |
| argon2 | ^0.45.2 / Argon2id |

> **バージョン指定について**：課題には `> 5.3.x`, `> 7.10.x`, `> 18.7` と表記されていますが、2026-11-18に確認できる安定版は Express 5.3.0、Prisma 7.10.1、PostgreSQL 18.7です。これらは同じ指定系列のバージョンです。採点者が `>` を**厳密な「より大きい」**として扱うか、**「指定バージョン以上」**の意図かは確認してください。厳密に`>18.7`の安定版は現時点で確認できません。

## 2. 最初に実行するコマンド

このプロジェクトは、以前の `message_board` と別フォルダに置いてください。**旧データベースをそのままマイグレーションするとIDの型が異なるため失敗します。** このサンプルでは独立DBとポート**5433**を使用し、既存の5432のDBに触れません。

```bash
cd forum_rest_api
cp .env.example .env
bun install
# DBだけDockerで起動
docker compose -f docker/compose.yaml up -d
# 既存のSQLマイグレーション適用
bun run db:deploy
# Prisma Clientの生成
bun run prisma:generate
# 型チェック
bun run typecheck
# APIサーバー起動
bun run dev
```

`http://localhost:3000/api/topic` に未ログインでアクセスすると `HTTP 401` と `errors` のJSONを返します。ログイン画面はありません。**APIへのPOST/PUT/DELETEはcurl、Bruno、Postmanなどで実行**します。

- `.env` はGitにpushしないこと。サンプルのDBパスワードとSESSION_SECRETは開発用です。
- `bun run db:deploy` が失敗したら、先に `docker compose -f docker/compose.yaml ps` でDB起動を確認してください。
- データベースの状態を確認：`docker compose -f docker/compose.yaml exec db psql -U forum -d forum -c '\dt'`
- 実行時の依存関係を入れ直したら `bun run prisma:generate` で生成し直してください。

## 3. REST API一覧

すべてのURLには `/api` が付きます。**認証を要するAPI**（下表の「要」）はログインCookieが必要です。

| メソッド | URL | 内容 | ログイン |
| --- | --- | --- | --- |
| POST | `/api/user/register` | ユーザー登録 | 不要 |
| POST | `/api/user/login` | ログイン | 不要 |
| PUT | `/api/user/change` | 名前・パスワード変更 | 要 |
| GET | `/api/topic?page=1` | トピック一覧（更新日時降順・5件/ページ） | 要 |
| POST | `/api/topic/create` | トピック作成と最初のメッセージ | 要 |
| GET | `/api/topic/:topic_id?page=1` | メッセージ一覧（5件/ページ） | 要 |
| POST | `/api/topic/:topic_id` | 返信を追加・トピック浮上 | 要 |
| PUT | `/api/topic/:topic_id` | タイトル編集（作成者のみ） | 要 |
| DELETE | `/api/topic/:topic_id` | トピック論理削除（作成者のみ） | 要 |
| PUT | `/api/post/:post_id` | メッセージ編集（投稿者のみ） | 要 |
| DELETE | `/api/post/:post_id` | メッセージ論理削除（投稿者のみ） | 要 |
| POST | `/api/user/logout` | ログアウト（追加機能） | 要 |

**レスポンス**：成功時は `{ "message": "OK" }`（エンドポイントによって `Changed!` / `deleted`）、失敗時は `{ "errors": [{ "name": "auth", "reason": "..." }] }` というJSONを返します。元のOpenAPI YAMLで詳細・形式を確認してください。

**主なHTTPステータス**：200 成功、201 トピック作成、400 バリデーション、401 未ログイン/ログイン失敗、403 他人の編集・削除、404 対象が存在しない。

## 4. curlによる操作例

### ユーザー登録

```bash
curl -i -X POST http://localhost:3000/api/user/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"taro@example.com","password":"password123","name":"Taro"}'
```

### ログイン（Cookieをファイルに保存）

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/user/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"taro@example.com","password":"password123"}'
```

### トピックを作る

```bash
curl -i -b cookies.txt -X POST http://localhost:3000/api/topic/create \
  -H 'Content-Type: application/json' \
  -d '{"title":"Javaの質問","message":"Javaの継承とは何ですか？"}'
```

レスポンスの `id` が **UUID v7** のトピックIDです。

### 一覧表示

```bash
curl -i -b cookies.txt 'http://localhost:3000/api/topic?page=1'
```

### 返信（IDは上で得た実際の値に置き換える）

```bash
curl -i -b cookies.txt -X POST 'http://localhost:3000/api/topic/ここにUUID' \
  -H 'Content-Type: application/json' \
  -d '{"message":"継承は既存クラスを引き継ぐ仕組みです。"}'
```

### 自動動作テスト

別のターミナルでサーバー起動中に実行します。**テスト用ユーザー・投稿がDBに残ります**。

```bash
bun run test:smoke
```

## 5. データベース構造

- **User**：`id UUIDv7`, `email VARCHAR(256) UNIQUE`, `password VARCHAR(192)` (Argon2id), `name VARCHAR(128) NULL`, `createdAt`, `deletedAt`
- **Topic**：`id UUIDv7`, `authorId UUID -> User.id`, `title VARCHAR(256)`, `createdAt`, `updatedAt`, `deletedAt`
- **Post**：`id UUIDv7`, `topicId UUID -> Topic.id`, `contributorId UUID -> User.id`, `message VARCHAR(512)`, `createdAt`, `updatedAt`, `deletedAt`

PostgreSQLには`DATETIME`という型名がないので、課題の「DATETIME」はタイムゾーンを管理できる `TIMESTAMPTZ(3)` として実装し、JSON出力ではISO 8601形式を使います。

### スレッドフロートの動作

1. `POST /api/topic/:topic_id` で返信を保存する。
2. 同一トランザクション内で `Topic.updatedAt` を現在日時に更新する。
3. 一覧取得時に `orderBy: updatedAt DESC` で並べ替える。
4. **返信で浮上**。タイトル編集でも`updatedAt`が変わるため浮上します。投稿編集・削除ではトピックは浮上しません。

## 6. 既存のDB版メッセージボードから変更した箇所と理由（提出用）

| 変更内容 | 理由 |
| --- | --- |
| 画面表示 (`Pug`) からJSON形式のREST APIに変更 | 今回の課題はバックエンドAPIの提出が目的だから |
| `User.id` の整数型からUUID v7に変更 | テーブル定義に合わせるため |
| `Topic` テーブルを追加 | 話題ごとにスレッドを管理するため |
| `Post` に `topicId`, `contributorId` を追加 | 投稿とトピック・投稿者を関連付けるため |
| `deletedAt` を各テーブルに追加 | 論理削除方式に対応するため |
| `/api/user/*`, `/api/topic/*`, `/api/post/*` にルーティングを分離 | 配布されたAPI仕様のURLとHTTPメソッドに合わせるため |
| `express-session` にユーザーIDだけを保持 | ログイン状態の維持と認証処理の分離のため |
| `/api/user/logout` を任意で追加 | 手元での動作検証が容易になるため |
| Docker DBポートを5433へ変更 | 講義の既存PostgreSQL（通常5432）との競合を避け、データ消失を防ぐため |
| Prismaのマイグレーションを独立DB用に新設 | 整数IDの既存DBに破壊的変更を加えないため |

## 7. ファイル構成

```text
forum_rest_api/
├── app.ts                       # Express起動・認証Cookie・エラーハンドラー
├── src/
│   ├── lib/
│   │   ├── db.ts                 # Prisma接続
│   │   ├── auth.ts               # ログイン必須ミドルウェア
│   │   └── http.ts               # バリデーション・JSONエラー
│   ├── routes/
│   │   ├── user.ts               # ユーザーAPI
│   │   ├── topic.ts              # トピックAPIとフロート
│   │   └── post.ts               # 投稿編集・削除
│   └── types/express-session.d.ts
├── prisma/schema.prisma         # 3テーブルの定義
├── prisma/migrations/           # DB初期化SQL
├── prisma7.config.ts            # Prisma 7 のCLI設定
├── docker/compose.yaml          # PostgreSQL 18.7
├── scripts/smoke.ts             # HTTP実動作テスト
├── docs/forum.yaml              # もとのOpenAPI仕様
└── .env.example                 # 環境変数の例
```

## 8. 安全性と注意点

- **採点・学習用のローカル構成**です。`express-session` 標準のMemoryStoreは本番運用向けではありません。公開する場合はPostgreSQL等の永続セッションストア、HTTPS、CSRF対策、ログイン試行制限、より堅牢な入力検証が必要です。
- Cookieセッションを使うので、curlは `-c` で保存、`-b` で送信してください。
- データベースの内容を消してしまう `docker compose down -v` は実行しないでください。
- 元の仕様の `/user/register` の400レスポンススキーマが `SimpleMessage` 参照なのにエラー例は `errors` 形式になっています。本実装ではサンプルに合わせて `errors` 形式に統一しました。
- `forum.yaml` のOpenAPIバージョンは配布物を変更せずそのまま保存しています。
- **このZIPは実装例です**。提出前にご自身の環境で `bun install` → DB起動 → `bun run db:deploy` → API起動 → テストを実行して動作確認してください。
