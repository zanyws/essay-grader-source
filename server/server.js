const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

// 嘗試載入 mammoth 用於處理 Word 文件
let mammoth = null;
try {
  mammoth = require('mammoth');
  console.log('Mammoth loaded successfully for Word processing');
} catch (e) {
  console.log('Mammoth not available, Word files will be processed via API');
}

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// 健康檢查
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: '中文科批改系統 API 服務器運行中',
    timestamp: new Date().toISOString()
  });
});

// 測試 API 連接
// 輕量 ping 端點（用於冷啟動偵測，不需要 API 密鑰）
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.post('/api/test', async (req, res) => {
  try {
    const { apiKey, apiType, model, baseURL } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'API 密鑰不能為空' });
    }

    if (apiType === 'gemini') {
      const result = await testGeminiConnection(apiKey, model);
      return res.json(result);
    } else if (apiType === 'custom') {
      if (!baseURL) {
        return res.status(400).json({ success: false, message: '自定義 API 需要提供 API 基礎 URL' });
      }
      const result = await testCustomConnection(apiKey, baseURL, model);
      return res.json(result);
    } else if (apiType === 'openai') {
      const result = await testOpenAIConnection(apiKey, model);
      return res.json(result);
    } else {
      return res.status(400).json({ success: false, message: '未知的 API 類型: ' + apiType });
    }
  } catch (error) {
    console.error('Test API error:', error);
    res.status(500).json({ success: false, message: error.message || '測試失敗' });
  }
});

// OCR 提取文字 - 支持多篇文章分篇
app.post('/api/extract', async (req, res) => {
  try {
    const { apiKey, apiType, model, baseURL, fileType, fileData, text } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'API 密鑰不能為空' });
    }

    if (!fileData && !text) {
      return res.status(400).json({ success: false, message: '沒有提供文件或文字' });
    }

    console.log('Extract request:', { apiType, fileType, hasFileData: !!fileData, hasText: !!text });

    let result;
    if (apiType === 'gemini') {
      result = await extractWithGemini(apiKey, model, fileData, text, fileType);
    } else if (apiType === 'custom') {
      if (!baseURL) {
        return res.status(400).json({ success: false, message: '自定義 API 需要提供 API 基礎 URL' });
      }
      result = await extractWithCustom(apiKey, baseURL, model, fileData, text, fileType);
    } else if (apiType === 'openai') {
      result = await extractWithOpenAI(apiKey, model, fileData, text, fileType);
    } else {
      return res.status(400).json({ success: false, message: '未知的 API 類型: ' + apiType });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Extract error:', error);
    res.status(500).json({ success: false, message: error.message || '提取失敗' });
  }
});

// 提取題目與評分準則
app.post('/api/extract-question-criteria', async (req, res) => {
  try {
    const { apiKey, apiType, model, baseURL, fileType, fileData, text } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'API 密鑰不能為空' });
    }

    if (!fileData && !text) {
      return res.status(400).json({ success: false, message: '沒有提供文件或文字' });
    }

    console.log('Extract question/criteria request:', { apiType, fileType, hasFileData: !!fileData, hasText: !!text });

    // Word 文件：先用 mammoth 提取文字
    let processedFileData = fileData;
    let processedText = text;
    let processedFileType = fileType;
    const isWord = fileType && (
      fileType === 'application/msword' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileType.includes('word') || fileType.includes('doc')
    );
    if (isWord && fileData) {
      if (!mammoth) {
        return res.status(400).json({ success: false, message: 'Word 文件處理需要 mammoth 庫' });
      }
      try {
        const buffer = Buffer.from(fileData, 'base64');
        const extracted = await mammoth.extractRawText({ buffer });
        processedText = extracted.value;
        processedFileData = null;
        processedFileType = 'text/plain';
        console.log('Word extracted for extract-question-criteria, length:', processedText.length);
      } catch (wordError) {
        return res.status(400).json({ success: false, message: `無法提取 Word 文件內容: ${wordError.message}` });
      }
    }

    let result;
    if (apiType === 'gemini') {
      result = await extractQuestionCriteriaWithGemini(apiKey, model, processedFileData, processedText, processedFileType);
    } else if (apiType === 'custom') {
      if (!baseURL) {
        return res.status(400).json({ success: false, message: '自定義 API 需要提供 API 基礎 URL' });
      }
      result = await extractQuestionCriteriaWithCustom(apiKey, baseURL, model, processedFileData, processedText, processedFileType);
    } else if (apiType === 'openai') {
      result = await extractQuestionCriteriaWithOpenAI(apiKey, model, processedFileData, processedText, processedFileType);
    } else {
      return res.status(400).json({ success: false, message: '未知的 API 類型: ' + apiType });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Extract question/criteria error:', error);
    res.status(500).json({ success: false, message: error.message || '提取失敗' });
  }
});

// 批改作文
app.post('/api/grade', async (req, res) => {
  try {
    const { apiKey, apiType, model, baseURL, essayText, question, customCriteria, gradingMode, contentPriority, enhancementDirection, genre, infoPoints, devItems, formatRequirements, materials, regenerateFeedbackOnly, teacherGrading } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'API 密鑰不能為空' });
    }

    if (!essayText) {
      return res.status(400).json({ success: false, message: '作文內容不能為空' });
    }

    const maxLength = 15000;
    const truncatedText = essayText.length > maxLength 
      ? essayText.substring(0, maxLength) + '\n\n[文章過長，已截斷]' 
      : essayText;

    // 【重新生成評語模式】：老師調整評分後，只重新生成評語，保留原有增潤文章和示範文章
    if (regenerateFeedbackOnly && teacherGrading && (gradingMode === 'secondary' || gradingMode === 'practical')) {
      let result;
      if (apiType === 'gemini') {
        result = await regenerateFeedbackWithGemini(apiKey, model, truncatedText, question, teacherGrading);
      } else if (apiType === 'custom') {
        if (!baseURL) return res.status(400).json({ success: false, message: '自定義 API 需要提供 API 基礎 URL' });
        result = await regenerateFeedbackWithCustom(apiKey, baseURL, model, truncatedText, question, teacherGrading);
      } else {
        result = await regenerateFeedbackWithOpenAI(apiKey, model, truncatedText, question, teacherGrading);
      }
      return res.json({ success: true, ...result });
    }

    let result;
    if (apiType === 'gemini') {
      result = await gradeWithGemini(apiKey, model, truncatedText, question, customCriteria, gradingMode, contentPriority, enhancementDirection, genre, infoPoints, devItems, formatRequirements, materials);
    } else if (apiType === 'custom') {
      if (!baseURL) {
        return res.status(400).json({ success: false, message: '自定義 API 需要提供 API 基礎 URL' });
      }
      result = await gradeWithCustom(apiKey, baseURL, model, truncatedText, question, customCriteria, gradingMode, contentPriority, enhancementDirection, genre, infoPoints, devItems, formatRequirements, materials);
    } else if (apiType === 'openai') {
      result = await gradeWithOpenAI(apiKey, model, truncatedText, question, customCriteria, gradingMode, contentPriority, enhancementDirection, genre, infoPoints, devItems, formatRequirements, materials);
    } else {
      return res.status(400).json({ success: false, message: '未知的 API 類型: ' + apiType });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Grade error:', error);
    res.status(500).json({ success: false, message: error.message || '批改失敗' });
  }
});

// 生成實用寫作模擬卷（新邏輯：上傳模擬卷→生成新模擬卷）
app.post('/api/generate-practical-exam', async (req, res) => {
  try {
    const { apiKey, apiType, model, baseURL, fileData, fileType, text, genre, systemPrompt: clientSystemPrompt } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'API 密鑰不能為空' });
    }

    if (!fileData && !text) {
      return res.status(400).json({ success: false, message: '請上傳模擬卷文件' });
    }

    if (!genre) {
      return res.status(400).json({ success: false, message: '請選擇文體' });
    }

    let result;

    // Word 文件：先用 mammoth 提取文字，再當純文字處理
    let processedFileData = fileData;
    let processedFileType = fileType;
    let processedText = text;
    const isWord = fileType && (
      fileType === 'application/msword' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileType.includes('word') || fileType.includes('doc')
    );
    if (isWord && fileData) {
      if (!mammoth) {
        return res.status(400).json({ success: false, message: 'Word 文件處理需要 mammoth 庫，請確保後端已安裝 mammoth (npm install mammoth)' });
      }
      try {
        const buffer = Buffer.from(fileData, 'base64');
        const extracted = await mammoth.extractRawText({ buffer });
        processedText = extracted.value;
        processedFileData = null;
        processedFileType = 'text/plain';
        console.log('Word file extracted for exam generation, length:', processedText.length);
      } catch (wordError) {
        return res.status(400).json({ success: false, message: `無法提取 Word 文件內容: ${wordError.message}` });
      }
    }

    if (apiType === 'gemini') {
      result = await generatePracticalExamWithGemini(apiKey, model, processedFileData, processedText, processedFileType, genre, clientSystemPrompt);
    } else if (apiType === 'custom') {
      if (!baseURL) {
        return res.status(400).json({ success: false, message: '自定義 API 需要提供 API 基礎 URL' });
      }
      result = await generatePracticalExamWithCustom(apiKey, baseURL, model, processedFileData, processedText, processedFileType, genre, clientSystemPrompt);
    } else if (apiType === 'openai') {
      result = await generatePracticalExamWithOpenAI(apiKey, model, processedFileData, processedText, processedFileType, genre, clientSystemPrompt);
    } else {
      return res.status(400).json({ success: false, message: '未知的 API 類型: ' + apiType });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Generate exam error:', error);
    res.status(500).json({ success: false, message: error.message || '生成失敗' });
  }
});

// 全班分析
app.post('/api/analyze-class', async (req, res) => {
  try {
    const { apiKey, apiType, model, baseURL, reports, question, gradingMode } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'API 密鑰不能為空' });
    }

    const maxReports = 30;
    const limitedReports = reports.slice(0, maxReports);

    let result;
    if (apiType === 'gemini') {
      result = await analyzeClassWithGemini(apiKey, model, limitedReports, question, gradingMode);
    } else if (apiType === 'custom') {
      if (!baseURL) {
        return res.status(400).json({ success: false, message: '自定義 API 需要提供 API 基礎 URL' });
      }
      result = await analyzeClassWithCustom(apiKey, baseURL, model, limitedReports, question, gradingMode);
    } else if (apiType === 'openai') {
      result = await analyzeClassWithOpenAI(apiKey, model, limitedReports, question, gradingMode);
    } else {
      return res.status(400).json({ success: false, message: '未知的 API 類型: ' + apiType });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Analyze class error:', error);
    res.status(500).json({ success: false, message: error.message || '分析失敗' });
  }
});

// ============ 輔助函數 ============

function normalizeGeminiModelName(modelName) {
  if (!modelName) return 'gemini-2.0-flash';
  let name = modelName.startsWith('models/') ? modelName.substring(7) : modelName;
  const modelMap = {
    'gemini-1.5-flash': 'gemini-1.5-flash-latest',
    'gemini-1.5-pro': 'gemini-1.5-pro-latest',
    'gemini-1.0-pro': 'gemini-1.0-pro-latest',
    'gemini-pro': 'gemini-1.0-pro-latest',
  };
  if (modelMap[name]) return modelMap[name];
  if (name.includes('-latest') || /-\d{3}$/.test(name)) return name;
  return name;
}

// Gemini 安全設置 - 解除過濾（批改學生作文需要寬鬆設定）
const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
];

// 安全解析 JSON - 增強版
/**
 * 將 AI 返回的模擬卷結果統一轉換為前端期望格式。
 * AI 返回: markingScheme.contentInfo.table[] + contentDevelopment.table[] + formatRequirements.table[]
 * 前端期望: markingScheme.content.infoPoints[] + content.factualPoints[] + content.developmentPoints[] + organization.formatRequirements[]
 */
function transformExamResult(result) {
  const ms = result.markingScheme || {};

  // 資訊分：contentInfo.table → infoPoints（取 item + description 拼合）
  const rawInfoTable = ms.contentInfo?.table || ms.content?.infoPoints?.map ? null : null;
  let infoPoints = [];
  if (Array.isArray(ms.contentInfo?.table)) {
    infoPoints = ms.contentInfo.table.map(r => r.description ? `${r.item}：${r.description}` : r.item).filter(Boolean);
  } else if (Array.isArray(ms.content?.infoPoints)) {
    infoPoints = ms.content.infoPoints;
  }

  // 內容發展分：支援新格式（factualContent + expansionPoints）和舊格式（table）
  let factualPoints = [];
  let developmentPoints = [];
  const cd = ms.contentDevelopment;
  if (cd) {
    // 新格式
    if (Array.isArray(cd.factualContent)) {
      factualPoints = cd.factualContent.filter(Boolean);
    }
    if (Array.isArray(cd.expansionPoints)) {
      developmentPoints = cd.expansionPoints.filter(Boolean);
    }
    // 舊格式兼容（table[]）
    if (factualPoints.length === 0 && developmentPoints.length === 0 && Array.isArray(cd.table)) {
      cd.table.forEach(r => {
        const text = r.description ? `${r.item}：${r.description}` : r.item;
        const isExpansion = /拓展|疑慮|游說|回應|說服|針對|克服|利用/.test(r.description || r.item || '');
        if (isExpansion) developmentPoints.push(text);
        else factualPoints.push(text);
      });
      if (factualPoints.length === 0) {
        developmentPoints = cd.table.map(r => r.description ? `${r.item}：${r.description}` : r.item).filter(Boolean);
      }
    }
  } else {
    factualPoints = Array.isArray(ms.content?.factualPoints) ? ms.content.factualPoints : [];
    developmentPoints = Array.isArray(ms.content?.developmentPoints) ? ms.content.developmentPoints : [];
  }

  // 格式要求：formatRequirements.table → formatRequirements[]
  let formatRequirements = [];
  if (Array.isArray(ms.formatRequirements?.table)) {
    formatRequirements = ms.formatRequirements.table.map(r => r.requirement || r.item).filter(Boolean);
  } else if (Array.isArray(ms.organization?.formatRequirements)) {
    formatRequirements = ms.organization.formatRequirements;
  }

  return {
    examPaper: result.examPaper || {
      title: 'DSE 中文卷二甲部：實用寫作',
      time: '45分鐘',
      marks: '50分',
      instructions: [],
      question: '',
      material1: { title: '', content: '' },
      material2: { title: '', content: '' },
    },
    markingScheme: {
      content: { infoPoints, factualPoints, developmentPoints },
      organization: { formatRequirements, toneRequirements: [] },
    },
    modelEssay: result.modelEssay || '',
  };
}


function safeJSONParse(text, context = '') {
  if (!text || typeof text !== 'string') {
    throw new Error(`AI 返回內容為空或格式錯誤 (${context})`);
  }
  
  console.log(`Parsing JSON (${context}):`, text.substring(0, 200) + '...');
  
  try {
    // 1. 去除 markdown 代碼塊標記
    let cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*$/gi, '')
      .trim();
    
    // 2. 嘗試直接解析
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // 3. 嘗試提取 JSON 對象（找第一個 { 和最後一個 }）
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(jsonStr);
        } catch (e2) {
          console.log('Extracted JSON parse failed, trying repair...');
        }
      }
      
      // 4. 修復截斷的 JSON（Unexpected end of JSON input）
      // 找到最後一個完整的 } 或 ] 並截斷
      let truncated = cleaned;
      
      // 嘗試逐步縮短找到可解析的 JSON
      const truncateAttempts = [
        cleaned,
        cleaned + '"}}}',      // 補全常見截斷：字串+三個花括號
        cleaned + '"}}',
        cleaned + '"}',
        cleaned + '}',
      ];
      
      for (const attempt of truncateAttempts) {
        try {
          // 先修復尾部逗號再嘗試解析
          const fixed = attempt.replace(/,\s*([}\]])/g, '$1');
          const parsed = JSON.parse(fixed);
          console.log('Recovered truncated JSON with attempt:', attempt.slice(-20));
          return parsed;
        } catch {}
      }
      
      // 5. 嘗試修復常見問題：去除尾部逗號
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
      
      // 6. 嘗試修復未閉合的字符串
      const openQuotes = (cleaned.match(/"/g) || []).length;
      if (openQuotes % 2 !== 0) {
        cleaned += '"';
      }
      
      try {
        return JSON.parse(cleaned);
      } catch (e3) {
        throw new Error(`無法解析 JSON (Unexpected end): ${text.substring(0, 100)}...`);
      }
    }
  } catch (error) {
    console.error('JSON parse error:', error, 'Original text:', text.substring(0, 500));
    throw new Error(`無法解析 AI 返回的 JSON 格式: ${error.message}`);
  }
}

// ============ Gemini API 函數 ============

async function testGeminiConnection(apiKey, modelName = 'gemini-2.0-flash') {
  const normalizedModelName = normalizeGeminiModelName(modelName);
  const model = `models/${normalizedModelName}`;
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=5`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const availableModels = data.models?.map(m => m.name) || [];
    const isModelAvailable = availableModels.some(m => m === model || m.endsWith(normalizedModelName));

    return {
      success: true,
      message: isModelAvailable 
        ? `Gemini API 連接成功！模型 "${normalizedModelName}" 可用`
        : `API 連接成功！但模型 "${normalizedModelName}" 可能不可用`,
      model: normalizedModelName
    };
  } catch (error) {
    return handleGeminiError(error, normalizedModelName);
  }
}

async function extractWithGemini(apiKey, modelName, fileData, text, fileType) {
  const normalizedModelName = normalizeGeminiModelName(modelName);
  const model = `models/${normalizedModelName}`;
  
  console.log('extractWithGemini:', { model, fileType, hasFileData: !!fileData, hasText: !!text });
  
  // 檢查是否為 Word 文件
  const isWord = fileType && (
    fileType === 'application/msword' || 
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType.includes('word') ||
    fileType.includes('doc')
  );
  
  // 如果是 Word 文件，必須使用 mammoth 提取文本
  if (isWord && fileData) {
    if (!mammoth) {
      throw new Error('Word 文件處理需要 mammoth 庫，請確保已安裝 mammoth 套件 (npm install mammoth)');
    }
    try {
      console.log('Processing Word file with mammoth');
      const buffer = Buffer.from(fileData, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      console.log('Word file extracted, length:', result.value.length);
      text = result.value;
      fileData = null; // 清除 fileData，使用提取的文本
    } catch (wordError) {
      console.error('Mammoth extraction failed:', wordError);
      throw new Error(`無法提取 Word 文件內容: ${wordError.message}`);
    }
  }
  
  const prompt = `你是一個專業的OCR文字識別助手。請從圖片或文檔中提取學生的作文文字。

【重要】分辨文章數量的規則：
- 如果文件中只有一篇學生作文，請只返回一篇文章
- 如果文件中有多篇學生作文（例如多個學生的作品、多頁不同學生的作文），請識別並分開每一篇
- 判斷標準：不同學生姓名、明顯的分隔線、不同的標題通常表示不同文章
- 如果只有一個學生姓名且內容連貫，請視為一篇文章

對於每一篇，請提取：
1. 學生姓名（通常在文章開頭或標題處）
2. 學生學號/班級（如果有）
3. 作文正文內容

提取要求：
- 保持原文的段落格式
- 只提取作文正文，不要包含題目（除非題目是文章的一部分）
- 保持所有標點符號
- 不要修改任何文字，包括錯別字

請以JSON格式返回，如果有多篇文章，請返回數組：
{
  "articles": [
    {
      "text": "第一篇作文全文",
      "name": "學生姓名1",
      "studentId": "學號1"
    }
  ]
}

如果只有一篇文章，也使用相同的格式返回。`;

  let requestBody;
  const isImage = fileType && fileType.startsWith('image/');
  const isPDF = fileType && (fileType === 'application/pdf' || fileType.includes('pdf'));
  
  console.log('Type check:', { isImage, isPDF, isWord: !!isWord, fileType, hasFileData: !!fileData, hasText: !!text });

  if (fileData && (isImage || isPDF)) {
    const mimeType = isPDF ? 'application/pdf' : fileType;
    console.log('Using inline_data mode with mimeType:', mimeType);
    
    requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: fileData
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json'
      },
      safetySettings: GEMINI_SAFETY_SETTINGS
    };
  } else {
    console.log('Using text mode');
    const content = text || '';
    requestBody = {
      contents: [{
        parts: [{
          text: prompt + '\n\n請提取以下文本中的學生作文內容：\n\n' + content
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json'
      },
      safetySettings: GEMINI_SAFETY_SETTINGS
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API 請求失敗');
  }

  const data = await response.json();
  
  // 檢查是否有內容被阻擋
  if (data.promptFeedback?.blockReason) {
    throw new Error(`內容被阻擋: ${data.promptFeedback.blockReason}`);
  }
  
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    // 檢查 finishReason
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(`Gemini API 返回異常: ${finishReason}`);
    }
    throw new Error('Gemini API 返回內容為空');
  }

  const result = safeJSONParse(content, 'extract');
  
  // 支持多篇文章返回
  if (result.articles && Array.isArray(result.articles) && result.articles.length > 0) {
    const firstArticle = result.articles[0];
    return {
      text: firstArticle.text || '',
      name: firstArticle.name || '',
      studentId: firstArticle.studentId || '',
      articles: result.articles
    };
  }
  
  return {
    text: result.text || '',
    name: result.name || '',
    studentId: result.studentId || '',
    articles: result.articles
  };
}

// 提取題目與評分準則
async function extractQuestionCriteriaWithGemini(apiKey, modelName, fileData, text, fileType) {
  const normalizedModelName = normalizeGeminiModelName(modelName);
  const model = `models/${normalizedModelName}`;
  
  const prompt = `你是一個專業的香港DSE中文科教育文件分析助手。請從文件中提取以下內容。

文件可能是一份完整的實用寫作練習卷，包含題目、資料一、資料二和評分參考（評卷參考）。請仔細分析並提取：

1. question（題目）：作文的題目要求，即「試以……名義，撰寫……」的完整題目句子
2. materials（資料內容）：資料一和資料二的完整內容，包含標題和正文，保留原有格式
3. infoPoints（資訊分考核項目）：從評分參考中提取「資訊分」或「資料分」的具體考核項目，以陣列形式返回。
   每項應為簡短的名稱（5-15字），例如：「計劃名稱」、「寫作身份」、「呼籲支持」等。
   若文件無評分準則，則返回空陣列 []。
   注意：不要抄錄示範論述，只提取資訊分的考核項目名稱。
4. genre（文體）：根據題目判斷文體類型，只可返回以下其中一個英文值：
   - "speech"（演講辭）："letter"（書信/公開信）："proposal"（建議書）："report"（報告）："commentary"（評論文章）："article"（專題文章）
   若無法判斷，返回空字符串 ""

重要：所有文字內容必須使用繁體中文，完整保留原文，不可省略或改寫。

請只返回有效的JSON格式，不要加任何說明或markdown：
{
  "question": "題目完整內容",
  "materials": "資料一和資料二的完整內容",
  "infoPoints": ["考核項目一", "考核項目二", "考核項目三"],
  "genre": "speech/letter/proposal/report/commentary/article 其中之一，或空字符串"
}`;

  let requestBody;
  const isImage = fileType && fileType.startsWith('image/');
  const isPDF = fileType && (fileType === 'application/pdf' || fileType.includes('pdf'));

  if (fileData && (isImage || isPDF)) {
    const mimeType = isPDF ? 'application/pdf' : fileType;
    requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: fileData
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 65536
        // responseMimeType 已移除：避免觸發 Gemini 安全過濾
      },
      safetySettings: GEMINI_SAFETY_SETTINGS
    };
  } else {
    requestBody = {
      contents: [{
        parts: [{
          text: prompt + '\n\n請分析以下內容：\n\n' + (text || '')
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 65536
        // responseMimeType 已移除：避免觸發 Gemini 安全過濾
      },
      safetySettings: GEMINI_SAFETY_SETTINGS
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API 請求失敗');
  }

  const data = await response.json();
  
  if (data.promptFeedback?.blockReason) {
    throw new Error(`內容被阻擋: ${data.promptFeedback.blockReason}`);
  }
  
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    throw new Error('Gemini API 返回內容為空');
  }

  return safeJSONParse(content, 'extract-question-criteria');
}

async function gradeWithGemini(apiKey, modelName, essayText, question, customCriteria, gradingMode = 'secondary', contentPriority = false, enhancementDirection = 'auto', genre = '', infoPoints = [], devItems = {}, formatRequirements = [], materials = '') {
  const normalizedModelName = normalizeGeminiModelName(modelName);
  const model = `models/${normalizedModelName}`;
  
  const systemPrompt = buildGradingPrompt(gradingMode, contentPriority, enhancementDirection, genre, infoPoints, devItems, formatRequirements);
  const userPrompt = buildUserPrompt(essayText, question, customCriteria, gradingMode, genre, materials);

  const requestBody = {
    contents: [{
      parts: [{ text: systemPrompt + '\n\n' + userPrompt }]
    }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 65536
      // responseMimeType 已移除：JSON mode 會使 Gemini 安全過濾更嚴格，導致 PROHIBITED_CONTENT
    },
    safetySettings: GEMINI_SAFETY_SETTINGS
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API 請求失敗');
  }

  const data = await response.json();
  
  // 檢查是否有內容被阻擋（promptFeedback層面）
  if (data.promptFeedback?.blockReason) {
    // 若為PROHIBITED_CONTENT，加入教育免責聲明重試一次
    if (data.promptFeedback.blockReason === 'PROHIBITED_CONTENT' || data.promptFeedback.blockReason === 'SAFETY') {
      console.log('Gemini blocked, retrying with education disclaimer...');
      return await gradeWithGeminiRetry(apiKey, normalizedModelName, essayText, systemPrompt, userPrompt, essayText, gradingMode);
    }
    throw new Error(`內容被阻擋: ${data.promptFeedback.blockReason}`);
  }
  
  let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  // 檢查candidates層面的SAFETY阻擋
  if (!content) {
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      console.log('Gemini candidate blocked by SAFETY, retrying...');
      return await gradeWithGeminiRetry(apiKey, normalizedModelName, essayText, systemPrompt, userPrompt, essayText, gradingMode);
    }
    // 嘗試從其他候選人獲取內容
    if (data.candidates && data.candidates.length > 1) {
      for (let i = 1; i < data.candidates.length; i++) {
        const altContent = data.candidates[i]?.content?.parts?.[0]?.text;
        if (altContent) {
          console.log('Using alternative candidate:', i);
          content = altContent;
          break;
        }
      }
    }
    
    if (!content) {
      throw new Error(`Gemini API 返回內容為空 (finishReason: ${finishReason || 'unknown'})`);
    }
  }

  return parseGradingResult(content, essayText, gradingMode);
}

// 當Gemini因安全過濾阻擋時，加入教育免責聲明重試
async function gradeWithGeminiRetry(apiKey, modelName, originalText, systemPrompt, userPrompt, essayText, gradingMode) {
  const disclaimerPrefix = `【重要說明】以下內容為香港中學生的中文科作文，純屬教育評核用途。作文中可能含有表達負面情緒、描寫衝突或敏感話題的句子，這是正常的創意寫作內容，請以教育工作者的專業角度進行評核。\n\n`;
  
  const retryBody = {
    contents: [{
      parts: [{ text: disclaimerPrefix + systemPrompt + '\n\n' + userPrompt }]
    }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 65536
    },
    safetySettings: GEMINI_SAFETY_SETTINGS
  };

  const retryResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(retryBody)
    }
  );

  const retryData = await retryResponse.json();
  
  if (retryData.promptFeedback?.blockReason) {
    throw new Error(`內容被阻擋: ${retryData.promptFeedback.blockReason}。建議改用 OpenAI 或 DeepSeek API 批改含敏感內容的作文。`);
  }

  const retryContent = retryData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!retryContent) {
    const reason = retryData.candidates?.[0]?.finishReason;
    throw new Error(`重試後仍被阻擋 (${reason})。建議改用 OpenAI 或 DeepSeek API 批改含敏感內容的作文。`);
  }

  return parseGradingResult(retryContent, essayText, gradingMode);
}

// 生成實用寫作模擬卷（新邏輯）
async function generatePracticalExamWithGemini(apiKey, modelName, fileData, text, fileType, genre, clientSystemPrompt) {
  const normalizedModelName = normalizeGeminiModelName(modelName);
  const model = `models/${normalizedModelName}`;
  
  const genreNames = {
    speech: '演講辭',
    letter: '書信/公開信',
    proposal: '建議書',
    report: '報告',
    commentary: '評論文章',
    article: '專題文章'
  };

  // 後端 prompt：分析上傳題目的寫作任務模式，生成仿照同一模式的新試卷
  const prompt = `你是一位專業的香港DSE中文科試題設計專家。

【第一步：分析上傳的參考題目和資料】
仔細分析用戶上傳的模擬卷（包括題目和資料一、資料二），識別以下要素：
1. 主題範疇（如：環保、閱讀推廣、健康生活、社區服務、文化交流等）
2. 寫作任務一的模式（從以下選項中識別最接近的）：
   - 「說明計劃的意義／好處」
   - 「介紹計劃的內容」
   - 「匯報調查結果」（報告文體專用）
   - 「評論計劃的利弊／成效」
   - 「就計劃提出建議」
3. 寫作任務二的模式（從以下選項中識別最接近的）：
   - 「回應同學的意見／疑慮，游說支持」
   - 「鼓勵同學積極參與」
   - 「提出改善建議」（報告文體專用）
   - 「呼籲各方支持」
4. 資料一的結構：活動細項數量、表格欄位設計、背景說明篇幅
5. 資料二的結構：留言數量、疑慮類型（對應哪些活動細項）、支持留言的方向

【第二步：生成新試卷（嚴格仿照參考卷的結構複雜度）】
保持相同的主題範疇、任務模式、資料結構複雜度，但情境、計劃名稱、機構、活動內容和人物姓名必須完全不同。
特別注意：
- 若參考卷資料一有2項活動、各有2個細項，新試卷也應設計2項活動、各有類似數量的細項
- 若參考卷資料二有2則疑慮留言（各對應1項活動），新試卷也應設計同等數量的配對疑慮
文體：${genreNames[genre] || genre}

【題目格式要求（非常重要）】
題目必須是一個完整的句子段落，不可用列點（(1)(2)或①②）陳述寫作任務。
正確格式示例：「綠苗中學將於本學年推行『惜食校園：廚餘減量行動』計劃，試以綠苗中學學生會副主席李明德的名義，撰寫一篇演講辭，在週會上向全體師生演講，說明『惜食校園：廚餘減量行動』的意義及內容，並針對同學對行動的疑慮，游說他們支持這項行動。（全文不得多於550字，標點符號計算在內。）」
題目須包含：情境背景 → 寫作身份（以[職銜][三字中文姓名]名義）→ 文體及場合 → 完整陳述任務（說明+回應，不列點）→ 字數限制

【資料設計要求】
- 資料一：官方文件形式（通告／宣傳單張），包含背景說明和活動內容表格
  【表格格式（非常重要，必須嚴格遵守）】
  資料一的活動內容必須用以下 Markdown 表格格式輸出，絕對不可用純文字段落代替：
  | 活動名稱 | 內容 |
  | --- | --- |
  | 活動一名稱 | 活動一的具體內容說明 |
  | 活動二名稱 | 活動二的具體內容說明 |
  表格行數：2-3行（對應2-3項活動）
- 資料二：學生討論記錄（4則留言），格式：[姓名（班別）] [時間 HH:MM] [留言內容]
  留言一：疑慮（對應活動一，表達具體擔憂）
  留言二：疑慮（對應活動二，表達具體擔憂）
  留言三：正面支持（肯定計劃的某個具體好處，此意見可在示範文章中引用作佐證）
  留言四：寫作者宣布將撰文回應
  重要：留言內容必須是純文字，絕對不可使用 | 表格、* # ** 等任何 Markdown 符號
  每則留言必須獨立一行，格式嚴格如下（不可用表格）：
  [姓名 (班別)] HH:MM 留言內容
  例：
  [林小明 (4C)] 10:35 我擔心活動會佔用溫習時間，影響成績。
  [陳美玲 (5B)] 11:05 我覺得這個計劃很有意義，支持！
- 資料一的活動細項必須能直接回應資料二的疑慮

【各文體格式要求（非常重要，必須嚴格遵守）】

演講辭（speech）必備三元素：
1. 稱謂：第一行頂格，按「先尊後卑」，末尾冒號。例：各位老師、各位同學：
2. 自我介紹：正文開首交代身份。例：大家好！我是學生會副主席李明德。
3. 文末致謝：最末一句。例：多謝各位！
演講辭絕對禁止：書信上款、祝頌語（祝/教安）、署名（謹啟）、日期

書信/公開信（letter）必備元素：
1. 上款：第一行頂格，含冒號。例：各位同學：
2. 祝頌語：正文後，「祝」字單獨一行，前空兩格；祝福語（如「學業進步」）另起一行頂格
3. 署名：必須分兩行，各自靠右對齊：
   第一行：身份（如：匯賢中學社會服務團團長）
   第二行：姓名+啟告語（如：陳志堅謹啟）
4. 日期：緊接署名第二行下方，靠左
書信絕對禁止：自我介紹（大家好！我是...）、文末致謝（多謝各位！）、演講辭稱謂格式、身份和姓名寫在同一行

建議書（proposal）必備元素：
1. 上款：第一行頂格，含冒號
2. 標題：置中，含「建議」二字
3. 署名：分兩行靠右，第一行為身份，第二行為姓名+謹啟
4. 日期
建議書絕對禁止：祝頌語、演講辭格式

報告（report）必備元素：
1. 上款：第一行頂格，含冒號
2. 標題：置中，含「報告」二字
3. 署名：分兩行靠右，第一行為身份，第二行為姓名+謹啟
4. 日期
報告絕對禁止：祝頌語、演講辭格式

評論文章（commentary）必備元素：
1. 標題：第一行置中（如：功課輔導立意佳 微調細節收效大）
2. 署名及身份：寫在標題正下方或文章末尾（如：學生會會長周詩涵）
評論文章絕對禁止：上款（頂格稱謂）、祝頌語（祝/教安）、日期、自我介紹（大家好！我是...）、文末致謝（多謝各位！）
違反上述禁忌將被視為添加多餘格式而扣分

專題文章（article）必備元素：
1. 標題：第一行置中（如：舞台展現自我 合作成就精彩）
2. 署名及身份：寫在標題右下方或文末（如：戲劇學會主席蘇樂行）
專題文章絕對禁止：上款（頂格稱謂）、祝頌語（祝/教安）、日期、自我介紹、文末致謝（多謝各位！）
違反上述禁忌將被視為添加多餘格式而扣分

【示範文章段落要求（非常重要）】
示範文章必須嚴格按以下四段結構，每段字數限制如下（連同標點符號計算）：
- 第一段【開首】約80字：交代寫作身份、計劃名稱及撰文目的
- 第二段【正文一】約220字：回應第一個疑慮，整合資料一對應活動的具體細項加以拓展說明；不可點名指定同學，須用泛指表達，如「有同學擔心……」、「對於……的疑慮」
- 第三段【正文二】約220字：回應第二個疑慮，整合資料一對應活動的具體細項加以拓展說明；同時自然引用支持者的正面意見作佐證，加強說服力；同樣不可點名，可用「亦有同學指出……」、「正如部分同學所言……」
- 第四段【結尾】約70字：總結計劃意義，呼籲同學支持參與
全文合共約590字（含上款、祝頌語、署名、日期），不可超過題目字數限制
每段字數須接近指定數字，不可大幅偏離（±20字以內）
示範文章輸出時不可在段落末標示字數（如「（79字）」），直接輸出文章內容即可

【示範文章要求】
- 全文500-560字，嚴格控制字數，不可超過字數限制
- 必須100%符合所選文體（${genreNames[genre] || genre}）的格式，嚴格遵守上述對應文體的必備元素和禁忌
- 拓展部分用【拓展】和【/拓展】標記
- 示範文章內容絕對不可使用 * # ** 等 Markdown 符號
- 示範文章絕對不可點名指定資料二中的同學（如「陳大明同學」、「黃小芳同學」），必須用泛指（如「有同學擔心」、「部分同學認為」、「亦有同學指出」）

【關鍵區分：資訊分 vs 內容發展分】
- 資訊分（2分）：考核考生是否提及必要背景資訊，如：寫作身份、計劃名稱、寫作目的／動機、呼籲支持等（即「有沒有提到」）
- 內容發展分（8分）：考核考生能否整理資料一的具體活動細項，並針對資料二的疑慮加以拓展說明

【內容發展評分參考格式（非常重要）】
contentDevelopment 分為兩部分輸出：
第一部分 factualContent：列出資料中可直接抄錄的客觀資訊（活動名稱、活動細項、所有同學意見含疑慮及支持），每項格式：「類別：具體內容」
例：
  「活動：長者探訪、數碼教學」
  「活動細項：長者探訪（分組前往老人院、與長者聊天及表演節目）、數碼教學（協助長者使用智能手機）」
  「同學疑慮：林學文擔心影響溫習時間、王小明擔心溝通困難」
  「同學支持：李思敏認為能從長者身上學到人生智慧、擴闊視野」
第二部分 expansionPoints：列出考生應如何拓展說明，並說明如何引用支持意見佐證
格式：「利用（細項）回應（疑慮），說明（論點）；可引用（支持意見）佐證」
例：
  「利用『分組探訪、與長者互動』回應課業壓力疑慮，說明探訪能培養同理心、調劑心情」
  「利用『數碼教學』回應溝通困難疑慮，說明教學能鍛煉耐性及溝通技巧；可引用李思敏正面意見，強調活動能擴闊視野、獲取人生智慧」

【輸出格式 - 必須是有效的JSON，不含markdown標記】
{
  "examPaper": {
    "title": "DSE 中文卷二甲部：實用寫作",
    "time": "45分鐘",
    "marks": "50分",
    "instructions": [],
    "question": "完整題目（含情境、身份、文體、任務一、任務二、字數限制）",
    "material1": {
      "title": "資料一：[機構名稱]「[計劃名稱]」[文件類型]",
      "content": "背景說明（1-2句）\n| 活動名稱 | 內容 |\n| --- | --- |\n| 活動一 | 說明 |\n| 活動二 | 說明 |"
    },
    "material2": {
      "title": "資料二：[學校名稱][討論平台]（節錄）",
      "content": "[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容"
    }
  },
  "markingScheme": {
    "contentInfo": {
      "title": "資訊分（2分）",
      "table": [
        { "item": "細項名稱", "description": "具體說明" }
      ]
    },
    "contentDevelopment": {
      "title": "內容發展分（8分）",
      "factualContent": [
        "活動：活動一名稱、活動二名稱",
        "活動細項：活動一細項、活動二細項",
        "同學疑慮：同學甲的疑慮（對應活動一）、同學乙的疑慮（對應活動二）",
        "同學支持：同學丙認為計劃的具體好處（正面意見）"
      ],
      "expansionPoints": [
        "利用『活動一細項』回應同學甲疑慮，說明活動如何解決問題及促進成長",
        "利用『活動二細項』回應同學乙疑慮，說明活動的實際價值；引用同學丙正面意見佐證"
      ]
    },
    "formatRequirements": {
      "title": "格式要求（組織分，最多扣2分）",
      "table": [
        { "item": "格式項目（如：欠稱謂）", "requirement": "具體格式要求", "score": "欠缺/多餘" }
      ]
    }
    // 注意：formatRequirements 只列出各文體的必備格式元素，不包含字數要求
    // 格式扣分規則由前端統一顯示：錯1-2項扣1分，錯3項或以上扣2分
  },
  "modelEssay": "示範文章（四段結構：開首約80字、正文一約220字、正文二約220字、結尾約70字；拓展部分用【拓展】【/拓展】標記）"
}`;

  let requestBody;
  const isImage = fileType && fileType.startsWith('image/');
  const isPDF = fileType && (fileType === 'application/pdf' || fileType.includes('pdf'));

  if (fileData && (isImage || isPDF)) {
    const mimeType = isPDF ? 'application/pdf' : fileType;
    requestBody = {
      contents: [{
        parts: [
          { text: prompt + '\n\n請仔細分析以下上傳的模擬卷（圖片/PDF），理解其主題方向、資料結構和寫作任務，然後生成一份全新的模擬卷。' },
          {
            inline_data: {
              mime_type: mimeType,
              data: fileData
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json'
      },
      safetySettings: GEMINI_SAFETY_SETTINGS
    };
  } else {
    const textContent = text || '';
    const criteriaMatch = textContent.match(/【參考卷：評分準則[^】]*】\n([\s\S]*?)(?=\n\n---|$)/);
    let criteria = criteriaMatch ? criteriaMatch[1].trim() : '';
    // 評分準則超過300字時只保留前300字，避免干擾生成
    if (criteria.length > 300) criteria = criteria.substring(0, 300) + '……（省略）';
    const mainContent = criteriaMatch
      ? textContent.replace(/\n\n---\n\n【參考卷：評分準則[^】]*】[\s\S]*$/, '').replace(/【參考卷：評分準則[^】]*】[\s\S]*$/, '')
      : textContent;
    const userMsg = [
      '請根據以下參考卷內容生成新模擬卷：',
      '',
      mainContent,
      criteria ? `\n【參考卷資料結構摘要（供AI理解資料複雜度，據此設計相似結構的新試卷）】\n${criteria}` : ''
    ].filter(Boolean).join('\n');

    requestBody = {
      contents: [{
        parts: [{
          text: prompt + '\n\n' + userMsg
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 65536,
        responseMimeType: 'application/json'
      },
      safetySettings: GEMINI_SAFETY_SETTINGS
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error response:', errorText);
    throw new Error(`Gemini API 請求失敗: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.promptFeedback?.blockReason) {
    throw new Error(`內容被阻擋: ${data.promptFeedback.blockReason}`);
  }
  
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    throw new Error('Gemini API 返回內容為空');
  }

  const result = safeJSONParse(content, 'generate-exam');
  return transformExamResult(result);
}

async function analyzeClassWithGemini(apiKey, modelName, reports, question, gradingMode = 'secondary') {
  const normalizedModelName = normalizeGeminiModelName(modelName);
  const model = `models/${normalizedModelName}`;
  
  const stats = {
    totalStudents: reports.length,
    averageScore: reports.reduce((sum, r) => sum + r.totalScore, 0) / reports.length,
  };

  let systemPrompt;
  if (gradingMode === 'primary') {
    systemPrompt = `你是一位專業的香港小學中文科教師，正在分析全班學生的寫作表現。

請根據學生的評分數據，從以下五個方面進行分析：
1. 切題與內容分析
2. 感受與立意分析
3. 組織與結構分析
4. 語言運用分析
5. 文類與格式分析

最後提供針對性的寫作教學建議。

請以JSON格式返回：
{
  "materialAnalysis": "選材分析內容",
  "relevanceAnalysis": "扣題分析內容",
  "themeAnalysis": "立意分析內容",
  "techniqueAnalysis": "寫作手法分析內容",
  "teachingSuggestion": "寫作教學建議內容"
}`;
  } else if (gradingMode === 'practical') {
    systemPrompt = `你是一位專業的香港中學中文科教師，正在分析全班學生的實用寫作表現。

請根據學生的評分數據，從以下方面進行分析：
1. 內容資訊分析
2. 拓展分析
3. 語氣分析
4. 組織結構分析

最後提供針對性的寫作教學建議。

請以JSON格式返回：
{
  "materialAnalysis": "內容資訊分析",
  "relevanceAnalysis": "拓展分析",
  "themeAnalysis": "語氣分析",
  "techniqueAnalysis": "組織結構分析",
  "teachingSuggestion": "寫作教學建議內容"
}`;
  } else {
    systemPrompt = `你是一位專業的香港中學中文科教師，正在分析全班學生的寫作表現。

請根據學生的評分數據，從以下四個方面進行分析：
1. 選材分析：學生選取素材的類型、優點和問題
2. 扣題分析：學生對題目的理解程度、常見問題和改進建議
3. 立意分析：學生立意的深度分佈、優點和問題
4. 寫作手法分析：學生使用的寫作手法、優點和問題

最後提供針對性的寫作教學建議。

請以JSON格式返回：
{
  "materialAnalysis": "選材分析內容",
  "relevanceAnalysis": "扣題分析內容",
  "themeAnalysis": "立意分析內容",
  "techniqueAnalysis": "寫作手法分析內容",
  "teachingSuggestion": "寫作教學建議內容"
}`;
  }

  const userPrompt = `請分析以下全班寫作數據：

## 題目
${question}

## 統計數據
- 總人數: ${stats.totalStudents}
- 平均分: ${stats.averageScore.toFixed(1)}

## 學生分數詳情
${reports.map(r => `- ${r.studentWork?.name || '未命名'}: 總分${r.totalScore}`).join('\n')}

請以專業教師的角度進行分析，並以JSON格式返回結果。`;

  const requestBody = {
    contents: [{
      parts: [{ text: systemPrompt + '\n\n' + userPrompt }]
    }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json'
    },
    safetySettings: GEMINI_SAFETY_SETTINGS
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API 請求失敗');
  }

  const data = await response.json();
  
  if (data.promptFeedback?.blockReason) {
    throw new Error(`內容被阻擋: ${data.promptFeedback.blockReason}`);
  }
  
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    throw new Error('Gemini API 返回內容為空');
  }

  return safeJSONParse(content, 'analyze-class');
}

// ============ OpenAI API 函數 ============

async function testOpenAIConnection(apiKey, modelName = 'gpt-4o') {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const availableModels = data.data?.map(m => m.id) || [];
    const isModelAvailable = availableModels.some(m => m === modelName);

    return {
      success: true,
      message: isModelAvailable 
        ? `OpenAI API 連接成功！模型 "${modelName}" 可用`
        : `API 連接成功！但模型 "${modelName}" 可能不可用`,
      model: modelName
    };
  } catch (error) {
    return handleOpenAIError(error, modelName);
  }
}

async function extractWithOpenAI(apiKey, modelName, fileData, text, fileType) {
  const model = modelName || 'gpt-4o';
  
  // 檢查是否為 Word 文件
  const isWord = fileType && (
    fileType === 'application/msword' || 
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType.includes('word') ||
    fileType.includes('doc')
  );
  
  // 如果是 Word 文件，必須使用 mammoth 提取文本
  if (isWord && fileData) {
    if (!mammoth) {
      throw new Error('Word 文件處理需要 mammoth 庫，請確保已安裝 mammoth 套件 (npm install mammoth)');
    }
    try {
      console.log('Processing Word file with mammoth (OpenAI)');
      const buffer = Buffer.from(fileData, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      console.log('Word file extracted, length:', result.value.length);
      text = result.value;
      fileData = null;
    } catch (wordError) {
      console.error('Mammoth extraction failed:', wordError);
      throw new Error(`無法提取 Word 文件內容: ${wordError.message}`);
    }
  }
  
  const systemPrompt = `你是一個專業的OCR文字識別助手。請從圖片或文檔中提取學生的作文文字。

【重要】分辨文章數量的規則：
- 如果文件中只有一篇學生作文，請只返回一篇文章
- 如果文件中有多篇學生作文，請識別並分開每一篇
- 判斷標準：不同學生姓名、明顯的分隔線、不同的標題通常表示不同文章

提取要求：
1. 保持原文的段落格式
2. 識別學生姓名和學號（通常在文章開頭或標題處）
3. 只提取作文正文，不要包含題目（除非題目是文章的一部分）
4. 保持所有標點符號
5. 不要修改任何文字，包括錯別字

請以JSON格式返回：
{
  "articles": [
    {
      "text": "作文全文",
      "name": "學生姓名（如無則留空）",
      "studentId": "學生學號（如無則留空）"
    }
  ]
}`;

  let messages;
  
  if (fileData && fileType && fileType.startsWith('image/')) {
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '請提取這張圖片中的學生作文文字，並識別姓名和學號。' },
          { type: 'image_url', image_url: { url: `data:${fileType};base64,${fileData}` } }
        ]
      }
    ];
  } else {
    const content = text || '';
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `請提取以下文本中的學生作文內容：\n\n${content}` }
    ];
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('OpenAI API 返回內容為空');
  }

  const result = JSON.parse(content);
  
  if (result.articles && Array.isArray(result.articles) && result.articles.length > 0) {
    const firstArticle = result.articles[0];
    return {
      text: firstArticle.text || '',
      name: firstArticle.name || '',
      studentId: firstArticle.studentId || '',
      articles: result.articles
    };
  }
  
  return {
    text: result.text || '',
    name: result.name || '',
    studentId: result.studentId || ''
  };
}

async function extractQuestionCriteriaWithOpenAI(apiKey, modelName, fileData, text, fileType) {
  const model = modelName || 'gpt-4o';
  
  const systemPrompt = `你是一個專業的香港DSE中文科教育文件分析助手。請從文件中提取以下內容。

文件可能是一份完整的實用寫作練習卷，包含題目、資料一、資料二和評分參考（評卷參考）。請仔細分析並提取：

1. question（題目）：作文的題目要求，即「試以……名義，撰寫……」的完整題目句子
2. materials（資料內容）：資料一和資料二的完整內容，包含標題和正文，保留原有格式
3. infoPoints（資訊分考核項目）：從評分參考中提取「資訊分」或「資料分」的具體考核項目，以陣列形式返回。
   每項應為簡短的名稱（5-15字），例如：「計劃名稱」、「寫作身份」、「呼籲支持」等。
   若文件無評分準則，則返回空陣列 []。
   注意：不要抄錄示範論述，只提取資訊分的考核項目名稱。
4. genre（文體）：根據題目判斷文體類型，只可返回以下其中一個英文值：
   - "speech"（演講辭）："letter"（書信/公開信）："proposal"（建議書）
   - "report"（報告）："commentary"（評論文章）："article"（專題文章）
   若無法判斷，返回空字符串 ""

重要：所有文字內容必須使用繁體中文，不可省略或改寫。

請只返回有效的JSON格式，不要加任何說明或markdown：
{
  "question": "題目完整內容",
  "materials": "資料一和資料二的完整內容",
  "infoPoints": ["考核項目一", "考核項目二", "考核項目三"],
  "genre": "speech/letter/proposal/report/commentary/article 其中之一，或空字符串"
}`;

  let messages;
  
  if (fileData && fileType && fileType.startsWith('image/')) {
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '請分析這張圖片，提取題目和評分準則。' },
          { type: 'image_url', image_url: { url: `data:${fileType};base64,${fileData}` } }
        ]
      }
    ];
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `請分析以下內容，提取題目和評分準則：\n\n${text || ''}` }
    ];
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('OpenAI API 返回內容為空');
  }

  return JSON.parse(content);
}

async function gradeWithOpenAI(apiKey, modelName, essayText, question, customCriteria, gradingMode = 'secondary', contentPriority = false, enhancementDirection = 'auto', genre = '', infoPoints = [], devItems = {}, formatRequirements = [], materials = '') {
  const model = modelName || 'gpt-4o';
  
  const systemPrompt = buildGradingPrompt(gradingMode, contentPriority, enhancementDirection, genre, infoPoints, devItems, formatRequirements);
  const userPrompt = buildUserPrompt(essayText, question, customCriteria, gradingMode, genre, materials);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('OpenAI API 返回內容為空');
  }

  return parseGradingResult(content, essayText, gradingMode);
}

async function generatePracticalExamWithOpenAI(apiKey, modelName, fileData, text, fileType, genre, clientSystemPrompt) {
  const model = modelName || 'gpt-4o';
  
  const genreNames = {
    speech: '演講辭',
    letter: '書信/公開信',
    proposal: '建議書',
    report: '報告',
    commentary: '評論文章',
    article: '專題文章'
  };

  const systemPrompt = `你是一位專業的香港DSE中文科試題設計專家。

【第一步：分析上傳的參考題目和資料】
仔細分析用戶上傳的模擬卷（包括題目和資料一、資料二），識別以下要素：
1. 主題範疇（如：環保、閱讀推廣、健康生活、社區服務、文化交流等）
2. 寫作任務一的模式（從以下選項中識別最接近的）：
   - 「說明計劃的意義／好處」
   - 「介紹計劃的內容」
   - 「匯報調查結果」（報告文體專用）
   - 「評論計劃的利弊／成效」
   - 「就計劃提出建議」
3. 寫作任務二的模式（從以下選項中識別最接近的）：
   - 「回應同學的意見／疑慮，游說支持」
   - 「鼓勵同學積極參與」
   - 「提出改善建議」（報告文體專用）
   - 「呼籲各方支持」
4. 資料一的結構：活動細項數量、表格欄位設計、背景說明篇幅
5. 資料二的結構：留言數量、疑慮類型（對應哪些活動細項）、支持留言的方向

【第二步：生成新試卷（嚴格仿照參考卷的結構複雜度）】
保持相同的主題範疇、任務模式、資料結構複雜度，但情境、計劃名稱、機構、活動內容和人物姓名必須完全不同。
特別注意：
- 若參考卷資料一有2項活動、各有2個細項，新試卷也應設計2項活動、各有類似數量的細項
- 若參考卷資料二有2則疑慮留言（各對應1項活動），新試卷也應設計同等數量的配對疑慮
文體：${genreNames[genre] || genre}

【題目格式要求（非常重要）】
題目必須是一個完整的句子段落，不可用列點（(1)(2)或①②）陳述寫作任務。
正確格式示例：「綠苗中學將於本學年推行『惜食校園：廚餘減量行動』計劃，試以綠苗中學學生會副主席李明德的名義，撰寫一篇演講辭，在週會上向全體師生演講，說明『惜食校園：廚餘減量行動』的意義及內容，並針對同學對行動的疑慮，游說他們支持這項行動。（全文不得多於550字，標點符號計算在內。）」
題目須包含：情境背景 → 寫作身份（以[職銜][三字中文姓名]名義）→ 文體及場合 → 完整陳述任務（說明+回應，不列點）→ 字數限制

【資料設計要求】
- 資料一：官方文件形式（通告／宣傳單張），包含背景說明和活動內容表格
  【表格格式（非常重要，必須嚴格遵守）】
  資料一的活動內容必須用以下 Markdown 表格格式輸出，絕對不可用純文字段落代替：
  | 活動名稱 | 內容 |
  | --- | --- |
  | 活動一名稱 | 活動一的具體內容說明 |
  | 活動二名稱 | 活動二的具體內容說明 |
  表格行數：2-3行（對應2-3項活動）
- 資料二：學生討論記錄（4則留言），格式：[姓名（班別）] [時間 HH:MM] [留言內容]
  留言一：疑慮（對應活動一，表達具體擔憂）
  留言二：疑慮（對應活動二，表達具體擔憂）
  留言三：正面支持（肯定計劃的某個具體好處，此意見可在示範文章中引用作佐證）
  留言四：寫作者宣布將撰文回應
  重要：留言內容必須是純文字，絕對不可使用 | 表格、* # ** 等任何 Markdown 符號
  每則留言必須獨立一行，格式嚴格如下（不可用表格）：
  [姓名 (班別)] HH:MM 留言內容
  例：
  [林小明 (4C)] 10:35 我擔心活動會佔用溫習時間，影響成績。
  [陳美玲 (5B)] 11:05 我覺得這個計劃很有意義，支持！
- 資料一的活動細項必須能直接回應資料二的疑慮

【各文體格式要求（非常重要，必須嚴格遵守）】

演講辭（speech）必備三元素：
1. 稱謂：第一行頂格，按「先尊後卑」，末尾冒號。例：各位老師、各位同學：
2. 自我介紹：正文開首交代身份。例：大家好！我是學生會副主席李明德。
3. 文末致謝：最末一句。例：多謝各位！
演講辭絕對禁止：書信上款、祝頌語（祝/教安）、署名（謹啟）、日期

書信/公開信（letter）必備元素：
1. 上款：第一行頂格，含冒號。例：各位同學：
2. 祝頌語：正文後，「祝」字單獨一行，前空兩格；祝福語（如「學業進步」）另起一行頂格
3. 署名：必須分兩行，各自靠右對齊：
   第一行：身份（如：匯賢中學社會服務團團長）
   第二行：姓名+啟告語（如：陳志堅謹啟）
4. 日期：緊接署名第二行下方，靠左
書信絕對禁止：自我介紹（大家好！我是...）、文末致謝（多謝各位！）、演講辭稱謂格式、身份和姓名寫在同一行

建議書（proposal）必備元素：
1. 上款：第一行頂格，含冒號
2. 標題：置中，含「建議」二字
3. 署名：分兩行靠右，第一行為身份，第二行為姓名+謹啟
4. 日期
建議書絕對禁止：祝頌語、演講辭格式

報告（report）必備元素：
1. 上款：第一行頂格，含冒號
2. 標題：置中，含「報告」二字
3. 署名：分兩行靠右，第一行為身份，第二行為姓名+謹啟
4. 日期
報告絕對禁止：祝頌語、演講辭格式

評論文章（commentary）必備元素：
1. 標題：第一行置中（如：功課輔導立意佳 微調細節收效大）
2. 署名及身份：寫在標題正下方或文章末尾（如：學生會會長周詩涵）
評論文章絕對禁止：上款（頂格稱謂）、祝頌語（祝/教安）、日期、自我介紹（大家好！我是...）、文末致謝（多謝各位！）
違反上述禁忌將被視為添加多餘格式而扣分

專題文章（article）必備元素：
1. 標題：第一行置中（如：舞台展現自我 合作成就精彩）
2. 署名及身份：寫在標題右下方或文末（如：戲劇學會主席蘇樂行）
專題文章絕對禁止：上款（頂格稱謂）、祝頌語（祝/教安）、日期、自我介紹、文末致謝（多謝各位！）
違反上述禁忌將被視為添加多餘格式而扣分

【示範文章段落要求（非常重要）】
示範文章必須嚴格按以下四段結構，每段字數限制如下（連同標點符號計算）：
- 第一段【開首】約80字：交代寫作身份、計劃名稱及撰文目的
- 第二段【正文一】約220字：回應第一個疑慮，整合資料一對應活動的具體細項加以拓展說明；不可點名指定同學，須用泛指表達，如「有同學擔心……」、「對於……的疑慮」
- 第三段【正文二】約220字：回應第二個疑慮，整合資料一對應活動的具體細項加以拓展說明；同時自然引用支持者的正面意見作佐證，加強說服力；同樣不可點名，可用「亦有同學指出……」、「正如部分同學所言……」
- 第四段【結尾】約70字：總結計劃意義，呼籲同學支持參與
全文合共約590字（含上款、祝頌語、署名、日期），不可超過題目字數限制
每段字數須接近指定數字，不可大幅偏離（±20字以內）
示範文章輸出時不可在段落末標示字數（如「（79字）」），直接輸出文章內容即可

【示範文章要求】
- 全文500-560字，嚴格控制字數，不可超過字數限制
- 必須100%符合所選文體（${genreNames[genre] || genre}）的格式，嚴格遵守上述對應文體的必備元素和禁忌
- 拓展部分用【拓展】和【/拓展】標記
- 示範文章內容絕對不可使用 * # ** 等 Markdown 符號
- 示範文章絕對不可點名指定資料二中的同學（如「陳大明同學」、「黃小芳同學」），必須用泛指（如「有同學擔心」、「部分同學認為」、「亦有同學指出」）

【關鍵區分：資訊分 vs 內容發展分】
- 資訊分（2分）：考核考生是否提及必要背景資訊，如：寫作身份、計劃名稱、寫作目的／動機、呼籲支持等（即「有沒有提到」）
- 內容發展分（8分）：考核考生能否整理資料一的具體活動細項，並針對資料二的疑慮加以拓展說明

【內容發展評分參考格式（非常重要）】
contentDevelopment 分為兩部分輸出：
第一部分 factualContent：列出資料中可直接抄錄的客觀資訊（活動名稱、活動細項、所有同學意見含疑慮及支持），每項格式：「類別：具體內容」
例：
  「活動：長者探訪、數碼教學」
  「活動細項：長者探訪（分組前往老人院、與長者聊天及表演節目）、數碼教學（協助長者使用智能手機）」
  「同學疑慮：林學文擔心影響溫習時間、王小明擔心溝通困難」
  「同學支持：李思敏認為能從長者身上學到人生智慧、擴闊視野」
第二部分 expansionPoints：列出考生應如何拓展說明，並說明如何引用支持意見佐證
格式：「利用（細項）回應（疑慮），說明（論點）；可引用（支持意見）佐證」
例：
  「利用『分組探訪、與長者互動』回應課業壓力疑慮，說明探訪能培養同理心、調劑心情」
  「利用『數碼教學』回應溝通困難疑慮，說明教學能鍛煉耐性及溝通技巧；可引用李思敏正面意見，強調活動能擴闊視野、獲取人生智慧」

【輸出格式 - 必須是有效的JSON，不含markdown標記】
{
  "examPaper": {
    "title": "DSE 中文卷二甲部：實用寫作",
    "time": "45分鐘",
    "marks": "50分",
    "instructions": [],
    "question": "完整題目（含情境、身份、文體、任務一、任務二、字數限制）",
    "material1": {
      "title": "資料一：[機構名稱]「[計劃名稱]」[文件類型]",
      "content": "背景說明（1-2句）\n| 活動名稱 | 內容 |\n| --- | --- |\n| 活動一 | 說明 |\n| 活動二 | 說明 |"
    },
    "material2": {
      "title": "資料二：[學校名稱][討論平台]（節錄）",
      "content": "[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容"
    }
  },
  "markingScheme": {
    "contentInfo": {
      "title": "資訊分（2分）",
      "table": [
        { "item": "細項名稱", "description": "具體說明" }
      ]
    },
    "contentDevelopment": {
      "title": "內容發展分（8分）",
      "factualContent": [
        "活動：活動一名稱、活動二名稱",
        "活動細項：活動一細項、活動二細項",
        "同學疑慮：同學甲的疑慮（對應活動一）、同學乙的疑慮（對應活動二）",
        "同學支持：同學丙認為計劃的具體好處（正面意見）"
      ],
      "expansionPoints": [
        "利用『活動一細項』回應同學甲疑慮，說明活動如何解決問題及促進成長",
        "利用『活動二細項』回應同學乙疑慮，說明活動的實際價值；引用同學丙正面意見佐證"
      ]
    },
    "formatRequirements": {
      "title": "格式要求（組織分，最多扣2分）",
      "table": [
        { "item": "格式項目（如：欠稱謂）", "requirement": "具體格式要求", "score": "欠缺/多餘" }
      ]
    }
    // 注意：formatRequirements 只列出各文體的必備格式元素，不包含字數要求
    // 格式扣分規則由前端統一顯示：錯1-2項扣1分，錯3項或以上扣2分
  },
  "modelEssay": "示範文章（四段結構：開首約80字、正文一約220字、正文二約220字、結尾約70字；拓展部分用【拓展】【/拓展】標記）"
}`;

  let messages;
  
  if (fileData && fileType && fileType.startsWith('image/')) {
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '請仔細分析這張模擬卷圖片，理解其主題方向、資料結構和寫作任務，然後生成一份全新的模擬卷。' },
          { type: 'image_url', image_url: { url: `data:${fileType};base64,${fileData}` } }
        ]
      }
    ];
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: (() => {
        const textContent = text || '';
        const criteriaMatch = textContent.match(/【參考卷：評分準則[^】]*】\n([\s\S]*?)(?=\n\n---|$)/);
        let criteria = criteriaMatch ? criteriaMatch[1].trim() : '';
        if (criteria.length > 300) criteria = criteria.substring(0, 300) + '……（省略）';
        const mainContent = criteriaMatch
          ? textContent.replace(/\n\n---\n\n【參考卷：評分準則[^】]*】[\s\S]*$/, '').replace(/【參考卷：評分準則[^】]*】[\s\S]*$/, '')
          : textContent;
        return ['請根據以下參考卷內容生成新模擬卷：', '', mainContent,
          criteria ? `\n【參考卷資料結構摘要（供AI理解資料複雜度，據此設計相似結構的新試卷）】\n${criteria}` : ''
        ].filter(Boolean).join('\n');
      })() }
    ];
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('OpenAI API 返回內容為空');
  }

  const result = JSON.parse(content);
  return transformExamResult(result);
}

async function analyzeClassWithOpenAI(apiKey, modelName, reports, question, gradingMode = 'secondary') {
  const model = modelName || 'gpt-4o';
  
  const stats = {
    totalStudents: reports.length,
    averageScore: reports.reduce((sum, r) => sum + r.totalScore, 0) / reports.length,
  };

  let systemPrompt;
  if (gradingMode === 'primary') {
    systemPrompt = `你是一位專業的香港小學中文科教師，正在分析全班學生的寫作表現。請以JSON格式返回分析結果。`;
  } else if (gradingMode === 'practical') {
    systemPrompt = `你是一位專業的香港中學中文科教師，正在分析全班學生的實用寫作表現。請以JSON格式返回分析結果。`;
  } else {
    systemPrompt = `你是一位專業的香港中學中文科教師，正在分析全班學生的寫作表現。請以JSON格式返回分析結果。`;
  }

  const userPrompt = `請分析以下全班寫作數據：

## 題目
${question}

## 統計數據
- 總人數: ${stats.totalStudents}
- 平均分: ${stats.averageScore.toFixed(1)}

## 學生分數詳情
${reports.map(r => `- ${r.studentWork?.name || '未命名'}: 總分${r.totalScore}`).join('\n')}

請以專業教師的角度進行分析，並以JSON格式返回結果。`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('OpenAI API 返回內容為空');
  }

  return JSON.parse(content);
}

// ============ 自定義 API 函數 ============

async function testCustomConnection(apiKey, baseURL, modelName) {
  try {
    const normalizedURL = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
    
    const response = await fetch(`${normalizedURL}/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const availableModels = data.data?.map(m => m.id) || [];
    const isModelAvailable = availableModels.some(m => m === modelName);

    return {
      success: true,
      message: isModelAvailable 
        ? `API 連接成功！模型 "${modelName}" 可用`
        : `API 連接成功！但模型 "${modelName}" 可能不可用`,
      model: modelName
    };
  } catch (error) {
    return handleOpenAIError(error, modelName);
  }
}

async function extractWithCustom(apiKey, baseURL, modelName, fileData, text, fileType) {
  const model = modelName || 'gpt-4o';
  const normalizedURL = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
  
  // 檢查是否為 Word 文件
  const isWord = fileType && (
    fileType === 'application/msword' || 
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType.includes('word') ||
    fileType.includes('doc')
  );
  
  // 如果是 Word 文件，必須使用 mammoth 提取文本
  if (isWord && fileData) {
    if (!mammoth) {
      throw new Error('Word 文件處理需要 mammoth 庫，請確保已安裝 mammoth 套件 (npm install mammoth)');
    }
    try {
      console.log('Processing Word file with mammoth (Custom API)');
      const buffer = Buffer.from(fileData, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      console.log('Word file extracted, length:', result.value.length);
      text = result.value;
      fileData = null;
    } catch (wordError) {
      console.error('Mammoth extraction failed:', wordError);
      throw new Error(`無法提取 Word 文件內容: ${wordError.message}`);
    }
  }
  
  const systemPrompt = `你是一個專業的OCR文字識別助手。請從圖片或文檔中提取學生的作文文字。

提取要求：
1. 保持原文的段落格式
2. 識別學生姓名和學號（通常在文章開頭或標題處）
3. 只提取作文正文，不要包含題目（除非題目是文章的一部分）
4. 保持所有標點符號
5. 不要修改任何文字，包括錯別字

請以JSON格式返回：
{
  "articles": [
    {
      "text": "作文全文",
      "name": "學生姓名（如無則留空）",
      "studentId": "學生學號（如無則留空）"
    }
  ]
}`;

  let messages;
  
  if (fileData && fileType && fileType.startsWith('image/')) {
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '請提取這張圖片中的學生作文文字，並識別姓名和學號。' },
          { type: 'image_url', image_url: { url: `data:${fileType};base64,${fileData}` } }
        ]
      }
    ];
  } else {
    const content = text || '';
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `請提取以下文本中的學生作文內容：\n\n${content}` }
    ];
  }

  const response = await fetch(`${normalizedURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('API 返回內容為空');
  }

  const result = JSON.parse(content);
  
  if (result.articles && Array.isArray(result.articles) && result.articles.length > 0) {
    const firstArticle = result.articles[0];
    return {
      text: firstArticle.text || '',
      name: firstArticle.name || '',
      studentId: firstArticle.studentId || '',
      articles: result.articles
    };
  }
  
  return {
    text: result.text || '',
    name: result.name || '',
    studentId: result.studentId || ''
  };
}

async function extractQuestionCriteriaWithCustom(apiKey, baseURL, modelName, fileData, text, fileType) {
  const model = modelName || 'gpt-4o';
  const normalizedURL = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
  
  const systemPrompt = `你是一個專業的香港DSE中文科教育文件分析助手。請從文件中分別提取以下四項內容。

文件可能是一份完整的實用寫作練習卷，包含題目、資料一、資料二和評分參考（評卷參考）。請仔細分析並分別提取：

1. question（題目）：作文的題目要求，即「試以……名義，撰寫……」的完整題目句子
2. materials（資料內容）：資料一和資料二的完整內容，包含標題和正文，保留原有格式
3. criteria（評分準則）：評分參考或評卷參考的內容（如無則為空字符串）

重要：所有內容必須使用繁體中文，完整保留原文，不可省略或改寫。

請只返回有效的JSON格式，不要加任何說明或markdown：
{
  "question": "題目完整內容",
  "materials": "資料一和資料二的完整內容",
  "criteria": "評分準則內容（如無則為空字符串）"
}`;

  let messages;
  
  if (fileData && fileType && fileType.startsWith('image/')) {
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '請分析這張圖片，提取題目和評分準則。' },
          { type: 'image_url', image_url: { url: `data:${fileType};base64,${fileData}` } }
        ]
      }
    ];
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `請分析以下內容：\n\n${text || ''}` }
    ];
  }

  const response = await fetch(`${normalizedURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('API 返回內容為空');
  }

  return JSON.parse(content);
}

async function gradeWithCustom(apiKey, baseURL, modelName, essayText, question, customCriteria, gradingMode = 'secondary', contentPriority = false, enhancementDirection = 'auto', genre = '', infoPoints = [], devItems = {}, formatRequirements = [], materials = '') {
  const model = modelName || 'gpt-4o';
  const normalizedURL = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
  
  const systemPrompt = buildGradingPrompt(gradingMode, contentPriority, enhancementDirection, genre, infoPoints, devItems, formatRequirements);
  const userPrompt = buildUserPrompt(essayText, question, customCriteria, gradingMode, genre, materials);

  const response = await fetch(`${normalizedURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('API 返回內容為空');
  }

  return parseGradingResult(content, essayText, gradingMode);
}

async function generatePracticalExamWithCustom(apiKey, baseURL, modelName, fileData, text, fileType, genre, clientSystemPrompt) {
  const model = modelName || 'gpt-4o';
  const normalizedURL = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
  
  const genreNames = {
    speech: '演講辭',
    letter: '書信/公開信',
    proposal: '建議書',
    report: '報告',
    commentary: '評論文章',
    article: '專題文章'
  };

  const systemPrompt = `你是一位專業的香港DSE中文科試題設計專家。

【第一步：分析上傳的參考題目和資料】
仔細分析用戶上傳的模擬卷（包括題目和資料一、資料二），識別以下要素：
1. 主題範疇（如：環保、閱讀推廣、健康生活、社區服務、文化交流等）
2. 寫作任務一的模式（從以下選項中識別最接近的）：
   - 「說明計劃的意義／好處」
   - 「介紹計劃的內容」
   - 「匯報調查結果」（報告文體專用）
   - 「評論計劃的利弊／成效」
   - 「就計劃提出建議」
3. 寫作任務二的模式（從以下選項中識別最接近的）：
   - 「回應同學的意見／疑慮，游說支持」
   - 「鼓勵同學積極參與」
   - 「提出改善建議」（報告文體專用）
   - 「呼籲各方支持」
4. 資料一的結構：活動細項數量、表格欄位設計、背景說明篇幅
5. 資料二的結構：留言數量、疑慮類型（對應哪些活動細項）、支持留言的方向

【第二步：生成新試卷（嚴格仿照參考卷的結構複雜度）】
保持相同的主題範疇、任務模式、資料結構複雜度，但情境、計劃名稱、機構、活動內容和人物姓名必須完全不同。
特別注意：
- 若參考卷資料一有2項活動、各有2個細項，新試卷也應設計2項活動、各有類似數量的細項
- 若參考卷資料二有2則疑慮留言（各對應1項活動），新試卷也應設計同等數量的配對疑慮
文體：${genreNames[genre] || genre}

【題目格式要求（非常重要）】
題目必須是一個完整的句子段落，不可用列點（(1)(2)或①②）陳述寫作任務。
正確格式示例：「綠苗中學將於本學年推行『惜食校園：廚餘減量行動』計劃，試以綠苗中學學生會副主席李明德的名義，撰寫一篇演講辭，在週會上向全體師生演講，說明『惜食校園：廚餘減量行動』的意義及內容，並針對同學對行動的疑慮，游說他們支持這項行動。（全文不得多於550字，標點符號計算在內。）」
題目須包含：情境背景 → 寫作身份（以[職銜][三字中文姓名]名義）→ 文體及場合 → 完整陳述任務（說明+回應，不列點）→ 字數限制

【資料設計要求】
- 資料一：官方文件形式（通告／宣傳單張），包含背景說明和活動內容表格
  【表格格式（非常重要，必須嚴格遵守）】
  資料一的活動內容必須用以下 Markdown 表格格式輸出，絕對不可用純文字段落代替：
  | 活動名稱 | 內容 |
  | --- | --- |
  | 活動一名稱 | 活動一的具體內容說明 |
  | 活動二名稱 | 活動二的具體內容說明 |
  表格行數：2-3行（對應2-3項活動）
- 資料二：學生討論記錄（4則留言），格式：[姓名（班別）] [時間 HH:MM] [留言內容]
  留言一：疑慮（對應活動一，表達具體擔憂）
  留言二：疑慮（對應活動二，表達具體擔憂）
  留言三：正面支持（肯定計劃的某個具體好處，此意見可在示範文章中引用作佐證）
  留言四：寫作者宣布將撰文回應
  重要：留言內容必須是純文字，絕對不可使用 | 表格、* # ** 等任何 Markdown 符號
  每則留言必須獨立一行，格式嚴格如下（不可用表格）：
  [姓名 (班別)] HH:MM 留言內容
  例：
  [林小明 (4C)] 10:35 我擔心活動會佔用溫習時間，影響成績。
  [陳美玲 (5B)] 11:05 我覺得這個計劃很有意義，支持！
- 資料一的活動細項必須能直接回應資料二的疑慮

【各文體格式要求（非常重要，必須嚴格遵守）】

演講辭（speech）必備三元素：
1. 稱謂：第一行頂格，按「先尊後卑」，末尾冒號。例：各位老師、各位同學：
2. 自我介紹：正文開首交代身份。例：大家好！我是學生會副主席李明德。
3. 文末致謝：最末一句。例：多謝各位！
演講辭絕對禁止：書信上款、祝頌語（祝/教安）、署名（謹啟）、日期

書信/公開信（letter）必備元素：
1. 上款：第一行頂格，含冒號。例：各位同學：
2. 祝頌語：正文後，「祝」字單獨一行，前空兩格；祝福語（如「學業進步」）另起一行頂格
3. 署名：必須分兩行，各自靠右對齊：
   第一行：身份（如：匯賢中學社會服務團團長）
   第二行：姓名+啟告語（如：陳志堅謹啟）
4. 日期：緊接署名第二行下方，靠左
書信絕對禁止：自我介紹（大家好！我是...）、文末致謝（多謝各位！）、演講辭稱謂格式、身份和姓名寫在同一行

建議書（proposal）必備元素：
1. 上款：第一行頂格，含冒號
2. 標題：置中，含「建議」二字
3. 署名：分兩行靠右，第一行為身份，第二行為姓名+謹啟
4. 日期
建議書絕對禁止：祝頌語、演講辭格式

報告（report）必備元素：
1. 上款：第一行頂格，含冒號
2. 標題：置中，含「報告」二字
3. 署名：分兩行靠右，第一行為身份，第二行為姓名+謹啟
4. 日期
報告絕對禁止：祝頌語、演講辭格式

評論文章（commentary）必備元素：
1. 標題：第一行置中（如：功課輔導立意佳 微調細節收效大）
2. 署名及身份：寫在標題正下方或文章末尾（如：學生會會長周詩涵）
評論文章絕對禁止：上款（頂格稱謂）、祝頌語（祝/教安）、日期、自我介紹（大家好！我是...）、文末致謝（多謝各位！）
違反上述禁忌將被視為添加多餘格式而扣分

專題文章（article）必備元素：
1. 標題：第一行置中（如：舞台展現自我 合作成就精彩）
2. 署名及身份：寫在標題右下方或文末（如：戲劇學會主席蘇樂行）
專題文章絕對禁止：上款（頂格稱謂）、祝頌語（祝/教安）、日期、自我介紹、文末致謝（多謝各位！）
違反上述禁忌將被視為添加多餘格式而扣分

【示範文章段落要求（非常重要）】
示範文章必須嚴格按以下四段結構，每段字數限制如下（連同標點符號計算）：
- 第一段【開首】約80字：交代寫作身份、計劃名稱及撰文目的
- 第二段【正文一】約220字：回應第一個疑慮，整合資料一對應活動的具體細項加以拓展說明；不可點名指定同學，須用泛指表達，如「有同學擔心……」、「對於……的疑慮」
- 第三段【正文二】約220字：回應第二個疑慮，整合資料一對應活動的具體細項加以拓展說明；同時自然引用支持者的正面意見作佐證，加強說服力；同樣不可點名，可用「亦有同學指出……」、「正如部分同學所言……」
- 第四段【結尾】約70字：總結計劃意義，呼籲同學支持參與
全文合共約590字（含上款、祝頌語、署名、日期），不可超過題目字數限制
每段字數須接近指定數字，不可大幅偏離（±20字以內）
示範文章輸出時不可在段落末標示字數（如「（79字）」），直接輸出文章內容即可

【示範文章要求】
- 全文500-560字，嚴格控制字數，不可超過字數限制
- 必須100%符合所選文體（${genreNames[genre] || genre}）的格式，嚴格遵守上述對應文體的必備元素和禁忌
- 拓展部分用【拓展】和【/拓展】標記
- 示範文章內容絕對不可使用 * # ** 等 Markdown 符號
- 示範文章絕對不可點名指定資料二中的同學（如「陳大明同學」、「黃小芳同學」），必須用泛指（如「有同學擔心」、「部分同學認為」、「亦有同學指出」）

【關鍵區分：資訊分 vs 內容發展分】
- 資訊分（2分）：考核考生是否提及必要背景資訊，如：寫作身份、計劃名稱、寫作目的／動機、呼籲支持等（即「有沒有提到」）
- 內容發展分（8分）：考核考生能否整理資料一的具體活動細項，並針對資料二的疑慮加以拓展說明

【內容發展評分參考格式（非常重要）】
contentDevelopment 分為兩部分輸出：
第一部分 factualContent：列出資料中可直接抄錄的客觀資訊（活動名稱、活動細項、所有同學意見含疑慮及支持），每項格式：「類別：具體內容」
例：
  「活動：長者探訪、數碼教學」
  「活動細項：長者探訪（分組前往老人院、與長者聊天及表演節目）、數碼教學（協助長者使用智能手機）」
  「同學疑慮：林學文擔心影響溫習時間、王小明擔心溝通困難」
  「同學支持：李思敏認為能從長者身上學到人生智慧、擴闊視野」
第二部分 expansionPoints：列出考生應如何拓展說明，並說明如何引用支持意見佐證
格式：「利用（細項）回應（疑慮），說明（論點）；可引用（支持意見）佐證」
例：
  「利用『分組探訪、與長者互動』回應課業壓力疑慮，說明探訪能培養同理心、調劑心情」
  「利用『數碼教學』回應溝通困難疑慮，說明教學能鍛煉耐性及溝通技巧；可引用李思敏正面意見，強調活動能擴闊視野、獲取人生智慧」

【輸出格式 - 必須是有效的JSON，不含markdown標記】
{
  "examPaper": {
    "title": "DSE 中文卷二甲部：實用寫作",
    "time": "45分鐘",
    "marks": "50分",
    "instructions": [],
    "question": "完整題目（含情境、身份、文體、任務一、任務二、字數限制）",
    "material1": {
      "title": "資料一：[機構名稱]「[計劃名稱]」[文件類型]",
      "content": "背景說明（1-2句）\n| 活動名稱 | 內容 |\n| --- | --- |\n| 活動一 | 說明 |\n| 活動二 | 說明 |"
    },
    "material2": {
      "title": "資料二：[學校名稱][討論平台]（節錄）",
      "content": "[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容\n[姓名 (班別)] HH:MM 留言內容"
    }
  },
  "markingScheme": {
    "contentInfo": {
      "title": "資訊分（2分）",
      "table": [
        { "item": "細項名稱", "description": "具體說明" }
      ]
    },
    "contentDevelopment": {
      "title": "內容發展分（8分）",
      "factualContent": [
        "活動：活動一名稱、活動二名稱",
        "活動細項：活動一細項、活動二細項",
        "同學疑慮：同學甲的疑慮（對應活動一）、同學乙的疑慮（對應活動二）",
        "同學支持：同學丙認為計劃的具體好處（正面意見）"
      ],
      "expansionPoints": [
        "利用『活動一細項』回應同學甲疑慮，說明活動如何解決問題及促進成長",
        "利用『活動二細項』回應同學乙疑慮，說明活動的實際價值；引用同學丙正面意見佐證"
      ]
    },
    "formatRequirements": {
      "title": "格式要求（組織分，最多扣2分）",
      "table": [
        { "item": "格式項目（如：欠稱謂）", "requirement": "具體格式要求", "score": "欠缺/多餘" }
      ]
    }
    // 注意：formatRequirements 只列出各文體的必備格式元素，不包含字數要求
    // 格式扣分規則由前端統一顯示：錯1-2項扣1分，錯3項或以上扣2分
  },
  "modelEssay": "示範文章（四段結構：開首約80字、正文一約220字、正文二約220字、結尾約70字；拓展部分用【拓展】【/拓展】標記）"
}`;

  let messages;
  
  if (fileData && fileType && fileType.startsWith('image/')) {
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '請仔細分析這張模擬卷圖片，理解其主題方向、資料結構和寫作任務，然後生成一份全新的模擬卷。' },
          { type: 'image_url', image_url: { url: `data:${fileType};base64,${fileData}` } }
        ]
      }
    ];
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: (() => {
        const textContent = text || '';
        const criteriaMatch = textContent.match(/【參考卷：評分準則[^】]*】\n([\s\S]*?)(?=\n\n---|$)/);
        let criteria = criteriaMatch ? criteriaMatch[1].trim() : '';
        if (criteria.length > 300) criteria = criteria.substring(0, 300) + '……（省略）';
        const mainContent = criteriaMatch
          ? textContent.replace(/\n\n---\n\n【參考卷：評分準則[^】]*】[\s\S]*$/, '').replace(/【參考卷：評分準則[^】]*】[\s\S]*$/, '')
          : textContent;
        return ['請根據以下參考卷內容生成新模擬卷：', '', mainContent,
          criteria ? `\n【參考卷資料結構摘要（供AI理解資料複雜度，據此設計相似結構的新試卷）】\n${criteria}` : ''
        ].filter(Boolean).join('\n');
      })() }
    ];
  }

  const response = await fetch(`${normalizedURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('API 返回內容為空');
  }

  const result = JSON.parse(content);
  return transformExamResult(result);
}

async function analyzeClassWithCustom(apiKey, baseURL, modelName, reports, question, gradingMode = 'secondary') {
  const model = modelName || 'gpt-4o';
  const normalizedURL = baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`;
  
  const stats = {
    totalStudents: reports.length,
    averageScore: reports.reduce((sum, r) => sum + r.totalScore, 0) / reports.length,
  };

  let systemPrompt;
  if (gradingMode === 'primary') {
    systemPrompt = `你是一位專業的香港小學中文科教師，正在分析全班學生的寫作表現。請以JSON格式返回分析結果。`;
  } else if (gradingMode === 'practical') {
    systemPrompt = `你是一位專業的香港中學中文科教師，正在分析全班學生的實用寫作表現。請以JSON格式返回分析結果。`;
  } else {
    systemPrompt = `你是一位專業的香港中學中文科教師，正在分析全班學生的寫作表現。請以JSON格式返回分析結果。`;
  }

  const userPrompt = `請分析以下全班寫作數據：

## 題目
${question}

## 統計數據
- 總人數: ${stats.totalStudents}
- 平均分: ${stats.averageScore.toFixed(1)}

## 學生分數詳情
${reports.map(r => `- ${r.studentWork?.name || '未命名'}: 總分${r.totalScore}`).join('\n')}

請以專業教師的角度進行分析，並以JSON格式返回結果。`;

  const response = await fetch(`${normalizedURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API 請求失敗');
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('API 返回內容為空');
  }

  return JSON.parse(content);
}

// ============ 錯誤處理函數 ============

function handleGeminiError(error, modelName) {
  const message = error.message || '未知錯誤';
  
  if (message.includes('quota') || message.includes('exceeded') || message.includes('429')) {
    return { success: false, message: 'Gemini API 配額已用完，請檢查您的 Google AI Studio 配額或稍後再試' };
  }
  
  if (message.includes('not found') || message.includes('model')) {
    return { success: false, message: `模型 "${modelName}" 不存在或無權訪問，請確認模型名稱正確` };
  }
  
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('API key not valid')) {
    return { success: false, message: 'API 密鑰無效，請檢查您的 Gemini API 密鑰是否正確' };
  }
  
  if (message.includes('fetch') || message.includes('network') || message.includes('ECONNREFUSED')) {
    return { success: false, message: '無法連接到 Gemini 服務器，請檢查網絡連接' };
  }
  
  if (message.includes('token') || message.includes('Token') || message.includes('1048576')) {
    return { success: false, message: '輸入內容太長，超過了 Token 限制。請嘗試：1) 使用更小的文件 2) 分段處理 3) 使用支持更大上下文的模型' };
  }
  
  return { success: false, message: `連接失敗: ${message}` };
}

function handleOpenAIError(error, modelName) {
  const message = error.message || '未知錯誤';
  
  if (message.includes('quota') || message.includes('exceeded') || message.includes('429')) {
    return { success: false, message: 'API 配額已用完，請檢查您的賬戶配額' };
  }
  
  if (message.includes('not found') || message.includes('model')) {
    return { success: false, message: `模型 "${modelName}" 不存在或無權訪問` };
  }
  
  if (message.includes('401') || message.includes('Unauthorized')) {
    return { success: false, message: 'API 密鑰無效，請檢查您的 API 密鑰' };
  }
  
  if (message.includes('token') || message.includes('Token')) {
    return { success: false, message: '輸入內容太長，超過了 Token 限制。請嘗試：1) 使用更小的文件 2) 分段處理 3) 使用支持更大上下文的模型' };
  }
  
  return { success: false, message: `連接失敗: ${message}` };
}

// ============ Prompt 和解析函數 ============

// ══════════════════════════════════════════════════════════════
// 【重新生成評語】：按老師調整後的分數重新生成評語（不重新生成增潤/示範）
// ══════════════════════════════════════════════════════════════

function buildFeedbackOnlyPrompt(essayText, question, teacherGrading) {
  const { content, expression, structure, punctuation } = teacherGrading;
  const totalScore = (content * 4) + (expression * 3) + (structure * 2) + punctuation;

  const gradeLabel = (score) => {
    const labels = { 10:'上上', 9:'上中', 8:'上下', 7:'中上', 6:'中中上', 5:'中中下', 4:'中下', 3:'下上', 2:'下中', 1:'下下' };
    return labels[Math.max(1, Math.min(10, Math.round(score)))] || '中中';
  };

  return `你是一位專業的香港中學中文科教師。老師已根據以下評分批改學生作文，請你按照老師給定的分數，為這篇作文撰寫相應水平的評語。

【老師給定的評分（必須嚴格按此分數撰寫評語，不可更改）】
- 內容（40分，品第制）：${content}分（${gradeLabel(content)}品）
- 表達（30分，品第制）：${expression}分（${gradeLabel(expression)}品）
- 結構（20分，品第制）：${structure}分（${gradeLabel(structure)}品）
- 標點（10分）：${punctuation}分
- 總分：${totalScore}分

【題目】
${question}

【學生作文】
${essayText}

【撰寫評語的要求】
1. 評語必須與老師給定的分數相符，不得高估或低估學生水平
2. 每項評語必須引用學生作文的具體句子或段落作依據
3. 總評須先指出選材是否扣題、立意是否清晰，再指出表達及結構的主要優點和改善建議
4. strengths和improvements各提供2-3項具體意見

請以JSON格式返回（只包含評語，不包含grading、enhancedText、modelEssay）：
{
  "overallComment": "總評（2-3段，引用具體句子，與評分水平相符）",
  "contentFeedback": {
    "strengths": ["引用具體句子說明內容優點"],
    "improvements": ["具體指出選材或立意的不足"]
  },
  "expressionFeedback": {
    "strengths": ["引用具體句子說明表達優點"],
    "improvements": ["具體指出語病或用詞問題，引用原句"]
  },
  "structureFeedback": {
    "strengths": ["具體說明結構完整性及銜接優點"],
    "improvements": ["具體指出結構或詳略問題"]
  },
  "punctuationFeedback": {
    "strengths": ["標點優點"],
    "improvements": ["具體指出標點失誤位置及類型"]
  }
}`;
}

async function regenerateFeedbackWithGemini(apiKey, modelName, essayText, question, teacherGrading) {
  const prompt = buildFeedbackOnlyPrompt(essayText, question, teacherGrading);
  // 修復：使用normalizeGeminiModelName並加入models/前綴，與gradeWithGemini一致
  const normalizedModel = normalizeGeminiModelName(modelName || 'gemini-2.0-flash');
  const model = `models/${normalizedModel}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        safetySettings: GEMINI_SAFETY_SETTINGS
      }),
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Gemini API 請求失敗');
  }
  const data = await response.json();
  if (data.promptFeedback?.blockReason) throw new Error(`內容被阻擋: ${data.promptFeedback.blockReason}`);
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!content) throw new Error('Gemini 返回內容為空');
  return parseFeedbackOnlyResult(content);
}

async function regenerateFeedbackWithOpenAI(apiKey, modelName, essayText, question, teacherGrading) {
  const prompt = buildFeedbackOnlyPrompt(essayText, question, teacherGrading);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return parseFeedbackOnlyResult(content);
}

async function regenerateFeedbackWithCustom(apiKey, baseURL, modelName, essayText, question, teacherGrading) {
  const prompt = buildFeedbackOnlyPrompt(essayText, question, teacherGrading);
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return parseFeedbackOnlyResult(content);
}

function parseFeedbackOnlyResult(content) {
  try {
    const clean = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean);
    const buildFeedback = (fb) => ({
      strengths: Array.isArray(fb?.strengths) ? fb.strengths : [],
      improvements: Array.isArray(fb?.improvements) ? fb.improvements : [],
    });
    return {
      overallComment: parsed.overallComment || '',
      contentFeedback: buildFeedback(parsed.contentFeedback),
      expressionFeedback: buildFeedback(parsed.expressionFeedback),
      structureFeedback: buildFeedback(parsed.structureFeedback),
      punctuationFeedback: buildFeedback(parsed.punctuationFeedback),
    };
  } catch (e) {
    console.error('parseFeedbackOnlyResult error:', e);
    return {
      overallComment: '評語生成失敗，請重試。',
      contentFeedback: { strengths: [], improvements: [] },
      expressionFeedback: { strengths: [], improvements: [] },
      structureFeedback: { strengths: [], improvements: [] },
      punctuationFeedback: { strengths: [], improvements: [] },
    };
  }
}

// ══════════════════════════════════════════════════════════════

function buildGradingPrompt(gradingMode = 'secondary', contentPriority = false, enhancementDirection = 'auto', genre = '', infoPoints = [], devItems = {}, formatRequirements = []) {
  if (gradingMode === 'primary') {
    return buildPrimaryGradingPrompt();
  } else if (gradingMode === 'practical') {
    return buildPracticalGradingPrompt(genre, infoPoints, devItems, formatRequirements);
  } else {
    return buildSecondaryGradingPrompt(contentPriority, enhancementDirection);
  }
}

function buildSecondaryGradingPrompt(contentPriority = false, enhancementDirection = 'auto') {
  const enhancementInstruction = enhancementDirection === 'narrative' 
    ? '增潤時優先考慮記敘和抒情元素，讓文章更有情感感染力'
    : enhancementDirection === 'argumentative'
    ? '增潤時優先考慮說理和論證元素，讓文章更有說服力'
    : enhancementDirection === 'descriptive'
    ? '增潤時優先考慮描寫元素（景物描寫或人物描寫），讓文章更具畫面感和形象性'
    : '根據文章類型自動判斷增潤方向（景物描寫/人物描寫/記敘抒情/議論說理）';

  const contentPriorityInstruction = contentPriority 
    ? '【以內容為主評分】請優先根據內容質量給分，結構分數可根據內容表現適度調整，但內容與結構分數一般不應相差超過2級' 
    : '【標準評分】請按照HKDSE標準評分準則進行評分';

  return `你是一位專業的香港中學中文科教師，正在批改HKDSE中文卷二乙部命題寫作。

${contentPriorityInstruction}

【給分基準提示】HKDSE一般考生的正常水平對應4至5分。給分時必須有文章的具體根據，不可憑印象估計。若無充分理由支撐6分或以上，應給5分或以下。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
一、內容（40分）— 品第制1-10分
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【評分邏輯：先看選材能否扣題，再看立意深度】

▌第一步：判斷選材扣題程度（決定能否突破5分下限）

題目通常包含多個關鍵元素（如「等待發芽的種子」含「等待」「發芽」「種子」三個元素）。評分時須逐一核對：

- 選材能扣緊題目全部關鍵元素，各元素的特質均能體現 → 可給5分或以上
- 選材只能扣住部分關鍵元素，有明顯遺漏 → 給4分
- 選材與題目核心元素有根本性偏差（如錯解「種子」的象徵） → 離題，給3分或以下

▌第二步：在扣題基礎上，按立意深度往上加分

- 5分（中中下）：扣題，有基本選材，惟立意單薄，缺乏個人體會，闡述浮淺
- 6分（中中上）：扣題，立意恰當，能配合選材，有一定個人感受，惟深度不足
- 7分（中上）：扣題，立意平穩具體，能帶出個人體會，選材合理，闡述尚算充實
- 8分（上下）：扣題，立意豐富，選材恰當，個人體會深刻，闡述飽滿
- 9分（上中）：扣題，立意極豐富且深刻，選材極恰當，觀點清晰，論證充分
- 10分（上上）：扣題，立意最深刻獨到，取材極精準，闡述極飽滿，觀點令人深思

▌離題及偏題：

- 3分（下上）：選材基本偏離題目核心元素，立意模糊，闡述欠奉
- 2分（下中）：選材嚴重偏離題目，立意混亂，闡述空泛
- 1分（下下）：完全離題或無法理解，取材闡述闕如

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
二、表達（30分）— 品第制1-10分
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【重要前提：評分豁免規則】
1. 簡體字與繁體字均接受，不視為語病或錯別字，不扣分
2. OCR識別錯誤（如形近字、同音字被錯誤辨認）不計入語病，評分時應以合理推斷學生原意為準
3. 一般考生（能寫出通順句子）的正常水平對應5分

【評分邏輯：先看句子通順程度，再看寫作手法運用】

▌第一步：判斷句子通順程度（決定基礎分）

- 句子整體通順，偶有沙石但不影響理解 → 基礎分5分（一般考生正常水平）
- 句子多處不通順，語病明顯影響閱讀 → 給4分
- 句子嚴重不通順，語病頻密，句子成分殘缺 → 給3分或以下

▌第二步：在通順基礎上，按寫作手法往上加分

- 5分（中中下）：句子尚算通順，惟有明顯語病；用詞平淡，欠缺寫作手法（此為一般考生基準）
- 6分（中中上）：句子大致通順，用詞大致準確；偶有寫作手法（如比喻、排比），惟運用一般
- 7分（中上）：句子通順，偶有瑕疵；用詞準確，寫作手法運用尚算靈活，能配合選材
- 8分（上下）：句子簡潔流暢；用詞精確豐富，寫作手法運用靈活，能有效配合選材
- 9分（上中）：句子極流暢；用詞極精確豐富，手法純熟，選材與手法配合緊密
- 10分（上上）：文句極簡潔流暢；詞藻優美，句式多變，手法純熟靈活，整體表達達到極高水平

▌語言嚴重失誤（4分或以下）：

- 4分（中下）：句子多處不通順，失誤頻密，用詞粗疏，表達薄弱
- 3分（下上）：句子欠通順，用詞不準，表達混亂
- 2分（下中）：用詞句式嚴重錯誤，表達極混亂
- 1分（下下）：文句無法達意

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
三、結構（20分）— 品第制1-10分
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【評分邏輯：先看結構是否完整，再看詳略安排與首尾呼應】

▌第一步：判斷結構完整程度（決定基礎分）

- 有清楚的開頭、中段、結尾，結構完整 → 基礎分5分
- 結構基本完整但某部分明顯薄弱（如結尾倉促或開頭缺乏引入） → 給4分
- 結構散亂，開中結欠分明 → 給3分或以下

▌第二步：在完整基礎上，按詳略安排與銜接往上加分

- 5分（中中下）：結構尚具，開中結俱備，惟詳略稍失衡，過渡一般
- 6分（中中上）：結構完整，詳略大致得宜，段落尚算清晰，輕微失衡
- 7分（中上）：結構大致完整，詳略大致合宜，過渡尚算自然，或有首尾呼應但未夠緊密
- 8分（上下）：結構完整，詳略得宜，首尾呼應清晰，段落鋪排有序
- 9分（上中）：結構極完整，詳略得宜，首尾呼應緊密，鋪排有序
- 10分（上上）：結構極完整，詳略極得宜，起承轉合自然流暢，首尾呼應精妙，鋪排主次分明

▌結構散亂（3分或以下）：

- 4分（中下）：尚具組織，但詳略明顯失衡，鋪排失當
- 3分（下上）：組織散亂，詳略嚴重失衡
- 2分（下中）：毫無組織，鋪排極混亂
- 1分（下下）：完全無結構

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
四、標點（10分）— 5-10分（下限5分）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- 10分：標點符號運用正確無誤
- 9分：偶有失誤（1-2處）
- 8分：有少許失誤（3-4處）
- 7分：有失誤（5-6處）
- 6分：失誤較多（7-8處）
- 5分：有明顯問題（9處以上），標點分數下限為5分

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
核心評分規則（必須嚴格遵守）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 一般考生正常水平為4至5分，給6分或以上必須有明確文章依據
2. 離題（選材偏離題目核心元素）→ 內容不高於3分
3. 內容與結構分數一般不應相差超過2級
4. 若內容離題（3分或以下），結構最高只能評至7分
5. 標點分數下限為5分
6. 每項評語必須引用文章具體句子或段落作依據，不可空泛

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
增潤文章要求
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${enhancementInstruction}
- 保留學生原有選材，不可替換為全新素材
- 保持學生原意和風格，修正語病和錯別字
- 提升表達質量，避免過度堆砌詞藻
- 保持人文情懷，避免AI感

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
示範文章（modelEssay）要求
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 示範文章必須達到上上品（10/10/10/10）標準
- 全文字數必須不少於1500字（標點符號計算在內），寧可超過1600字，絕不可少於1500字
- 必須按以下結構撰寫：
  【開頭】引人入勝，點出題目關鍵元素，交代情境或立場（約150-200字）
  【中段】充分展開，每段圍繞一個核心意念，有具體細節描寫或論據支撐，層層遞進（約1000-1100字）
  【結尾】呼應開頭，昇華主題，令讀者深思（約150-200字）
- 記敘文：需有細節描寫、對話、內心感受，情節起伏有致
- 議論文：需有清晰論點、多角度論據、駁論或讓步，邏輯嚴密
- 描寫文：需有多感官描寫、層次分明，意境深遠
- 文章需扣緊題目所有關鍵元素，立意獨到深刻，語言優美流暢

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
輸出格式（必須是有效JSON）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
請以JSON格式返回，確保所有字段都存在：
{
  "grading": {
    "content": 5,
    "expression": 5,
    "structure": 5,
    "punctuation": 7
  },
  "overallComment": "總評須先指出文章的選材是否扣題、立意是否清晰，再指出表達及結構的主要優點和具體改善建議，每項必須引用文章具體句子作依據，共2-3段",
  "contentFeedback": {
    "strengths": ["引用文章具體句子說明選材扣題的優點"],
    "improvements": ["具體指出選材或立意的不足，並建議改善方向"]
  },
  "expressionFeedback": {
    "strengths": ["引用文章具體句子說明表達的優點"],
    "improvements": ["具體指出語病或用詞問題，並引用原句說明"]
  },
  "structureFeedback": {
    "strengths": ["具體說明結構完整性及銜接的優點"],
    "improvements": ["具體指出結構或詳略的問題"]
  },
  "punctuationFeedback": {
    "strengths": ["標點優點"],
    "improvements": ["具體指出標點失誤位置及類型"]
  },
  "enhancedText": "增潤後的完整文章。規則：①保留學生所有段落和原意 ②只修正語病、優化用詞、補充描寫 ③字數必須多於原文字數，不可刪減學生內容 ④避免AI堆砌感，保持學生文風",
  "enhancementNotes": ["只列修改類別，每項5字內，如：修正語病、豐富詞彙、調整句式、加強描寫、深化立意、刪除冗詞，最多5項，不需列出具體句子"],
  "modelEssay": "上上品示範文章，不少於1500字，按開頭/中段/結尾結構，扣緊題目關鍵元素，立意深刻，語言優美"
}`;
}

function buildPrimaryGradingPrompt() {
  return `你是一位專業的香港小學中文科教師，正在批改小學命題寫作。

## 評分準則（必須嚴格遵守）

### 切題與內容（30分）- 等級制 0-4級
評分重點：切合題旨、內容具體、素材運用

具體標準：
- 4級(24-30分): 內容切題，具體充實，能圍繞主題展開，有適當的例子和細節
- 3級(18-23分): 內容大致切題，尚算具體，能圍繞主題但深度不足
- 2級(9-17分): 內容尚切題但不夠具體，有離題或空洞的情況
- 1級(1-8分): 內容不切題或過於簡略，嚴重離題或內容貧乏
- 0級(0分): 完全沒有內容或完全離題

### 感受與立意（20分）- 等級制 0-4級
評分重點：情感真摯、立意清晰、個人體會

具體標準：
- 4級(16-20分): 感受真摯深刻，立意清晰，有個人獨特體會
- 3級(12-15分): 感受真摯，立意尚清晰，有個人體會
- 2級(6-11分): 感受一般，立意不夠清晰，體會較淺
- 1級(1-5分): 感受虛假或缺乏，立意模糊，沒有個人體會
- 0級(0分): 完全沒有感受或立意

### 組織與結構（20分）- 等級制 0-4級
評分重點：段落分明、详略得當、過渡自然

具體標準：
- 4級(16-20分): 結構完整，段落分明，详略得當，過渡自然
- 3級(12-15分): 結構尚完整，段落尚分明，详略大致得當
- 2級(6-11分): 結構一般，段落不夠分明，详略有失衡
- 1級(1-5分): 結構散亂，段落不清，详略嚴重失衡
- 0級(0分): 完全沒有結構

### 語言運用（20分）- 等級制 0-4級
評分重點：詞彙運用、句式多樣、文句通順

具體標準：
- 4級(16-20分): 詞彙豐富，句式多樣，文句流暢，修辭恰當
- 3級(12-15分): 詞彙尚豐富，句式有變化，文句通順
- 2級(6-11分): 詞彙一般，句式單一，文句有語病
- 1級(1-5分): 詞彙貧乏，句式單調，文句不通
- 0級(0分): 完全無法表達

### 文類與格式（10分）- 等級制 0-4級
評分重點：符合文類要求、格式正確

具體標準：
- 4級(8-10分): 完全符合文類要求，格式正確
- 3級(6-7分): 大致符合文類要求，格式大致正確
- 2級(3-5分): 尚算符合文類要求，格式有錯誤
- 1級(1-2分): 不符合文類要求，格式錯誤嚴重
- 0級(0分): 完全不符合文類要求

## 輸出格式
請以JSON格式返回：
{
  "grading": {
    "content": 3,
    "feeling": 3,
    "structure": 3,
    "language": 3,
    "format": 3
  },
  "overallComment": "簡潔易明的總評",
  "contentFeedback": {
    "strengths": ["優點1"],
    "improvements": ["改善建議1"]
  },
  "feelingFeedback": {
    "strengths": ["優點1"],
    "improvements": ["改善建議1"]
  },
  "structureFeedback": {
    "strengths": ["優點1"],
    "improvements": ["改善建議1"]
  },
  "languageFeedback": {
    "strengths": ["優點1"],
    "improvements": ["改善建議1"]
  },
  "formatFeedback": {
    "strengths": ["優點1"],
    "improvements": ["改善建議1"]
  },
  "enhancedText": "增潤後的文章",
  "enhancementNotes": ["修改說明1"],
  "modelEssay": "示範文章"
}`;
}

function buildPracticalGradingPrompt(genre = '', infoPoints = [], devItems = {}, formatRequirements = []) {

  // 文體名稱對照
  const genreNames = {
    speech: '演講辭', letter: '書信／公開信', proposal: '建議書',
    report: '報告', commentary: '評論文章', article: '專題文章'
  };
  const genreName = genreNames[genre] || genre || '實用文';

  // 行文語氣效果（按文體）
  // 重要：行文語氣只評核措詞是否切合文體、對象及場合，以及游說/呼籲效果
  // 簡體字、錯別字、語病屬於「表達」層面，不在行文語氣評分範圍內，不可因此扣減語氣分
  const toneGuide = {
    speech:     '以「說明效果」為主：語氣親切，具感染力，能有效游說聽眾支持計劃。\n【重要】評分只考慮語氣是否切合文體及場合、游說效果如何，不考慮簡體字、錯別字或語病。\n評分標準：\n- 9–10分：措詞準確，行文簡潔流暢；態度冷靜得體，修飾恰當，說明效果佳，頗能吸引聽眾關注。\n- 7–8分：措詞準確，行文達意流暢；態度冷靜，頗能說明計劃。\n- 5–6分：措詞大致準確，行文大致達意；態度尚算冷靜，說明效果一般。\n- 3–4分：措詞大致準確，行文達意；語氣頗多不當。\n- 1–2分：措詞、行文未能達意；語氣極多不當。\n- 0分：空白卷或答案完全錯誤。',
    letter:     '以「游說／呼籲效果」為主（自薦信則以「自薦效果」為主）：語氣誠懇有禮，符合書信場合。\n【重要】評分只考慮語氣是否切合文體及場合、游說效果如何，不考慮簡體字、錯別字或語病。\n評分標準：\n- 9–10分：措詞準確，行文簡潔流暢；態度誠懇，修飾恰當，游說效果佳。\n- 7–8分：措詞準確，行文達意流暢；態度誠懇，頗具游說效果。\n- 5–6分：措詞大致準確，行文大致達意；態度尚算誠懇，游說效果一般。\n- 3–4分：措詞大致準確，行文達意；語氣頗多不當。\n- 1–2分：措詞、行文未能達意；語氣極多不當。\n- 0分：空白卷或答案完全錯誤。',
    proposal:   '以「說服效果」為主：語氣客觀正式，建議具體可行，具說服力。\n【重要】評分只考慮語氣是否切合文體及場合、說服效果如何，不考慮簡體字、錯別字或語病。\n評分標準：\n- 9–10分：措詞準確，行文簡潔流暢；態度客觀，建議具體，說服效果佳。\n- 7–8分：措詞準確，行文達意流暢；態度客觀，頗具說服效果。\n- 5–6分：措詞大致準確，行文大致達意；說服效果一般。\n- 3–4分：措詞大致準確，行文達意；語氣頗多不當。\n- 1–2分：措詞、行文未能達意；語氣極多不當。\n- 0分：空白卷或答案完全錯誤。',
    report:     '以「客觀匯報效果」為主：語氣正式客觀，資料呈現清晰有條理，避免主觀情感語句。\n【重要】評分只考慮語氣是否切合文體及場合、匯報效果如何，不考慮簡體字、錯別字或語病。\n評分標準：\n- 9–10分：措詞準確，行文簡潔流暢；語氣客觀正式，資料呈現清晰，匯報效果佳。\n- 7–8分：措詞準確，行文達意流暢；語氣客觀，匯報效果頗佳。\n- 5–6分：措詞大致準確，行文大致達意；語氣尚算客觀，匯報效果一般。\n- 3–4分：措詞大致準確，行文達意；語氣頗多不當。\n- 1–2分：措詞、行文未能達意；語氣極多不當。\n- 0分：空白卷或答案完全錯誤。',
    commentary: '以「論證效果」為主：語氣客觀持平，立場清晰，論證有力。\n【重要】評分只考慮語氣是否切合文體及場合、論證效果如何，不考慮簡體字、錯別字或語病。\n評分標準：\n- 9–10分：措詞準確，行文簡潔流暢；立場清晰，論證有力，論證效果佳。\n- 7–8分：措詞準確，行文達意流暢；立場大致清晰，論證效果頗佳。\n- 5–6分：措詞大致準確，行文大致達意；論證效果一般。\n- 3–4分：措詞大致準確，行文達意；語氣頗多不當。\n- 1–2分：措詞、行文未能達意；語氣極多不當。\n- 0分：空白卷或答案完全錯誤。',
    article:    '以「說明效果」為主：語氣客觀，有說服力，能有效呼籲讀者。\n【重要】評分只考慮語氣是否切合文體及場合、說明效果如何，不考慮簡體字、錯別字或語病。\n評分標準：\n- 9–10分：措詞準確，行文簡潔流暢；語氣客觀，說明清晰，頗能呼籲讀者。\n- 7–8分：措詞準確，行文達意流暢；語氣尚算客觀，說明效果頗佳。\n- 5–6分：措詞大致準確，行文大致達意；說明效果一般。\n- 3–4分：措詞大致準確，行文達意；語氣頗多不當。\n- 1–2分：措詞、行文未能達意；語氣極多不當。\n- 0分：空白卷或答案完全錯誤。',
  };
  const toneSection = toneGuide[genre] || '語氣須切合文體、對象及場合，以措詞行文為主。【重要】不考慮簡體字、錯別字或語病。\n評分標準：\n- 9–10分：措詞準確，行文簡潔流暢；語氣切合文體，效果佳。\n- 7–8分：措詞準確，行文達意流暢；語氣大致切合文體。\n- 5–6分：措詞大致準確，行文大致達意；語氣尚算切合。\n- 1–2分：措詞、行文未能達意；語氣頗多不當。\n- 0分：空白卷或答案完全錯誤。';

  // 資訊分考核項目
  const infoCount = infoPoints.length || 3;
  const infoList = infoPoints.length > 0
    ? infoPoints.map((p, i) => `  ${i + 1}. ${p}`).join('\n')
    : '  1. 計劃名稱／活動名稱\n  2. 計劃目的／背景\n  3. 寫作身份／動機';
  const infoScoreDesc = `以下 ${infoCount} 項資料齊全得 2 分；只有 ${infoCount - 1} 項得 1 分；${infoCount - 2} 項或以下得 0 分。`;

  // 內容發展細項
  const devDefaults = {
    speech:     { label: '2項措施、4個措施細項、3項同學意見', fullCount: '2項措施＋4個措施細項＋3項同學意見', partCount: '部分細項' },
    letter:     { label: '2項個人條件、4個條件細項、3項同學意見', fullCount: '2項個人條件＋4個條件細項＋3項同學意見', partCount: '部分細項' },
    proposal:   { label: '2個建議、4個建議細項、3項同學意見', fullCount: '2個建議＋4個建議細項＋3項同學意見', partCount: '部分細項' },
    report:     { label: '2個調查類別、4個調查意見、2個改善建議', fullCount: '2個調查類別＋4個調查意見＋2個改善建議', partCount: '部分類別或意見' },
    commentary: { label: '2個目標、4項活動、4項同學意見', fullCount: '2個目標＋4項活動＋4項同學意見', partCount: '部分細項' },
    article:    { label: '2個目標、4項活動細項、4項意見', fullCount: '2個目標＋4項活動細項＋4項意見', partCount: '部分細項' },
  };
  const devDefault = devDefaults[genre] || { label: '相關細項', fullCount: '全部細項', partCount: '部分細項' };
  const devLabel = (devItems && devItems.label) ? devItems.label : devDefault.label;
  const devFull = (devItems && devItems.fullCount) ? devItems.fullCount : devDefault.fullCount;
  const devPart = (devItems && devItems.partCount) ? devItems.partCount : devDefault.partCount;

  // 格式要求
  const formatDefaults = {
    speech:     [
      '稱謂：開首頂格，按先尊後卑排列，末尾須有冒號（例如：校長、各位老師、各位同學：）',
      '自我介紹：引入正文前交代身份',
      '文末致謝：文章最末尾（例如：多謝各位。）',
    ],
    letter:     [
      '上款／稱謂：開首頂格書寫（例如：王老師／各位同學：）',
      '祝頌語：正文後先空兩格寫「祝」，下一行頂格寫祝福語（例如：祝↵教安）',
      '署名：分兩行靠右，身份行往左空兩格、姓名行頂格（階梯式），姓名後加啟告語（例如：學生會主席↵　　林美珊謹啟）',
      '日期：署名下一行靠左頂格，寫完整年月日',
    ],
    proposal:   [
      '上款：頂格書寫收信人（例如：圖書館主任張老師：）——上款只出現一次，正文前不應再重複稱謂',
      '標題：置中書寫，必須包含「建議」二字（例如：優化「電子閱讀推廣計劃」建議）',
      '署名：分兩行靠右，身份行往左空兩格、姓名行頂格（階梯式），姓名後加謹啟（例如：文學社社長↵　　周子晴謹啟）',
      '日期：署名下一行靠左頂格，寫完整年月日',
    ],
    report:     [
      '上款：頂格書寫呈交對象（例如：陳校長：）——上款只出現一次，正文前不應再重複稱謂',
      '標題：置中書寫，必須包含「報告」二字（例如：「校園問卷調查」工作報告）',
      '署名：分兩行靠右，身份行往左空兩格、姓名行頂格（階梯式），姓名後加謹啟（例如：學生會會長↵　　王子樂謹啟）',
      '日期：署名下一行靠左頂格，寫完整年月日',
    ],
    commentary: [
      '標題：文章頂部置中書寫，交代文章主題',
      '署名：文末分兩行靠右，身份行往左空兩格、姓名行頂格（階梯式），不寫「啟」（例如：學生會主席↵　　林美珊）',
    ],
    article:    [
      '標題：文章頂部置中書寫，帶出主題核心價值',
      '署名：文末分兩行靠右，身份行往左空兩格、姓名行頂格（階梯式），不寫「啟」（例如：戲劇學會主席↵　　蘇樂行）',
    ],
  };
  const formatItems = (formatRequirements && formatRequirements.length > 0)
    ? formatRequirements
    : (formatDefaults[genre] || ['相關格式元素']);
  const formatList = formatItems.map(f => `  • ${f}`).join('\n');

  return `你是一位專業的香港中學中文科教師，正在批改HKDSE中文卷二甲部（${genreName}）實用寫作。
所有評語必須使用繁體中文。

【核心批改原則（必須優先遵守）】
評分必須以學生的實際作文內容為唯一依據：
- 若學生的作文偏離題目（如寫了不同主題、不同文體、不同身份），資訊分和內容發展分均給 0 分
- 若題目資料（資料一/資料二）另行提供，僅用於生成增潤和示範文章，不可因資料存在而誤判學生得分
- 增潤文章和示範文章必須嚴格按照題目要求撰寫，與學生原文的主題、文體保持一致

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
評分準則（必須嚴格遵守）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
總分：50分
內容（30分）= （資訊分 + 內容發展分）× 3
行文語氣（10分）
組織（10分）

━━━━━━━━━━━━
一、資訊分（最高 2 分）
━━━━━━━━━━━━
【離題扣分規則（優先判斷）】
若學生提及的計劃名稱、活動內容、身份與題目要求完全不符（即離題），資訊分直接給 0 分，無論學生文中是否有提及任何資訊。

評分邏輯：${infoScoreDesc}
必須涵蓋的背景資訊項目（以題目所指定的計劃為準）：
${infoList}

評分說明：
- 2分：以上全部項目均提及，且準確符合題目要求的計劃
- 1分：只提及其中 ${infoCount - 1} 項
- 0分：只提及 ${infoCount - 2} 項或以下，或完全沒有，或所提及的內容與題目要求的計劃不符

━━━━━━━━━━━━
二、內容發展分（最高 8 分）
━━━━━━━━━━━━
【離題扣分規則（優先判斷）】
若學生的作文內容與題目要求的計劃／活動完全不符（即離題），內容發展分直接給 0 分。

本題具體細項要求：${devLabel}

評分標準：
┌────────┬────────────────────────────────────────────────────────────────────┐
│ 分數   │ 評分準則                                                           │
├────────┼────────────────────────────────────────────────────────────────────┤
│ 7–8分  │ 內容發展細項齊全（${devFull}）；合理、扣題、具體拓展；            │
│        │ 解說清晰，論點有力                                                 │
├────────┼────────────────────────────────────────────────────────────────────┤
│ 5–6分  │ 內容發展細項齊全（${devFull}）；合理、具體拓展；解說尚算清晰      │
├────────┼────────────────────────────────────────────────────────────────────┤
│ 3–4分  │ 內容發展細項齊全（${devFull}）；有拓展但不夠具體，或拓展欠扣題    │
├────────┼────────────────────────────────────────────────────────────────────┤
│ 2分    │ 內容發展細項齊全（${devFull}）；拓展欠奉，或觀點不合理            │
├────────┼────────────────────────────────────────────────────────────────────┤
│ 1分    │ 內容發展細項不齊全；拓展欠奉，或觀點不合理                        │
├────────┼────────────────────────────────────────────────────────────────────┤
│ 0分    │ 欠缺：甚少回應或缺回應；觀點闕如或極不合理                        │
└────────┴────────────────────────────────────────────────────────────────────┘

評分時必須：
1. 先判斷學生涵蓋了哪些細項（齊全／不齊全）
2. 細項齊全者才可得2分或以上；不齊全者最高1分
3. 細項齊全後，再根據拓展質量決定2-8分範圍內的具體分數
4. 直接照抄資料原文而無任何拓展者，齊全最高只能給2分

━━━━━━━━━━━━
三、行文語氣（最高 10 分）
━━━━━━━━━━━━
文體：${genreName}
${toneSection}

━━━━━━━━━━━━
四、組織（最高 10 分）
━━━━━━━━━━━━
評分重點：結構完整性、詳略得宜、要點扣連

格式核對（欠缺以下必備格式元素須扣分）：
${formatList}
扣分規則：欠缺 1–2 項扣 1 分；欠缺 3 項或以上扣 2 分；添加多餘格式（如不應有的祝頌語、日期等）扣 2 分
【重要】在 JSON 輸出中：
- organizationBase = 格式扣分前的原始組織分（按組織評分標準給分）
- formatDeduction = 格式扣分數（0、1 或 2）
- organization = organizationBase - formatDeduction（最終組織分）

組織評分標準：
- 9–10分：結構完整；詳略得宜，鋪排有序；內容要點之間緊密扣連。（如有格式問題按上述規則扣分）
- 7–8分：結構完整；詳略得宜，鋪排有序。
- 5–6分：結構大致完整；詳略大致合宜，鋪排大致有序。
- 3–4分（尚完整）：結構完整；詳略得宜，鋪排有序。／結構大致完整；詳略大致合宜，鋪排大致有序。
- 1–2分：散亂／甚混亂：組織散亂；詳略失衡，鋪排失當。
- 0分：空白卷或毫無組織可言。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
五、增潤文章要求
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
增潤是在學生原文基礎上修改，而非重新撰寫。必須：
1. 保留學生原有結構和立意，只修正以下問題：
   - 格式錯誤（如祝頌語位置、署名格式）
   - 資訊分不足（補充遺漏的必備背景資訊）
   - 內容發展不足（補充未引用的資料細項，加強拓展闡述）
2. 拓展闡述的句子用【拓展】和【/拓展】標記包住。拓展包含以下三個層次，均應標示：
   層次一：引用資料細項並加以具體說明或延伸（超出資料原文的部分）
   層次二：結合資料措施，針對資料二的疑慮提出具體解決方案
   層次三：引申計劃的深層意義、對人的長遠影響或效果

   【唯一不標示的情況】直接照抄資料原文，完全沒有任何發展或延伸

   正確例子（應標示）：資料一提到「每個樓層增設飲水機」。
   →【拓展】學生會將確保飲水機提供足夠的過濾飲用水，讓同學隨時補充水分。養成自備水樽的習慣不僅有益健康，更從源頭減少塑膠廢物，將環保理念融入日常生活。【/拓展】

   錯誤例子（不應標示）：每個樓層設有飲水機，學校亦不提供即棄塑膠餐具。
   （這是直接照抄資料原文，沒有任何發展）

   拓展內容必須根植於題目情境，符合計劃目的、文體及寫作身份，不可完全脫離資料憑空發揮。
3. 不加任何 HTML 或 Markdown 格式，純文字加【拓展】標記
4. 增潤後字數控制在 550–599 字之間
5. 若文體需要日期（書信、建議書、報告），日期必須寫完整年月日，格式如「2026年1月15日」或「二零二六年一月十五日」，不可只寫月日

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
六、示範文章要求
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
嚴格按以下段落結構撰寫全新示範文章，全文不得少於550字（標點符號計算在內），寧可略超600字也不可少於550字：
- 開首：約100字（交代身份、背景、計劃名稱及寫作目的，引入正文）
- 正文一：約230字，結構：
  ① 引用資料一「活動一」的名稱及具體細項
  ② 針對資料二「留言一」（疑慮）用活動一細項加以回應
  ③ 深層拓展：說明活動對人的具體意義或效果（超出資料字面內容），必須充分展開，至少3–4句
  ④ 如資料二有支持意見（留言三），可在此自然引入，強化論點
- 正文二：約230字，結構：
  ① 引用資料一「活動二」的名稱及具體細項
  ② 針對資料二「留言二」（疑慮）用活動二細項加以回應
  ③ 深層拓展：說明活動對人的具體意義或效果，必須充分展開，至少3–4句
- 結尾：約80字（總結計劃意義，呼籲積極參與）
【重要】資料二的支持意見（留言三）應在正文中自然融入，而非只在結尾提及
例如：「正如不少同學所認同，這項計劃……」可引出支持觀點，再作深層拓展

重要原則：
- 資料一和資料二必須交織在同一段落，而非分段處理
- 正文中不點名具體人物，以泛指代替（如「有同學擔心……」）
- 必須包含${genreName}所有必備格式元素
- 若文體需要日期（書信、建議書、報告），日期必須寫完整年月日，格式如「2026年1月15日」，不可只寫月日
- 拓展闡述句子用【拓展】和【/拓展】標記包住
  拓展包含以下三個層次，均應標示：
  ① 引用資料細項並加以具體說明或延伸（超出資料原文的部分）
  ② 結合資料措施，針對資料二的疑慮提出具體解決方案
  ③ 引申計劃的深層意義、對人的長遠影響或效果
  唯一不標示的情況：直接照抄資料原文，完全沒有任何發展或延伸
  每段正文應有清晰的拓展標示，拓展內容須根植於題目情境，不可完全脫離資料
- 段落之間必須有空行（用換行符分隔），確保正文、開首、結尾各自獨立成段
- 純文字加【拓展】標記，不加任何 HTML 或 Markdown 格式

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
輸出格式（必須是有效的JSON）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【第一步：判斷是否離題】
在填寫任何評分數字之前，先判斷學生作文是否離題：
- 離題定義：學生寫的身份、計劃名稱、主題與題目要求完全不符
- 若離題：isOffTopic = true，info 和 development 必須填 0，不得填其他數字
- 若不離題：isOffTopic = false，按評分準則給分

{
  "isOffTopic": false,
  "grading": {
    "info": 0,
    "development": 0,
    "tone": 7,
    "organization": 7,
    "organizationBase": 8,
    "formatDeduction": 1
  },
  // organization = organizationBase - formatDeduction（格式扣分後最終分）
  // formatDeduction：欠1-2項格式 → 1分；欠3項或以上或添加多餘格式 → 2分；無格式問題 → 0分
  "overallComment": "整體評語（繁體中文，3–5句）",
  "infoFeedback": {
    "strengths": ["優點（繁體中文）"],
    "improvements": ["改善建議（繁體中文）"]
  },
  "developmentFeedback": {
    "strengths": ["優點（繁體中文）"],
    "improvements": ["改善建議（繁體中文）"]
  },
  "toneFeedback": {
    "strengths": ["優點（繁體中文）"],
    "improvements": ["改善建議（繁體中文）"]
  },
  "organizationFeedback": {
    "strengths": ["優點（繁體中文）"],
    "improvements": ["改善建議（繁體中文）"]
  },
  "formatIssues": ["具體格式問題（繁體中文）"],
  "enhancedText": "增潤後的文章（繁體中文，保留學生原有結構，拓展部分用【拓展】【/拓展】標記）",
  "enhancementNotes": ["修改說明（繁體中文）"],
  "modelEssay": "示範文章（繁體中文，按四段結構，拓展部分用【拓展】【/拓展】標記）"
}`;
}

function buildUserPrompt(essayText, question, customCriteria, gradingMode = 'secondary', genre = '', materials = '') {
  const genreNames = {
    speech: '演講辭', letter: '書信／公開信', proposal: '建議書',
    report: '報告', commentary: '評論文章', article: '專題文章'
  };
  const genreNote = (gradingMode === 'practical' && genre)
    ? `
## 文體
${genreNames[genre] || genre}
` : '';

  const materialsNote = (gradingMode === 'practical' && materials)
    ? `
## 題目資料（資料一及資料二）
${materials}

【重要批改原則】
- 評分時必須以學生的實際作文內容為唯一依據，對照上方題目要求判斷學生有否準確引用資料細項並加以拓展
- 若學生的作文內容與題目要求完全不符（如寫了不同主題、不同文體），資訊分和內容發展分均應給0分
- 以上資料一及資料二僅供生成「增潤文章」和「示範文章」時參考，不可因資料的存在而影響對學生作文的評分
` : '';

  return `請批改以下學生實用文（若為命題寫作則批改作文）：
${genreNote}
## 題目
${question || '（未提供題目）'}
${materialsNote}
## 學生作文
${essayText}

${customCriteria ? `## 上傳的評分準則（請結合系統評分準則一同使用）
${customCriteria}
` : ''}
請嚴格按照評分準則進行批改，給出具體、有建設性的繁體中文評語，並以JSON格式返回結果。`;
}

function parseGradingResult(content, essayText, gradingMode = 'secondary') {
  const result = safeJSONParse(content, 'grade');

  if (gradingMode === 'primary') {
    const grading = {
      content: Math.max(1, Math.min(4, Math.round(result.grading?.content || 3))),
      feeling: Math.max(1, Math.min(4, Math.round(result.grading?.feeling || 3))),
      structure: Math.max(1, Math.min(4, Math.round(result.grading?.structure || 3))),
      language: Math.max(1, Math.min(4, Math.round(result.grading?.language || 3))),
      format: Math.max(1, Math.min(4, Math.round(result.grading?.format || 3))),
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

    const buildFeedback = (fb) => ({
      strengths: Array.isArray(fb?.strengths) ? fb.strengths : [],
      improvements: Array.isArray(fb?.improvements) ? fb.improvements : []
    });

    return {
      grading,
      totalScore,
      gradeLevel: getPrimaryGradeLabel(totalScore),
      overallComment: result.overallComment || '',
      contentFeedback: buildFeedback(result.contentFeedback),
      feelingFeedback: buildFeedback(result.feelingFeedback),
      structureFeedback: buildFeedback(result.structureFeedback),
      languageFeedback: buildFeedback(result.languageFeedback),
      formatFeedback: buildFeedback(result.formatFeedback),
      enhancedText: result.enhancedText || essayText,
      enhancementNotes: Array.isArray(result.enhancementNotes) ? result.enhancementNotes : [],
      modelEssay: result.modelEssay || ''
    };
  } else if (gradingMode === 'practical') {
    // 離題檢測：優先用 AI 明確聲明的 isOffTopic 欄位，輔以 regex 掃描總評
    const overallComment = result.overallComment || '';
    const isOffTopic = result.isOffTopic === true ||
      /離題|偏離|完全不符|均為零|資訊.*零|內容.*零|0分.*資訊|資訊.*0分|內容發展.*為零|資訊分.*為零|均給.*0/.test(overallComment);

    const rawInfo = result.grading?.info;
    const rawDev  = result.grading?.development;

    const grading = {
      info:         Math.max(0, Math.min(2,  Math.round(isOffTopic ? 0 : (rawInfo  != null ? rawInfo  : 1)))),
      development:  Math.max(0, Math.min(8,  Math.round(isOffTopic ? 0 : (rawDev   != null ? rawDev   : 5)))),
      tone:         Math.max(0, Math.min(10, Math.round(result.grading?.tone         ?? 6))),
      organization: Math.max(0, Math.min(10, Math.round(result.grading?.organization ?? 6))),
    };

    const contentScore = (grading.info + grading.development);
    const organizationScore = grading.tone + grading.organization;
    const totalScore = contentScore + organizationScore;

    const buildFeedback = (fb) => ({
      strengths: Array.isArray(fb?.strengths) ? fb.strengths : [],
      improvements: Array.isArray(fb?.improvements) ? fb.improvements : []
    });

    return {
      grading,
      contentScore,
      organizationScore,
      totalScore,
      overallComment: result.overallComment || '',
      infoFeedback: buildFeedback(result.infoFeedback),
      developmentFeedback: buildFeedback(result.developmentFeedback),
      toneFeedback: buildFeedback(result.toneFeedback),
      organizationFeedback: buildFeedback(result.organizationFeedback),
      formatIssues: Array.isArray(result.formatIssues) ? result.formatIssues : [],
      enhancedText: result.enhancedText || essayText,
      enhancementNotes: Array.isArray(result.enhancementNotes) ? result.enhancementNotes : [],
      modelEssay: result.modelEssay || ''
    };
  } else {
    // secondary
    const grading = {
      content: Math.max(1, Math.min(10, Math.round(result.grading?.content || 6))),
      expression: Math.max(1, Math.min(10, Math.round(result.grading?.expression || 6))),
      structure: Math.max(1, Math.min(10, Math.round(result.grading?.structure || 6))),
      punctuation: Math.max(5, Math.min(10, Math.round(result.grading?.punctuation || 7)))
    };

    const totalScore = (grading.content * 4) + (grading.expression * 3) + 
                      (grading.structure * 2) + grading.punctuation;

    const buildFeedback = (fb) => ({
      strengths: Array.isArray(fb?.strengths) ? fb.strengths : [],
      improvements: Array.isArray(fb?.improvements) ? fb.improvements : []
    });

    const getGradeLabel = (score) => {
      if (score >= 90) return '上上';
      if (score >= 85) return '上中';
      if (score >= 80) return '上下';
      if (score >= 70) return '中上';
      if (score >= 60) return '中中';
      if (score >= 50) return '中下';
      if (score >= 40) return '下上';
      if (score >= 30) return '下中';
      if (score >= 10) return '下下';
      return '極差';
    };

    return {
      grading,
      totalScore,
      gradeLabel: getGradeLabel(totalScore),
      overallComment: result.overallComment || '',
      contentFeedback: buildFeedback(result.contentFeedback),
      expressionFeedback: buildFeedback(result.expressionFeedback),
      structureFeedback: buildFeedback(result.structureFeedback),
      punctuationFeedback: buildFeedback(result.punctuationFeedback),
      enhancedText: result.enhancedText || essayText,
      enhancementNotes: Array.isArray(result.enhancementNotes) ? result.enhancementNotes : [],
      modelEssay: result.modelEssay || ''
    };
  }
}

function getPrimaryGradeLabel(totalScore) {
  if (totalScore >= 85) return '優異';
  if (totalScore >= 70) return '良好';
  if (totalScore >= 50) return '一般';
  return '有待改善';
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`中文科批改系統 API 服務器`);
  console.log(`運行於端口: ${PORT}`);
  console.log(`========================================`);
});
