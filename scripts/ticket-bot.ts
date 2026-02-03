/**
 * RELIEF Ticket リセールチケット自動購入Bot
 * 
 * 機能：
 * 1. 指定URLを監視（高速リフレッシュ）
 * 2. 購入可能になったら枚数を選択
 * 3. 「購入手続きへ」ボタンをクリック
 * 4. その後の入力は手動で行う
 * 
 * 使い方：
 *   npm run bot          -- 通常モード（自動リフレッシュ）
 *   npm run bot:wait     -- 待機モード（リフレッシュなし）
 * 
 * 重要：
 *   - 実行前にブラウザでRELIEF Ticketにログインしておく必要があります
 *   - セレクターは実際のサイト構造に合わせて調整してください
 */

import { chromium, firefox, webkit, Browser, Page, BrowserContext } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { config as dotenvConfig } from "dotenv";
import { config } from "./ticket-bot-config";

// 環境変数を読み込み
dotenvConfig();

// コンソール出力用のユーティリティ（色付き）
const log = {
  info: (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`),
  error: (msg: string) => console.error(`\x1b[31m[ERROR]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`),
  warn: (msg: string) => console.warn(`\x1b[33m[WARN]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`),
  highlight: (msg: string) => console.log(`\x1b[35m[!!!!]\x1b[0m ${new Date().toLocaleTimeString()} - ${msg}`),
};

// 音声通知（Windows用）- 複数回ビープ
async function playNotification() {
  try {
    const { exec } = await import("child_process");
    // 3回ビープ音を鳴らす
    exec('powershell -Command "[console]::beep(1500,300);[console]::beep(1500,300);[console]::beep(1500,300)"');
  } catch {
    // 通知失敗しても続行
  }
}

// ============================================
// Discord通知
// ============================================

async function sendDiscordNotify(message: string, urgent: boolean = false): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    return false;
  }
  
  try {
    // 緊急時は@everyoneでメンション
    const content = urgent ? `@everyone\n${message}` : message;
    
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: content,
        username: "チケットBot",
      }),
    });
    
    if (response.ok) {
      log.info("Discord通知を送信しました");
      return true;
    } else {
      log.warn(`Discord通知の送信に失敗: ${response.status}`);
      return false;
    }
  } catch (error) {
    log.warn(`Discord通知エラー: ${error}`);
    return false;
  }
}

// ============================================
// LINE通知（廃止予定）
// ============================================

async function sendLineNotify(message: string): Promise<boolean> {
  // 環境変数または設定ファイルからトークンを取得
  const token = process.env.LINE_NOTIFY_TOKEN || config.lineNotify.accessToken;
  
  if (!config.lineNotify.enabled || !token) {
    return false;
  }
  
  try {
    const response = await fetch("https://notify-api.line.me/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Bearer ${token}`,
      },
      body: `message=${encodeURIComponent(message)}`,
    });
    
    if (response.ok) {
      log.info("LINE通知を送信しました");
      return true;
    } else {
      log.warn(`LINE通知の送信に失敗: ${response.status}`);
      return false;
    }
  } catch (error) {
    log.warn(`LINE通知エラー: ${error}`);
    return false;
  }
}

// ============================================
// セッション（ログイン状態）の保存/読み込み
// ============================================

// セッション保存の最終時刻
let lastSessionSaveTime = 0;
const SESSION_SAVE_INTERVAL = 60000; // 60秒に1回だけ保存

async function saveSession(context: BrowserContext, force = false): Promise<void> {
  if (!config.session.saveSession) return;
  
  // 強制保存でない場合、一定間隔でのみ保存
  const now = Date.now();
  if (!force && now - lastSessionSaveTime < SESSION_SAVE_INTERVAL) {
    return;
  }
  
  try {
    const sessionDir = dirname(config.session.sessionFile);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
    
    const storageState = await context.storageState();
    writeFileSync(config.session.sessionFile, JSON.stringify(storageState, null, 2));
    lastSessionSaveTime = now;
    
    if (force) {
      log.info(`セッションを保存しました: ${config.session.sessionFile}`);
    }
  } catch (error) {
    log.warn(`セッションの保存に失敗: ${error}`);
  }
}

function loadSession(): string | undefined {
  if (!config.session.saveSession) return undefined;
  
  try {
    if (existsSync(config.session.sessionFile)) {
      log.info(`保存済みセッションを読み込みます: ${config.session.sessionFile}`);
      return config.session.sessionFile;
    }
  } catch (error) {
    log.warn(`セッションの読み込みに失敗: ${error}`);
  }
  return undefined;
}

// ============================================
// 自動ログイン
// ============================================

async function checkLoginStatus(page: Page): Promise<boolean> {
  try {
    // ページのテキストを取得
    const pageText = await page.textContent('body') || "";
    
    // ログインボタンがある = 未ログイン
    const hasLoginButton = pageText.includes("ログイン") && !pageText.includes("ログアウト");
    
    // ログアウトボタンがある = ログイン済み
    const hasLogoutButton = pageText.includes("ログアウト");
    
    // Myページリンクがある = ログイン済み
    const hasMyPageLink = pageText.includes("Myページ") || pageText.includes("マイページ");
    
    const isLoggedIn = hasLogoutButton || hasMyPageLink;
    
    log.info(`ログイン状態チェック: ログアウトボタン=${hasLogoutButton}, Myページ=${hasMyPageLink}, ログインボタン=${hasLoginButton}`);
    
    return isLoggedIn && !hasLoginButton;
  } catch (error) {
    log.warn(`ログイン状態の確認に失敗: ${error}`);
    return false;
  }
}

async function autoLogin(page: Page): Promise<boolean> {
  const email = process.env.RELIEF_TICKET_EMAIL;
  const password = process.env.RELIEF_TICKET_PASSWORD;
  
  if (!email || !password) {
    log.warn("ログイン情報が設定されていません（.envファイルを確認してください）");
    log.info(`EMAIL: ${email ? "設定済み" : "未設定"}, PASSWORD: ${password ? "設定済み" : "未設定"}`);
    return false;
  }
  
  try {
    log.info("自動ログインを開始します...");
    
    // ログインページへ移動
    log.info("ログインリンクを探しています...");
    
    // ログインリンクを探してクリック
    const loginLink = await page.$('a:has-text("ログイン")');
    if (loginLink) {
      log.info("ログインリンクを見つけました。クリックします...");
      await loginLink.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
    } else {
      // ログインページのURLに直接アクセス
      log.info("ログインリンクが見つかりません。直接ログインページへ移動します...");
      await page.goto("https://my.relief-ticket.jp/login", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    }
    
    // 現在のURLを確認
    log.info(`現在のURL: ${page.url()}`);
    
    // ページ内の入力フィールドを探す
    log.info("ログインフォームを探しています...");
    
    // すべてのinput要素を確認
    const inputs = await page.$$('input');
    log.info(`入力フィールド数: ${inputs.length}`);
    
    // メールアドレス入力
    const emailInput = await page.$('input[type="email"], input[name="email"], input[id*="email"], input[placeholder*="メール"], input[placeholder*="mail"]');
    if (emailInput) {
      await emailInput.click();
      await emailInput.fill(email);
      log.success("メールアドレスを入力しました");
    } else {
      log.warn("メールアドレス入力欄が見つかりません");
      // 最初のテキスト入力欄を試す
      const firstInput = await page.$('input[type="text"], input:not([type])');
      if (firstInput) {
        await firstInput.fill(email);
        log.info("最初の入力欄にメールアドレスを入力しました");
      } else {
        return false;
      }
    }
    
    // パスワード入力
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.click();
      await passwordInput.fill(password);
      log.success("パスワードを入力しました");
    } else {
      log.warn("パスワード入力欄が見つかりません");
      return false;
    }
    
    // ログインボタンをクリック
    const loginButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("ログイン"), input[value="ログイン"]');
    if (loginButton) {
      log.info("ログインボタンをクリックします...");
      await loginButton.click();
    } else {
      log.warn("ログインボタンが見つかりません。Enterキーを押します...");
      await page.keyboard.press("Enter");
    }
    
    // ログイン完了を待機
    log.info("ログイン処理を待機中...");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    
    // ログイン後のURLを確認
    log.info(`ログイン後のURL: ${page.url()}`);
    
    // ログイン成功を確認
    const loginSuccess = await checkLoginStatus(page);
    if (loginSuccess) {
      log.success("ログインに成功しました！");
      return true;
    } else {
      log.warn("ログインに失敗した可能性があります");
      return false;
    }
    
  } catch (error) {
    log.error(`自動ログインに失敗: ${error}`);
    return false;
  }
}

// ブラウザを起動
async function launchBrowser(): Promise<Browser> {
  const browserType = {
    chromium,
    firefox,
    webkit,
  }[config.browser];

  log.info(`ブラウザを起動中... (${config.browser})`);
  
  return browserType.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  });
}

/**
 * 公演情報の型
 */
type PerformanceInfo = {
  element: any;     // 公演セクションの要素
  text: string;     // 公演情報のテキスト（日付、会場など）
  hasButton: boolean; // 購入ボタンがあるか
};

/**
 * 特定公演のフィルタリング
 * フィルターに一致する公演を見つける
 */
async function findTargetPerformance(page: Page): Promise<PerformanceInfo | null> {
  try {
    // ページ全体のテキストを取得して、フィルター条件に一致するか確認
    const pageText = await page.textContent('body') || "";
    
    // フィルターが有効な場合
    if (config.targetPerformance.enabled && config.targetPerformance.filters.length > 0) {
      // すべてのフィルター条件に一致するか確認
      const allFiltersMatch = config.targetPerformance.filters.every(filter => 
        pageText.includes(filter)
      );
      
      if (!allFiltersMatch) {
        return null; // フィルター条件に一致しない
      }
    }
    
    // 購入ボタンが存在するか確認
    const selectors = config.selectors.availabilityIndicator.split(", ");
    for (const selector of selectors) {
      const element = await page.$(selector.trim());
      if (element && await element.isVisible()) {
        return {
          element,
          text: pageText.substring(0, 200), // 最初の200文字
          hasButton: true,
        };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * 購入可能かチェック（フィルター対応版）
 */
async function checkAvailability(page: Page): Promise<boolean> {
  try {
    const performance = await findTargetPerformance(page);
    return performance !== null && performance.hasButton;
  } catch {
    return false;
  }
}

/**
 * プルダウンの選択肢情報（valueとtext）
 */
type OptionInfo = {
  value: string;  // 内部値（ハッシュ値など）
  text: string;   // 表示テキスト（「1枚」「2枚」など）
};

/**
 * プルダウンで利用可能な選択肢を取得（value と text の両方）
 */
async function getAvailableOptions(page: Page): Promise<OptionInfo[]> {
  try {
    const selectElements = await page.$$('select');
    const availableOptions: OptionInfo[] = [];
    
    for (const select of selectElements) {
      const options = await select.$$eval('option', (opts) => 
        opts.map(opt => ({
          value: opt.value,
          text: opt.textContent?.trim() || "",
        }))
      );
      
      for (const opt of options) {
        // 空でない選択肢のみ追加
        if (opt.value && opt.value !== "" && opt.text) {
          availableOptions.push(opt);
        }
      }
    }
    
    return availableOptions;
  } catch {
    return [];
  }
}

/**
 * 枚数選択結果の型
 */
type SelectResult = {
  success: boolean;
  selectedText: string | null;    // 選択した表示テキスト（「1枚」など）
  availableTexts: string[];       // 利用可能な表示テキストの一覧
  shouldSkip: boolean;            // exactモードで条件に合わない場合はtrue
};

/**
 * 枚数を選択（モード対応版）
 * 
 * モード:
 *   - "any": どの枚数でもOK（最初に見つかった選択肢を選ぶ）
 *   - "preferred": 優先順位に従って選択
 *   - "exact": 指定した枚数のみ購入（それ以外はスキップ）
 */
async function selectQuantity(page: Page): Promise<SelectResult> {
  const { mode, preferredList } = config.ticketQuantity;
  
  const result: SelectResult = {
    success: false,
    selectedText: null,
    availableTexts: [],
    shouldSkip: false,
  };
  
  try {
    // 利用可能な選択肢を取得（valueとtext両方）
    const availableOptions = await getAvailableOptions(page);
    result.availableTexts = availableOptions.map(opt => opt.text);
    
    if (availableOptions.length === 0) {
      log.warn("選択肢が見つかりません");
      return result;
    }
    
    log.info(`利用可能な選択肢: ${result.availableTexts.join(", ")}`);
    
    // モードに応じて選択する選択肢を決定
    let optionToSelect: OptionInfo | null = null;
    
    switch (mode) {
      case "any":
        // どれでもOK - 最初の選択肢を選ぶ
        optionToSelect = availableOptions[0];
        log.info(`[anyモード] 最初の選択肢を選択: ${optionToSelect.text}`);
        break;
        
      case "preferred":
        // 優先順位に従って選択（表示テキストで比較）
        for (const preferredText of preferredList) {
          const found = availableOptions.find(opt => opt.text === preferredText);
          if (found) {
            optionToSelect = found;
            log.info(`[preferredモード] 優先選択肢を選択: ${optionToSelect.text}`);
            break;
          }
        }
        // 優先リストに一致するものがなければ最初の選択肢
        if (!optionToSelect && availableOptions.length > 0) {
          optionToSelect = availableOptions[0];
          log.info(`[preferredモード] 優先選択肢なし、最初を選択: ${optionToSelect.text}`);
        }
        break;
        
      case "exact":
        // 指定した枚数のみ（表示テキストで比較）
        for (const exactText of preferredList) {
          const found = availableOptions.find(opt => opt.text === exactText);
          if (found) {
            optionToSelect = found;
            log.info(`[exactモード] 指定枚数を選択: ${optionToSelect.text}`);
            break;
          }
        }
        // 一致するものがなければスキップ
        if (!optionToSelect) {
          log.warn(`[exactモード] 指定枚数 (${preferredList.join(", ")}) が利用できません。スキップします。`);
          result.shouldSkip = true;
          return result;
        }
        break;
    }
    
    if (!optionToSelect) {
      log.warn("選択する値を決定できませんでした");
      return result;
    }
    
    // select要素を探して選択（valueで選択）
    const selectElements = await page.$$('select');
    
    for (const select of selectElements) {
      try {
        await select.selectOption(optionToSelect.value);
        result.success = true;
        result.selectedText = optionToSelect.text;
        log.success(`枚数選択完了: ${optionToSelect.text}`);
        return result;
      } catch {
        continue;
      }
    }
    
    // 特定のセレクターで再試行
    await page.selectOption(config.selectors.quantityDropdown, optionToSelect.value);
    result.success = true;
    result.selectedText = optionToSelect.text;
    log.success(`枚数選択完了: ${optionToSelect.text}`);
    return result;
    
  } catch (error) {
    log.warn(`枚数選択をスキップ: ${error}`);
    return result;
  }
}

/**
 * 購入失敗メッセージを検知
 */
async function detectPurchaseError(page: Page): Promise<string | null> {
  try {
    // ページのテキストを取得
    const pageText = await page.textContent('body') || "";
    
    // エラーメッセージをチェック
    for (const errorMsg of config.failureDetection.errorMessages) {
      if (pageText.includes(errorMsg)) {
        return errorMsg;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * 購入結果の型
 */
type PurchaseResult = {
  clicked: boolean;      // ボタンをクリックできたか
  success: boolean;      // 購入手続きに進めたか（エラーなし）
  errorMessage: string | null;  // 検知されたエラーメッセージ
};

/**
 * 購入手続きボタンをクリックして結果を確認
 */
async function clickPurchaseButton(page: Page): Promise<PurchaseResult> {
  const result: PurchaseResult = {
    clicked: false,
    success: false,
    errorMessage: null,
  };
  
  try {
    log.highlight("「購入手続きへ」ボタンをクリック中...");
    
    // テキストで検索してクリック
    const buttonTexts = ["購入手続きへ", "購入する", "申し込む", "次へ"];
    
    for (const text of buttonTexts) {
      try {
        const button = page.locator(`button:has-text("${text}"), input[value="${text}"], a:has-text("${text}")`).first();
        if (await button.isVisible({ timeout: 500 })) {
          await button.click();
          log.success(`「${text}」ボタンをクリックしました！`);
          result.clicked = true;
          break;
        }
      } catch {
        continue;
      }
    }
    
    // 特定のセレクターで再試行
    if (!result.clicked) {
      await page.click(config.selectors.purchaseButton);
      log.success("ボタンクリック完了！");
      result.clicked = true;
    }
    
    // クリック後、少し待ってからエラーを検知
    await page.waitForTimeout(300);
    
    // エラーメッセージを検知
    result.errorMessage = await detectPurchaseError(page);
    
    if (result.errorMessage) {
      log.error(`購入失敗: ${result.errorMessage}`);
      result.success = false;
    } else {
      // URLが変わったかチェック（購入手続きページへ遷移したか）
      const currentUrl = page.url();
      log.info(`遷移先URL: ${currentUrl}`);
      
      // ログインページへリダイレクトされた場合は失敗
      if (currentUrl.includes("/login") || currentUrl.includes("login")) {
        log.error("ログインページへリダイレクトされました。ログインが必要です。");
        result.errorMessage = "ログインが必要です";
        result.success = false;
      } else if (currentUrl !== config.targetUrl) {
        // URLが変わった & ログインページでない = 成功
        log.success("購入手続きページへ遷移しました！");
        result.success = true;
      } else {
        // URLは同じ - 購入ボタンがまだあるかチェック
        await page.waitForTimeout(500);
        
        // 購入ボタンの存在確認
        const purchaseButtonExists = await page.$(config.selectors.purchaseButton);
        
        if (!purchaseButtonExists) {
          // ボタンが消えた = 売り切れ
          log.warn("購入ボタンが消えました（売り切れ）");
          result.errorMessage = "売り切れ";
          result.success = false;
        } else {
          // ボタンはあるが、エラーも検出されていない
          // 念のため再度エラーチェック
          result.errorMessage = await detectPurchaseError(page);
          
          if (result.errorMessage) {
            log.error(`購入失敗: ${result.errorMessage}`);
            result.success = false;
          } else {
            // エラーなし、ボタンあり、URL同じ = 再試行が必要
            log.warn("状態が不明です。再試行します...");
            result.errorMessage = "再試行が必要";
            result.success = false;
          }
        }
      }
    }
    
    return result;
  } catch (error) {
    log.error(`ボタンクリックに失敗: ${error}`);
    return result;
  }
}

// 設定情報を表示
function displayConfig() {
  const { mode, preferredList } = config.ticketQuantity;
  
  console.log("\n" + "=".repeat(60));
  log.highlight("RELIEF Ticket チケット監視Bot 起動");
  console.log("=".repeat(60));
  log.info(`URL: ${config.targetUrl}`);
  log.info(`監視間隔: ${config.refreshInterval}ms`);
  
  // 枚数選択モードの表示
  switch (mode) {
    case "any":
      log.info(`枚数選択: [anyモード] どの枚数でもOK`);
      break;
    case "preferred":
      log.info(`枚数選択: [preferredモード] 優先順位: ${preferredList.join(" > ")}`);
      break;
    case "exact":
      log.info(`枚数選択: [exactモード] ${preferredList.join(" または ")} のみ購入`);
      break;
  }
  
  console.log("=".repeat(60) + "\n");
}

// メインの監視・購入処理
async function monitorAndPurchase(page: Page): Promise<boolean> {
  displayConfig();
  
  log.info("監視を開始します...\n");
  
  // 初回待機（ページ読み込み安定化）
  await page.waitForTimeout(1000);
  
  let attempts = 0;
  let skippedCount = 0;
  let failedCount = 0;  // 購入失敗（他のお客様に先を越された）回数
  const startTime = Date.now();
  
  while (true) {
    attempts++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const skipInfo = skippedCount > 0 ? ` | スキップ: ${skippedCount}` : "";
    const failInfo = failedCount > 0 ? ` | \x1b[31m失敗: ${failedCount}\x1b[0m` : "";
    process.stdout.write(`\r\x1b[36m[監視中]\x1b[0m ${attempts}回目 | 経過: ${elapsed}秒${skipInfo}${failInfo} | 最終: ${new Date().toLocaleTimeString()}   `);
    
    // 購入可能かチェック
    const isAvailable = await checkAvailability(page);
    
    if (isAvailable) {
      console.log("\n");
      log.success("========================================");
      log.success("🎉 チケットが販売中です！購入を試みます...");
      log.success("========================================");
      await playNotification();
      
      // LINE通知（チケット発見時）
      if (config.lineNotify.notifyOn.ticketFound) {
        await sendLineNotify(`🎫 RELIEF Ticket\n\nチケットを発見しました！\n購入を試みています...\n\nURL: ${config.targetUrl}`);
      }
      
      // === 長時間リトライモード開始 ===
      // 他のユーザーがタイムアウトするまで粘り強くリトライし続ける
      // 平均2分、最大5分の待機を想定
      let quickRetryCount = 0;
      let selectedText: string | null = null;
      const retryStartTime = Date.now();
      
      while (true) {
        const retryElapsed = Date.now() - retryStartTime;
        const retryElapsedSec = Math.floor(retryElapsed / 1000);
        const retryElapsedMin = Math.floor(retryElapsedSec / 60);
        const retryElapsedSecRemainder = retryElapsedSec % 60;
        
        // 最大リトライ時間を超えた場合
        if (retryElapsed >= config.failureDetection.maxRetryDuration) {
          console.log("");
          log.warn(`========================================`);
          log.warn(`${retryElapsedMin}分${retryElapsedSecRemainder}秒間リトライしましたが、購入権利を獲得できませんでした`);
          log.warn(`総試行回数: ${failedCount}回`);
          log.warn(`========================================`);
          log.info("監視を継続します。次のチャンスを待ちます...\n");
          break; // 通常の監視ループに戻る
        }
        
        // 枚数選択（モード対応）
        const selectResult = await selectQuantity(page);
        
        // exactモードで条件に合わない場合はスキップして監視継続
        if (selectResult.shouldSkip) {
          skippedCount++;
          console.log("");
          log.warn(`条件に合わないためスキップ (利用可能: ${selectResult.availableTexts.join(", ")})`);
          log.info("監視を継続します...\n");
          break; // 通常の監視ループに戻る
        }
        
        selectedText = selectResult.selectedText;
        
        // 購入ボタンクリック
        const purchaseResult = await clickPurchaseButton(page);
        
        if (purchaseResult.clicked && purchaseResult.success) {
          // 購入手続きへ進めた！
          console.log("\n" + "=".repeat(60));
          log.success("🎊🎊🎊 購入権利を獲得！！！ 🎊🎊🎊");
          if (selectedText) {
            log.success(`選択した枚数: ${selectedText}`);
          }
          log.success(`総試行回数: ${failedCount + 1}回`);
          log.success(`所要時間: ${retryElapsedMin}分${retryElapsedSecRemainder}秒`);
          log.highlight("ここから先は手動で入力してください！！！");
          console.log("=".repeat(60) + "\n");
          await playNotification();
          
          // Discord通知（購入権利獲得時）- 緊急通知
          await sendDiscordNotify(`🎊🎊🎊 購入権利を獲得しました！！！ 🎊🎊🎊\n\n📱 **今すぐSMS認証を完了してください！**\n\n枚数: ${selectedText || "不明"}\n試行回数: ${failedCount + 1}回\n所要時間: ${retryElapsedMin}分${retryElapsedSecRemainder}秒`, true);
          
          // LINE通知（購入権利獲得時）
          if (config.lineNotify.notifyOn.purchaseSuccess) {
            await sendLineNotify(`🎊 RELIEF Ticket\n\n購入権利を獲得しました！！！\n\n枚数: ${selectedText || "不明"}\n試行回数: ${failedCount + 1}回\n所要時間: ${retryElapsedMin}分${retryElapsedSecRemainder}秒\n\n⚠️ 今すぐ購入手続きを完了してください！`);
          }
          
          return true;
        }
        
        if (purchaseResult.clicked && !purchaseResult.success) {
          // 売り切れの場合はリトライせずに監視モードに戻る
          if (purchaseResult.errorMessage === "売り切れ") {
            console.log("");
            log.warn("チケットが売り切れました（他のユーザーが購入完了）");
            log.info("監視を継続します。次のチャンスを待ちます...\n");
            break; // 通常の監視ループに戻る
          }
          
          // 2025年8月仕様変更対応：「他のお客様が手続き中」= 購入権は別の人が獲得
          // リトライしても意味がないので、すぐに監視に戻って次の出品を狙う
          if (purchaseResult.errorMessage?.includes("他のお客様")) {
            console.log("");
            log.info("他のお客様が購入権を獲得しました。次の出品を監視します...\n");
            break;
          }
          
          // 購入失敗（他のお客様が先に購入中）
          failedCount++;
          quickRetryCount++;
          
          // 進捗状況を1行で表示（経過時間、リトライ回数、リロードまでのカウント）
          const timeDisplay = `${retryElapsedMin}:${retryElapsedSecRemainder.toString().padStart(2, '0')}`;
          const maxTimeMin = Math.floor(config.failureDetection.maxRetryDuration / 60000);
          process.stdout.write(`\r\x1b[33m[他ユーザー購入中]\x1b[0m 経過: ${timeDisplay}/${maxTimeMin}:00 | 試行: ${failedCount}回 | タイムアウト待ち中...   `);
          
          // 最大連続リトライ回数に達したらページをリロード
          if (quickRetryCount >= config.failureDetection.maxQuickRetries) {
            console.log("");
            log.info(`30秒経過。ページをリフレッシュ... (継続中)`);
            quickRetryCount = 0;
            
            await page.waitForTimeout(config.failureDetection.reloadDelay);
            try {
              await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
            } catch {
              // リロード失敗しても続行
            }
            
            // ボタンがまだ存在するか確認
            const stillAvailable = await checkAvailability(page);
            if (!stillAvailable) {
              console.log("");
              log.warn("チケットが売り切れました（他のユーザーが購入完了）");
              log.info("監視を継続します。次のチャンスを待ちます...\n");
              break; // 通常の監視ループに戻る
            }
            
            // まだ購入可能 = 他のユーザーがまだ購入手続き中
            log.info("他のユーザーがまだ購入手続き中。リトライを継続...");
            continue;
          }
          
          // 高速リトライ（リロードせずに即座に再クリック）
          await page.waitForTimeout(config.failureDetection.quickRetryDelay);
          continue;
        }
        
        // クリックできなかった場合は監視ループに戻る
        break;
      }
    }
    
    // 待機してリフレッシュ
    await page.waitForTimeout(config.refreshInterval);
    
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
      
      // リロード後にログインページにリダイレクトされていないかチェック
      const currentUrl = page.url();
      if (currentUrl.includes("/login") || currentUrl.includes("login")) {
        console.log("");
        log.warn("セッションが切れました。自動ログインを試みます...");
        const loginSuccess = await autoLogin(page);
        if (loginSuccess) {
          log.success("再ログインに成功しました");
          await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
        } else {
          log.error("再ログインに失敗しました");
        }
      }
    } catch {
      log.warn("リロードがタイムアウト、続行します");
    }
  }
}

// ============================================
// DOM監視モード（高速検知）
// ============================================

// DOM監視モード：リロードなしでボタン出現を即座に検知
async function monitorWithDOM(page: Page): Promise<boolean> {
  displayConfig();
  log.info("モード: DOM監視（リロードなし、高速検知）");
  log.info(`ポーリング間隔: ${config.monitorMode.domPollInterval}ms`);
  console.log("=".repeat(60) + "\n");
  
  log.info("DOM監視を開始します...\n");
  
  const { mode, preferredList } = config.ticketQuantity;
  let checks = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const startTime = Date.now();
  
  while (true) {
    checks++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const skipInfo = skippedCount > 0 ? ` | スキップ: ${skippedCount}` : "";
    const failInfo = failedCount > 0 ? ` | \x1b[31m失敗: ${failedCount}\x1b[0m` : "";
    process.stdout.write(`\r\x1b[36m[DOM監視]\x1b[0m ${checks}回 | 経過: ${elapsed}秒${skipInfo}${failInfo} | ${new Date().toLocaleTimeString()}   `);
    
    // 購入ボタンの存在を高速チェック（evaluate使用で最速）
    const isAvailable = await page.evaluate(() => {
      // ボタン、input、リンクから「購入手続きへ」を含むものを検索
      const buttons = document.querySelectorAll('button, input[type="submit"], a');
      for (const btn of buttons) {
        const text = btn.textContent || (btn as HTMLInputElement).value || '';
        if (text.includes('購入手続きへ')) {
          return (btn as HTMLElement).offsetParent !== null;
        }
      }
      return false;
    });
    
    if (isAvailable) {
      console.log("\n");
      log.success("========================================");
      log.success("🎉 チケットを検知！即座に購入を試みます...");
      log.success("========================================");
      await playNotification();
      
      // === 購入処理 ===
      let selectedText: string | null = null;
      const retryStartTime = Date.now();
      let quickRetryCount = 0;
      
      while (true) {
        const retryElapsed = Date.now() - retryStartTime;
        const retryElapsedSec = Math.floor(retryElapsed / 1000);
        const retryElapsedMin = Math.floor(retryElapsedSec / 60);
        const retryElapsedSecRemainder = retryElapsedSec % 60;
        
        if (retryElapsed >= config.failureDetection.maxRetryDuration) {
          console.log("");
          log.warn(`${retryElapsedMin}分${retryElapsedSecRemainder}秒間リトライしましたが、獲得できませんでした`);
          log.info("監視を継続します...\n");
          break;
        }
        
        // 枚数選択
        const selectResult = await selectQuantity(page);
        if (selectResult.shouldSkip) {
          skippedCount++;
          console.log("");
          log.warn(`条件に合わないためスキップ`);
          break;
        }
        selectedText = selectResult.selectedText;
        
        // 購入ボタンクリック
        const purchaseResult = await clickPurchaseButton(page);
        
        if (purchaseResult.clicked && purchaseResult.success) {
          console.log("\n" + "=".repeat(60));
          log.success("🎊🎊🎊 購入権利を獲得！！！ 🎊🎊🎊");
          log.success(`選択した枚数: ${selectedText || "不明"}`);
          log.success(`試行回数: ${failedCount + 1}回`);
          log.highlight("ここから先は手動で入力してください！！！");
          console.log("=".repeat(60) + "\n");
          await playNotification();
          
          // Discord通知（購入権利獲得時）- 緊急通知
          await sendDiscordNotify(`🎊🎊🎊 購入権利を獲得しました！！！ 🎊🎊🎊\n\n📱 **今すぐSMS認証を完了してください！**\n\n枚数: ${selectedText || "不明"}\n試行回数: ${failedCount + 1}回`, true);
          
          return true;
        }
        
        if (purchaseResult.clicked && !purchaseResult.success) {
          if (purchaseResult.errorMessage === "売り切れ") {
            console.log("");
            log.warn("売り切れました");
            log.info("監視を継続します...\n");
            break;
          }
          
          // 2025年8月仕様変更対応：「他のお客様が手続き中」= 購入権は別の人が獲得
          // リトライしても意味がないので、すぐに監視に戻って次の出品を狙う
          if (purchaseResult.errorMessage?.includes("他のお客様")) {
            console.log("");
            log.info("他のお客様が購入権を獲得しました。次の出品を監視します...\n");
            break;
          }
          
          failedCount++;
          quickRetryCount++;
          
          const timeDisplay = `${retryElapsedMin}:${retryElapsedSecRemainder.toString().padStart(2, '0')}`;
          const maxTimeMin = Math.floor(config.failureDetection.maxRetryDuration / 60000);
          process.stdout.write(`\r\x1b[33m[他ユーザー購入中]\x1b[0m ${timeDisplay}/${maxTimeMin}:00 | 試行: ${failedCount}回   `);
          
          // リトライ
          await page.waitForTimeout(config.failureDetection.quickRetryDelay);
          continue;
        }
        
        break;
      }
    }
    
    // 定期的にログイン状態をチェック（1分ごと）
    if (checks % Math.floor(60000 / config.monitorMode.domPollInterval) === 0) {
      const currentUrl = page.url();
      if (currentUrl.includes("/login") || !currentUrl.includes("relief-ticket.jp/events")) {
        console.log("");
        log.warn("ターゲットページから離れました。復帰を試みます...");
        if (currentUrl.includes("/login")) {
          const loginSuccess = await autoLogin(page);
          if (loginSuccess) {
            log.success("再ログインに成功しました");
          }
        }
        await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
      }
    }
    
    // 高速ポーリング（リロードなし）
    await page.waitForTimeout(config.monitorMode.domPollInterval);
  }
}

// ハイブリッドモード：DOM監視 + 定期リロード
async function monitorHybrid(page: Page): Promise<boolean> {
  displayConfig();
  log.info("モード: ハイブリッド（DOM監視 + 定期リロード）");
  log.info(`ポーリング間隔: ${config.monitorMode.domPollInterval}ms`);
  log.info(`リロード間隔: ${config.monitorMode.hybridReloadInterval / 1000}秒`);
  console.log("=".repeat(60) + "\n");
  
  log.info("ハイブリッド監視を開始します...\n");
  
  let checks = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const startTime = Date.now();
  let lastReloadTime = Date.now();
  
  while (true) {
    checks++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const nextReload = Math.max(0, Math.floor((config.monitorMode.hybridReloadInterval - (Date.now() - lastReloadTime)) / 1000));
    const skipInfo = skippedCount > 0 ? ` | スキップ: ${skippedCount}` : "";
    const failInfo = failedCount > 0 ? ` | \x1b[31m失敗: ${failedCount}\x1b[0m` : "";
    process.stdout.write(`\r\x1b[36m[ハイブリッド]\x1b[0m ${checks}回 | 経過: ${elapsed}秒 | 次リロード: ${nextReload}秒${skipInfo}${failInfo}   `);
    
    // 購入ボタンの存在を高速チェック
    const isAvailable = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, input[type="submit"], a');
      for (const btn of buttons) {
        const text = btn.textContent || (btn as HTMLInputElement).value || '';
        if (text.includes('購入手続きへ')) {
          return (btn as HTMLElement).offsetParent !== null;
        }
      }
      return false;
    });
    
    if (isAvailable) {
      console.log("\n");
      log.success("========================================");
      log.success("🎉 チケットを検知！即座に購入を試みます...");
      log.success("========================================");
      await playNotification();
      
      // === 購入処理（DOM監視モードと同じ） ===
      let selectedText: string | null = null;
      const retryStartTime = Date.now();
      
      while (true) {
        const retryElapsed = Date.now() - retryStartTime;
        const retryElapsedSec = Math.floor(retryElapsed / 1000);
        const retryElapsedMin = Math.floor(retryElapsedSec / 60);
        const retryElapsedSecRemainder = retryElapsedSec % 60;
        
        if (retryElapsed >= config.failureDetection.maxRetryDuration) {
          console.log("");
          log.warn(`${retryElapsedMin}分${retryElapsedSecRemainder}秒間リトライしましたが、獲得できませんでした`);
          log.info("監視を継続します...\n");
          break;
        }
        
        const selectResult = await selectQuantity(page);
        if (selectResult.shouldSkip) {
          skippedCount++;
          break;
        }
        selectedText = selectResult.selectedText;
        
        const purchaseResult = await clickPurchaseButton(page);
        
        if (purchaseResult.clicked && purchaseResult.success) {
          console.log("\n" + "=".repeat(60));
          log.success("🎊🎊🎊 購入権利を獲得！！！ 🎊🎊🎊");
          log.success(`選択した枚数: ${selectedText || "不明"}`);
          log.success(`試行回数: ${failedCount + 1}回`);
          log.highlight("ここから先は手動で入力してください！！！");
          console.log("=".repeat(60) + "\n");
          await playNotification();
          
          // Discord通知（購入権利獲得時）- 緊急通知
          await sendDiscordNotify(`🎊🎊🎊 購入権利を獲得しました！！！ 🎊🎊🎊\n\n📱 **今すぐSMS認証を完了してください！**\n\n枚数: ${selectedText || "不明"}\n試行回数: ${failedCount + 1}回`, true);
          
          return true;
        }
        
        if (purchaseResult.clicked && !purchaseResult.success) {
          if (purchaseResult.errorMessage === "売り切れ") {
            console.log("");
            log.warn("売り切れました");
            log.info("監視を継続します...\n");
            break;
          }
          
          // 2025年8月仕様変更対応：「他のお客様が手続き中」= 購入権は別の人が獲得
          // リトライしても意味がないので、すぐに監視に戻って次の出品を狙う
          if (purchaseResult.errorMessage?.includes("他のお客様")) {
            console.log("");
            log.info("他のお客様が購入権を獲得しました。次の出品を監視します...\n");
            break;
          }
          
          failedCount++;
          await page.waitForTimeout(config.failureDetection.quickRetryDelay);
          continue;
        }
        
        break;
      }
    }
    
    // 定期リロード（ハイブリッドモード）
    if (Date.now() - lastReloadTime >= config.monitorMode.hybridReloadInterval) {
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
        lastReloadTime = Date.now();
        
        // リロード後にログインページにリダイレクトされていないかチェック
        const currentUrl = page.url();
        if (currentUrl.includes("/login") || currentUrl.includes("login")) {
          console.log("");
          log.warn("セッションが切れました。自動ログインを試みます...");
          const loginSuccess = await autoLogin(page);
          if (loginSuccess) {
            log.success("再ログインに成功しました");
            await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
            lastReloadTime = Date.now();
          } else {
            log.error("再ログインに失敗しました");
          }
        }
      } catch {
        // リロード失敗しても続行
      }
    }
    
    // 定期的にログイン状態をチェック（5分ごと）
    if (checks % Math.floor(300000 / config.monitorMode.domPollInterval) === 0) {
      const currentUrl = page.url();
      if (currentUrl.includes("/login") || !currentUrl.includes("relief-ticket.jp/events")) {
        console.log("");
        log.warn("ターゲットページから離れました。復帰を試みます...");
        if (currentUrl.includes("/login")) {
          const loginSuccess = await autoLogin(page);
          if (loginSuccess) {
            log.success("再ログインに成功しました");
          }
        }
        await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
        lastReloadTime = Date.now();
      }
    }
    
    // 高速ポーリング
    await page.waitForTimeout(config.monitorMode.domPollInterval);
  }
}

// 代替モード：要素の出現を待つ（リフレッシュなし、JS更新を監視）
async function waitForElement(page: Page): Promise<boolean> {
  displayConfig();
  log.info("モード: 待機モード（リフレッシュなし）");
  log.info("ページ内のJavaScript更新を監視します");
  log.info("購入可能になるまで待機中...\n");
  
  // 定期的に要素をチェック（リフレッシュなし）
  let checks = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  while (true) {
    checks++;
    const skipInfo = skippedCount > 0 ? ` | スキップ: ${skippedCount}` : "";
    const failInfo = failedCount > 0 ? ` | \x1b[31m失敗: ${failedCount}\x1b[0m` : "";
    process.stdout.write(`\r\x1b[36m[待機中]\x1b[0m チェック: ${checks}回${skipInfo}${failInfo} | ${new Date().toLocaleTimeString()}   `);
    
    const isAvailable = await checkAvailability(page);
    
    if (isAvailable) {
      console.log("\n");
      log.success("🎉 チケットが販売中です！購入を試みます...");
      await playNotification();
      
      // LINE通知（チケット発見時）
      if (config.lineNotify.notifyOn.ticketFound) {
        await sendLineNotify(`🎫 RELIEF Ticket\n\nチケットを発見しました！\n購入を試みています...\n\nURL: ${config.targetUrl}`);
      }
      
      // === 長時間リトライモード開始 ===
      let quickRetryCount = 0;
      let selectedText: string | null = null;
      const retryStartTime = Date.now();
      
      while (true) {
        const retryElapsed = Date.now() - retryStartTime;
        const retryElapsedSec = Math.floor(retryElapsed / 1000);
        const retryElapsedMin = Math.floor(retryElapsedSec / 60);
        const retryElapsedSecRemainder = retryElapsedSec % 60;
        
        // 最大リトライ時間を超えた場合
        if (retryElapsed >= config.failureDetection.maxRetryDuration) {
          console.log("");
          log.warn(`${retryElapsedMin}分${retryElapsedSecRemainder}秒間リトライしましたが、購入権利を獲得できませんでした`);
          log.info("監視を継続します...\n");
          break;
        }
        
        // 枚数選択（モード対応）
        const selectResult = await selectQuantity(page);
        
        // exactモードで条件に合わない場合はスキップ
        if (selectResult.shouldSkip) {
          skippedCount++;
          log.warn(`条件に合わないためスキップ (利用可能: ${selectResult.availableTexts.join(", ")})`);
          log.info("監視を継続します...\n");
          break;
        }
        
        selectedText = selectResult.selectedText;
        
        // 購入ボタンクリック
        const purchaseResult = await clickPurchaseButton(page);
        
        if (purchaseResult.clicked && purchaseResult.success) {
          // 購入手続きへ進めた！
          console.log("\n" + "=".repeat(60));
          log.success("🎊🎊🎊 購入権利を獲得！！！ 🎊🎊🎊");
          if (selectedText) {
            log.success(`選択した枚数: ${selectedText}`);
          }
          log.success(`総試行回数: ${failedCount + 1}回`);
          log.success(`所要時間: ${retryElapsedMin}分${retryElapsedSecRemainder}秒`);
          log.highlight("ここから先は手動で入力してください！");
          console.log("=".repeat(60) + "\n");
          
          // Discord通知（購入権利獲得時）- 緊急通知
          await sendDiscordNotify(`🎊🎊🎊 購入権利を獲得しました！！！ 🎊🎊🎊\n\n📱 **今すぐSMS認証を完了してください！**\n\n枚数: ${selectedText || "不明"}\n試行回数: ${failedCount + 1}回\n所要時間: ${retryElapsedMin}分${retryElapsedSecRemainder}秒`, true);
          
          // LINE通知（購入権利獲得時）
          if (config.lineNotify.notifyOn.purchaseSuccess) {
            await sendLineNotify(`🎊 RELIEF Ticket\n\n購入権利を獲得しました！！！\n\n枚数: ${selectedText || "不明"}\n試行回数: ${failedCount + 1}回\n所要時間: ${retryElapsedMin}分${retryElapsedSecRemainder}秒\n\n⚠️ 今すぐ購入手続きを完了してください！`);
          }
          
          return true;
        }
        
        if (purchaseResult.clicked && !purchaseResult.success) {
          // 売り切れの場合はリトライせずに監視モードに戻る
          if (purchaseResult.errorMessage === "売り切れ") {
            console.log("");
            log.warn("チケットが売り切れました（他のユーザーが購入完了）");
            log.info("監視を継続します。次のチャンスを待ちます...\n");
            break; // 通常の監視ループに戻る
          }
          
          // 購入失敗（他のお客様が先に購入中）
          failedCount++;
          quickRetryCount++;
          
          const timeDisplay = `${retryElapsedMin}:${retryElapsedSecRemainder.toString().padStart(2, '0')}`;
          const maxTimeMin = Math.floor(config.failureDetection.maxRetryDuration / 60000);
          process.stdout.write(`\r\x1b[33m[他ユーザー購入中]\x1b[0m 経過: ${timeDisplay}/${maxTimeMin}:00 | 試行: ${failedCount}回 | タイムアウト待ち中...   `);
          
          // 最大連続リトライ回数に達したらページをリロード
          if (quickRetryCount >= config.failureDetection.maxQuickRetries) {
            console.log("");
            log.info(`30秒経過。ページをリフレッシュ... (継続中)`);
            quickRetryCount = 0;
            
            await page.waitForTimeout(config.failureDetection.reloadDelay);
            await page.reload({ waitUntil: "domcontentloaded" });
            
            const stillAvailable = await checkAvailability(page);
            if (!stillAvailable) {
              console.log("");
              log.warn("チケットが売り切れました（他のユーザーが購入完了）");
              log.info("監視を継続します。次のチャンスを待ちます...\n");
              break;
            }
            log.info("他のユーザーがまだ購入手続き中。リトライを継続...");
            continue;
          }
          
          // 高速リトライ（リロードせずに即座に再クリック）
          await page.waitForTimeout(config.failureDetection.quickRetryDelay);
          continue;
        }
        
        break;
      }
    }
    
    // 100msごとにチェック（高速）
    await page.waitForTimeout(100);
  }
}

// メイン関数
async function main() {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     RELIEF Ticket リセールチケット自動購入Bot          ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log("\n");
  
  // 機能の状態を表示
  if (config.session.saveSession) {
    log.info("セッション保持: 有効");
  }
  if (config.lineNotify.enabled) {
    log.info("LINE通知: 有効");
  }
  if (config.targetPerformance.enabled) {
    log.info(`公演フィルター: ${config.targetPerformance.filters.join(", ")}`);
  }
  console.log("");
  
  try {
    browser = await launchBrowser();
    
    // 保存済みセッションを読み込み
    const savedSession = loadSession();
    
    // ブラウザコンテキストを作成（Cookieなどを保持）
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "ja-JP",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      storageState: savedSession, // 保存済みセッションを読み込み
    });
    
    const page = await context.newPage();
    
    // リソースブロッキング（ページロード高速化）
    if (config.monitorMode.blockResources) {
      log.info("リソースブロッキング: 有効（画像/CSS/フォント）");
      await page.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        if (config.monitorMode.blockedResourceTypes.includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }
    
    // セッション保存のためのイベントリスナー
    // ページ遷移時にセッションを保存
    page.on("load", async () => {
      await saveSession(context!);
    });
    
    // まずターゲットURLに移動
    log.info(`ページを開いています: ${config.targetUrl}`);
    await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
    
    // ログイン状態を確認して、必要なら自動ログイン
    const isLoggedIn = await checkLoginStatus(page);
    if (!isLoggedIn) {
      log.warn("ログインが必要です");
      const loginSuccess = await autoLogin(page);
      
      if (loginSuccess) {
        // ログイン後、ターゲットURLに戻る
        await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
        await saveSession(context, true); // 強制保存
      } else {
        log.warn("自動ログインに失敗しました。手動でログインしてください。");
        log.info("ログイン後、監視が自動的に開始されます。\n");
        
        // 手動ログインを待機
        log.info("ログインを待機中...");
        while (true) {
          await page.waitForTimeout(3000);
          if (await checkLoginStatus(page)) {
            log.success("ログインを確認しました！");
            await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
            await saveSession(context, true); // 強制保存
            break;
          }
        }
      }
    } else {
      log.success("ログイン済みです");
    }
    
    // モード選択（設定ファイルで指定）
    const monitorModeType = config.monitorMode.mode;
    log.info(`監視モード: ${monitorModeType}`);
    
    if (monitorModeType === "dom") {
      await monitorWithDOM(page);
    } else if (monitorModeType === "hybrid") {
      await monitorHybrid(page);
    } else {
      // reloadモード（従来方式）
      await monitorAndPurchase(page);
    }
    
    // 手動操作のためにブラウザを開いたままにする
    log.info("ブラウザは開いたままです。手動で操作を続けてください。");
    log.info("終了するには Ctrl+C を押してください。\n");
    
    // ブラウザが閉じられるまで待機
    await new Promise(() => {});
    
  } catch (error) {
    log.error(`致命的なエラー: ${error}`);
    if (browser) await browser.close();
    process.exit(1);
  }
}

// 実行
main();
