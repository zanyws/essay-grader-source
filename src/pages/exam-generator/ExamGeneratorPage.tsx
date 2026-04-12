import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Download, FileText, RefreshCw, AlertCircle, BookOpen, Upload, X, Type, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStore } from '@/hooks/useStore';
import { generatePracticalExamWithAPI, extractQuestionCriteriaWithAPI, isAPIAvailable } from '@/lib/api';
import { generateId, readFileAsDataURL, readFileAsText } from '@/lib/utils';
import type { FileInfo } from '@/types';
import { EditableText, EditableList } from '@/components/EditableText';

interface ExtendedFileInfo extends FileInfo { file?: File; }

export function ExamGeneratorPage() {
  const {
    apiKey, apiType, apiModel, apiBaseURL,
    generatedExam, setGeneratedExam, updateGeneratedExam,
    customQuestion: storedQuestion,
    practicalMaterials: storedMaterials,
  } = useStore();
  const [genre, setGenre] = useState('speech');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedContent, setExtractedContent] = useState<{question: string; materials: string; criteria: string; genre: string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<ExtendedFileInfo | null>(null);
  // 若有從實用寫作批改頁帶來的題目資料，預設切換到貼上模式
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>(storedQuestion ? 'paste' : 'upload');
  // 預填從實用寫作批改頁帶來的題目（含資料內容）
  const [pastedQuestion, setPastedQuestion] = useState(storedQuestion || '');
  const [pastedMaterials, setPastedMaterials] = useState(storedMaterials || '');
  const [pastedCriteria, setPastedCriteria] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.doc', '.docx'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!hasValidExtension) { setError(`不支持的文件類型: ${file.name}`); return; }
    setUploadedFile({ id: generateId(), name: file.name, size: file.size, type: file.type || 'application/octet-stream', file });
    setError(null);
    setSuccess(`已上傳文件: ${file.name}`);
    setTimeout(() => setSuccess(null), 3000);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 第一步：提取上傳檔案的內容，供用戶確認
  const handleExtract = async () => {
    if (!isAPIAvailable(apiKey)) { setError('請先在右上角設定有效的 API 密鑰'); return; }
    if (!uploadedFile?.file) { setError('請先上傳文件'); return; }
    setIsExtracting(true); setError(null);
    try {
      let fileContent: string;
      let fileType: string;
      if (uploadedFile.type.startsWith('image/') || uploadedFile.type.includes('pdf')) {
        fileContent = await readFileAsDataURL(uploadedFile.file);
        fileType = uploadedFile.type;
      } else if (uploadedFile.name.toLowerCase().endsWith('.docx') || uploadedFile.name.toLowerCase().endsWith('.doc')) {
        fileContent = await readFileAsDataURL(uploadedFile.file);
        fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else {
        fileContent = await readFileAsText(uploadedFile.file);
        fileType = 'text/plain';
      }
      const result = await extractQuestionCriteriaWithAPI(fileContent, fileType, { apiKey, apiType: apiType as any, model: apiModel, baseURL: apiBaseURL });
      setExtractedContent({
        question: result.question || '',
        materials: result.materials || '',
        criteria: result.criteria || '',
        genre: result.genre || genre,
      });
      if (result.genre) setGenre(result.genre);
    } catch (e: any) {
      setError(e.message || '提取失敗，請重試');
    } finally {
      setIsExtracting(false);
    }
  };

  // 確認提取內容後生成
  const handleConfirmAndGenerate = () => {
    if (!extractedContent) return;
    setPastedQuestion(extractedContent.question);
    setPastedMaterials(extractedContent.materials);
    setPastedCriteria(extractedContent.criteria);
    setExtractedContent(null);
    setInputMode('paste');
    // 稍等讓 state 更新後再生成
    setTimeout(() => handleGenerateWithContent(extractedContent.question, extractedContent.materials, extractedContent.criteria), 100);
  };

  const handleGenerate = async () => {
    await handleGenerateWithContent(pastedQuestion, pastedMaterials, pastedCriteria);
  };

  const handleGenerateWithContent = async (question: string, materials: string, criteria: string) => {
    if (!isAPIAvailable(apiKey)) { setError('請先在右上角設定有效的 API 密鑰'); return; }
    if (!genre) { setError('請選擇文體'); return; }
    if (inputMode === 'upload' && !uploadedFile) { setError('請上傳一份模擬卷文件'); return; }
    if (inputMode === 'paste' && !question.trim()) { setError('請貼上題目內容'); return; }
    setIsGenerating(true); setError(null);
    try {
      let fileContent: string;
      let fileType: string;
      if (inputMode === 'upload') {
        if (!uploadedFile?.file) throw new Error('文件無效');
        if (uploadedFile.type.startsWith('image/') || uploadedFile.type.includes('pdf')) {
          fileContent = await readFileAsDataURL(uploadedFile.file);
          fileType = uploadedFile.type;
        } else if (uploadedFile.name.toLowerCase().endsWith('.txt')) {
          fileContent = await readFileAsText(uploadedFile.file);
          fileType = 'text/plain';
        } else if (uploadedFile.name.toLowerCase().endsWith('.docx') || uploadedFile.name.toLowerCase().endsWith('.doc')) {
          fileContent = await readFileAsDataURL(uploadedFile.file);
          fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else {
          fileContent = await readFileAsText(uploadedFile.file);
          fileType = uploadedFile.type || 'text/plain';
        }
      } else {
        fileContent = [
          question ? `【參考卷：題目】\n${question}` : '',
          materials ? `【參考卷：資料內容（請分析資料一和資料二的結構）】\n${materials}` : '',
          criteria ? `【參考卷：評分準則（供參考）】\n${criteria}` : '',
        ].filter(Boolean).join('\n\n---\n\n') || '（無內容）';
        fileType = 'text/plain';
      }
      const result = await generatePracticalExamWithAPI(fileContent, fileType, genre, { apiKey, apiType: apiType as any, model: apiModel, baseURL: apiBaseURL });
      setGeneratedExam(result);
      setSuccess('模擬卷生成成功！');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || '生成失敗，請重試');
    } finally {
      setIsGenerating(false);
    }
  };

  const getInfoPoints = () => generatedExam?.markingScheme?.content?.infoPoints ?? [];
  const getFactualPoints = () => generatedExam?.markingScheme?.content?.factualPoints ?? [];
  const getDevelopmentPoints = () => generatedExam?.markingScheme?.content?.developmentPoints ?? [];
  const getFormatRequirements = () => generatedExam?.markingScheme?.organization?.formatRequirements ?? [];

  const getToneDescription = (genreValue: string): string[] => {
    const toneMap: Record<string, string[]> = {
      speech: ['措詞準確，行文簡潔，達意流暢；態度冷靜得體，說明效果佳，頗能吸引聽眾關注計劃。（9–10分）', '措詞準確，行文達意流暢；態度冷靜，頗能說明計劃。（7–8分）', '措詞大致準確，行文大致達意；說明效果一般。（5–6分）', '措詞、行文未能達意；語氣頗多不當。（1–2分）'],
      letter: ['措詞準確，行文簡潔，達意流暢；態度誠懇積極，自薦效果佳。（9–10分）', '措詞準確，行文達意流暢；態度誠懇，頗具自薦效果。（7–8分）', '措詞大致準確，行文大致達意；自薦效果一般。（5–6分）', '措詞、行文未能達意；語氣頗多不當。（1–2分）'],
      proposal: ['措詞準確，行文簡潔，達意流暢；態度客觀正式，說服效果佳。（9–10分）', '措詞準確，行文達意流暢；態度客觀，頗具說服效果。（7–8分）', '措詞大致準確，行文大致達意；說服效果一般。（5–6分）', '措詞、行文未能達意；語氣頗多不當。（1–2分）'],
      report: ['措詞準確，行文簡潔，達意流暢；語氣客觀正式，資料呈現清晰有條理，匯報效果佳。（9–10分）', '措詞準確，行文達意流暢；語氣客觀，匯報效果頗佳。（7–8分）', '措詞大致準確，行文大致達意；匯報效果一般。（5–6分）', '措詞、行文未能達意；語氣頗多不當。（1–2分）'],
      commentary: ['措詞準確，行文簡潔，達意流暢；立場清晰，論證有力，具說服力。（9–10分）', '措詞準確，行文達意流暢；立場大致清晰，論證效果頗佳。（7–8分）', '措詞大致準確，行文大致達意；論證效果一般。（5–6分）', '措詞、行文未能達意；語氣頗多不當。（1–2分）'],
      article: ['措詞準確，行文簡潔，達意流暢；語氣客觀，說明清晰，頗能呼籲讀者。（9–10分）', '措詞準確，行文達意流暢；說明效果頗佳。（7–8分）', '措詞大致準確，行文大致達意；說明效果一般。（5–6分）', '措詞、行文未能達意；語氣頗多不當。（1–2分）'],
    };
    return toneMap[genreValue] ?? ['措詞準確，行文簡潔流暢；語氣切合文體，效果佳。（9–10分）', '措詞準確，行文達意；語氣大致切合文體。（7–8分）', '措詞大致準確，行文大致達意；語氣尚算切合。（5–6分）', '措詞、行文未能達意；語氣頗多不當。（1–2分）'];
  };

  // 將資料內容轉為 HTML，支援 Markdown 表格，並對純文字列點做容錯轉換
  const convertMaterialToHtml = (text: string): string => {
    // 先嘗試標準 Markdown 表格解析
    const lines = text.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];
    const isSepRow = (l: string) => /^\s*\|?[\s:\-]+(\|[\s:\-]+)+\|?\s*$/.test(l);
    const isTableRow = (l: string) => l.includes('|') && l.trim().length > 2;
    const flushTable = () => {
      if (tableRows.length === 0) { inTable = false; return; }
      const dataRows = tableRows.filter(r => !isSepRow(r));
      if (dataRows.length === 0) { tableRows = []; inTable = false; return; }
      result.push('<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px">');
      dataRows.forEach((row, idx) => {
        const rawCells = row.split('|');
        const cells = rawCells.slice(rawCells[0].trim() === '' ? 1 : 0)
          .slice(0, rawCells[rawCells.length - 1].trim() === '' ? -1 : undefined)
          .map(c => c.trim());
        if (cells.length === 0) return;
        const tag = idx === 0 ? 'th' : 'td';
        const style = idx === 0
          ? 'style="background:#e8e0d4;font-weight:bold;padding:5px 10px;border:1px solid #c8b89a;text-align:left"'
          : 'style="padding:5px 10px;border:1px solid #c8b89a;vertical-align:top"';
        result.push(`<tr>${cells.map(c => `<${tag} ${style}>${c}</${tag}>`).join('')}</tr>`);
      });
      result.push('</table>');
      tableRows = []; inTable = false;
    };

    // 收集非表格行，用於後續容錯判斷
    const nonTableLines: string[] = [];

    for (const line of lines) {
      if (isTableRow(line)) {
        if (!inTable) inTable = true;
        tableRows.push(line);
        nonTableLines.push(''); // 佔位
      } else {
        if (inTable) flushTable();
        nonTableLines.push(line);
        const t = line.trim();
        if (t) result.push(`<p style="margin:4px 0;font-size:13px">${t}</p>`);
        else result.push('<div style="margin:6px 0"></div>');
      }
    }
    if (inTable) flushTable();

    // 若結果中沒有表格（AI 沒輸出 Markdown 表格），嘗試容錯：
    // 偵測「名稱：內容」或「• 名稱：內容」格式，自動轉換成表格
    const hasTable = result.some(r => r.startsWith('<table'));
    if (!hasTable) {
      // 找出「X：Y」格式的行（排除背景說明句子，即以「。」結尾的長句）
      const kvLines = lines.filter(l => {
        const t = l.trim().replace(/^[•\-\*\d\.]\s*/, '');
        return /^[^。！？\n]{1,20}[：:].{5,}/.test(t) && !t.endsWith('。') && t.length < 60;
      });

      if (kvLines.length >= 2) {
        // 有足夠的 key-value 行，轉換為表格
        const tableHtml = [
          '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px">',
          '<tr><th style="background:#e8e0d4;font-weight:bold;padding:5px 10px;border:1px solid #c8b89a;text-align:left">活動名稱</th><th style="background:#e8e0d4;font-weight:bold;padding:5px 10px;border:1px solid #c8b89a;text-align:left">內容</th></tr>',
          ...kvLines.map(l => {
            const t = l.trim().replace(/^[•\-\*\d\.]\s*/, '');
            const colonIdx = t.search(/[：:]/);
            const key = t.substring(0, colonIdx).trim();
            const val = t.substring(colonIdx + 1).trim();
            return `<tr><td style="padding:5px 10px;border:1px solid #c8b89a;vertical-align:top;font-weight:500">${key}</td><td style="padding:5px 10px;border:1px solid #c8b89a;vertical-align:top">${val}</td></tr>`;
          }),
          '</table>',
        ].join('');

        // 重新渲染：非 kv 行保留為段落，kv 行替換為表格
        const kvSet = new Set(kvLines.map(l => l.trim()));
        const finalLines = lines.filter(l => !kvSet.has(l.trim().replace(/^[•\-\*\d\.]\s*/, '')) || l.trim() === '');
        const paras = finalLines.map(l => {
          const t = l.trim();
          if (!t) return '<div style="margin:6px 0"></div>';
          return `<p style="margin:4px 0;font-size:13px">${t}</p>`;
        }).join('');
        return paras + tableHtml;
      }
    }

    return result.join('');
  };

  const convertMarkdownTable = (text: string): string => {
    const lines = text.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];
    const isSeparatorRow = (line: string) => /^\s*\|?[\s:\-]+(\|[\s:\-]+)+\|?\s*$/.test(line);
    const isTableRow = (line: string) => line.includes('|') && line.trim().length > 2;
    const flushTable = () => {
      if (tableRows.length === 0) { inTable = false; return; }
      const dataRows = tableRows.filter(r => !isSeparatorRow(r));
      if (dataRows.length === 0) { tableRows = []; inTable = false; return; }
      result.push('<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:14px">');
      dataRows.forEach((row, idx) => {
        const rawCells = row.split('|');
        const cells = rawCells.slice(rawCells[0].trim() === '' ? 1 : 0).slice(0, rawCells[rawCells.length - 1].trim() === '' ? -1 : undefined).map(c => c.trim());
        if (cells.length === 0) return;
        const tag = idx === 0 ? 'th' : 'td';
        const style = idx === 0 ? 'style="background:#f0f0f0;font-weight:bold;padding:6px 10px;border:1px solid #ccc;text-align:left"' : 'style="padding:6px 10px;border:1px solid #ccc;vertical-align:top"';
        result.push(`<tr>${cells.map(c => `<${tag} ${style}>${c}</${tag}>`).join('')}</tr>`);
      });
      result.push('</table>');
      tableRows = []; inTable = false;
    };
    for (const line of lines) {
      if (isTableRow(line)) { if (!inTable) inTable = true; tableRows.push(line); }
      else { if (inTable) flushTable(); result.push(line); }
    }
    if (inTable) flushTable();

    // 容錯：若沒有偵測到表格，嘗試把「名稱：內容」格式轉成 HTML 表格
    const hasTable = result.some(r => r.includes('<table'));
    if (!hasTable) {
      const kvLines = lines.filter(l => {
        const t = l.trim().replace(/^[•\-\*\d\.]\s*/, '');
        return /^[^。！？\n]{1,20}[：:].{5,}/.test(t) && !t.endsWith('。') && t.length < 60;
      });
      if (kvLines.length >= 2) {
        const kvSet = new Set(kvLines.map(l => l.trim().replace(/^[•\-\*\d\.]\s*/, '')));
        const nonKvHtml = lines
          .filter(l => !kvSet.has(l.trim().replace(/^[•\-\*\d\.]\s*/, '')) || l.trim() === '')
          .map(l => l.trim() ? `<p style="margin:4px 0">${l.trim()}</p>` : '')
          .join('');
        const tableHtml = [
          '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:14px">',
          '<tr><th style="background:#f0f0f0;font-weight:bold;padding:6px 10px;border:1px solid #ccc;text-align:left">活動名稱</th><th style="background:#f0f0f0;font-weight:bold;padding:6px 10px;border:1px solid #ccc;text-align:left">內容</th></tr>',
          ...kvLines.map(l => {
            const t = l.trim().replace(/^[•\-\*\d\.]\s*/, '');
            const ci = t.search(/[：:]/);
            const key = t.substring(0, ci).trim();
            const val = t.substring(ci + 1).trim();
            return `<tr><td style="padding:6px 10px;border:1px solid #ccc;vertical-align:top;font-weight:500">${key}</td><td style="padding:6px 10px;border:1px solid #ccc;vertical-align:top">${val}</td></tr>`;
          }),
          '</table>',
        ].join('');
        return nonKvHtml + tableHtml;
      }
    }

    return result.join('\n');
  };

  const ROLE_KEYWORDS_EXAM = ['主席', '會長', '幹事', '大使', '委員', '代表', '老師', '同學', '學生', '負責人', '召集人', '社長', '組長', '部長', '隊長', '幹部'];
  const SIGN_KEYWORDS_EXAM = ['謹啟', '謹呈', '謹上', '敬啟', '敬呈', '拜啟', '頓首', '謹識'];

  /**
   * 六種文體格式規則：
   *
   * speech（演講辭）：
   *   - 首行：稱謂（頂格，含冒號）
   *   - 正文：空兩格
   *   - 無祝頌語、無署名、無日期
   *
   * letter（書信/公開信）：
   *   - 首行：上款（頂格，含冒號）
   *   - 正文：空兩格
   *   - 祝頌語：「祝」前空兩格，祝福語頂格
   *   - 署名：分兩行靠右（身份行縮兩格，姓名行頂格）
   *   - 日期：靠左
   *
   * proposal（建議書）：
   *   - 首行：上款（頂格，含冒號）
   *   - 次行：標題（置中粗體，含「建議」）
   *   - 正文：空兩格
   *   - 無祝頌語
   *   - 署名：分兩行靠右
   *   - 日期：靠左
   *
   * report（報告）：
   *   - 首行：上款（頂格，含冒號）
   *   - 次行：標題（置中粗體，含「報告」）
   *   - 正文：空兩格
   *   - 無祝頌語
   *   - 署名：分兩行靠右
   *   - 日期：靠左
   *
   * commentary（評論文章）：
   *   - 首行：上款（頂格，含冒號）—— 或標題（置中）
   *   - 正文：空兩格
   *   - 祝頌語：「祝」前空兩格，祝福語頂格
   *   - 署名：分兩行靠右
   *   - 日期：靠左
   *
   * article（專題文章）：
   *   - 首行：標題（置中粗體）
   *   - 正文：空兩格
   *   - 祝頌語：「祝」前空兩格，祝福語頂格
   *   - 署名：分兩行靠右
   *   - 日期：靠左
   */
  const parseEssayToHtml = (text: string, genreValue: string = genre): string => {
    const processExpand = (t: string) =>
      t.replace(/<strong[^>]*color[^>]*>/gi, '<strong style="color:#2563eb;font-weight:700">')
       .replace(/<\/strong>/gi, '</strong>')
       .replace(/【拓展[】）}]?/g, '<strong style="color:#2563eb;font-weight:700">')
       .replace(/【\/拓展[】）}]/g, '</strong>')
       .replace(/\[拓展\]/g, '<strong style="color:#2563eb;font-weight:700">')
       .replace(/\[\/拓展\]/g, '</strong>')
       .replace(/<\/strong>\s*<strong[^>]*>/g, '');

    // 各文體特性（按文件《實用寫作格式》）
    const cfg = {
      // 有上款/稱謂（頂格，含冒號）
      hasGreeting:  ['speech', 'letter', 'proposal', 'report'].includes(genreValue),
      // 有標題（置中粗體）
      hasTitle:     ['proposal', 'report', 'commentary', 'article'].includes(genreValue),
      // 有祝頌語（「祝」獨行 + 祝福語）
      hasBlessing:  ['letter'].includes(genreValue),
      // 有謹啟式署名（分兩行靠右）
      hasSignName:  ['letter', 'proposal', 'report'].includes(genreValue),
      // 有身份署名（文末，可靠右，評論/專題用）
      hasAuthor:    ['commentary', 'article'].includes(genreValue),
    };

    const lines = text.split('\n');
    const totalLines = lines.length;
    const lastFewStart = Math.max(0, totalLines - 10);
    const result: string[] = [];

    // ── 預掃描：署名行（含謹啟等）──
    const signNameIndexes = new Set<number>();
    if (cfg.hasSignName) {
      lines.forEach((line, idx) => {
        if (idx >= lastFewStart && SIGN_KEYWORDS_EXAM.some(k => line.trim().includes(k))) {
          signNameIndexes.add(idx);
        }
      });
    }

    // ── 預掃描：身份行（署名前的短行）──
    const signRoleIndexes = new Set<number>();
    if (cfg.hasSignName) {
      lines.forEach((line, idx) => {
        if (idx < lastFewStart || signNameIndexes.has(idx)) return;
        const t = line.trim();
        if (!t) return;
        const isShort = t.length > 0 && t.length < 25 && !/[。！？，、：]$/.test(t) && !t.includes('：');
        const hasRoleKw = ROLE_KEYWORDS_EXAM.some(k => t.includes(k));
        if (
          signNameIndexes.has(idx + 1) ||
          signNameIndexes.has(idx + 2) ||
          (hasRoleKw && isShort) ||
          (isShort && signNameIndexes.size > 0 && idx >= totalLines - 6)
        ) {
          signRoleIndexes.add(idx);
        }
      });
    }

    // ── 預掃描：祝頌語（「祝」獨行 + 祝福語）──
    const zhiLineIndexes = new Set<number>();
    const blessLineIndexes = new Set<number>();
    if (cfg.hasBlessing) {
      lines.forEach((line, idx) => {
        if (idx >= lastFewStart && line.trim() === '祝') {
          zhiLineIndexes.add(idx);
          for (let j = idx + 1; j < Math.min(idx + 3, totalLines); j++) {
            if (lines[j].trim()) { blessLineIndexes.add(j); break; }
          }
        }
      });
    }

    // ── 預掃描：評論/專題文章作者署名（無謹啟，短行靠右）──
    const authorIndexes = new Set<number>();
    if (cfg.hasAuthor) {
      // 標題正下方第二行
      if (lines.length > 1) {
        const t = lines[1].trim();
        if (t && t.length < 25 && !/[。！？，、：]$/.test(t) && !t.includes('：')) authorIndexes.add(1);
      }
      // 文末最後5行中的短行
      lines.forEach((line, idx) => {
        if (idx < totalLines - 6) return;
        const t = line.trim();
        if (t && t.length < 25 && !/[。！？，、：]$/.test(t) && !t.includes('：')) authorIndexes.add(idx);
      });
    }

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) { result.push('<div style="margin:0.8em 0"></div>'); return; }
      const processed = processExpand(trimmed);
      const isInLastSection = idx >= lastFewStart;

      // ── 上款／稱謂：文首含冒號的短行（commentary/article 無上款）──
      const isGreeting = cfg.hasGreeting && idx <= 2 &&
        /[：:]/.test(trimmed) && trimmed.length < 30 && !trimmed.includes('。') && !trimmed.includes('，');

      // ── 標題：置中粗體 ──
      const TITLE_EXCLUDE = ['同學', '希望', '匯報', '上報', '計劃', '提出', '相信', '認為', '先生', '女士', '老師'];
      const titleMaxIdx = ['proposal', 'report'].includes(genreValue) ? 5
                        : genreValue === 'article' ? 1
                        : 2; // commentary
      const isTitle = cfg.hasTitle && !isGreeting && idx < titleMaxIdx &&
        trimmed.length < 40 && !trimmed.includes('：') && !trimmed.includes(':') &&
        !/[。！？，]$/.test(trimmed) && !TITLE_EXCLUDE.some(w => trimmed.includes(w));

      // ── 日期（書信/建議書/報告才有）──
      const isDate = cfg.hasSignName && isInLastSection &&
        /[二零一九八七六五四三兩〇0-9]{4}年.*月.*[日號]/.test(trimmed);

      // ── 祝頌語 ──
      const isZhi      = zhiLineIndexes.has(idx);
      const isBlessing = blessLineIndexes.has(idx);

      // ── 謹啟署名 ──
      const isSignName = signNameIndexes.has(idx);
      const isSignRole = signRoleIndexes.has(idx) && !isSignName && !isZhi && !isBlessing && !isDate;

      // ── 評論/專題作者署名（靠右）──
      const isAuthor = cfg.hasAuthor && authorIndexes.has(idx) && !isTitle;

      // ── 套用樣式 ──
      if (isGreeting)    return result.push(`<div style="margin:0.3em 0">${processed}</div>`);
      if (isTitle)       return result.push(`<div style="text-align:center;font-weight:bold;margin:0.6em 0;display:block;width:100%">${processed}</div>`);
      if (isDate)        return result.push(`<div style="margin:0.2em 0">${processed}</div>`);
      if (isZhi)         return result.push(`<div style="margin:0.6em 0 0.1em 0">&emsp;&emsp;${processed}</div>`);
      if (isBlessing)    return result.push(`<div style="margin:0.1em 0 0.5em 0">${processed}</div>`);
      if (isSignName)    return result.push(`<div style="text-align:right;margin:0.1em 0">${processed}</div>`);
      if (isSignRole)    return result.push(`<div style="text-align:right;padding-right:2em;margin:0.1em 0">${processed}</div>`);
      if (isAuthor)      return result.push(`<div style="text-align:right;margin:0.2em 0">${processed}</div>`);
      // 一般段落
      result.push(`<div style="margin:0.2em 0">&emsp;&emsp;${processed}</div>`);
    });
    return result.join('');
  };

  const stripMarkers = (text: string): string => text.replace(/【拓展】/g, '').replace(/【\/拓展】/g, '');

  const handleExportTxt = () => {
    if (!generatedExam) return;
    const infoPoints = getInfoPoints();
    const developmentPoints = getDevelopmentPoints();
    const formatReqs = getFormatRequirements();
    const lines: string[] = [
      'DSE 中文卷二甲部：實用寫作模擬試卷', '',
      generatedExam.examPaper.title, '',
      `考試時間：${generatedExam.examPaper.time} 佔分：${generatedExam.examPaper.marks}`, '',
      '【題目】', generatedExam.examPaper.question, '',
      `【${generatedExam.examPaper.material1.title}】`, generatedExam.examPaper.material1.content, '',
      `【${generatedExam.examPaper.material2.title}】`, generatedExam.examPaper.material2.content, '',
      '════════════════════════════════', '評分參考（教師用）', '════════════════════════════════', '',
      '① 資訊分（最高 2 分）', '考生須提及以下 3-4 項背景資訊，齊全得 2 分，欠 1 項得 1 分，欠 2 項或以上得 0 分：',
      ...infoPoints.map((p: string) => ` • ${p}`), '',
      '② 內容發展分（最高 8 分）', '優質回應應涵蓋以下論點及拓展方向：',
      ...developmentPoints.map((p: string) => ` • ${p}`), '',
      '行文語氣（最高 10 分）（以措詞行文為主）：',
      ...getToneDescription(genre).map((t: string) => ` • ${t}`), '',
      '組織及格式要求（最高 10 分）：',
      ...formatReqs.map((r: string) => ` • ${r}`),
      '',
      '格式扣分規則（從組織分中扣減，最多扣2分）：',
      ' • 格式不當或添加多餘格式，錯 1–2 項扣 1 分',
      ' • 格式不當或添加多餘格式，錯 3 項或以上扣 2 分',
      ' * 組織及格式部分不考慮字數',
    ];
    if (generatedExam.modelEssay) {
      lines.push('', '════════════════════════════════', '示範文章（底線部分為內容拓展示範）', '════════════════════════════════', '');
      lines.push(stripMarkers(generatedExam.modelEssay));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `實用寫作模擬卷_${genre}.txt`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const handleExportHtml = () => {
    if (!generatedExam) return;
    const infoPoints = getInfoPoints();
    const factualPoints = getFactualPoints();
    const developmentPoints = getDevelopmentPoints();
    const formatReqs = getFormatRequirements();
    const toList = (arr: string[]) => arr.length > 0 ? arr.map(i => `<li>${i}</li>`).join('\n ') : '<li>（未有資料）</li>';
    const modelEssayHtml = generatedExam.modelEssay ? parseEssayToHtml(generatedExam.modelEssay, genre) : '';

    // 內容發展分：上段資料整理 + 下段拓展方向，右欄評分準則
    const cleanPoint = (p: string) => p.replace(/^【\d+分】\s*/, '').replace(/^\d+分[:：]\s*/, '');
    const scoringCriteria = [
      ['7–8分','齊全；合理、扣題、具體拓展；解說清晰，論點有力'],
      ['5–6分','齊全；合理、具體拓展；解說尚算清晰'],
      ['3–4分','大致齊全；拓展欠具體，或拓展欠扣題'],
      ['2分','齊全；拓展欠奉，或觀點不合理'],
      ['1分','不齊全；拓展欠奉'],
      ['0分','欠缺'],
    ].map(([score, desc]) => `<tr><td style="padding:4px 6px;border-bottom:1px solid #e8dcc8;font-weight:600;color:#7a5f00;white-space:nowrap">${score}</td><td style="padding:4px 6px;border-bottom:1px solid #e8dcc8;color:#555;font-size:11px">${desc}</td></tr>`).join('');

    const hasContent = factualPoints.length > 0 || developmentPoints.length > 0;
    const devPointsHtml = hasContent
      ? `<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px">
          <thead>
            <tr>
              <th style="background:#f5f0e8;padding:6px 10px;border:1px solid #d4c5a0;text-align:left;font-weight:600">優質回應應涵蓋以下內容</th>
              <th style="background:#f5f0e8;padding:6px 10px;border:1px solid #d4c5a0;text-align:center;font-weight:600;width:160px">評分準則</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:0;border:1px solid #d4c5a0;vertical-align:top">
                ${factualPoints.length > 0 ? `
                <div style="background:#f0f4fa;padding:8px 10px;border-bottom:1px solid #e8dcc8">
                  <div style="font-size:11px;color:#4A6FA5;font-weight:700;margin-bottom:4px;letter-spacing:0.03em">抄錄資料內容</div>
                  <ul style="margin:0;padding-left:16px">${factualPoints.map((p: string) => `<li style="margin:3px 0">${cleanPoint(p)}</li>`).join('')}</ul>
                </div>` : ''}
                ${developmentPoints.length > 0 ? `
                <div style="padding:8px 10px">
                  <div style="font-size:11px;color:#B5726E;font-weight:700;margin-bottom:4px;letter-spacing:0.03em">拓展方向</div>
                  <ul style="margin:0;padding-left:16px">${developmentPoints.map((p: string) => `<li style="margin:3px 0">${cleanPoint(p)}</li>`).join('')}</ul>
                </div>` : ''}
              </td>
              <td style="padding:0;border:1px solid #d4c5a0;vertical-align:top">
                <table style="width:100%;border-collapse:collapse;font-size:12px">${scoringCriteria}</table>
              </td>
            </tr>
          </tbody>
        </table>`
      : '<p>（未有資料）</p>';

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="UTF-8">
<title>${generatedExam.examPaper.title}</title>
<style>
body{font-family:"Microsoft JhengHei","PingFang HK",sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;line-height:1.8;color:#333}
h1{text-align:center;font-size:22px;margin-bottom:8px}
.meta{text-align:center;color:#666;margin-bottom:24px;font-size:14px}
h2{font-size:17px;margin-top:32px;margin-bottom:12px;border-bottom:2px solid #B5726E;padding-bottom:4px;color:#B5726E}
h3{font-size:15px;margin-top:18px;margin-bottom:8px;color:#444}
.material{background:#f9f9f9;padding:16px 20px;border-radius:8px;margin:16px 0;border-left:4px solid #B5726E}
.material-title{font-weight:bold;margin-bottom:8px;color:#B5726E}
.marking{background:#fffbf0;border:1px solid #e8d9a0;border-radius:8px;padding:20px 24px;margin-top:32px;page-break-before:always}
.marking h2{color:#7a5f00;border-bottom-color:#c8a800}
.marking h3{color:#5a4800}
.marking ul{margin:6px 0;padding-left:22px}
.marking li{margin:4px 0;font-size:14px}
.score-note{font-size:13px;color:#888;font-style:italic;margin-bottom:6px}
.model-essay{background:#f0f7ff;border:1px solid #b0cce8;border-radius:8px;padding:20px 24px;margin-top:32px;page-break-before:always}
.model-essay h2{color:#1a4f7a;border-bottom-color:#4a8fbf}
.essay-body{font-size:15px;line-height:2}
.essay-body strong{color:#2563eb;font-weight:700}
@media print{.marking,.model-essay{page-break-before:always}}
</style>
</head>
<body>
<h1>${generatedExam.examPaper.title}</h1>
<p class="meta">考試時間：${generatedExam.examPaper.time} 佔分：${generatedExam.examPaper.marks}</p>
<h2>題目</h2>
<p>${generatedExam.examPaper.question.replace(/\n/g, '<br>')}</p>
<div class="material"><div class="material-title">${generatedExam.examPaper.material1.title}</div>
<div>${convertMarkdownTable(generatedExam.examPaper.material1.content).split('\n').map((l: string) => l.startsWith('<') ? l : (l.trim() ? `<p style="margin:4px 0">${l}</p>` : '')).join('')}</div></div>
<div class="material"><div class="material-title">${generatedExam.examPaper.material2.title}</div>
<div>${convertMarkdownTable(generatedExam.examPaper.material2.content).split('\n').map((l: string) => l.startsWith('<') ? l : (l.trim() ? `<p style="margin:4px 0">${l}</p>` : '')).join('')}</div></div>
<div class="marking">
<h2>評分參考（教師用）</h2>
<h3>① 資訊分（最高 2 分）</h3>
<p class="score-note">考生須提及以下背景資訊，齊全得 2 分，欠 1 項得 1 分，欠 2 項或以上得 0 分：</p>
<ul>${toList(infoPoints)}</ul>
<h3>② 內容發展分（最高 8 分）</h3>
${devPointsHtml}
<h3>行文語氣（最高 10 分）</h3>
<p style="font-size:13px;color:#888;font-style:italic;margin-bottom:6px">以措詞行文為主，語氣須符合文體、對象及場合</p>
<ul>${getToneDescription(genre).map((t: string) => `<li>${t}</li>`).join('\n ')}</ul>
<h3>組織及格式（最高 10 分）</h3>
<p class="score-note">必備格式元素（欠缺或添加多餘格式須扣分）：</p>
<ul>${toList(formatReqs)}</ul>
<div style="background:#fff8e6;border:1px solid #e8d9a0;border-radius:6px;padding:10px 14px;margin:8px 0;font-size:13px">
  <p style="font-weight:600;margin:0 0 4px">格式扣分規則（從組織分中扣減，最多扣2分）：</p>
  <p style="margin:2px 0">• 格式不當或添加多餘格式，錯 1–2 項扣 1 分</p>
  <p style="margin:2px 0">• 格式不當或添加多餘格式，錯 3 項或以上扣 2 分</p>
  <p style="margin:4px 0 0;color:#888;font-style:italic">* 組織及格式部分不考慮字數</p>
</div>
</div>
${modelEssayHtml ? `<div class="model-essay"><h2>示範文章</h2><p style="font-size:13px;color:#4a6fa5;margin-bottom:16px">藍色粗體部分為內容拓展示範，供學生參考。</p><div class="essay-body">${modelEssayHtml}</div></div>` : ''}
</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `實用寫作模擬卷_${genre}.html`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  // 【學生版】移除作答欄
  const handleExportStudentHtml = () => {
    if (!generatedExam) return;
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="UTF-8">
<title>${generatedExam.examPaper.title}（學生版）</title>
<style>
body{font-family:"Microsoft JhengHei","PingFang HK",sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;line-height:1.8;color:#333}
h1{text-align:center;font-size:22px;margin-bottom:8px}
.meta{text-align:center;color:#666;margin-bottom:24px;font-size:14px}
h2{font-size:17px;margin-top:32px;margin-bottom:12px;border-bottom:2px solid #B5726E;padding-bottom:4px;color:#B5726E}
.material{background:#f9f9f9;padding:16px 20px;border-radius:8px;margin:16px 0;border-left:4px solid #B5726E}
.material-title{font-weight:bold;margin-bottom:8px;color:#B5726E}
@media print{body{padding:20px}}
</style>
</head>
<body>
<h1>${generatedExam.examPaper.title}</h1>
<p class="meta">考試時間：${generatedExam.examPaper.time} 佔分：${generatedExam.examPaper.marks}</p>
<h2>題目</h2>
<p>${generatedExam.examPaper.question.replace(/\n/g, '<br>')}</p>
<div class="material">
<div class="material-title">${generatedExam.examPaper.material1.title}</div>
<div>${convertMarkdownTable(generatedExam.examPaper.material1.content).split('\n').map((l: string) => l.startsWith('<') ? l : (l.trim() ? '<p style="margin:4px 0">' + l + '</p>' : '')).join('')}</div>
</div>
<div class="material">
<div class="material-title">${generatedExam.examPaper.material2.title}</div>
<div>${convertMarkdownTable(generatedExam.examPaper.material2.content).split('\n').map((l: string) => l.startsWith('<') ? l : (l.trim() ? '<p style="margin:4px 0">' + l + '</p>' : '')).join('')}</div>
</div>
</body></html>`;
    // 注意：學生版不含作答欄（已移除 <h2>作答欄</h2> 和 answer-box）

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `實用寫作模擬卷_學生版_${genre}.html`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="max-w-5xl mx-auto">
      {error && <Alert className="mb-6 bg-red-50 border-red-200"><AlertCircle className="w-4 h-4 text-red-600" /><AlertDescription className="text-red-700">{error}</AlertDescription></Alert>}
      {success && <Alert className="mb-6 bg-green-50 border-green-200"><BookOpen className="w-4 h-4 text-green-600" /><AlertDescription className="text-green-700">{success}</AlertDescription></Alert>}

      <div className="grid lg:grid-cols-[1fr_1.5fr] gap-6">
        {/* Left - Settings */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#B5726E]" />生成設定</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'upload' | 'paste')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">上傳文件</TabsTrigger>
                <TabsTrigger value="paste">貼上文字</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>上傳模擬卷</Label>
                  <div className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-6 text-center hover:border-[#B5726E] hover:bg-[#F7F9FB] transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-8 h-8 text-[#718096] mx-auto mb-2" />
                    <p className="text-sm text-[#2D3748]">點擊上傳模擬卷文件</p>
                    <p className="text-xs text-[#718096]">支持 JPG、PNG、PDF、Word、TXT 格式</p>
                    <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleFileChange} />
                  </div>
                </div>
                {uploadedFile && (
                  <div className="flex items-center justify-between p-2 bg-[#F7F9FB] rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-[#B5726E] flex-shrink-0" />
                      <span className="text-sm truncate">{uploadedFile.name}</span>
                      <span className="text-xs text-[#718096] flex-shrink-0">({formatFileSize(uploadedFile.size)})</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleRemoveFile}><X className="w-4 h-4" /></Button>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="paste" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Type className="w-4 h-4" />貼上題目</Label>
                    {storedQuestion && (
                      <p className="text-xs text-[#4A6FA5] bg-blue-50 p-2 rounded mb-1">
                        已自動填入實用寫作批改頁的題目及資料內容
                      </p>
                    )}
                  <Textarea placeholder="請貼上題目內容..." value={pastedQuestion} onChange={(e) => setPastedQuestion(e.target.value)} className="min-h-[120px]" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><ClipboardList className="w-4 h-4" />貼上資料內容（可選）</Label>
                  {storedMaterials && (
                    <p className="text-xs text-[#4A6FA5] bg-blue-50 p-2 rounded">已自動填入實用寫作批改頁的資料內容</p>
                  )}
                  <Textarea
                    placeholder="請貼上資料一及資料二的內容（可選）..."
                    value={pastedMaterials}
                    onChange={(e) => setPastedMaterials(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><ClipboardList className="w-4 h-4" />資料結構摘要（可選）</Label>
                  <Textarea placeholder="例：2個活動名稱：長者探訪、數碼教學；4個活動細項：……；3個同學意見：……" value={pastedCriteria} onChange={(e) => setPastedCriteria(e.target.value)} className="min-h-[60px]" />
                  {pastedCriteria.length > 300 && (
                    <p className="text-xs text-amber-600">⚠️ 內容較長（{pastedCriteria.length}字），生成時只會參考前300字。建議只填入活動名稱、細項和同學意見的簡短摘要。</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label>選擇輸出文體</Label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="speech">演講辭</SelectItem>
                  <SelectItem value="letter">書信/公開信</SelectItem>
                  <SelectItem value="proposal">建議書</SelectItem>
                  <SelectItem value="report">報告</SelectItem>
                  <SelectItem value="commentary">評論文章</SelectItem>
                  <SelectItem value="article">專題文章</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="text-sm text-[#718096] bg-[#F7F9FB] p-3 rounded-lg">
              <p className="font-medium mb-1">生成說明：</p>
              <p>AI將分析您上傳的模擬卷或貼上的題目內容，理解其主題和結構，然後生成一份全新的模擬卷。新模擬卷會保持相同的主題方向，但內容完全不同，並符合您選擇的文體格式要求。</p>
            </div>

            {/* 上傳模式：先提取，確認後生成 */}
            {inputMode === 'upload' ? (
              <Button
                onClick={handleExtract}
                disabled={isExtracting || !uploadedFile}
                className="w-full gap-2 bg-[#4A6FA5] hover:bg-[#3a5f95]"
              >
                {isExtracting
                  ? <><RefreshCw className="w-4 h-4 animate-spin" />AI 提取內容中...</>
                  : <><Sparkles className="w-4 h-4" />提取參考卷內容</>}
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || (!pastedQuestion.trim() && !pastedMaterials.trim())}
                className="w-full gap-2 bg-[#B5726E] hover:bg-[#a5625e]"
              >
                {isGenerating
                  ? <><RefreshCw className="w-4 h-4 animate-spin" />生成中...</>
                  : <><Sparkles className="w-4 h-4" />生成模擬卷</>}
              </Button>
            )}

            {/* 提取結果確認區 */}
            {extractedContent && (
              <div className="border border-[#4A6FA5] rounded-lg p-4 space-y-3 bg-blue-50">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#4A6FA5]">✅ 提取完成，請確認內容</p>
                  <button onClick={() => setExtractedContent(null)} className="text-xs text-[#718096] hover:text-[#2D3748]">✕ 取消</button>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-[#2D3748] mb-1">題目</p>
                    <textarea
                      className="w-full text-xs border border-[#E2E8F0] rounded p-2 bg-white resize-none"
                      rows={3}
                      value={extractedContent.question}
                      onChange={(e) => setExtractedContent({...extractedContent, question: e.target.value})}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#2D3748] mb-1">資料內容</p>
                    <textarea
                      className="w-full text-xs border border-[#E2E8F0] rounded p-2 bg-white resize-none"
                      rows={4}
                      value={extractedContent.materials}
                      onChange={(e) => setExtractedContent({...extractedContent, materials: e.target.value})}
                    />
                  </div>
                  {extractedContent.criteria && (
                    <div>
                      <p className="text-xs font-medium text-[#2D3748] mb-1">資料結構摘要 <span className="text-[#718096] font-normal">（AI 將據此設計相似結構的新試卷）</span></p>
                      <textarea
                        className="w-full text-xs border border-[#E2E8F0] rounded p-2 bg-white resize-none"
                        rows={2}
                        value={extractedContent.criteria}
                        onChange={(e) => setExtractedContent({...extractedContent, criteria: e.target.value})}
                      />
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleConfirmAndGenerate}
                  disabled={isGenerating}
                  className="w-full gap-2 bg-[#B5726E] hover:bg-[#a5625e]"
                >
                  {isGenerating
                    ? <><RefreshCw className="w-4 h-4 animate-spin" />生成中...</>
                    : <><Sparkles className="w-4 h-4" />確認並生成模擬卷</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right - Preview */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-[#4A6FA5]" />預覽</CardTitle></CardHeader>
          <CardContent>
            {generatedExam ? (
              <Tabs defaultValue="paper" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="paper">模擬試卷</TabsTrigger>
                  <TabsTrigger value="marking">評分參考</TabsTrigger>
                  <TabsTrigger value="model">示範文章</TabsTrigger>
                </TabsList>

                <TabsContent value="paper" className="space-y-4 pt-4">
                  <div className="text-center border-b pb-4">
                    <EditableText
                      value={generatedExam.examPaper.title}
                      onSave={(v) => updateGeneratedExam({ examPaper: { ...generatedExam.examPaper, title: v } })}
                      className="font-bold text-lg text-center"
                      multiline={false}
                      minHeight={40}
                    />
                    <p className="text-sm text-[#718096]">考試時間：{generatedExam.examPaper.time} | 佔分：{generatedExam.examPaper.marks}</p>
                  </div>
                  <div>
                    <p className="font-medium mb-2">題目：</p>
                    <EditableText
                      value={generatedExam.examPaper.question}
                      onSave={(v) => updateGeneratedExam({ examPaper: { ...generatedExam.examPaper, question: v } })}
                      className="text-sm"
                      minHeight={60}
                    />
                  </div>
                  <div className="bg-[#F7F9FB] p-4 rounded-lg">
                    <EditableText
                      value={generatedExam.examPaper.material1.title}
                      onSave={(v) => updateGeneratedExam({ examPaper: { ...generatedExam.examPaper, material1: { ...generatedExam.examPaper.material1, title: v } } })}
                      className="font-medium mb-2"
                      multiline={false}
                      minHeight={40}
                    />
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: convertMaterialToHtml(generatedExam.examPaper.material1.content) }} />
                    <div className="mt-2 border-t pt-2">
                      <p className="text-xs text-[#718096] mb-1">編輯原始內容：</p>
                      <EditableText
                        value={generatedExam.examPaper.material1.content}
                        onSave={(v) => updateGeneratedExam({ examPaper: { ...generatedExam.examPaper, material1: { ...generatedExam.examPaper.material1, content: v } } })}
                        className="text-sm"
                        minHeight={80}
                      />
                    </div>
                  </div>
                  <div className="bg-[#F7F9FB] p-4 rounded-lg">
                    <EditableText
                      value={generatedExam.examPaper.material2.title}
                      onSave={(v) => updateGeneratedExam({ examPaper: { ...generatedExam.examPaper, material2: { ...generatedExam.examPaper.material2, title: v } } })}
                      className="font-medium mb-2"
                      multiline={false}
                      minHeight={40}
                    />
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: convertMaterialToHtml(generatedExam.examPaper.material2.content) }} />
                    <div className="mt-2 border-t pt-2">
                      <p className="text-xs text-[#718096] mb-1">編輯原始內容：</p>
                      <EditableText
                        value={generatedExam.examPaper.material2.content}
                        onSave={(v) => updateGeneratedExam({ examPaper: { ...generatedExam.examPaper, material2: { ...generatedExam.examPaper.material2, content: v } } })}
                        className="text-sm"
                        minHeight={80}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={handleExportTxt} variant="outline" className="flex-1 gap-2"><Download className="w-4 h-4" />導出 TXT</Button>
                    <Button onClick={handleExportHtml} className="flex-1 gap-2 bg-[#B5726E] hover:bg-[#a5625e]"><Download className="w-4 h-4" />導出 HTML（教師版）</Button>
                    <Button onClick={handleExportStudentHtml} variant="outline" className="w-full gap-2 border-[#B5726E] text-[#B5726E] hover:bg-[#f9f0ef]"><Download className="w-4 h-4" />導出 HTML（學生版）</Button>
                  </div>
                </TabsContent>

                <TabsContent value="marking" className="space-y-4 pt-4">
                  {getInfoPoints().length > 0 && (
                    <div>
                      <p className="font-medium mb-2">資訊要點 <span className="text-xs text-[#718096] font-normal">（必須提及，齊全得2分）</span></p>
                      <EditableList
                        items={getInfoPoints()}
                        onSave={(items) => updateGeneratedExam({
                          markingScheme: { ...generatedExam!.markingScheme, content: { ...generatedExam!.markingScheme.content, infoPoints: items } }
                        })}
                        className="text-sm text-[#718096]"
                      />
                    </div>
                  )}
                  {(getFactualPoints().length > 0 || getDevelopmentPoints().length > 0) && (
                    <div>
                      <p className="font-medium mb-2">內容發展 <span className="text-xs text-[#718096] font-normal">（最高8分）</span></p>
                      <div className="border border-[#E2E8F0] rounded-lg overflow-hidden text-xs">
                        {/* 表頭 */}
                        <div className="grid grid-cols-[1fr_160px] bg-[#F7F9FB] border-b border-[#E2E8F0]">
                          <div className="px-3 py-2 font-medium text-[#2D3748] border-r border-[#E2E8F0]">優質回應應涵蓋以下內容</div>
                          <div className="px-3 py-2 font-medium text-[#2D3748] text-center">評分準則</div>
                        </div>
                        <div className="grid grid-cols-[1fr_160px]">
                          {/* 左欄：上下兩段 */}
                          <div className="border-r border-[#E2E8F0]">
                            {/* 上段：可抄錄資料 */}
                            {getFactualPoints().length > 0 && (
                              <div className="px-3 py-2 border-b border-[#E2E8F0] bg-[#fafaf8]">
                                <p className="text-[10px] text-[#4A6FA5] mb-1.5 font-semibold tracking-wide">抄錄資料內容</p>
                                <EditableList
                                  items={getFactualPoints()}
                                  onSave={(items) => updateGeneratedExam({
                                    markingScheme: { ...generatedExam!.markingScheme, content: { ...generatedExam!.markingScheme.content, factualPoints: items } }
                                  })}
                                  className="text-[#2D3748]"
                                />
                              </div>
                            )}
                            {/* 下段：拓展方向 */}
                            {getDevelopmentPoints().length > 0 && (
                              <div className="px-3 py-2">
                                <p className="text-[10px] text-[#B5726E] mb-1.5 font-semibold tracking-wide">拓展方向</p>
                                <EditableList
                                  items={getDevelopmentPoints().map((p: string) => p.replace(/^【\d+分】\s*/, '').replace(/^\d+分[:：]\s*/, ''))}
                                  onSave={(items) => updateGeneratedExam({
                                    markingScheme: { ...generatedExam!.markingScheme, content: { ...generatedExam!.markingScheme.content, developmentPoints: items } }
                                  })}
                                  className="text-[#2D3748]"
                                />
                              </div>
                            )}
                          </div>
                          {/* 右欄：評分準則 */}
                          <div className="divide-y divide-[#E2E8F0]">
                            {[
                              { score: '7–8分', desc: '齊全；合理、扣題、具體拓展；解說清晰' },
                              { score: '5–6分', desc: '齊全；合理、具體拓展；解說尚算清晰' },
                              { score: '3–4分', desc: '大致齊全；拓展欠具體或欠扣題' },
                              { score: '2分', desc: '齊全；拓展欠奉，或觀點不合理' },
                              { score: '1分', desc: '不齊全；拓展欠奉' },
                              { score: '0分', desc: '欠缺' },
                            ].map(({ score, desc }) => (
                              <div key={score} className="px-2 py-1.5 text-center">
                                <span className="font-medium text-[#4A6FA5] block">{score}</span>
                                <span className="text-[10px] text-[#718096] leading-tight block">{desc}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="font-medium mb-2">行文語氣 <span className="text-xs text-[#718096] font-normal">（最高 10 分，以措詞行文為主）</span></p>
                    <ul className="text-sm list-disc list-inside space-y-1 text-[#718096]">{getToneDescription(genre).map((t: string, idx: number) => <li key={idx}>{t}</li>)}</ul>
                  </div>
                  {getFormatRequirements().length > 0 && (
                    <div>
                      <p className="font-medium mb-2">組織及格式 <span className="text-xs text-[#718096] font-normal">（最高 10 分）</span></p>
                      <p className="text-xs text-[#718096] mb-1">必備格式元素（欠缺或添加多餘格式須扣分）：</p>
                      <EditableList
                        items={getFormatRequirements()}
                        onSave={(items) => updateGeneratedExam({
                          markingScheme: { ...generatedExam!.markingScheme, organization: { ...generatedExam!.markingScheme.organization, formatRequirements: items } }
                        })}
                        className="text-sm text-[#718096] mb-2"
                      />
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-0.5">
                        <p className="font-medium">格式扣分規則（從組織分中扣減，最多扣2分）：</p>
                        <p>• 格式不當或添加多餘格式，錯 1–2 項扣 1 分</p>
                        <p>• 格式不當或添加多餘格式，錯 3 項或以上扣 2 分</p>
                        <p className="text-[#718096] italic">* 組織及格式部分不考慮字數</p>
                      </div>
                    </div>
                  )}
                  {getInfoPoints().length === 0 && getFactualPoints().length === 0 && getDevelopmentPoints().length === 0 && getFormatRequirements().length === 0 && (
                    <div className="text-center py-6 text-[#718096]"><p className="text-sm">未能生成評分參考，請重新生成模擬卷</p></div>
                  )}
                </TabsContent>

                <TabsContent value="model" className="space-y-4 pt-4">
                  {generatedExam.modelEssay ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                        <span className="text-xs text-blue-700"><strong style={{color:'#2563eb'}}>藍色粗體部分</strong> 為內容拓展示範，供學生參考</span>
                      </div>
                      <div className="bg-[#F7F9FB] p-4 rounded-lg text-sm leading-relaxed" style={{textAlign:'left'}} dangerouslySetInnerHTML={{ __html: parseEssayToHtml(generatedExam.modelEssay, genre) }} />
                      <div className="border-t pt-4">
                        <p className="text-xs text-[#718096] mb-2">直接編輯示範文章：</p>
                        <EditableText
                          value={generatedExam.modelEssay}
                          onSave={(v) => updateGeneratedExam({ modelEssay: v })}
                          className="text-sm text-[#2D3748] bg-[#F7F9FB] rounded-lg p-3"
                          minHeight={200}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-[#718096]"><p>未生成示範文章</p></div>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-12 text-[#718096]">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>上傳模擬卷並點擊「生成模擬卷」</p>
                <p className="text-sm mt-2">AI將根據原卷主題生成全新模擬卷</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
