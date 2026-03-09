/**
 * 見積徴収システム - ポータルシート管理
 * 協力会社ごとのポータルシートを作成・更新する
 */

/**
 * 協力会社のポータルシートを更新する
 * ポータルシートが未作成の場合は新規作成する
 */
function updateCompanyPortal(company, project, estimateUrl, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const companySheet = ss.getSheetByName(CONFIG.SHEETS.COMPANIES);

  let portalSheetId = company.portalSheetId;
  let portalSS;

  if (!portalSheetId) {
    // ポータルシートを新規作成
    portalSS = createPortalSheet_(company);
    portalSheetId = portalSS.getId();

    // 協力会社マスターにポータルシートIDとURLを記録
    const companyData = companySheet.getDataRange().getValues();
    for (let i = 1; i < companyData.length; i++) {
      if (String(companyData[i][0]).trim() === company.code) {
        companySheet.getRange(i + 1, 7).setValue(portalSheetId);
        companySheet.getRange(i + 1, 8).setValue(portalSS.getUrl());
        company.portalSheetId = portalSheetId;
        company.portalSheetUrl = portalSS.getUrl();
        break;
      }
    }
  } else {
    portalSS = SpreadsheetApp.openById(portalSheetId);
  }

  // ポータルシートにデータ行を追加・更新
  updatePortalRow_(portalSS, project, estimateUrl, status);
}

/**
 * ポータルシートを新規作成する
 */
function createPortalSheet_(company) {
  const rootFolder = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const portalFolder = getOrCreateSubFolder_(rootFolder, CONFIG.FOLDERS.PORTALS);

  const portalSS = SpreadsheetApp.create(`【ポータル】${company.name}`);
  const portalFile = DriveApp.getFileById(portalSS.getId());

  // ポータルフォルダに移動
  portalFolder.addFile(portalFile);
  const parents = portalFile.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    if (parent.getId() !== portalFolder.getId()) {
      parent.removeFile(portalFile);
    }
  }

  // 共有設定: リンクを知っている全員が閲覧可能（ポータルは閲覧のみ）
  portalFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // シートの書式設定
  const sheet = portalSS.getSheets()[0];
  sheet.setName('見積案件一覧');

  // ヘッダー行
  const headers = CONFIG.PORTAL_HEADERS;
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1A73E8')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 250);  // 案件名
  sheet.setColumnWidth(2, 120);  // 工種
  sheet.setColumnWidth(3, 130);  // 提出期限
  sheet.setColumnWidth(4, 100);  // ステータス
  sheet.setColumnWidth(5, 200);  // 入力リンク

  // ステータス列の条件付き書式
  applyPortalStatusFormatting_(sheet);

  writeLog('ポータルシート作成', `${company.name}用ポータルシートを作成`);
  return portalSS;
}

/**
 * ポータルシートの行を追加・更新する
 */
function updatePortalRow_(portalSS, project, estimateUrl, status) {
  const sheet = portalSS.getSheets()[0];
  const data = sheet.getDataRange().getValues();

  // 既存行を検索（案件名 + 工種で一致判定）
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === project.name && data[i][1] === project.trade) {
      targetRow = i + 1;
      break;
    }
  }

  const deadline = project.deadline instanceof Date
    ? Utilities.formatDate(project.deadline, Session.getScriptTimeZone(), 'yyyy/MM/dd')
    : project.deadline;

  const linkText = (status === CONFIG.STATUS.ANSWERED || status === CONFIG.STATUS.LOCKED)
    ? '確認する'
    : '入力画面を開く';

  const linkFormula = `=HYPERLINK("${estimateUrl}", "${linkText}")`;

  if (targetRow > 0) {
    // 既存行を更新
    sheet.getRange(targetRow, 3).setValue(deadline);
    sheet.getRange(targetRow, 4).setValue(status);
    sheet.getRange(targetRow, 5).setFormula(linkFormula);
  } else {
    // 新規行を追加
    const newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1).setValue(project.name);
    sheet.getRange(newRow, 2).setValue(project.trade);
    sheet.getRange(newRow, 3).setValue(deadline);
    sheet.getRange(newRow, 4).setValue(status);
    sheet.getRange(newRow, 5).setFormula(linkFormula);

    // リンクセルの書式（青文字・下線）
    sheet.getRange(newRow, 5)
      .setFontColor('#1A73E8')
      .setFontWeight('bold');
  }

  // ステータスセルの色を更新
  applyPortalStatusFormatting_(sheet);
}

/**
 * ポータルシートのステータス列に条件付き書式を適用
 */
function applyPortalStatusFormatting_(sheet) {
  const range = sheet.getRange('D2:D100');
  const rules = [];

  for (const [status, color] of Object.entries(CONFIG.STATUS_COLORS)) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(status)
        .setBackground(color)
        .setFontWeight('bold')
        .setRanges([range])
        .build()
    );
  }
  sheet.setConditionalFormatRules(rules);
}

/**
 * 全協力会社のポータルシートのステータスを一括更新する
 */
function syncAllPortals() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);
  const companySheet = ss.getSheetByName(CONFIG.SHEETS.COMPANIES);

  if (!requestSheet || !companySheet) return;

  const requests = requestSheet.getDataRange().getValues();
  const companies = getCompanyMap_(companySheet);
  const projects = {};

  // 会社ごとにリクエストをグループ化
  const companyRequests = {};
  for (let i = 1; i < requests.length; i++) {
    const companyCode = String(requests[i][3]).trim();
    if (!companyCode || !companies[companyCode]) continue;
    if (!companies[companyCode].portalSheetId) continue;

    if (!companyRequests[companyCode]) {
      companyRequests[companyCode] = [];
    }
    companyRequests[companyCode].push({
      projectName: requests[i][2],
      trade: requests[i][5],
      estimateUrl: requests[i][7],
      deadline: requests[i][9],
      status: requests[i][10]
    });
  }

  // 各会社のポータルシートを更新
  for (const [companyCode, reqs] of Object.entries(companyRequests)) {
    const company = companies[companyCode];
    try {
      const portalSS = SpreadsheetApp.openById(company.portalSheetId);
      const sheet = portalSS.getSheets()[0];

      // ヘッダー以外をクリアして再構築
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).clearContent();
      }

      for (let j = 0; j < reqs.length; j++) {
        const req = reqs[j];
        const row = j + 2;
        const deadline = req.deadline instanceof Date
          ? Utilities.formatDate(req.deadline, Session.getScriptTimeZone(), 'yyyy/MM/dd')
          : req.deadline;

        const linkText = (req.status === CONFIG.STATUS.ANSWERED || req.status === CONFIG.STATUS.LOCKED)
          ? '確認する'
          : '入力画面を開く';

        sheet.getRange(row, 1).setValue(req.projectName);
        sheet.getRange(row, 2).setValue(req.trade);
        sheet.getRange(row, 3).setValue(deadline);
        sheet.getRange(row, 4).setValue(req.status);
        sheet.getRange(row, 5).setFormula(`=HYPERLINK("${req.estimateUrl}", "${linkText}")`);
        sheet.getRange(row, 5).setFontColor('#1A73E8').setFontWeight('bold');
      }

      applyPortalStatusFormatting_(sheet);
    } catch (e) {
      writeLog('ポータル同期エラー', `${company.name}: ${e.message}`);
    }
  }

  writeLog('ポータル同期', '全ポータルシートを同期しました');
}
