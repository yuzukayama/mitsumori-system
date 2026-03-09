/**
 * 見積徴収システム - メイン
 * スプレッドシートを開いた際にカスタムメニューを追加する
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('見積管理')
    .addItem('見積依頼を作成', 'createEstimateRequests')
    .addItem('見積依頼メールを送信', 'sendRequestEmails')
    .addSeparator()
    .addItem('ステータスを一括更新', 'updateAllStatuses')
    .addItem('リマインドメールを送信', 'sendReminderEmails')
    .addItem('期限切れシートをロック', 'lockExpiredSheets')
    .addSeparator()
    .addSubMenu(ui.createMenu('テンプレート')
      .addItem('Excelからテンプレート分割', 'splitExcelToTemplates')
      .addItem('フォルダからテンプレート一括登録', 'registerTemplatesFromFolder')
      .addItem('テンプレートフォルダを作成', 'createProjectTemplateFolder')
      .addItem('テンプレート管理シートを表示', 'showTemplateSheet'))
    .addSubMenu(ui.createMenu('設定')
      .addItem('初期セットアップ', 'initialSetup')
      .addItem('シート追加セットアップ（既存環境用）', 'additionalSetup')
      .addItem('工種プルダウンを更新', 'refreshTradeDropdowns')
      .addItem('サブフォルダを作成', 'createSubFolders'))
    .addToUi();
}

/**
 * 初期セットアップ: マスター管理シートの全シートとヘッダーを作成する
 */
function initialSetup() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert(
    '初期セットアップ',
    'マスター管理シートの各シートとヘッダーを作成します。\n既存データは影響を受けません。\n実行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupCompaniesSheet_(ss);
  setupProjectsSheet_(ss);
  setupTradesSheet_(ss);
  setupTemplatesSheet_(ss);
  setupRequestsSheet_(ss);
  setupSettingsSheet_(ss);
  setupLogSheet_(ss);

  const defaultSheet = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  createSubFolders();

  ui.alert('セットアップ完了', '全シートの作成と初期設定が完了しました。\n「設定」シートの自社情報を入力してください。', ui.ButtonSet.OK);
  writeLog('初期セットアップ', '完了');
}

/**
 * 既存環境に工種マスター・テンプレート管理シートだけ追加する
 */
function additionalSetup() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert(
    'シート追加セットアップ',
    '「工種マスター」と「テンプレート管理」シートを追加します。\n案件マスターのヘッダーも更新されます。\n既存データは影響を受けません。\n実行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (result !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupTradesSheet_(ss);
  setupTemplatesSheet_(ss);
  setupProjectsSheet_(ss);

  createSubFolders();

  ui.alert('追加完了', '「工種マスター」「テンプレート管理」シートを作成しました。\n案件マスターのヘッダーも更新されました。', ui.ButtonSet.OK);
  writeLog('シート追加セットアップ', '工種マスター・テンプレート管理を追加');
}

function showTemplateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TEMPLATES);
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert('テンプレート管理シートが見つかりません。初期セットアップを実行してください。');
  }
}

// ─── 各シートのセットアップ ───

function setupCompaniesSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.COMPANIES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.COMPANIES);
  }
  const headers = [
    '会社コード', '会社名', '担当者名', 'メールアドレス',
    '電話番号', '主要工種', 'ポータルシートID', 'ポータルシートURL',
    'サイトURL', '備考'
  ];
  setupSheetHeaders_(sheet, headers);
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 250);
  sheet.setColumnWidth(8, 300);
  sheet.setColumnWidth(9, 300);

  applyTradeDropdown_(ss, sheet, 'F2:F1000');
}

function setupProjectsSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.PROJECTS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.PROJECTS);
  }
  const headers = [
    '案件コード', '案件名', '見積提出期限',
    'テンプレートフォルダID', '図面フォルダURL', '備考'
  ];
  setupSheetHeaders_(sheet, headers);
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 300);
  sheet.setColumnWidth(5, 300);
}

function setupTradesSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.TRADES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.TRADES);
  }
  const headers = ['工種コード', '工種名', '備考'];
  setupSheetHeaders_(sheet, headers);
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 300);

  // 初期データがなければ代表的な工種を投入
  if (sheet.getLastRow() <= 1) {
    const defaultTrades = [
      ['T01', '仮設工事', ''],
      ['T02', '土工事', ''],
      ['T03', '地業工事', ''],
      ['T04', '鉄筋工事', ''],
      ['T05', '型枠工事', ''],
      ['T06', 'コンクリート工事', ''],
      ['T07', '鉄骨工事', ''],
      ['T08', '既製コンクリート工事', ''],
      ['T09', '防水工事', ''],
      ['T10', '石工事', ''],
      ['T11', 'タイル工事', ''],
      ['T12', '木工事', ''],
      ['T13', '屋根工事', ''],
      ['T14', '金属工事', ''],
      ['T15', '左官工事', ''],
      ['T16', '建具工事', ''],
      ['T17', 'ガラス工事', ''],
      ['T18', '塗装工事', ''],
      ['T19', '内装工事', ''],
      ['T20', '外構工事', ''],
      ['T21', '電気設備工事', ''],
      ['T22', '給排水衛生設備工事', ''],
      ['T23', '空調換気設備工事', ''],
      ['T24', '昇降機設備工事', ''],
      ['T25', '解体工事', ''],
      ['T26', '産廃処分', ''],
      ['T27', 'ALC工事', ''],
      ['T28', '金属製建具工事', ''],
      ['T29', 'カーテンウォール工事', ''],
      ['T30', 'ユニット工事', ''],
    ];
    sheet.getRange(2, 1, defaultTrades.length, 3).setValues(defaultTrades);
  }
}

function setupTemplatesSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.TEMPLATES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.TEMPLATES);
  }
  const headers = [
    '案件コード', '案件名', '工種', 'テンプレートID', 'テンプレートURL', '登録日'
  ];
  setupSheetHeaders_(sheet, headers);
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 300);
  sheet.setColumnWidth(5, 350);
  sheet.setColumnWidth(6, 120);

  applyTradeDropdown_(ss, sheet, 'C2:C1000');
}

function setupRequestsSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.REQUESTS);
  }
  const headers = [
    'No.', '案件コード', '案件名', '会社コード', '会社名', '工種',
    '見積シートID', '見積シートURL', '依頼日', '提出期限',
    'ステータス', '最終編集日時', 'メール送信日', '備考'
  ];
  setupSheetHeaders_(sheet, headers);
  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(8, 300);
  sheet.setColumnWidth(11, 100);

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(CONFIG.STATUS))
    .setAllowInvalid(false)
    .build();
  sheet.getRange('K2:K1000').setDataValidation(statusRule);

  applyTradeDropdown_(ss, sheet, 'F2:F1000');
}

function setupSettingsSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.SETTINGS);
  }

  if (sheet.getLastRow() < 2) {
    const settings = [
      ['設定項目', '値'],
      ['自社名', ''],
      ['担当者名', ''],
      ['電話番号', ''],
      ['メールアドレス', ''],
      ['ルートフォルダID', CONFIG.ROOT_FOLDER_ID],
      ['リマインド日数（期限N日前）', 3],
      ['メール件名', '【見積依頼】{案件名} - {工種}'],
      ['リマインド件名', '【再送】{案件名} - {工種}（期限：{提出期限}）']
    ];
    sheet.getRange(1, 1, settings.length, 2).setValues(settings);
    sheet.getRange('A1:B1')
      .setBackground('#4285F4')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setColumnWidth(1, 250);
    sheet.setColumnWidth(2, 400);

    sheet.getRange('A2:A' + settings.length)
      .setBackground('#F3F3F3')
      .setFontWeight('bold');
  }
}

function setupLogSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.LOG);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.LOG);
    sheet.appendRow(['日時', '操作', '詳細', '実行者']);
    sheet.getRange('A1:D1')
      .setBackground('#4285F4')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 200);
    sheet.setColumnWidth(3, 400);
    sheet.setColumnWidth(4, 250);
  }
}

// ─── ヘルパー ───

function setupSheetHeaders_(sheet, headers) {
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  if (sheet.getLastRow() === 0 || sheet.getRange('A1').getValue() === '') {
    headerRange.setValues([headers]);
  }
  headerRange
    .setBackground('#4285F4')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

/**
 * 工種マスターのB列を参照するプルダウン（データの入力規則）を適用する
 * 工種マスターに行を追加すればプルダウンにも自動反映される
 */
function applyTradeDropdown_(ss, targetSheet, rangeA1) {
  const tradesSheet = ss.getSheetByName(CONFIG.SHEETS.TRADES);
  if (!tradesSheet) return;

  const lastRow = Math.max(tradesSheet.getLastRow(), 2);
  const sourceRange = tradesSheet.getRange(`B2:B${lastRow}`);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true)
    .setAllowInvalid(true)
    .build();
  targetSheet.getRange(rangeA1).setDataValidation(rule);
}

/**
 * 全シートの工種プルダウンを最新の工種マスターで更新する
 * 工種マスターに工種を追加・変更した後に実行してください
 */
function refreshTradeDropdowns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const companySheet = ss.getSheetByName(CONFIG.SHEETS.COMPANIES);
  const templateSheet = ss.getSheetByName(CONFIG.SHEETS.TEMPLATES);
  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);

  if (companySheet) applyTradeDropdown_(ss, companySheet, 'F2:F1000');
  if (templateSheet) applyTradeDropdown_(ss, templateSheet, 'C2:C1000');
  if (requestSheet) applyTradeDropdown_(ss, requestSheet, 'F2:F1000');

  SpreadsheetApp.getUi().alert('更新完了', '全シートの工種プルダウンを更新しました。', SpreadsheetApp.getUi().ButtonSet.OK);
  writeLog('プルダウン更新', '工種プルダウンを全シートに適用');
}

/**
 * サブフォルダを作成する
 */
function createSubFolders() {
  const rootFolder = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);

  for (const name of Object.values(CONFIG.FOLDERS)) {
    const existing = rootFolder.getFoldersByName(name);
    if (!existing.hasNext()) {
      rootFolder.createFolder(name);
    }
  }
  writeLog('フォルダ作成', 'サブフォルダを確認・作成しました');
}
