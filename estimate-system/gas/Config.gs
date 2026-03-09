/**
 * 見積徴収システム - 設定定数
 * ★ 運用環境に合わせて値を変更してください
 */

const CONFIG = {
  // Google Drive 保存先フォルダID（共有ドライブ or マイドライブ）
  ROOT_FOLDER_ID: '0AAD_-egrQbLiUk9PVA',

  // サブフォルダ名
  FOLDERS: {
    ESTIMATES: '見積書',
    PORTALS: 'ポータルシート',
    TEMPLATES: '見積テンプレート'
  },

  // マスター管理シートのシート名
  SHEETS: {
    COMPANIES: '協力会社マスター',
    PROJECTS: '案件マスター',
    TRADES: '工種マスター',
    TEMPLATES: 'テンプレート管理',
    REQUESTS: '見積依頼管理',
    SETTINGS: '設定',
    LOG: '操作ログ'
  },

  // 見積依頼ステータス
  STATUS: {
    DRAFT: '未依頼',
    SENT: '依頼済',
    ANSWERED: '回答済',
    OVERDUE: '期限超過',
    LOCKED: 'ロック済'
  },

  // ポータルシート列定義
  PORTAL_HEADERS: ['案件名', '工種', '提出期限', 'ステータス', '入力リンク'],

  // ステータス色定義
  STATUS_COLORS: {
    '未依頼': '#E0E0E0',
    '依頼済': '#FFF9C4',
    '回答済': '#C8E6C9',
    '期限超過': '#FFCDD2',
    'ロック済': '#CFD8DC'
  }
};

/**
 * 設定シートから値を取得するヘルパー
 */
function getSettingValue(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (!sheet) return '';

  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return '';
}

/**
 * 操作ログを記録する
 */
function writeLog(action, detail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.LOG);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.LOG);
    sheet.appendRow(['日時', '操作', '詳細', '実行者']);
  }
  sheet.appendRow([
    new Date(),
    action,
    detail,
    Session.getActiveUser().getEmail()
  ]);
}
