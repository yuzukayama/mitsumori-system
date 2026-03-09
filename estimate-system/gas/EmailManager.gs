/**
 * 見積徴収システム - メール送信
 */

/**
 * 「依頼済」ステータスかつメール未送信の行に対して見積依頼メールを送信する
 */
function sendRequestEmails() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);
  const companySheet = ss.getSheetByName(CONFIG.SHEETS.COMPANIES);

  if (!requestSheet || !companySheet) {
    ui.alert('エラー', 'シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const requests = requestSheet.getDataRange().getValues();
  const companies = getCompanyMap_(companySheet);

  // メール未送信の依頼済行を収集
  const targets = [];
  for (let i = 1; i < requests.length; i++) {
    const status = requests[i][10];  // K列
    const emailSent = requests[i][12]; // M列
    const companyCode = String(requests[i][3]).trim();

    if (status === CONFIG.STATUS.SENT && !emailSent && companyCode) {
      const company = companies[companyCode];
      if (company && company.email) {
        targets.push({
          rowIndex: i + 1,
          projectName: requests[i][2],
          trade: requests[i][5],
          estimateUrl: requests[i][7],
          deadline: requests[i][9],
          company: company
        });
      }
    }
  }

  if (targets.length === 0) {
    ui.alert('対象なし', 'メール未送信の依頼がありません。', ui.ButtonSet.OK);
    return;
  }

  // 送信先一覧を表示して確認
  const targetList = targets.map(t =>
    `・${t.company.name}（${t.company.email}）- ${t.projectName}`
  ).join('\n');

  const confirm = ui.alert(
    'メール送信確認',
    `以下の${targets.length}件にメールを送信します。\n\n${targetList}\n\n送信しますか？`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  let successCount = 0;
  let errorCount = 0;

  for (const target of targets) {
    try {
      sendEstimateRequestEmail_(target);
      requestSheet.getRange(target.rowIndex, 13).setValue(new Date()); // M列: メール送信日
      successCount++;
      writeLog('メール送信', `${target.company.name} / ${target.projectName}`);
    } catch (e) {
      errorCount++;
      writeLog('メール送信エラー', `${target.company.name}: ${e.message}`);
    }
  }

  ui.alert('送信完了', `成功: ${successCount}件\nエラー: ${errorCount}件`, ui.ButtonSet.OK);
}

/**
 * 見積依頼メールを1件送信する
 */
function sendEstimateRequestEmail_(target) {
  const myCompany = getSettingValue('自社名');
  const myName = getSettingValue('担当者名');
  const myPhone = getSettingValue('電話番号');
  const myEmail = getSettingValue('メールアドレス');
  const subjectTemplate = getSettingValue('メール件名') || '【見積依頼】{案件名} - {工種}';

  const deadline = target.deadline instanceof Date
    ? Utilities.formatDate(target.deadline, Session.getScriptTimeZone(), 'yyyy/MM/dd')
    : target.deadline;

  const replacements = {
    '{会社名}': target.company.name,
    '{担当者名}': target.company.contact,
    '{案件名}': target.projectName,
    '{工種}': target.trade,
    '{提出期限}': deadline,
    '{見積URL}': target.estimateUrl,
    '{自社名}': myCompany,
    '{自分の名前}': myName,
    '{電話番号}': myPhone,
    '{メールアドレス}': myEmail
  };

  const subject = replaceTemplate_(subjectTemplate, replacements);
  const body = buildRequestEmailBody_(replacements);

  GmailApp.sendEmail(target.company.email, subject, body);
}

/**
 * リマインドメールを送信する
 */
function sendReminderEmails() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestSheet = ss.getSheetByName(CONFIG.SHEETS.REQUESTS);
  const companySheet = ss.getSheetByName(CONFIG.SHEETS.COMPANIES);

  if (!requestSheet || !companySheet) {
    ui.alert('エラー', 'シートが見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const requests = requestSheet.getDataRange().getValues();
  const companies = getCompanyMap_(companySheet);
  const reminderDays = Number(getSettingValue('リマインド日数（期限N日前）')) || 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targets = [];
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

    if (daysUntil <= reminderDays && daysUntil >= 0) {
      targets.push({
        rowIndex: i + 1,
        projectName: requests[i][2],
        trade: requests[i][5],
        estimateUrl: requests[i][7],
        deadline: deadline,
        company: company,
        daysUntil: daysUntil
      });
    }
  }

  if (targets.length === 0) {
    ui.alert('対象なし', `期限${reminderDays}日以内の未回答案件はありません。`, ui.ButtonSet.OK);
    return;
  }

  const targetList = targets.map(t =>
    `・${t.company.name} - ${t.projectName}（残り${t.daysUntil}日）`
  ).join('\n');

  const confirm = ui.alert(
    'リマインド送信確認',
    `以下の${targets.length}件にリマインドメールを送信します。\n\n${targetList}\n\n送信しますか？`,
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  let successCount = 0;
  for (const target of targets) {
    try {
      sendReminderEmail_(target);
      successCount++;
      writeLog('リマインド送信', `${target.company.name} / ${target.projectName}`);
    } catch (e) {
      writeLog('リマインド送信エラー', `${target.company.name}: ${e.message}`);
    }
  }

  ui.alert('送信完了', `${successCount}件のリマインドメールを送信しました。`, ui.ButtonSet.OK);
}

/**
 * リマインドメールを1件送信する
 */
function sendReminderEmail_(target) {
  const myCompany = getSettingValue('自社名');
  const myName = getSettingValue('担当者名');
  const myPhone = getSettingValue('電話番号');
  const myEmail = getSettingValue('メールアドレス');
  const subjectTemplate = getSettingValue('リマインド件名') || '【再送】{案件名} - {工種}（期限：{提出期限}）';

  const deadline = target.deadline instanceof Date
    ? Utilities.formatDate(target.deadline, Session.getScriptTimeZone(), 'yyyy/MM/dd')
    : target.deadline;

  const replacements = {
    '{会社名}': target.company.name,
    '{担当者名}': target.company.contact,
    '{案件名}': target.projectName,
    '{工種}': target.trade,
    '{提出期限}': deadline,
    '{見積URL}': target.estimateUrl,
    '{自社名}': myCompany,
    '{自分の名前}': myName,
    '{電話番号}': myPhone,
    '{メールアドレス}': myEmail
  };

  const subject = replaceTemplate_(subjectTemplate, replacements);
  const body = buildReminderEmailBody_(replacements);

  GmailApp.sendEmail(target.company.email, subject, body);
}

// ─── メールテンプレート ───

function buildRequestEmailBody_(r) {
  return `${r['{会社名}']} ${r['{担当者名}']} 様

いつもお世話になっております。
${r['{自社名}']}の${r['{自分の名前}']}です。

下記案件の見積をお願いしたく、ご連絡差し上げました。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 案件名：${r['{案件名}']}
■ 工種　：${r['{工種}']}
■ 提出期限：${r['{提出期限}']}
━━━━━━━━━━━━━━━━━━━━━━━━

下記URLを開き、見積入力をお願いいたします。

${r['{見積URL}']}

※URLを開くとスプレッドシートが表示されます。
　黄色のセルに単価・金額等をご入力ください。
※入力内容は自動保存されます。

ご不明な点がございましたら、お気軽にお問い合わせください。

何卒よろしくお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
${r['{自社名}']}
${r['{自分の名前}']}
TEL: ${r['{電話番号}']}
Email: ${r['{メールアドレス}']}
━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function buildReminderEmailBody_(r) {
  return `${r['{会社名}']} ${r['{担当者名}']} 様

いつもお世話になっております。
${r['{自社名}']}の${r['{自分の名前}']}です。

先日ご依頼いたしました下記案件の見積につきまして、
提出期限が近づいておりますので再度ご連絡差し上げました。

━━━━━━━━━━━━━━━━━━━━━━━━
■ 案件名：${r['{案件名}']}
■ 工種　：${r['{工種}']}
■ 提出期限：${r['{提出期限}']}
━━━━━━━━━━━━━━━━━━━━━━━━

見積入力URL：
${r['{見積URL}']}

お忙しいところ恐れ入りますが、
期限までにご入力いただけますようお願いいたします。

何卒よろしくお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━━━
${r['{自社名}']}
${r['{自分の名前}']}
TEL: ${r['{電話番号}']}
Email: ${r['{メールアドレス}']}
━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─── ユーティリティ ───

function replaceTemplate_(template, replacements) {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(escapeRegExp_(key), 'g'), value || '');
  }
  return result;
}

function escapeRegExp_(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
