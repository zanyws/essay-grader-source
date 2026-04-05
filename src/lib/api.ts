import type { SecondaryReport, PrimaryReport, PracticalReport, GeneratedExam, APIConfig } from '@/types';
// API 類型
export type APIType = 'openai' | 'gemini' | 'custom';

// 後端服務器配置
export const BACKEND_URL = 'https://chinese-grading-server.onrender.com';

// Gemini 默認配置
export const GEMINI_CONFIG = { model: 'gemini-2.0-flash' };

// OpenAI 默認配置
export const OPENAI_CONFIG = { model: 'gpt-4o' };

// Deepseek 默認配置
export const DEEPSEEK_CONFIG = { model: 'deepseek-chat', baseURL: 'https://api.deepseek.com/v1' };

// 檢查 API 是否可用
export function isAPIAvailable(apiKey: string): boolean {
  return !!apiKey && apiKey.length > 10;
}

// 測試 API 連接
export async function testAPIConnection(config: APIConfig): Promise<{ success: boolean; message: string; model?: string }> {
  if (!isAPIAvailable(config.apiKey)) return { success: false, message: 'API 密鑰無效或為空' };
  try {
    const response = await fetch(`${BACKEND_URL}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: config.apiKey, apiType: config.apiType, model: config.model, baseURL: config.baseURL }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || '測試失敗' };
    return data;
  } catch (error: any) {
    console.error('Test API connection error:', error);
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
      return { success: false, message: `無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動` };
    }
    return { success: false, message: `連接失敗: ${error.message || '未知錯誤'}` };
  }
}

// OCR 提取文字（支援多篇自動分辨）
export async function extractTextWithAPI(
  fileContent: string,
  fileType: string,
  config: APIConfig,
  ignoreRedInk: boolean = false
): Promise<{ text: string; name: string; studentId: string; articles?: { text: string; name: string; studentId: string }[] }> {
  if (!isAPIAvailable(config.apiKey)) throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  try {
    const isImage = fileType.startsWith('image/');
    const isPDF = fileType === 'application/pdf' || fileType.includes('pdf');
    const useInlineData = isImage || isPDF;
    const requestBody: any = { apiKey: config.apiKey, apiType: config.apiType, model: config.model, baseURL: config.baseURL, fileType, ignoreRedInk };
    if (useInlineData) {
      requestBody.fileData = fileContent.includes(',') ? fileContent.split(',')[1] : fileContent;
    } else {
      requestBody.text = fileContent;
    }
    const response = await fetch(`${BACKEND_URL}/api/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || '提取文字失敗');
    return { text: data.text || '', name: data.name || '', studentId: data.studentId || '', articles: data.articles };
  } catch (error: any) {
    console.error('Extract text error:', error);
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) throw new Error(`無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動`);
    throw new Error(error.message || '提取文字失敗');
  }
}

// 中學命題寫作批改
export async function gradeSecondaryEssayWithAPI(
  essayText: string, question: string, customCriteria: string, config: APIConfig,
  options: { contentPriority?: boolean; enhancementDirection?: 'auto' | 'narrative' | 'argumentative' | 'descriptive' } = {}
): Promise<SecondaryReport> {
  if (!isAPIAvailable(config.apiKey)) throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  try {
    const response = await fetch(`${BACKEND_URL}/api/grade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: config.apiKey, apiType: config.apiType, model: config.model, baseURL: config.baseURL, essayText, question, customCriteria, gradingMode: 'secondary', contentPriority: options.contentPriority, enhancementDirection: options.enhancementDirection }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || '批改失敗');
    const grading = {
      content: Math.max(1, Math.min(10, Math.round(data.grading?.content || 6))) as 1|2|3|4|5|6|7|8|9|10,
      expression: Math.max(1, Math.min(10, Math.round(data.grading?.expression || 6))) as 1|2|3|4|5|6|7|8|9|10,
      structure: Math.max(1, Math.min(10, Math.round(data.grading?.structure || 6))) as 1|2|3|4|5|6|7|8|9|10,
      punctuation: Math.max(5, Math.min(10, Math.round(data.grading?.punctuation || 7))),
    };
    const totalScore = (grading.content * 4) + (grading.expression * 3) + (grading.structure * 2) + grading.punctuation;
    const buildFeedback = (fb: any) => ({ strengths: Array.isArray(fb?.strengths) ? fb.strengths : [], improvements: Array.isArray(fb?.improvements) ? fb.improvements : [] });
    return { studentWork: {} as any, grading, totalScore, gradeLabel: getSecondaryGradeLabel(totalScore), overallComment: data.overallComment || '', contentFeedback: buildFeedback(data.contentFeedback), expressionFeedback: buildFeedback(data.expressionFeedback), structureFeedback: buildFeedback(data.structureFeedback), punctuationFeedback: buildFeedback(data.punctuationFeedback), enhancedText: data.enhancedText || essayText, enhancementNotes: Array.isArray(data.enhancementNotes) ? data.enhancementNotes : [], modelEssay: data.modelEssay || '' };
  } catch (error: any) {
    console.error('Grade essay error:', error);
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) throw new Error(`無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動`);
    throw new Error(error.message || '批改失敗');
  }
}

// 小學命題寫作批改
export async function gradePrimaryEssayWithAPI(essayText: string, question: string, customCriteria: string, config: APIConfig): Promise<PrimaryReport> {
  if (!isAPIAvailable(config.apiKey)) throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  try {
    const response = await fetch(`${BACKEND_URL}/api/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: config.apiKey, apiType: config.apiType, model: config.model, baseURL: config.baseURL, essayText, question, customCriteria, gradingMode: 'primary' }) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || '批改失敗');
    const grading = {
      content: Math.max(1, Math.min(4, Math.round(data.grading?.content || 3))) as 1|2|3|4,
      feeling: Math.max(1, Math.min(4, Math.round(data.grading?.feeling || 3))) as 1|2|3|4,
      structure: Math.max(1, Math.min(4, Math.round(data.grading?.structure || 3))) as 1|2|3|4,
      language: Math.max(1, Math.min(4, Math.round(data.grading?.language || 3))) as 1|2|3|4,
      format: Math.max(1, Math.min(4, Math.round(data.grading?.format || 3))) as 1|2|3|4,
    };
    const scoreTable = { content: [0,9,18,24,30], feeling: [0,6,12,16,20], structure: [0,6,12,16,20], language: [0,6,12,16,20], format: [0,3,6,8,10] };
    const totalScore = scoreTable.content[grading.content] + scoreTable.feeling[grading.feeling] + scoreTable.structure[grading.structure] + scoreTable.language[grading.language] + scoreTable.format[grading.format];
    const buildFeedback = (fb: any) => ({ strengths: Array.isArray(fb?.strengths) ? fb.strengths : [], improvements: Array.isArray(fb?.improvements) ? fb.improvements : [] });
    return { studentWork: {} as any, grading, totalScore, gradeLevel: getPrimaryGradeLevel(totalScore), overallComment: data.overallComment || '', contentFeedback: buildFeedback(data.contentFeedback), feelingFeedback: buildFeedback(data.feelingFeedback), structureFeedback: buildFeedback(data.structureFeedback), languageFeedback: buildFeedback(data.languageFeedback), formatFeedback: buildFeedback(data.formatFeedback), enhancedText: data.enhancedText || essayText, enhancementNotes: Array.isArray(data.enhancementNotes) ? data.enhancementNotes : [], modelEssay: data.modelEssay || '' };
  } catch (error: any) {
    console.error('Grade primary essay error:', error);
    throw new Error(error.message || '批改失敗');
  }
}

// 實用寫作評分細項類型
export interface PracticalDevItems { label?: string; fullCount?: string; partCount?: string; }

// 實用寫作批改
export async function gradePracticalEssayWithAPI(
  essayText: string, question: string, customCriteria: string, config: APIConfig,
  options: { genre?: string; infoPoints?: string[]; devItems?: PracticalDevItems; formatRequirements?: string[]; materials?: string } = {}
): Promise<PracticalReport> {
  if (!isAPIAvailable(config.apiKey)) throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  try {
    const response = await fetch(`${BACKEND_URL}/api/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: config.apiKey, apiType: config.apiType, model: config.model, baseURL: config.baseURL, essayText, question, customCriteria, gradingMode: 'practical', genre: options.genre || '', infoPoints: options.infoPoints || [], devItems: options.devItems || {}, formatRequirements: options.formatRequirements || [], materials: options.materials || '' }) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || '批改失敗');
    const grading = { info: Math.max(0, Math.min(2, Math.round(data.grading?.info || 1))), development: Math.max(0, Math.min(8, Math.round(data.grading?.development || 5))), tone: Math.max(0, Math.min(10, Math.round(data.grading?.tone || 6))), organization: Math.max(0, Math.min(10, Math.round(data.grading?.organization || 6))) };
    const contentScore = (grading.info + grading.development) * 3;
    const organizationScore = grading.tone + grading.organization;
    const totalScore = contentScore + organizationScore;
    const buildFeedback = (fb: any) => ({ strengths: Array.isArray(fb?.strengths) ? fb.strengths : [], improvements: Array.isArray(fb?.improvements) ? fb.improvements : [] });
    return { studentWork: {} as any, grading, contentScore, organizationScore, totalScore, overallComment: data.overallComment || '', infoFeedback: buildFeedback(data.infoFeedback), developmentFeedback: buildFeedback(data.developmentFeedback), toneFeedback: buildFeedback(data.toneFeedback), organizationFeedback: buildFeedback(data.organizationFeedback), formatIssues: Array.isArray(data.formatIssues) ? data.formatIssues : [], enhancedText: data.enhancedText || essayText, enhancementNotes: Array.isArray(data.enhancementNotes) ? data.enhancementNotes : [], modelEssay: data.modelEssay || '' };
  } catch (error: any) {
    console.error('Grade practical essay error:', error);
    throw new Error(error.message || '批改失敗');
  }
}

// 提取題目與評分準則（【已修改】加入 genre 返回值）
export async function extractQuestionCriteriaWithAPI(
  fileContent: string,
  fileType: string,
  config: APIConfig
): Promise<{
  question: string;
  materials: string;
  criteria: string;
  genre: string;  // 新增：AI 根據題目文件自動判斷的文體
}> {
  if (!isAPIAvailable(config.apiKey)) throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  try {
    const isImage = fileType.startsWith('image/');
    const isPDF = fileType === 'application/pdf' || fileType.includes('pdf');
    const useInlineData = isImage || isPDF;
    const requestBody: any = { apiKey: config.apiKey, apiType: config.apiType, model: config.model, baseURL: config.baseURL, fileType };
    if (useInlineData) {
      requestBody.fileData = fileContent.includes(',') ? fileContent.split(',')[1] : fileContent;
    } else {
      requestBody.text = fileContent;
    }
    const response = await fetch(`${BACKEND_URL}/api/extract-question-criteria`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || '提取失敗');
    return {
      question: data.question || '',
      materials: data.materials || '',
      criteria: data.criteria || '',
      genre: data.genre || '',  // 新增：後端 AI 判斷的文體
    };
  } catch (error: any) {
    console.error('Extract question/criteria error:', error);
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) throw new Error(`無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動`);
    throw new Error(error.message || '提取失敗');
  }
}

const GENRE_LABELS: Record<string, string> = { speech: '演講辭', letter: '書信／公開信', proposal: '建議書', report: '報告', commentary: '評論文章', article: '專題文章' };

const GENRE_FORMAT_GUIDE: Record<string, string> = {
  speech: `【演講辭必備格式】\n- 稱謂：寫在文章開首第一行頂格，按「先尊後卑」次序排列，末尾必須有冒號（例如：校長、各位老師、各位同學：）\n- 自我介紹：寫在開首引入正文前，交代自己的身份（例如：大家好，我是學生會主席……）\n- 文末致謝：寫在文章最末尾（例如：多謝各位。）\n【扣分陷阱】\n- 切勿添加書信格式，如「鈞鑒」、「敬啟者」、「此致」、「祝頌語」等\n【行文語氣評分重點】\n- 以「說明效果」為主：語氣親切、具感染力，能有效游說聽眾\n【內容發展細項數量（供評分參考使用）】\n- 資料一應提供：2項核心措施＋2項配套措施（共4項，列於表格）\n- 資料二應提供：3項同學意見（1則支持、2則疑慮）＋1則寫作者宣布演講\n- 評分參考細項：2項措施、4個措施細項、3項同學意見`,
  letter: `【書信／公開信必備格式】\n- 上款／稱謂：寫在文章開首，頂格書寫收信人（例如：王老師／各位同學：）\n- 祝頌語：寫在正文後，先空兩格寫「祝」，再於下一行頂格寫祝福語（例如：祝↵教安）\n- 署名：寫在祝頌語下一行，分兩行書寫，均靠右，身份行空兩格在前，姓名行頂格在後（階梯式）\n例如：學生會主席↵ 林美珊謹啟\n- 日期：寫在署名下一行，靠左頂格，必須寫上完整的年、月、日\n【扣分陷阱】\n- 切勿在開首寫「本文旨在說明」或使用演講辭的自我介紹格式\n- 切勿把祝頌語、署名寫在同一行\n【行文語氣評分重點】\n- 視乎題目類型：自薦信以「自薦效果」為主；公開信以「游說／呼籲效果」為主\n【內容發展細項數量（供評分參考使用）】\n- 評分參考細項：2項個人條件、4個條件細項（經歷及履歷）、3項同學意見`,
  proposal: `【建議書必備格式】\n- 上款：頂格書寫收信人（例如：圖書館主任張老師：）\n- 標題：置中書寫，必須包含「建議」二字\n- 署名：分兩行書寫，身份行空兩格，姓名行頂格（階梯式），均靠右\n- 日期：署名下一行靠左頂格，寫上完整的年、月、日\n【扣分陷阱】\n- 建議書屬公務文書，不應添加「祝頌語」\n- 標題必須有「建議」二字\n【行文語氣評分重點】\n- 以「說服效果」為主：語氣客觀、正式，建議具體可行\n【內容發展細項數量（供評分參考使用）】\n- 評分參考細項：2個建議、4個建議細項、3項同學意見`,
  report: `【報告必備格式】\n- 上款：頂格書寫呈交對象（例如：陳校長：）\n- 標題：置中書寫，必須包含「報告」二字\n- 署名：分兩行書寫，身份行空兩格，姓名行頂格（階梯式），均靠右\n- 日期：署名下一行靠左頂格，寫上完整的年、月、日\n【扣分陷阱】\n- 切勿加入「多謝各位」、「祝頌語」或「專此」等非報告格式用語\n- 標題必須有「報告」二字\n【行文語氣評分重點】\n- 以「客觀匯報效果」為主：語氣正式、客觀，資料呈現清晰有條理\n【內容發展細項數量（供評分參考使用）】\n- 評分參考細項：2個調查類別、4個調查意見、2個改善建議`,
  commentary: `【評論文章必備格式】\n- 標題：寫在文章頂部，置中書寫，交代文章主題\n- 署名：寫在文末，分兩行書寫，身份行空兩格，姓名行頂格（階梯式），均靠右，不寫「啟」\n【扣分陷阱】\n- 評論屬「文章」類別，切勿加上書信的「上款」、「祝頌語」，也不需要「日期」\n- 署名不寫「啟」字\n【行文語氣評分重點】\n- 以「論證效果」為主：語氣客觀持平，立場清晰，論證有力\n【內容發展細項數量（供評分參考使用）】\n- 評分參考細項：2個目標、4項活動、4項同學意見`,
  article: `【專題文章必備格式】\n- 標題：寫在文章頂部，置中書寫，帶出主題核心價值\n- 署名：與評論文章相同，寫在文末，不寫「啟」\n【扣分陷阱】\n- 切勿加上「上款」、「祝頌語」及「日期」，否則被視為添加多餘格式扣2分\n- 署名不寫「啟」字\n【行文語氣評分重點】\n- 以「說明效果」為主：語氣客觀、有說服力，能有效呼籲讀者\n【內容發展細項數量（供評分參考使用）】\n- 評分參考細項：2個目標、4項活動細項、4項意見`,
};

// 生成實用寫作模擬卷
export async function generatePracticalExamWithAPI(fileContent: string, fileType: string, genre: string, config: APIConfig): Promise<GeneratedExam> {
  if (!isAPIAvailable(config.apiKey)) throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  try {
    const isImage = fileType.startsWith('image/');
    const isPDF = fileType === 'application/pdf' || fileType.includes('pdf');
    const useInlineData = isImage || isPDF;
    const genreLabel = GENRE_LABELS[genre] || genre;
    const genreFormatGuide = GENRE_FORMAT_GUIDE[genre] || '';
    const systemPrompt = `你是香港 DSE 中文科卷二甲部（實用寫作）的出題專家，專門設計符合考評局要求的模擬試卷。\n\n【你的任務】\n根據用戶提供的參考模擬卷，理解其主題方向，然後設計一份全新的模擬試卷，文體為「${genreLabel}」。新試卷必須保持與參考卷相同的主題方向（如環保、閱讀推廣、健康生活、社區服務等），讓學生就相同主題作第二次練習，加強拓展能力。但情境、計劃名稱、機構名稱、具體活動內容和人物姓名必須完全不同，避免重複。\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n一、題目設計（必須嚴格遵守以下公式）\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n題目必須包含以下五個要素，缺一不可：\n① 情境背景：[學校名稱]將[發起某計劃或活動，或引起討論]\n【報告文體例外】情境應為「[機構]就[某議題]進行了問卷調查／意見收集，現就結果作報告」\n② 身份：試以[學校名稱][職銜][中文姓名（三字）]的名義\n③ 文體及發表場合：撰寫[${genreLabel}]，[具體發表場合，如：在早會時段說明／刊登於校報《XX通訊》]\n④ 寫作任務一：[說明計劃的意義／分析計劃的利弊／就計劃提出看法]\n【報告文體例外】任務一應為「就調查結果作報告，說明[調查議題]的現況」\n⑤ 寫作任務二：並[鼓勵同學積極參與／建議校方作出改善／回應同學的意見]\n【報告文體例外】任務二應為「根據調查結果，提出改善建議」\n⑥ 字數：（全文不得多於550字，標點符號計算在內。）\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n二、資料一設計（官方文件形式）\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n標題格式：「資料一：[機構名稱]「[計劃名稱]」[文件類型]」\n【報告文體例外】資料一必須是「問卷調查結果」\n【其他文體】內容含背景說明、計劃目的、活動內容表格（2欄：活動名稱｜內容，2-3行）\n字數：正文約60-90字，加表格，總體不超過130字\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n三、資料二設計（學生討論記錄形式）\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n共4則留言：第1則疑慮（對應活動一）、第2則疑慮（對應活動二）、第3則支持、第4則寫作者宣布撰文\n字數：每則留言20-40字\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n五、評分參考\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n資訊分（最高2分）\n內容發展分（最高8分）評分標準：7–8分（齊全；合理、扣題、具體拓展；解說清晰）、5–6分（齊全；合理、具體拓展）、3–4分（大致齊全）、1–2分（不齊全）、0分（欠缺）。直接照抄原文無拓展最高只給4分。\n行文語氣（最高10分）、組織（最高10分）\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n六、${genreLabel}格式要求\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${genreFormatGuide}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n七、示範文章（不少於550字，拓展部分用【拓展】【/拓展】標記）\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    const requestBody: any = { apiKey: config.apiKey, apiType: config.apiType, model: config.model, baseURL: config.baseURL, fileType, genre, genreLabel, systemPrompt, promptVersion: '2.0' };
    if (useInlineData) {
      requestBody.fileData = fileContent.includes(',') ? fileContent.split(',')[1] : fileContent;
    } else {
      requestBody.text = fileContent;
    }
    const response = await fetch(`${BACKEND_URL}/api/generate-practical-exam`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) throw new Error('服務器返回格式錯誤，請稍後重試');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || '生成失敗');
    const ms = data.markingScheme || {};
    const toInfoPoints = (table: any[]): string[] => Array.isArray(table) ? table.map(r => `${r.item}：${r.description || r.requirement || ''}`) : [];
    const toDevPoints = (table: any[]): string[] => Array.isArray(table) ? table.filter(r => r.item && r.item !== 'undefined' && r.description && r.description !== 'undefined').map(r => { const score = r.score && r.score !== 'undefined' ? `【${r.score}】` : ''; return `${score}${r.item}：${r.description}`; }) : [];
    const toFormatPoints = (table: any[]): string[] => Array.isArray(table) ? table.filter(r => r.item && r.item !== 'undefined').map(r => `${r.item}：${r.requirement || r.description || ''}${r.score ? `（${r.score}）` : ''}`) : [];
    return {
      examPaper: { title: data.examPaper?.title || 'DSE 中文卷二甲部：實用寫作', time: '45分鐘', marks: '50分', instructions: Array.isArray(data.examPaper?.instructions) ? data.examPaper.instructions : [], question: data.examPaper?.question || '', material1: { title: data.examPaper?.material1?.title || '材料一', content: data.examPaper?.material1?.content || '' }, material2: { title: data.examPaper?.material2?.title || '材料二', content: data.examPaper?.material2?.content || '' } },
      markingScheme: { content: { infoPoints: toInfoPoints(ms.contentInfo?.table || ms.content?.infoPoints || ms.infoPoints || []), developmentPoints: toDevPoints(ms.contentDevelopment?.table || ms.content?.developmentPoints || ms.developmentPoints || []) }, organization: { formatRequirements: toFormatPoints(ms.formatRequirements?.table || ms.organization?.formatRequirements || ms.formatRequirements || []), toneRequirements: toFormatPoints(ms.toneRequirements?.table || ms.organization?.toneRequirements || ms.toneRequirements || []) } },
      modelEssay: data.modelEssay || '',
    };
  } catch (error: any) {
    console.error('Generate exam error:', error);
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) throw new Error(`無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動`);
    throw new Error(error.message || '生成失敗');
  }
}

// 生成全班分析報告
export async function generateClassAnalysisWithAPI(reports: any[], question: string, config: APIConfig, gradingMode: 'secondary' | 'primary' | 'practical' = 'secondary'): Promise<{ materialAnalysis: string; relevanceAnalysis: string; themeAnalysis: string; techniqueAnalysis: string; teachingSuggestion: string }> {
  if (!isAPIAvailable(config.apiKey)) throw new Error('API 密鑰無效');
  try {
    const simplifiedReports = reports.map(r => ({ totalScore: r.totalScore, grading: r.grading, studentWork: { name: r.studentWork?.name || '未命名' } }));
    const response = await fetch(`${BACKEND_URL}/api/analyze-class`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: config.apiKey, apiType: config.apiType, model: config.model, baseURL: config.baseURL, reports: simplifiedReports, question, gradingMode }) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || '分析失敗');
    return { materialAnalysis: data.materialAnalysis || '', relevanceAnalysis: data.relevanceAnalysis || '', themeAnalysis: data.themeAnalysis || '', techniqueAnalysis: data.techniqueAnalysis || '', teachingSuggestion: data.teachingSuggestion || '' };
  } catch (error: any) {
    console.error('Analyze class error:', error);
    throw new Error(error.message || '分析失敗');
  }
}

// 輔助函數
function getSecondaryGradeLabel(totalScore: number): string {
  if (totalScore >= 90) return '上上';
  if (totalScore >= 85) return '上中';
  if (totalScore >= 80) return '上下';
  if (totalScore >= 70) return '中上';
  if (totalScore >= 60) return '中中';
  if (totalScore >= 50) return '中下';
  if (totalScore >= 40) return '下上';
  if (totalScore >= 30) return '下中';
  if (totalScore >= 10) return '下下';
  return '極差';
}

function getPrimaryGradeLevel(totalScore: number): string {
  if (totalScore >= 85) return '優異';
  if (totalScore >= 70) return '良好';
  if (totalScore >= 50) return '一般';
  return '有待改善';
}
