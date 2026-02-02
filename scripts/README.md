# RELIEF Ticket リセールチケット自動購入Bot

RELIEF Ticket (https://relief-ticket.jp) のリセールチケットを自動で取得するためのBotです。

## 機能

1. **ページ監視**: 指定URLを高速でリフレッシュし、チケットが購入可能になったことを検知
2. **自動枚数選択**: プルダウンから指定した枚数を自動選択
3. **自動ボタンクリック**: 「購入手続きへ」ボタンを自動クリック
4. **長時間リトライ**: 他のユーザーが購入手続き中でも最大6分間粘り強くリトライ
5. **音声通知**: チケットが見つかったらビープ音で通知
6. **LINE通知**: スマホに通知を送信（外出中でも安心）
7. **セッション保持**: ログイン状態を保存して次回から自動ログイン
8. **公演フィルター**: 特定の日付・会場のみを対象に監視
9. **手動入力対応**: ボタンクリック後はブラウザが開いたまま、手動で入力を続行

## セットアップ

```bash
# 依存関係をインストール
npm install

# Playwrightのブラウザをインストール
npx playwright install chromium
```

## 使い方

### 1. 設定ファイルを編集

`scripts/ticket-bot-config.ts` を開いて、以下を設定：

```typescript
// 監視対象のURL
targetUrl: "https://relief-ticket.jp/events/artist/11/121",

// 枚数選択の設定
ticketQuantity: {
  mode: "any",                    // "any" | "preferred" | "exact"
  preferredList: ["2枚", "1枚"],  // サイトに表示されるテキストで指定
},
```

#### 枚数選択モードの説明

| モード | 説明 | 使用例 |
|--------|------|--------|
| `"any"` | どの枚数でもOK。最初に見つかった選択肢を選ぶ | とにかくチケットが欲しい時 |
| `"preferred"` | 優先順位に従って選択。リストの順番で試す | 2枚優先、なければ1枚でもOK |
| `"exact"` | 指定した枚数のみ購入。それ以外はスキップして待機継続 | 2枚セットで行きたい時 |

**重要**: `preferredList` にはサイトに表示される**実際のテキスト**（「1枚」「2枚」など）を指定してください。

#### 設定例

```typescript
// 例1: どの枚数でもOK（デフォルト）
ticketQuantity: {
  mode: "any",
  preferredList: ["2枚", "1枚"],
},

// 例2: 2枚を優先、なければ1枚
ticketQuantity: {
  mode: "preferred",
  preferredList: ["2枚", "1枚"],  // 2枚 > 1枚 の優先順位
},

// 例3: 2枚の時だけ購入（1枚の時はスキップして待機継続）
ticketQuantity: {
  mode: "exact",
  preferredList: ["2枚"],  // 2枚のみ
},

// 例4: 1枚の時だけ購入
ticketQuantity: {
  mode: "exact",
  preferredList: ["1枚"],  // 1枚のみ
},
```

### 2. Botを実行

```bash
# 通常モード（自動リフレッシュ）
npm run bot

# 待機モード（リフレッシュなし、JS更新を監視）
npm run bot:wait
```

### 3. ブラウザでログイン

Botを実行するとブラウザが開きます。**先にRELIEF Ticketにログインしてください。**

> **セッション保持機能**: 一度ログインすると、セッションが `session/` フォルダに保存されます。次回からは自動的にログイン状態が復元されます。

### 4. 待機

ログイン後、Botが自動的にページを監視します。  
チケットが購入可能になると：

1. 音が鳴る
2. 枚数が自動選択される
3. 「購入手続きへ」ボタンが自動クリックされる

### 5. 手動で購入手続き

ボタンクリック後の画面から、手動で情報を入力して購入を完了してください。

## モードの違い

| モード | コマンド | 説明 |
|--------|----------|------|
| 通常モード | `npm run bot` | ページを定期的にリフレッシュして監視（推奨） |
| 待機モード | `npm run bot:wait` | リフレッシュせず、ページ内のJS更新を監視 |

## 設定項目

### `ticket-bot-config.ts`

| 項目 | 説明 | 推奨値 |
|------|------|--------|
| `targetUrl` | 監視するページのURL | 対象公演のURL |
| `ticketQuantity` | 購入枚数 | "1", "2" など |
| `refreshInterval` | リフレッシュ間隔(ms) | 500〜2000 |
| `headless` | ブラウザ非表示 | `false`（手動入力のため） |

## セレクターの調整

サイトの構造が変わった場合は、`selectors` を調整してください：

```typescript
selectors: {
  // 購入可能を示す要素
  availabilityIndicator: 'button:has-text("購入手続きへ")',
  
  // 枚数選択のプルダウン
  quantityDropdown: 'select',
  
  // 購入ボタン
  purchaseButton: 'button:has-text("購入手続きへ")',
},
```

### セレクターの見つけ方

1. ブラウザでF12キーを押して開発者ツールを開く
2. 左上の矢印アイコン（要素選択）をクリック
3. ページ上の対象要素をクリック
4. HTMLから適切なセレクターを特定

## 追加機能の設定

### LINE通知

外出中でもチケット取得を通知できます。

1. [LINE Notify](https://notify-bot.line.me/my/) でアクセストークンを取得
2. `ticket-bot-config.ts` に設定：

```typescript
lineNotify: {
  enabled: true,  // 有効化
  accessToken: "YOUR_ACCESS_TOKEN",  // 取得したトークン
  notifyOn: {
    ticketFound: true,      // チケット発見時に通知
    purchaseSuccess: true,  // 購入権利獲得時に通知
  },
},
```

### 特定公演のフィルター

特定の日付・会場のチケットのみを対象にできます。

```typescript
targetPerformance: {
  enabled: true,  // 有効化
  filters: [
    "2026/02/05",  // 日付でフィルター
    "東京ドーム",   // 会場でフィルター
  ],
},
```

> 複数指定した場合は、すべての条件に一致する公演のみが対象になります。

### セッション保持

ログイン状態を保存して、次回から自動ログインできます。

```typescript
session: {
  saveSession: true,  // 有効化（デフォルト: true）
  sessionFile: "./session/relief-ticket-session.json",
},
```

> セッションは `session/` フォルダに保存されます。

## 注意事項

- **利用規約**: サイトの利用規約を確認し、自己責任でご利用ください
- **過度なアクセス**: リフレッシュ間隔を短くしすぎるとアクセス制限を受ける可能性があります
- **ログイン必須**: 購入にはRELIEF Ticketへのログインが必要です
- **成功保証なし**: 競争率が高い場合、Botを使っても購入できない場合があります

## トラブルシューティング

### ボタンがクリックされない

セレクターが合っていない可能性があります。ブラウザの開発者ツールで実際の要素を確認し、`ticket-bot-config.ts` のセレクターを調整してください。

### すぐに購入可能と判定される

`availabilityIndicator` のセレクターが適切でない可能性があります。購入不可能な状態と可能な状態で、HTML構造の違いを確認してください。

### アクセス制限を受けた

`refreshInterval` を長くしてください（2000ms以上推奨）。
