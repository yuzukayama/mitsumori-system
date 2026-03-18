# 技術仕様書：見積徴収管理システム

> **文書バージョン**: 1.0
> **最終更新日**: 2026-03-17
> **ステータス**: レビュー中

---

## 1. 技術スタック

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロントエンド | Next.js 15 (App Router) | React Server Components 活用 |
| スタイリング | Tailwind CSS 4 | ユーティリティファースト |
| UIコンポーネント | shadcn/ui | アクセシブルで統一感のあるUI |
| ORM | Prisma | 型安全なDB操作 |
| データベース | PostgreSQL (Cloud SQL) | db-f1-micro（最小構成） |
| 認証 | NextAuth.js (Auth.js v5) | Google OAuth Provider |
| ホスティング | Google Cloud Run | コンテナベース、従量課金 |
| メール送信 | Google Apps Script + Gmail | Workspace活用、追加コストなし |
| ファイル保存 | Google Drive API | Workspace 2TB/ユーザー |
| OCR (Phase 3) | Google Document AI | 従量課金（月1,000ページ無料） |
| 比較表出力 | ExcelJS | サーバーサイドでExcel生成 |

---

## 2. システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                        Cloud Run                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Next.js 15 (App Router)                  │  │
│  │                                                       │  │
│  │  /admin/*          管理画面（社内用）                    │  │
│  │    - Google OAuth 認証必須                              │  │
│  │    - 案件管理・見積依頼・比較表・会社マスタ               │  │
│  │                                                       │  │
│  │  /portal/[token]   協力会社ポータル（外部用）            │  │
│  │    - トークン認証（ログイン不要）                        │  │
│  │    - 見積入力・提出                                     │  │
│  │                                                       │  │
│  │  /api/*            API Routes                         │  │
│  │    - 見積データCRUD                                    │  │
│  │    - Excel出力                                        │  │
│  │    - ファイルアップロード                               │  │
│  └──────────────┬────────────────────────────────────────┘  │
│                 │                                           │
│  ┌──────────────▼───────┐  ┌────────────────────────────┐  │
│  │   Prisma ORM         │  │   Google APIs              │  │
│  │   ↓                  │  │   - Drive API（ファイル）    │  │
│  │   Cloud SQL          │  │   - Sheets API（比較表）    │  │
│  │   (PostgreSQL)       │  │   - Gmail API（通知）       │  │
│  └──────────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. データベース設計（主要エンティティ）

### 3.1 ER図（概要）

```
User (社内ユーザー)
 │
 ├── Project (案件)
 │    ├── EstimateRequest (見積依頼)
 │    │    ├── EstimateSheet (見積シート: 棟・エリア単位)
 │    │    │    └── EstimateItem (見積明細行)
 │    │    ├── EstimateHeader (見積情報: ヘッダー)
 │    │    ├── EstimateAttachment (添付ファイル)
 │    │    └── EstimateComment (差し戻しコメント)
 │    └── ComparisonTable (比較表)
 │
 ├── Partner (協力会社)
 │    └── PartnerContact (担当者)
 │
 └── Template (見積テンプレート)
      ├── TemplateSheet (テンプレートシート)
      └── TemplateItem (テンプレート明細行)
```

### 3.2 主要テーブル定義

#### Project（案件）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | PK |
| code | VARCHAR | 工事コード（例: 7720008） |
| name_internal | VARCHAR | 工事名称（社内用） |
| name_public | VARCHAR | 工事名称（公開用） |
| address | VARCHAR | 現場住所 |
| manager_id | UUID | FK → User |
| start_date | DATE | 着工日 |
| end_date | DATE | 竣工日 |
| total_area | DECIMAL | 延面積 |
| building_type | VARCHAR | 建物用途 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### Partner（協力会社）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | PK |
| name | VARCHAR | 会社名 |
| contact_name | VARCHAR | 担当者名 |
| email | VARCHAR | メールアドレス |
| phone | VARCHAR | 電話番号 |
| trade_types | VARCHAR[] | 対応工種（配列） |
| branch | ENUM | 東京 / 大阪 / 両方 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### EstimateRequest（見積依頼）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | PK |
| project_id | UUID | FK → Project |
| partner_id | UUID | FK → Partner |
| template_id | UUID | FK → Template |
| token | VARCHAR(64) | 暗号学的ランダムトークン |
| token_expires_at | TIMESTAMP | トークン有効期限 |
| status | ENUM | 未発行/依頼中/下書き中/提出済/確定/不採用/差し戻し |
| request_type | ENUM | sanwa_format / partner_format |
| deadline | DATE | 提出期限（依頼時に設定） |
| requested_at | TIMESTAMP | 依頼送信日時 |
| submitted_at | TIMESTAMP | 提出日時 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### EstimateItem（見積明細行）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | PK（システム自動採番 = 集計キー） |
| sheet_id | UUID | FK → EstimateSheet |
| sort_order | INTEGER | 表示順 |
| code | VARCHAR | 記号（空の場合あり） |
| name | VARCHAR | 名称 |
| spec | VARCHAR | 仕様 |
| quantity | DECIMAL(12,2) | 数量（小数点以下2桁） |
| unit | VARCHAR | 単位 |
| unit_price | INTEGER | 単価（整数のみ、協力会社入力） |
| amount | INTEGER | 金額 = floor(quantity × unit_price) |
| remarks | TEXT | 備考（協力会社入力） |
| is_added_by_partner | BOOLEAN | 協力会社が追加した行か |
| item_type | ENUM | normal / subtotal / welfare / expenses / adjustment |
| template_item_id | UUID | FK → TemplateItem（テンプレート元への参照） |

---

## 4. URL設計

### 4.1 管理画面（社内用） — Google OAuth必須

| パス | 機能 |
|------|------|
| `/admin` | ダッシュボード（進捗一覧） |
| `/admin/projects` | 案件一覧 |
| `/admin/projects/[id]` | 案件詳細 |
| `/admin/projects/[id]/requests` | 見積依頼一覧・一括発行 |
| `/admin/projects/[id]/comparison` | 比較表 |
| `/admin/partners` | 協力会社マスタ |
| `/admin/partners/new` | 協力会社新規登録 |
| `/admin/partners/import` | CSVインポート |
| `/admin/templates` | テンプレート管理 |

### 4.2 協力会社ポータル（外部用） — トークン認証

| パス | 機能 |
|------|------|
| `/portal/[token]` | 見積入力ポータルトップ |
| `/portal/[token]/edit` | 見積明細入力フォーム |
| `/portal/[token]/confirm` | 入力内容確認・提出 |

---

## 5. 主要機能の技術詳細

### 5.1 見積入力フォーム（協力会社向け）

**課題**: 電気設備テンプレートで1,091項目。通常のフォームでは動作が重くなる。

**対策**:
- **仮想スクロール** (TanStack Virtual): DOMに描画するのは画面に見える行のみ
- **セクション単位の折りたたみ**: 棟・エリアごとに折りたたみ可能
- **自動保存**: 入力中のデータを定期的に自動保存（下書き状態）
- **入力バリデーション**: 単価は整数のみ、リアルタイムで金額自動計算
- **一括ペースト対応**: Excelからのコピー&ペーストに対応（単価列）

### 5.2 比較表

**生成方式**:
1. チェックボックスで比較対象の会社を選択
2. 項目IDをキーに各社のデータを横並びに集計
3. パフォーマンスに応じてリアルタイムまたはボタンクリックで生成

**Excel出力**:
- ExcelJS を使用してサーバーサイドで生成
- 現在の比較表フォーマットに準拠した出力
- セル結合・書式設定を含む

### 5.3 トークン認証

```
トークン生成: crypto.randomBytes(32).toString('hex')
→ 64文字の暗号学的ランダム文字列
→ URL例: https://mitsumori.sanwa-kensetsu.co.jp/portal/a3f8c9...
→ 有効期限: 依頼の提出期限 + 7日間のバッファ
```

### 5.4 メール通知（GAS + Gmail）

- GAS側にWeb APIエンドポイントを作成
- Next.jsからGAS APIを呼び出してメール送信をトリガー
- テンプレートベースのメール本文（案件名・期限・URL含む）
- Gmail API の送信上限: 1,500通/日（Business Standard）

### 5.5 テンプレートのインポート

- ExcelファイルをアップロードしてParseし、DBに保存
- 「見積書兼出来高明細」シートの構造を自動認識
- 複数シート（棟・エリア）を自動的にEstimateSheetとして分割
- 「出来高明細」列は読み込まない（Phase 1スコープ外）

---

## 6. Google Workspace 連携詳細

| サービス | 用途 | 認証方式 |
|---------|------|---------|
| Google OAuth | 社内ユーザー認証 | OAuth 2.0 (Workspace domain制限) |
| Gmail (via GAS) | メール通知 | サービスアカウントまたはGASトリガー |
| Google Drive | ファイル保存 (Phase 2) | サービスアカウント |
| Google Sheets | 比較表出力 (Phase 1) | サービスアカウント |
| Document AI | OCR (Phase 3) | サービスアカウント |

---

## 7. インフラ構成

### 7.1 Google Cloud リソース

| リソース | 構成 | 月額目安 |
|---------|------|---------|
| Cloud Run | vCPU 1, メモリ 512MB, min-instances: 0 | ¥0〜500 |
| Cloud SQL | db-f1-micro, PostgreSQL 15, 10GB SSD | ¥3,000〜4,500 |
| Container Registry | Dockerイメージ保存 | ¥0〜100 |
| **合計** | | **¥3,000〜5,100** |

### 7.2 GCPプロジェクト

- プロジェクトID: `sgc-mitsumori-system`
- リージョン: `asia-northeast1`（東京）
- 有効API: Cloud Run, Cloud SQL, Container Registry

### 7.3 CI/CD

- GitHub Actions でCloud Runへ自動デプロイ
- `main` ブランチへのマージで本番デプロイ
- `develop` ブランチでステージング環境（将来的に）

---

## 8. セキュリティ

| 対策 | 実装 |
|------|------|
| 社内認証 | Google OAuth + Workspace ドメイン制限 |
| 協力会社アクセス | 暗号学的ランダムトークン（64文字）+ 有効期限 |
| HTTPS | Cloud Run標準（自動SSL） |
| CSRF対策 | Next.js組み込みCSRF保護 |
| SQLインジェクション | Prisma ORM（パラメータバインディング） |
| XSS | React自動エスケープ + CSP |
| レート制限 | Cloud Run / middleware でのリクエスト制限 |
| データ暗号化 | Cloud SQL の保存時暗号化（AES-256） |
| バックアップ | Cloud SQL自動バックアップ（日次、7世代保持） |

---

## 9. パフォーマンス要件と対策

| シナリオ | 目標 | 対策 |
|---------|------|------|
| 見積入力フォーム表示（1,000項目） | 2秒以内 | 仮想スクロール + ページネーション |
| 比較表生成（5社×1,000項目） | 5秒以内 | サーバーサイド集計 + キャッシュ |
| Excel出力 | 10秒以内 | サーバーサイド非同期生成 |
| 一括メール送信（100社） | 60秒以内 | GASキューイング + バッチ処理 |
| 自動保存（下書き） | 体感0秒 | デバウンス + 差分送信 |

---

## 10. ディレクトリ構成（予定）

```
mitsumori-system/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/              # 管理画面
│   │   │   ├── projects/
│   │   │   ├── partners/
│   │   │   ├── templates/
│   │   │   └── layout.tsx
│   │   ├── portal/             # 協力会社ポータル
│   │   │   └── [token]/
│   │   ├── api/                # API Routes
│   │   └── layout.tsx
│   ├── components/             # 共通コンポーネント
│   │   ├── ui/                 # shadcn/ui
│   │   ├── estimate/           # 見積関連
│   │   ├── comparison/         # 比較表関連
│   │   └── common/
│   ├── lib/                    # ユーティリティ
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── token.ts
│   │   └── excel.ts
│   └── types/                  # 型定義
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── gas/                        # Google Apps Script（メール通知用）
├── docs/                       # ドキュメント
├── Dockerfile
├── docker-compose.yml          # ローカル開発用
├── .env.example
└── package.json
```
