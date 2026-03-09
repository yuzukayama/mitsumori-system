/**
 * 見積徴収システム - ステータス監視・期限管理
 */

/**
 * 全依頼のステータスを一括更新する
 * 見積シートの最終編集日時を確認し、編集があれば「回答済」にする
 * 期限超過もチェックする
 */
function updateAllStatuses() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);

  if (!requestSheet) {
    ui.alert('エラー', '見積依頼管理シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const requests = requestSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let updatedCount = 0;
  let overdueCount = 0;

  for (let i = 1; i < requests.length; i++) {
    const status = requests[i][10];     // K列: ステータス
    const sheetId = requests[i][6];     // G列: 見積シートID
    const deadline = requests[i][9];    // J列: 提出期限
    const createdDate = requests[i][8]; // I列: 依頼日

    if (!sheetId || status === CONFIG.STATUS.LOCKED) continue;

    try {
      // 見積シートの最終更新日を確認
      const file = DriveApp.getFileById(String(sheetId).trim());
      const lastUpdated = file.getLastUpdated();
      requestSheet.getRange(i + 1, 12).setValue(lastUpdated); // L列: 最終編集日時

      // 依頼日以降に編集されていれば「回答済」
      if (status === CONFIG.STATUS.SENT && createdDate) {
        const createdTime = new Date(createdDate);
        // 作成後5分以上経ってから編集があった場合を回答とみなす
        const threshold = new Date(createdTime.getTime() + 5 * 60 * 1000);
        if (lastUpdated > threshold) {
          requestSheet.getRange(i + 1, 11).setValue(CONFIG.STATUS.ANSWERED);
          updatedCount++;
          continue;
        }
      }

      // 期限超過チェック
      if (status === CONFIG.STATUS.SENT && deadline) {
        const deadlineDate = new Date(deadline);
        deadlineDate.setHours(23, 59, 59, 999);
        if (today > deadlineDate) {
          requestSheet.getRange(i + 1, 11).setValue(CONFIG.STATUS.OVERDUE);
          overdueCount++;
        }
      }
    } catch (e) {
      writeLog('ステータス更新エラー', `行${i + 1}: ${e.message}`);
    }
  }

  // ステータスの条件付き書式を再適用
  applyStatusFormatting_(requestSheet);

  // ポータルシートも同期
  syncAllPortals();

  ui.alert(
    'ステータス更新完了',
    `回答確認: ${updatedCount}件\n期限超過: ${overdueCount}件`,
    ui.ButtonSet.OK
  );
  writeLog('ステータス一括更新', `回答${updatedCount}件、期限超過${overdueCount}件`);
}

/**
 * 期限切れの見積シートを「閲覧のみ」に変更（ロック）する
 */
function lockExpiredSheets() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);

  if (!requestSheet) {
    ui.alert('エラー', '見積依頼管理シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const requests = requestSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ロック対象の収集
  const targets = [];
  for (let i = 1; i < requests.length; i++) {
    const status = requests[i][10];
    const sheetId = requests[i][6];
    const deadline = requests[i][9];

    if (!sheetId || status === CONFIG.STATUS.LOCKED) continue;
    if (status !== CONFIG.STATUS.OVERDUE && status !== CONFIG.STATUS.ANSWERED) continue;

    if (deadline) {
      const deadlineDate = new Date(deadline);
      deadlineDate.setHours(23, 59, 59, 999);
      if (today > deadlineDate) {
        targets.push({
          rowIndex: i + 1,
          sheetId: String(sheetId).trim(),
          projectName: requests[i][2],
          companyName: requests[i][4]
        });
      }
    }
  }

  if (targets.length === 0) {
    ui.alert('対象なし', 'ロック対象の見積シートはありません。', ui.ButtonSet.OK);
    return;
  }

  const targetList = targets.map(t => `・${t.companyName} - ${t.projectName}`).join('\n');
  const confirm = ui.alert(
    'シートロック確認',
    `以下の${targets.length}件の見積シートを「閲覧のみ」に変更します。\n\n${targetList}\n\nロックしますか？`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  let successCount = 0;
  for (const target of targets) {
    try {
      setAnyoneViewOnly_(target.sheetId);
      requestSheet.getRange(target.rowIndex, 11).setValue(CONFIG.STATUS.LOCKED);
      successCount++;
      writeLog('シートロック', `${target.companyName} / ${target.projectName}`);
    } catch (e) {
      writeLog('シートロックエラー', `${target.companyName}: ${e.message}`);
    }
  }

  // ポータルも同期
  syncAllPortals();
  applyStatusFormatting_(requestSheet);

  ui.alert('ロック完了', `${successCount}件のシートをロックしました。`, ui.ButtonSet.OK);
}

// ─── タイムトリガー用関数 ───

/**
 * 定期実行用: ステータス更新（UIなし版）
 * トリガーに設定して自動実行する場合に使用
 */
function autoUpdateStatuses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);
  if (!requestSheet) return;

  const requests = requestSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 1; i < requests.length; i++) {
    const status = requests[i][10];
    const sheetId = requests[i][6];
    const deadline = requests[i][9];
    const createdDate = requests[i][8];

    if (!sheetId || status === CONFIG.STATUS.LOCKED) continue;

    try {
      const file = DriveApp.getFileById(String(sheetId).trim());
      const lastUpdated = file.getLastUpdated();
      requestSheet.getRange(i + 1, 12).setValue(lastUpdated);

      if (status === CONFIG.STATUS.SENT && createdDate) {
        const threshold = new Date(new Date(createdDate).getTime() + 5 * 60 * 1000);
        if (lastUpdated > threshold) {
          requestSheet.getRange(i + 1, 11).setValue(CONFIG.STATUS.ANSWERED);
          continue;
        }
      }

      if (status === CONFIG.STATUS.SENT && deadline) {
        const deadlineDate = new Date(deadline);
        deadlineDate.setHours(23, 59, 59, 999);
        if (today > deadlineDate) {
          requestSheet.getRange(i + 1, 11).setValue(CONFIG.STATUS.OVERDUE);
        }
      }
    } catch (e) {
      writeLog('自動ステータス更新エラー', `行${i + 1}: ${e.message}`);
    }
  }

  applyStatusFormatting_(requestSheet);
  syncAllPortals();
  writeLog('自動ステータス更新', '定期実行完了');
}

/**
 * 定期実行用: 期限間近のリマインド自動送信
 * トリガーに設定して自動実行する場合に使用
 */
function autoSendReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);
  const companySheet = ss.getSheetByName(CONFIG.SHEETS.COMPANIES);
  if (!requestSheet || !companySheet) return;

  const requests = requestSheet.getDataRange().getValues();
  const companies = getCompanyMap_(companySheet);
  const reminderDays = Number(getSettingValue('リマインド日数（期限N日前）')) || 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 1; i < requests.length; i++) {
    const status = requests[i][10];
    const deadline = requests[i][9];
    const companyCode = String(requests[i][3]).trim();

    if (status !== CONFIG.STATUS.SENT || !deadline || !companyCode) continue;

    const company = companies[companyCode];
    if (!company || !company.email) continue;

    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));

    if (daysUntil === reminderDays) {
      try {
        sendReminderEmail_({
          projectName: requests[i][2],
          trade: requests[i][5],
          estimateUrl: requests[i][7],
          deadline: deadline,
          company: company
        });
        writeLog('自動リマインド送信', `${company.name} / ${requests[i][2]}`);
      } catch (e) {
        writeLog('自動リマインド送信エラー', `${company.name}: ${e.message}`);
      }
    }
  }
}
