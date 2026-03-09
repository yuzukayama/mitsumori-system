/**
 * 見積徴収システム - テンプレート管理
 * Excel分割・フォルダスキャン・テンプレート登録
 */

// ═══════════════════════════════════════════════════════
// Excel → 工種別スプレッドシート分割
// ═══════════════════════════════════════════════════════

/**
 * Excelから変換したスプレッドシートの各シートを工種別に分割し、
 * テンプレートフォルダに保存 → テンプレート管理に自動登録する
 */
function splitExcelToTemplates() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const projectSheet = ss.getSheetByName(CONFIG.SHEETS.PROJECTS);
  const templateSheet = ss.getSheetByName(CONFIG.SHEETS.TEMPLATES);

  if (!projectSheet || !templateSheet) {
    ui.alert('エラー', 'シートが見つかりません。初期セットアップを実行してください。', ui.ButtonSet.OK);
    return;
  }

  // 案件コード入力
  const projects = getProjectMap_(projectSheet);
  const projectCodes = Object.keys(projects);
  if (projectCodes.length === 0) {
    ui.alert('案件なし', '案件マスターに案件が登録されていません。', ui.ButtonSet.OK);
    return;
  }

  const projectList = projectCodes.map(code => `${code}: ${projects[code].name}`).join('\n');
  const projInput = ui.prompt(
    'Excel分割 - STEP 1/3',
    `対象の案件コードを入力してください。\n\n${projectList}`,
    ui.ButtonSet.OK_CANCEL
  );
  if (projInput.getSelectedButton() !== ui.Button.OK) return;

  const selectedCode = projInput.getResponseText().trim();
  const project = projects[selectedCode];
  if (!project) {
    ui.alert('エラー', `案件コード「${selectedCode}」が見つかりません。`, ui.ButtonSet.OK);
    return;
  }

  // 元ファイル（Excel→スプレッドシート変換済み）のID入力
  const sourceInput = ui.prompt(
    'Excel分割 - STEP 2/3',
    'Excel変換済みスプレッドシートのIDを入力してください。\n\n' +
    '※ ExcelファイルをDriveで「アプリで開く」→「Googleスプレッドシート」で\n' +
    '　変換したファイルのURLから取得できます。\n\n' +
    'URL例: https://docs.google.com/spreadsheets/d/【★ここがID★】/edit',
    ui.ButtonSet.OK_CANCEL
  );
  if (sourceInput.getSelectedButton() !== ui.Button.OK) return;

  const sourceId = sourceInput.getResponseText().trim();
  let sourceSS;
  try {
    sourceSS = SpreadsheetApp.openById(sourceId);
  } catch (e) {
    ui.alert('エラー', `スプレッドシートを開けません。\nID: ${sourceId}\n\n${e.message}`, ui.ButtonSet.OK);
    return;
  }

  // 全シート名を表示して範囲を選択させる
  const allSheets = sourceSS.getSheets();
  const sheetList = allSheets.map((s, i) => `${i}: ${s.getName()}`).join('\n');

  const rangeInput = ui.prompt(
    'Excel分割 - STEP 3/3',
    `全${allSheets.length}シートが見つかりました。\n\n` +
    `${sheetList}\n\n` +
    'テンプレートとして分割するシートの開始番号と終了番号を\n' +
    '「開始,終了」の形式で入力してください。\n\n' +
    '例: 10,37（10番目〜37番目を分割）',
    ui.ButtonSet.OK_CANCEL
  );
  if (rangeInput.getSelectedButton() !== ui.Button.OK) return;

  const rangeParts = rangeInput.getResponseText().split(',').map(s => parseInt(s.trim(), 10));
  if (rangeParts.length !== 2 || isNaN(rangeParts[0]) || isNaN(rangeParts[1])) {
    ui.alert('エラー', '「開始番号,終了番号」の形式で入力してください。\n例: 10,37', ui.ButtonSet.OK);
    return;
  }

  const startIdx = rangeParts[0];
  const endIdx = rangeParts[1];

  if (startIdx < 0 || endIdx >= allSheets.length || startIdx > endIdx) {
    ui.alert('エラー', `番号は 0〜${allSheets.length - 1} の範囲で指定してください。`, ui.ButtonSet.OK);
    return;
  }

  const targetSheets = allSheets.slice(startIdx, endIdx + 1);
  const targetNames = targetSheets.map(s => s.getName()).join('\n');

  const confirm = ui.alert(
    '分割確認',
    `以下の${targetSheets.length}シートを個別スプレッドシートに分割します。\n\n` +
    `${targetNames}\n\n` +
    `案件: ${project.name}\n` +
    '実行しますか？（処理に数分かかる場合があります）',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // テンプレートフォルダの準備
  const rootFolder = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const templatesRoot = getOrCreateSubFolder_(rootFolder, CONFIG.FOLDERS.TEMPLATES);
  let templateFolder;

  if (project.templateFolderId) {
    try {
      templateFolder = DriveApp.getFolderById(project.templateFolderId);
    } catch (e) {
      templateFolder = templatesRoot.createFolder(`${selectedCode}_${project.name}`);
      updateProjectTemplateFolderId_(projectSheet, selectedCode, templateFolder.getId());
    }
  } else {
    templateFolder = templatesRoot.createFolder(`${selectedCode}_${project.name}`);
    updateProjectTemplateFolderId_(projectSheet, selectedCode, templateFolder.getId());
  }

  const tradeNames = getTradeNames_();
  const existingTemplates = getTemplateMap_(templateSheet);
  let successCount = 0;
  let skipCount = 0;
  const results = [];

  for (const sheet of targetSheets) {
    const sheetName = sheet.getName();
    try {
      // シート名から工種を判定
      const matchedTrade = findMatchingTrade_(sheetName, tradeNames);
      const tradeName = matchedTrade || sheetName;

      // 既に登録済みならスキップ
      const templateKey = `${selectedCode}_${tradeName}`;
      if (existingTemplates[templateKey]) {
        results.push(`⏭ ${sheetName} → ${tradeName}（登録済みスキップ）`);
        skipCount++;
        continue;
      }

      // 新しいスプレッドシートを作成し、シートをコピー
      const newSS = SpreadsheetApp.create(`${tradeName}`);
      const copiedSheet = sheet.copyTo(newSS);

      // コピーしたシートの名前を設定し、デフォルトシートを削除
      copiedSheet.setName(tradeName);
      const defaultSheet = newSS.getSheetByName('シート1') || newSS.getSheetByName('Sheet1');
      if (defaultSheet && newSS.getSheets().length > 1) {
        newSS.deleteSheet(defaultSheet);
      }

      // テンプレートフォルダに移動
      const newFile = DriveApp.getFileById(newSS.getId());
      templateFolder.addFile(newFile);
      const parents = newFile.getParents();
      while (parents.hasNext()) {
        const parent = parents.next();
        if (parent.getId() !== templateFolder.getId()) {
          parent.removeFile(newFile);
        }
      }

      // テンプレート管理シートに登録
      templateSheet.appendRow([
        selectedCode,
        project.name,
        tradeName,
        newSS.getId(),
        newSS.getUrl(),
        new Date()
      ]);

      existingTemplates[templateKey] = newSS.getId();
      successCount++;
      results.push(`✓ ${sheetName} → ${tradeName}`);
    } catch (e) {
      results.push(`✗ ${sheetName}: ${e.message}`);
    }
  }

  const resultMessage = results.join('\n');
  ui.alert(
    '分割完了',
    `成功: ${successCount}件 / スキップ: ${skipCount}件\n\n${resultMessage}`,
    ui.ButtonSet.OK
  );

  writeLog('Excel分割', `案件: ${project.name} / ${successCount}件分割, ${skipCount}件スキップ`);
}

/**
 * 案件マスターのテンプレートフォルダIDを更新する
 */
function updateProjectTemplateFolderId_(projectSheet, projectCode, folderId) {
  const data = projectSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === projectCode) {
      projectSheet.getRange(i + 1, 4).setValue(folderId);
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════
// フォルダスキャンによるテンプレート登録
// ═══════════════════════════════════════════════════════

/**
 * 案件のテンプレートフォルダをスキャンし、テンプレート管理シートに一括登録する
 * ファイル名に工種名が含まれていれば自動マッチングする
 */
function registerTemplatesFromFolder() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const projectSheet = ss.getSheetByName(CONFIG.SHEETS.PROJECTS);
  const templateSheet = ss.getSheetByName(CONFIG.SHEETS.TEMPLATES);

  if (!projectSheet || !templateSheet) {
    ui.alert('エラー', 'シートが見つかりません。初期セットアップを実行してください。', ui.ButtonSet.OK);
    return;
  }

  // 案件選択ダイアログ
  const projects = getProjectMap_(projectSheet);
  const projectCodes = Object.keys(projects);

  if (projectCodes.length === 0) {
    ui.alert('案件なし', '案件マスターに案件が登録されていません。\n先に案件マスターに案件を登録してください。', ui.ButtonSet.OK);
    return;
  }

  const projectList = projectCodes.map(code => `${code}: ${projects[code].name}`).join('\n');
  const input = ui.prompt(
    'テンプレート一括登録',
    `登録する案件コードを入力してください。\n\n登録済み案件一覧：\n${projectList}`,
    ui.ButtonSet.OK_CANCEL
  );

  if (input.getSelectedButton() !== ui.Button.OK) return;

  const selectedCode = input.getResponseText().trim();
  const project = projects[selectedCode];

  if (!project) {
    ui.alert('エラー', `案件コード「${selectedCode}」が見つかりません。`, ui.ButtonSet.OK);
    return;
  }

  if (!project.templateFolderId) {
    ui.alert(
      'エラー',
      `案件「${project.name}」にテンプレートフォルダIDが設定されていません。\n` +
      '案件マスターの「テンプレートフォルダID」列にDriveフォルダIDを入力してください。',
      ui.ButtonSet.OK
    );
    return;
  }

  // フォルダ内のスプレッドシートファイルを取得
  let folder;
  try {
    folder = DriveApp.getFolderById(project.templateFolderId);
  } catch (e) {
    ui.alert('エラー', `フォルダにアクセスできません。\nフォルダID: ${project.templateFolderId}\n\n${e.message}`, ui.ButtonSet.OK);
    return;
  }

  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  const tradeNames = getTradeNames_();
  const existingTemplates = getTemplateMap_(templateSheet);

  const registered = [];
  const unmatched = [];
  const skipped = [];

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    const fileId = file.getId();
    const fileUrl = file.getUrl();

    // ファイル名から工種を自動判定
    const matchedTrade = findMatchingTrade_(fileName, tradeNames);

    if (matchedTrade) {
      const templateKey = `${selectedCode}_${matchedTrade}`;
      if (existingTemplates[templateKey]) {
        skipped.push(`${matchedTrade}（既に登録済み）`);
        continue;
      }
      // テンプレート管理シートに追加
      templateSheet.appendRow([
        selectedCode,
        project.name,
        matchedTrade,
        fileId,
        fileUrl,
        new Date()
      ]);
      registered.push(matchedTrade);
    } else {
      unmatched.push(fileName);
    }
  }

  // 結果レポート
  let message = '';
  if (registered.length > 0) {
    message += `【登録成功】${registered.length}件\n${registered.join('、')}\n\n`;
  }
  if (skipped.length > 0) {
    message += `【スキップ（登録済み）】${skipped.length}件\n${skipped.join('、')}\n\n`;
  }
  if (unmatched.length > 0) {
    message += `【未マッチ（手動登録が必要）】${unmatched.length}件\n${unmatched.join('\n')}\n\n`;
    message += '※ 工種マスターの工種名がファイル名に含まれていない場合、自動マッチできません。\n';
    message += '  テンプレート管理シートに手動で登録するか、ファイル名に工種名を含めてください。';
  }
  if (registered.length === 0 && skipped.length === 0 && unmatched.length === 0) {
    message = 'フォルダ内にGoogleスプレッドシートが見つかりませんでした。\n\n' +
      'Excelファイルの場合は、Googleスプレッドシートに変換してからフォルダに配置してください。\n' +
      '（Excelファイルを右クリック→「アプリで開く」→「Googleスプレッドシート」）';
  }

  ui.alert('テンプレート登録結果', message, ui.ButtonSet.OK);
  writeLog('テンプレート一括登録', `案件: ${project.name} / 登録: ${registered.length}件, スキップ: ${skipped.length}件, 未マッチ: ${unmatched.length}件`);
}

/**
 * ファイル名と工種名リストを照合し、最もマッチする工種を返す
 * 長い工種名を先にチェックすることで「金属工事」と「金属製建具工事」の誤判定を防ぐ
 */
function findMatchingTrade_(fileName, tradeNames) {
  // 長い名前を優先して照合（部分一致の誤判定防止）
  const sorted = [...tradeNames].sort((a, b) => b.length - a.length);
  for (const trade of sorted) {
    if (fileName.indexOf(trade) !== -1) {
      return trade;
    }
  }
  return null;
}

/**
 * テンプレート管理シートに手動で1件追加するためのダイアログ
 */
function addTemplateManually() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const templateSheet = ss.getSheetByName(CONFIG.SHEETS.TEMPLATES);

  if (!templateSheet) {
    ui.alert('エラー', 'テンプレート管理シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const projectCode = ui.prompt('案件コードを入力', '', ui.ButtonSet.OK_CANCEL);
  if (projectCode.getSelectedButton() !== ui.Button.OK) return;

  const trade = ui.prompt('工種名を入力', '', ui.ButtonSet.OK_CANCEL);
  if (trade.getSelectedButton() !== ui.Button.OK) return;

  const templateId = ui.prompt(
    'テンプレートのスプレッドシートIDを入力',
    'URLの「/d/」と「/edit」の間の文字列です',
    ui.ButtonSet.OK_CANCEL
  );
  if (templateId.getSelectedButton() !== ui.Button.OK) return;

  const projects = getProjectMap_(ss.getSheetByName(CONFIG.SHEETS.PROJECTS));
  const project = projects[projectCode.getResponseText().trim()];
  const projectName = project ? project.name : '';

  try {
    const file = DriveApp.getFileById(templateId.getResponseText().trim());
    templateSheet.appendRow([
      projectCode.getResponseText().trim(),
      projectName,
      trade.getResponseText().trim(),
      templateId.getResponseText().trim(),
      file.getUrl(),
      new Date()
    ]);
    ui.alert('登録完了', `テンプレートを登録しました。\n${projectName} - ${trade.getResponseText()}`, ui.ButtonSet.OK);
    writeLog('テンプレート手動登録', `${projectName} - ${trade.getResponseText()}`);
  } catch (e) {
    ui.alert('エラー', `ファイルにアクセスできません。\n${e.message}`, ui.ButtonSet.OK);
  }
}

/**
 * 案件のテンプレートフォルダを新規作成する
 * （見積テンプレートフォルダ配下に案件名のフォルダを作成）
 */
function createProjectTemplateFolder() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const projectSheet = ss.getSheetByName(CONFIG.SHEETS.PROJECTS);

  if (!projectSheet) {
    ui.alert('エラー', '案件マスターシートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const projects = getProjectMap_(projectSheet);
  const projectCodes = Object.keys(projects);

  if (projectCodes.length === 0) {
    ui.alert('案件なし', '案件マスターに案件が登録されていません。', ui.ButtonSet.OK);
    return;
  }

  const projectList = projectCodes.map(code => `${code}: ${projects[code].name}`).join('\n');
  const input = ui.prompt(
    'テンプレートフォルダ作成',
    `フォルダを作成する案件コードを入力してください。\n\n${projectList}`,
    ui.ButtonSet.OK_CANCEL
  );

  if (input.getSelectedButton() !== ui.Button.OK) return;

  const selectedCode = input.getResponseText().trim();
  const project = projects[selectedCode];

  if (!project) {
    ui.alert('エラー', `案件コード「${selectedCode}」が見つかりません。`, ui.ButtonSet.OK);
    return;
  }

  if (project.templateFolderId) {
    ui.alert('確認', `案件「${project.name}」には既にフォルダID「${project.templateFolderId}」が設定されています。`, ui.ButtonSet.OK);
    return;
  }

  const rootFolder = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const templatesRoot = getOrCreateSubFolder_(rootFolder, CONFIG.FOLDERS.TEMPLATES);
  const folderName = `${selectedCode}_${project.name}`;
  const newFolder = templatesRoot.createFolder(folderName);

  // 案件マスターにフォルダIDを書き戻す
  const data = projectSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === selectedCode) {
      projectSheet.getRange(i + 1, 4).setValue(newFolder.getId()); // D列: テンプレートフォルダID
      break;
    }
  }

  ui.alert(
    'フォルダ作成完了',
    `案件「${project.name}」のテンプレートフォルダを作成しました。\n\n` +
    `フォルダ名: ${folderName}\n` +
    `フォルダID: ${newFolder.getId()}\n\n` +
    'このフォルダに見積テンプレート（スプレッドシート）をアップロードしてください。\n' +
    'ファイル名に工種名を含めると、一括登録時に自動マッチングされます。\n' +
    '（例: 「電気設備工事」「内装工事_見積」など）',
    ui.ButtonSet.OK
  );

  writeLog('テンプレートフォルダ作成', `${project.name}: ${newFolder.getId()}`);
}
