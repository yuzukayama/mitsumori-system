/**
 * 見積徴収システム - 見積依頼作成・共有設定
 * テンプレート管理シートから案件×工種でテンプレートを特定してコピーする
 */

/**
 * 見積依頼管理シートで「未依頼」の行を処理し、
 * テンプレートのコピー・共有設定・ポータル更新を行う
 */
function createEstimateRequests() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);
  const companySheet = ss.getSheetByName(CONFIG.SHEETS.COMPANIES);
  const projectSheet = ss.getSheetByName(CONFIG.SHEETS.PROJECTS);
  const templateSheet = ss.getSheetByName(CONFIG.SHEETS.TEMPLATES);

  if (!requestSheet || !companySheet || !projectSheet || !templateSheet) {
    ui.alert('エラー', 'シートが見つかりません。初期セットアップを実行してください。', ui.ButtonSet.OK);
    return;
  }

  const requests = requestSheet.getDataRange().getValues();
  const companies = getCompanyMap_(companySheet);
  const projects = getProjectMap_(projectSheet);
  const templates = getTemplateMap_(templateSheet);

  // 未依頼の行を収集
  const draftRows = [];
  for (let i = 1; i < requests.length; i++) {
    const status = requests[i][10]; // K列: ステータス
    const projectCode = String(requests[i][1]).trim(); // B列: 案件コード
    const companyCode = String(requests[i][3]).trim(); // D列: 会社コード
    const trade = String(requests[i][5]).trim(); // F列: 工種

    if (status === CONFIG.STATUS.DRAFT && projectCode && companyCode) {
      draftRows.push({ rowIndex: i + 1, projectCode, companyCode, trade });
    }
  }

  if (draftRows.length === 0) {
    ui.alert(
      '対象なし',
      '「未依頼」ステータスの行がありません。\n\n' +
      '見積依頼管理シートに以下を入力してください：\n' +
      '・B列: 案件コード\n' +
      '・D列: 会社コード\n' +
      '・F列: 工種（空欄なら会社の主要工種を使用）\n' +
      '・K列: 「未依頼」を選択',
      ui.ButtonSet.OK
    );
    return;
  }

  const confirm = ui.alert(
    '見積依頼作成',
    `${draftRows.length}件の見積依頼を作成します。\nテンプレートのコピー・共有設定・ポータル更新を行います。\n実行しますか？`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const rootFolder = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const estimateFolder = getOrCreateSubFolder_(rootFolder, CONFIG.FOLDERS.ESTIMATES);

  let successCount = 0;
  let errorCount = 0;

  for (const row of draftRows) {
    try {
      const project = projects[row.projectCode];
      const company = companies[row.companyCode];

      if (!project) {
        throw new Error(`案件コード「${row.projectCode}」が案件マスターに見つかりません`);
      }
      if (!company) {
        throw new Error(`会社コード「${row.companyCode}」が協力会社マスターに見つかりません`);
      }

      // 工種の決定: F列に入力があればそれを使用、なければ会社の主要工種
      const trade = row.trade || company.trade;
      if (!trade) {
        throw new Error(`工種が指定されていません（会社: ${company.name}）`);
      }

      // テンプレート管理から該当テンプレートを検索
      const templateKey = `${row.projectCode}_${trade}`;
      const templateId = templates[templateKey];
      if (!templateId) {
        throw new Error(
          `テンプレートが見つかりません（案件: ${row.projectCode}, 工種: ${trade}）\n` +
          'テンプレート管理シートに登録してください'
        );
      }

      // テンプレートをコピー
      const fileName = `【見積】${project.name}_${trade}_${company.name}`;
      const copiedFile = DriveApp.getFileById(templateId).makeCopy(fileName, estimateFolder);
      const newSheetId = copiedFile.getId();
      const newSheetUrl = copiedFile.getUrl();

      // 共有設定: リンクを知っている全員が編集可能
      setAnyoneCanEdit_(newSheetId);

      // 見積依頼管理シートの行を更新
      const rowNum = row.rowIndex;
      requestSheet.getRange(rowNum, 3).setValue(project.name);       // C列: 案件名
      requestSheet.getRange(rowNum, 5).setValue(company.name);       // E列: 会社名
      requestSheet.getRange(rowNum, 6).setValue(trade);              // F列: 工種
      requestSheet.getRange(rowNum, 7).setValue(newSheetId);         // G列: 見積シートID
      requestSheet.getRange(rowNum, 8).setValue(newSheetUrl);        // H列: 見積シートURL
      requestSheet.getRange(rowNum, 9).setValue(new Date());         // I列: 依頼日
      requestSheet.getRange(rowNum, 10).setValue(project.deadline);  // J列: 提出期限
      requestSheet.getRange(rowNum, 11).setValue(CONFIG.STATUS.SENT);// K列: ステータス

      // ポータルシート更新（project オブジェクトに trade を付与して渡す）
      const projectWithTrade = Object.assign({}, project, { trade: trade });
      updateCompanyPortal(company, projectWithTrade, newSheetUrl, CONFIG.STATUS.SENT);

      successCount++;
      writeLog('見積依頼作成', `${company.name} / ${project.name} - ${trade}`);
    } catch (e) {
      errorCount++;
      writeLog('見積依頼作成エラー', `行${row.rowIndex}: ${e.message}`);
    }
  }

  applyStatusFormatting_(requestSheet);

  ui.alert(
    '処理完了',
    `成功: ${successCount}件\nエラー: ${errorCount}件\n\n詳細は操作ログシートを確認してください。`,
    ui.ButtonSet.OK
  );
}

// ─── マスターデータ取得 ───

function getCompanyMap_(sheet) {
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][0]).trim();
    if (!code) continue;
    map[code] = {
      code: code,
      name: data[i][1],
      contact: data[i][2],
      email: data[i][3],
      phone: data[i][4],
      trade: data[i][5],
      portalSheetId: data[i][6],
      portalSheetUrl: data[i][7],
      siteUrl: data[i][8],
      notes: data[i][9]
    };
  }
  return map;
}

/**
 * 案件マスターをマップ化（工種列を削除し、テンプレートフォルダID列に変更）
 * 列: 案件コード | 案件名 | 見積提出期限 | テンプレートフォルダID | 図面フォルダURL | 備考
 */
function getProjectMap_(sheet) {
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][0]).trim();
    if (!code) continue;
    map[code] = {
      code: code,
      name: data[i][1],
      deadline: data[i][2],
      templateFolderId: String(data[i][3]).trim(),
      drawingsUrl: data[i][4],
      notes: data[i][5]
    };
  }
  return map;
}

/**
 * テンプレート管理シートをマップ化
 * キー: "案件コード_工種" → テンプレートID
 * 列: 案件コード | 案件名 | 工種 | テンプレートID | テンプレートURL | 登録日
 */
function getTemplateMap_(sheet) {
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const projectCode = String(data[i][0]).trim();
    const trade = String(data[i][2]).trim();
    const templateId = String(data[i][3]).trim();
    if (!projectCode || !trade || !templateId) continue;
    map[`${projectCode}_${trade}`] = templateId;
  }
  return map;
}

/**
 * 工種マスターから工種名一覧を取得
 */
function getTradeNames_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TRADES);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getDataRange().getValues();
  return data.slice(1).map(row => String(row[1]).trim()).filter(name => name);
}

// ─── ヘルパー関数 ───

/**
 * ファイルを「リンクを知っている全員が編集可能」に設定する
 * 共有ドライブではDriveApp.setSharing()が使えないため、Drive API v2を使用する
 */
function setAnyoneCanEdit_(fileId) {
  // 方法1: DriveApp.setSharing()（マイドライブ用）
  try {
    const file = DriveApp.getFileById(fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
    return;
  } catch (e) {
    // 共有ドライブでは失敗するため、方法2にフォールバック
  }

  // 方法2: Drive API（共有ドライブ対応）
  try {
    var permission = {
      type: 'anyone',
      role: 'writer'
    };
    Drive.Permissions.insert(permission, fileId, {supportsAllDrives: true});
  } catch (e2) {
    throw new Error('共有設定に失敗しました: ' + e2.message +
      '\n\nDrive APIが有効になっていない場合は、Apps Scriptエディタの' +
      '「サービス」からDrive APIを追加してください。');
  }
}

/**
 * ファイルを「リンクを知っている全員が閲覧のみ」に変更する（ロック用）
 */
function setAnyoneViewOnly_(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return;
  } catch (e) {
    // 共有ドライブの場合
  }

  try {
    // 既存のanyoneパーミッションを取得して更新
    var permissions = Drive.Permissions.list(fileId, {supportsAllDrives: true});
    if (permissions.items) {
      for (var i = 0; i < permissions.items.length; i++) {
        if (permissions.items[i].type === 'anyone') {
          Drive.Permissions.patch({role: 'reader'}, fileId, permissions.items[i].id, {supportsAllDrives: true});
          return;
        }
      }
    }
    // anyoneパーミッションがなければ新規作成
    Drive.Permissions.insert({type: 'anyone', role: 'reader'}, fileId, {supportsAllDrives: true});
  } catch (e2) {
    throw new Error('共有設定の変更に失敗しました: ' + e2.message);
  }
}

function getOrCreateSubFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

/**
 * ステータス列に条件付き書式を適用
 */
function applyStatusFormatting_(sheet) {
  const range = sheet.getRange('K2:K1000');
  const rules = [];
  for (const [status, color] of Object.entries(CONFIG.STATUS_COLORS)) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(status)
        .setBackground(color)
        .setRanges([range])
        .build()
    );
  }
  sheet.setConditionalFormatRules(rules);
}
