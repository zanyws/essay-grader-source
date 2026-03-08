import type { 
  SecondaryReport, 
  PrimaryReport, 
  PracticalReport,
  GeneratedExam,
  APIConfig 
} from '@/types';

// API 類型
export type APIType = 'openai' | 'gemini' | 'custom';

// 後端服務器配置
export const BACKEND_URL = 'https://chinese-grading-server.onrender.com';

// Gemini 默認配置
export const GEMINI_CONFIG = {
  model: 'gemini-2.0-flash',
};

// OpenAI 默認配置
export const OPENAI_CONFIG = {
  model: 'gpt-4o',
};

// Deepseek 默認配置
export const DEEPSEEK_CONFIG = {
  model: 'deepseek-chat',
  baseURL: 'https://api.deepseek.com/v1',
};

// 檢查 API 是否可用
export function isAPIAvailable(apiKey: string): boolean {
  return !!apiKey && apiKey.length > 10;
}

// 測試 API 連接
export async function testAPIConnection(config: APIConfig): Promise<{
  success: boolean;
  message: string;
  model?: string;
}> {
  if (!isAPIAvailable(config.apiKey)) {
    return { success: false, message: 'API 密鑰無效或為空' };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: config.apiKey,
        apiType: config.apiType,
        model: config.model,
        baseURL: config.baseURL,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, message: data.message || '測試失敗' };
    }

    return data;
  } catch (error: any) {
    console.error('Test API connection error:', error);
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
      return { 
        success: false, 
        message: `無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動` 
      };
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
): Promise<{
  text: string;
  name: string;
  studentId: string;
  articles?: { text: string; name: string; studentId: string }[];
}> {
  if (!isAPIAvailable(config.apiKey)) {
    throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  }

  try {
    const isImage = fileType.startsWith('image/');
    const isPDF = fileType === 'application/pdf' || fileType.includes('pdf');
    const useInlineData = isImage || isPDF;
    
    const requestBody: any = {
      apiKey: config.apiKey,
      apiType: config.apiType,
      model: config.model,
      baseURL: config.baseURL,
      fileType: fileType,
      ignoreRedInk: ignoreRedInk,
    };

    if (useInlineData) {
      const base64Data = fileContent.includes(',') 
        ? fileContent.split(',')[1] 
        : fileContent;
      requestBody.fileData = base64Data;
    } else {
      requestBody.text = fileContent;
    }

    const response = await fetch(`${BACKEND_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.message || '提取文字失敗');
    }

    return {
      text: data.text || '',
      name: data.name || '',
      studentId: data.studentId || '',
      articles: data.articles,
    };
  } catch (error: any) {
    console.error('Extract text error:', error);
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
      throw new Error(`無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動`);
    }
    
    throw new Error(error.message || '提取文字失敗');
  }
}

// 中學命題寫作批改
export async function gradeSecondaryEssayWithAPI(
  essayText: string,
  question: string,
  customCriteria: string,
  config: APIConfig,
  options: {
    contentPriority?: boolean;
    enhancementDirection?: 'auto' | 'narrative' | 'argumentative' | 'descriptive';
  } = {}
): Promise<SecondaryReport> {
  if (!isAPIAvailable(config.apiKey)) {
    throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: config.apiKey,
        apiType: config.apiType,
        model: config.model,
        baseURL: config.baseURL,
        essayText: essayText,
        question: question,
        customCriteria: customCriteria,
        gradingMode: 'secondary',
        contentPriority: options.contentPriority,
        enhancementDirection: options.enhancementDirection,
      }),
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.message || '批改失敗');
    }

    const grading = {
      content: Math.max(1, Math.min(10, Math.round(data.grading?.content || 6))) as 1|2|3|4|5|6|7|8|9|10,
      expression: Math.max(1, Math.min(10, Math.round(data.grading?.expression || 6))) as 1|2|3|4|5|6|7|8|9|10,
      structure: Math.max(1, Math.min(10, Math.round(data.grading?.structure || 6))) as 1|2|3|4|5|6|7|8|9|10,
      punctuation: Math.max(5, Math.min(10, Math.round(data.grading?.punctuation || 7))),
    };

    const totalScore = (grading.content * 4) + (grading.expression * 3) + 
                      (grading.structure * 2) + grading.punctuation;

    const buildFeedback = (fb: any) => ({
      strengths: Array.isArray(fb?.strengths) ? fb.strengths : [],
      improvements: Array.isArray(fb?.improvements) ? fb.improvements : [],
    });

    return {
      studentWork: {} as any,
      grading,
      totalScore,
      gradeLabel: getSecondaryGradeLabel(totalScore),
      overallComment: data.overallComment || '',
      contentFeedback: buildFeedback(data.contentFeedback),
      expressionFeedback: buildFeedback(data.expressionFeedback),
      structureFeedback: buildFeedback(data.structureFeedback),
      punctuationFeedback: buildFeedback(data.punctuationFeedback),
      enhancedText: data.enhancedText || essayText,
      enhancementNotes: Array.isArray(data.enhancementNotes) ? data.enhancementNotes : [],
      modelEssay: data.modelEssay || '',
    };
  } catch (error: any) {
    console.error('Grade essay error:', error);
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
      throw new Error(`無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動`);
    }
    
    throw new Error(error.message || '批改失敗');
  }
}

// 小學命題寫作批改
export async function gradePrimaryEssayWithAPI(
  essayText: string,
  question: string,
  customCriteria: string,
  config: APIConfig
): Promise<PrimaryReport> {
  if (!isAPIAvailable(config.apiKey)) {
    throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: config.apiKey,
        apiType: config.apiType,
        model: config.model,
        baseURL: config.baseURL,
        essayText: essayText,
        question: question,
        customCriteria: customCriteria,
        gradingMode: 'primary',
      }),
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.message || '批改失敗');
    }

    const grading = {
      content: Math.max(1, Math.min(4, Math.round(data.grading?.content || 3))) as 1|2|3|4,
      feeling: Math.max(1, Math.min(4, Math.round(data.grading?.feeling || 3))) as 1|2|3|4,
      structure: Math.max(1, Math.min(4, Math.round(data.grading?.structure || 3))) as 1|2|3|4,
      language: Math.max(1, Math.min(4, Math.round(data.grading?.language || 3))) as 1|2|3|4,
      format: Math.max(1, Math.min(4, Math.round(data.grading?.format || 3))) as 1|2|3|4,
    };

    const scoreTable = {
      content: [0, 9, 18, 24, 30],
      feeling: [0, 6, 12, 16, 20],
      structure: [0, 6, 12, 16, 20],
      language: [0, 6, 12, 16, 20],
      format: [0, 3, 6, 8, 10],
    };

    const totalScore = scoreTable.content[grading.content] + 
                      scoreTable.feeling[grading.feeling] +
                      scoreTable.structure[grading.structure] +
                      scoreTable.language[grading.language] +
                      scoreTable.format[grading.format];

    const buildFeedback = (fb: any) => ({
      strengths: Array.isArray(fb?.strengths) ? fb.strengths : [],
      improvements: Array.isArray(fb?.improvements) ? fb.improvements : [],
    });

    return {
      studentWork: {} as any,
      grading,
      totalScore,
      gradeLevel: getPrimaryGradeLevel(totalScore),
      overallComment: data.overallComment || '',
      contentFeedback: buildFeedback(data.contentFeedback),
      feelingFeedback: buildFeedback(data.feelingFeedback),
      structureFeedback: buildFeedback(data.structureFeedback),
      languageFeedback: buildFeedback(data.languageFeedback),
      formatFeedback: buildFeedback(data.formatFeedback),
      enhancedText: data.enhancedText || essayText,
      enhancementNotes: Array.isArray(data.enhancementNotes) ? data.enhancementNotes : [],
      modelEssay: data.modelEssay || '',
    };
  } catch (error: any) {
    console.error('Grade primary essay error:', error);
    throw new Error(error.message || '批改失敗');
  }
}

// 實用寫作批改
export async function gradePracticalEssayWithAPI(
  essayText: string,
  question: string,
  customCriteria: string,
  config: APIConfig
): Promise<PracticalReport> {
  if (!isAPIAvailable(config.apiKey)) {
    throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: config.apiKey,
        apiType: config.apiType,
        model: config.model,
        baseURL: config.baseURL,
        essayText: essayText,
        question: question,
        customCriteria: customCriteria,
        gradingMode: 'practical',
      }),
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.message || '批改失敗');
    }

    const grading = {
      info: Math.max(0, Math.min(2, Math.round(data.grading?.info || 1))),
      development: Math.max(0, Math.min(8, Math.round(data.grading?.development || 5))),
      tone: Math.max(0, Math.min(10, Math.round(data.grading?.tone || 6))),
      organization: Math.max(0, Math.min(10, Math.round(data.grading?.organization || 6))),
    };

    const contentScore = (grading.info + grading.development) * 3;
    const organizationScore = grading.tone + grading.organization;
    const totalScore = contentScore + organizationScore;

    const buildFeedback = (fb: any) => ({
      strengths: Array.isArray(fb?.strengths) ? fb.strengths : [],
      improvements: Array.isArray(fb?.improvements) ? fb.improvements : [],
    });

    return {
      studentWork: {} as any,
      grading,
      contentScore,
      organizationScore,
      totalScore,
      overallComment: data.overallComment || '',
      infoFeedback: buildFeedback(data.infoFeedback),
      developmentFeedback: buildFeedback(data.developmentFeedback),
      toneFeedback: buildFeedback(data.toneFeedback),
      organizationFeedback: buildFeedback(data.organizationFeedback),
      formatIssues: Array.isArray(data.formatIssues) ? data.formatIssues : [],
      enhancedText: data.enhancedText || essayText,
      enhancementNotes: Array.isArray(data.enhancementNotes) ? data.enhancementNotes : [],
      modelEssay: data.modelEssay || '',
    };
  } catch (error: any) {
    console.error('Grade practical essay error:', error);
    throw new Error(error.message || '批改失敗');
  }
}

// 提取題目與評分準則
export async function extractQuestionCriteriaWithAPI(
  fileContent: string,
  fileType: string,
  config: APIConfig
): Promise<{
  question: string;
  criteria: string;
}> {
  if (!isAPIAvailable(config.apiKey)) {
    throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  }

  try {
    const isImage = fileType.startsWith('image/');
    const isPDF = fileType === 'application/pdf' || fileType.includes('pdf');
    const useInlineData = isImage || isPDF;
    
    const requestBody: any = {
      apiKey: config.apiKey,
      apiType: config.apiType,
      model: config.model,
      baseURL: config.baseURL,
      fileType: fileType,
    };

    if (useInlineData) {
      const base64Data = fileContent.includes(',') 
        ? fileContent.split(',')[1] 
        : fileContent;
      requestBody.fileData = base64Data;
    } else {
      requestBody.text = fileContent;
    }

    const response = await fetch(`${BACKEND_URL}/api/extract-question-criteria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.message || '提取失敗');
    }

    return {
      question: data.question || '',
      criteria: data.criteria || '',
    };
  } catch (error: any) {
    console.error('Extract question/criteria error:', error);
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
      throw new Error(`無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動`);
    }
    
    throw new Error(error.message || '提取失敗');
  }
}

// 生成實用寫作模擬卷（新邏輯：上傳模擬卷→生成新模擬卷）
export async function generatePracticalExamWithAPI  (
  fileContent: string,
  fileType: string,
  genre: string,
  config: APIConfig
): Promise<GeneratedExam> {
  if (!isAPIAvailable(config.apiKey)) {
    throw new Error('API 密鑰無效，請在右上角設定正確的 API 密鑰');
  }

  try {
    const isImage = fileType.startsWith('image/');
    const isPDF = fileType === 'application/pdf' || fileType.includes('pdf');
    const useInlineData = isImage || isPDF;
    
    const requestBody: any = {
      apiKey: config.apiKey,
      apiType: config.apiType,
      model: config.model,
      baseURL: config.baseURL,
      fileType: fileType,
      genre: genre,
    };

    if (useInlineData) {
      const base64Data = fileContent.includes(',') 
        ? fileContent.split(',')[1] 
        : fileContent;
      requestBody.fileData = base64Data;
    } else {
      requestBody.text = fileContent;
    }

    const response = await fetch(`${BACKEND_URL}/api/generate-practical-exam`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    // 檢查響應內容類型
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text.substring(0, 500));
      throw new Error('服務器返回格式錯誤，請稍後重試');
    }

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.message || '生成失敗');
    }

    return {
      examPaper: data.examPaper || {
        title: 'DSE 中文卷二甲部：實用寫作',
        time: '45分鐘',
        marks: '50分',
        instructions: [],
        question: '',
        material1: { title: '', content: '' },
        material2: { title: '', content: '' },
      },
      markingScheme: data.markingScheme || ?
              markingScheme: {
        content: {
          infoPoints: data.markingScheme?.content?.infoPoints || [],
          developmentPoints: data.markingScheme?.content?.developmentPoints || []
        },
        organization: {
          formatRequirements: data.markingScheme?.organization?.formatRequirements || [],
          toneRequirements: data.markingScheme?.organization?.toneRequirements || []
        }
      },
  } catch (error: any) {
    console.error('Generate exam error:', error);
    
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Network')) {
      throw new Error(`無法連接到後端服務器 (${BACKEND_URL})，請確認後端服務器已啟動`);
    }
    
    throw new Error(error.message || '生成失敗');
  }
}

// 生成全班分析報告
export async function generateClassAnalysisWithAPI(
  reports: any[],
  question: string,
  config: APIConfig,
  gradingMode: 'secondary' | 'primary' | 'practical' = 'secondary'
): Promise<{
  materialAnalysis: string;
  relevanceAnalysis: string;
  themeAnalysis: string;
  techniqueAnalysis: string;
  teachingSuggestion: string;
}> {
  if (!isAPIAvailable(config.apiKey)) {
    throw new Error('API 密鑰無效');
  }

  try {
    const simplifiedReports = reports.map(r => ({
      totalScore: r.totalScore,
      grading: r.grading,
      studentWork: { name: r.studentWork?.name || '未命名' },
    }));

    const response = await fetch(`${BACKEND_URL}/api/analyze-class`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: config.apiKey,
        apiType: config.apiType,
        model: config.model,
        baseURL: config.baseURL,
        reports: simplifiedReports,
        question: question,
        gradingMode: gradingMode,
      }),
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.message || '分析失敗');
    }

    return {
      materialAnalysis: data.materialAnalysis || '',
      relevanceAnalysis: data.relevanceAnalysis || '',
      themeAnalysis: data.themeAnalysis || '',
      techniqueAnalysis: data.techniqueAnalysis || '',
      teachingSuggestion: data.teachingSuggestion || '',
    };
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
