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
import { generatePracticalExamWithAPI, isAPIAvailable } from '@/lib/api';
import { generateId, readFileAsDataURL, readFileAsText } from '@/lib/utils';
import type { FileInfo } from '@/types';

interface ExtendedFileInfo extends FileInfo { file?: File; }

export function ExamGeneratorPage() {
  const { apiKey, apiType, apiModel, apiBaseURL, generatedExam, setGeneratedExam, customQuestion: storedQuestion, practicalMaterials: storedMaterials } = useStore();
  const [genre, setGenre] = useState('speech');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<ExtendedFileInfo | null>(null);
  // 若有從實用寫作批改頁帶來的題目資料，預設切換到貼上模式
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>(storedQuestion ? 'paste' : 'upload');
  // 預填從實用寫作批改頁帶來的題目（含資料內容）
  const prefilledContent = storedQuestion
    ? storedMaterials
      ? `${storedQuestion}\n\n${storedMaterials}`
      : storedQuestion
    : '';
  const [pastedQuestion, setPastedQuestion] = useState(prefilledContent);
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

  const handleGenerate = async () => {
    if (!isAPIAvailable(apiKey)) { setError('請先在右上角設定有效的 API 密鑰'); return; }
    if (!genre) { setError('請選擇文體'); return; }
    if (inputMode === 'upload' && !uploadedFile) { setError('請上傳一份模擬卷文件'); return; }
    if (inputMode === 'paste' && !pastedQuestion.trim()) { setError('請貼上題目內容'); return; }
    setIsGenerating(true); setError(null);
    try {
      let fileContent: string;
      let fileType: string;
      if (inputMode === 'upload') {
        if (!uploadedFile?.file) throw new Error('文件無效');
        if (uploadedFile.type.startsWith('image/') || uploadedFile.type.includes('pdf')) {
          fileContent = await readFileAsDataURL(uploadedFile.file);
        } else {
          fileContent = await readFileAsText(uploadedFile.file);
        }
        fileType = uploadedFile.type;
      } else {
        fileContent = `【題目】\n${pastedQuestion}\n\n【評分準則】\n${pastedCriteria || '（無特定評分準則）'}`;
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
    return result.join('\n');
  };

  const ROLE_KEYWORDS_EXAM = ['主席', '會長', '幹事', '大使', '委員', '代表', '老師', '同學', '學生', '負責人', '召集人', '社長'];
  const SIGN_KEYWORDS_EXAM = ['謹啟', '謹呈', '謹上', '敬啟', '敬呈', '拜啟', '頓首', '謹識'];

  const parseEssayToHtml = (text: string): string => {
    const processExpand = (t: string) =>
      t.replace(/<strong[^>]*color[^>]*>/gi, '<strong style="color:#2563eb;font-weight:700">')
       .replace(/<\/strong>/gi, '</strong>')
       .replace(/【拓展[】）}]?/g, '<strong style="color:#2563eb;font-weight:700">')
       .replace(/【\/拓展[】）}]/g, '</strong>')
       .replace(/\[拓展\]/g, '<strong style="color:#2563eb;font-weight:700">')
       .replace(/\[\/拓展\]/g, '</strong>')
       .replace(/<\/strong>\s*<strong[^>]*>/g, '');
    const lines = text.split('\n');
    const totalLines = lines.length;
    const result: string[] = [];
    const lastFewStart = Math.max(0, totalLines - 7);
    const signNameIndexes = new Set<number>();
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (idx >= lastFewStart && SIGN_KEYWORDS_EXAM.some(k => trimmed.includes(k))) signNameIndexes.add(idx);
    });
    const noSignKeywords = signNameIndexes.size === 0;
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) { result.push('<div style="margin:0.8em 0"></div>'); return; }
      const processed = processExpand(trimmed);
      const isInLastSection = idx >= lastFewStart;
      const isInFirstSection = idx < 8;
      const TITLE_EXCLUDE = ['同學', '希望', '匯報', '上報', '計劃中', '提出', '相信', '認為'];
      const isTitle = isInFirstSection && ((/建議/.test(trimmed) || /報告/.test(trimmed))) && trimmed.length < 30 && !trimmed.includes('：') && !trimmed.includes(':') && !TITLE_EXCLUDE.some(w => trimmed.includes(w));
      const isCommentaryTitle = idx === 0 && trimmed.length < 30 && !trimmed.includes('：') && !trimmed.includes(':') && !/[。！？]$/.test(trimmed);
      const isSignName = signNameIndexes.has(idx);
      const isSignRole = isInLastSection && !isSignName && (signNameIndexes.has(idx + 1) || (noSignKeywords && ROLE_KEYWORDS_EXAM.some(k => trimmed.includes(k)) && trimmed.length < 15) || (noSignKeywords && idx >= totalLines - 3 && trimmed.length < 12 && !/[。！？，]$/.test(trimmed))) && !trimmed.includes('：') && !trimmed.includes(':');
      const isDate = isInLastSection && /[二零一九八七六五四三兩〇0-9]{4}年.*月.*[日號]/.test(trimmed);
      if (isTitle || isCommentaryTitle) result.push(`<div style="text-align:center;font-weight:bold;margin:0.6em 0">${processed}</div>`);
      else if (isSignRole) result.push(`<div style="text-align:right;padding-right:3em;margin:0.1em 0">${processed}</div>`);
      else if (isSignName) result.push(`<div style="text-align:right;padding-right:0;margin:0.1em 0">${processed}</div>`);
      else if (isDate) result.push(`<div style="text-align:left;margin:0.3em 0">${processed}</div>`);
      else result.push(`<div style="margin:0.2em 0">${processed}</div>`);
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
    const developmentPoints = getDevelopmentPoints();
    const formatReqs = getFormatRequirements();
    const toList = (arr: string[]) => arr.length > 0 ? arr.map(i => `<li>${i}</li>`).join('\n ') : '<li>（未有資料）</li>';
    const modelEssayHtml = generatedExam.modelEssay ? parseEssayToHtml(generatedExam.modelEssay) : '';

    // 內容發展分：左欄細項 + 右欄評分準則表格
    const cleanPoint = (p: string) => p.replace(/^【\d+分】\s*/, '').replace(/^\d+分[:：]\s*/, '');
    const devPointsHtml = developmentPoints.length > 0
      ? `<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px">
          <thead>
            <tr>
              <th style="background:#f5f0e8;padding:6px 10px;border:1px solid #d4c5a0;text-align:left;font-weight:600">優質回應應涵蓋以下論點及拓展方向</th>
              <th style="background:#f5f0e8;padding:6px 10px;border:1px solid #d4c5a0;text-align:center;font-weight:600;width:160px">評分準則</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px 10px;border:1px solid #d4c5a0;vertical-align:top">
                <ul style="margin:0;padding-left:16px">${developmentPoints.map((p: string) => `<li style="margin:3px 0">${cleanPoint(p)}</li>`).join('')}</ul>
              </td>
              <td style="padding:0;border:1px solid #d4c5a0;vertical-align:top">
                <table style="width:100%;border-collapse:collapse;font-size:12px">
                  ${[
                    ['7–8分','齊全；合理、扣題、具體拓展；解說清晰，論點有力'],
                    ['5–6分','齊全；合理、具體拓展；解說尚算清晰'],
                    ['3–4分','大致齊全；拓展欠具體，或拓展欠扣題'],
                    ['2分','齊全；拓展欠奉，或觀點不合理'],
                    ['1分','不齊全；拓展欠奉'],
                    ['0分','欠缺'],
                  ].map(([score, desc]) => `<tr><td style="padding:4px 6px;border-bottom:1px solid #e8dcc8;font-weight:600;color:#7a5f00;white-space:nowrap">${score}</td><td style="padding:4px 6px;border-bottom:1px solid #e8dcc8;color:#555;font-size:11px">${desc}</td></tr>`).join('')}
                </table>
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
<ul>${toList(formatReqs)}</ul>
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
                  <Label className="flex items-center gap-2"><ClipboardList className="w-4 h-4" />貼上評分準則（可選）</Label>
                  <Textarea placeholder="請貼上評分準則內容（可選）..." value={pastedCriteria} onChange={(e) => setPastedCriteria(e.target.value)} className="min-h-[100px]" />
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

            <Button onClick={handleGenerate} disabled={isGenerating || (inputMode === 'upload' ? !uploadedFile : !pastedQuestion.trim())} className="w-full gap-2 bg-[#B5726E] hover:bg-[#a5625e]">
              {isGenerating ? <><RefreshCw className="w-4 h-4 animate-spin" />生成中...</> : <><Sparkles className="w-4 h-4" />生成模擬卷</>}
            </Button>
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
                    <h3 className="font-bold text-lg">{generatedExam.examPaper.title}</h3>
                    <p className="text-sm text-[#718096]">考試時間：{generatedExam.examPaper.time} | 佔分：{generatedExam.examPaper.marks}</p>
                  </div>
                  <div><p className="font-medium mb-2">題目：</p><p className="text-sm whitespace-pre-wrap">{generatedExam.examPaper.question}</p></div>
                  <div className="bg-[#F7F9FB] p-4 rounded-lg"><p className="font-medium mb-2">{generatedExam.examPaper.material1.title}</p><p className="text-sm whitespace-pre-wrap">{generatedExam.examPaper.material1.content}</p></div>
                  <div className="bg-[#F7F9FB] p-4 rounded-lg"><p className="font-medium mb-2">{generatedExam.examPaper.material2.title}</p><p className="text-sm whitespace-pre-wrap">{generatedExam.examPaper.material2.content}</p></div>
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
                      <ul className="text-sm list-disc list-inside space-y-1 text-[#718096]">{getInfoPoints().map((p: string, idx: number) => <li key={idx}>{p}</li>)}</ul>
                    </div>
                  )}
                  {getDevelopmentPoints().length > 0 && (
                    <div>
                      <p className="font-medium mb-2">內容發展 <span className="text-xs text-[#718096] font-normal">（最高8分）</span></p>
                      {/* 左右兩欄表格：左欄細項，右欄評分準則 */}
                      <div className="border border-[#E2E8F0] rounded-lg overflow-hidden text-xs">
                        <div className="grid grid-cols-[1fr_auto] bg-[#F7F9FB]">
                          <div className="px-3 py-2 font-medium text-[#2D3748] border-r border-[#E2E8F0]">優質回應應涵蓋以下論點及拓展方向</div>
                          <div className="px-3 py-2 font-medium text-[#2D3748] w-36 text-center">評分準則</div>
                        </div>
                        <div className="grid grid-cols-[1fr_auto]">
                          {/* 左欄：具體細項 */}
                          <div className="border-r border-[#E2E8F0] divide-y divide-[#E2E8F0]">
                            {getDevelopmentPoints().map((p: string, idx: number) => (
                              <div key={idx} className="px-3 py-2 text-[#2D3748]">
                                {/* 清除可能殘留的【X分】前綴 */}
                                {p.replace(/^【\d+分】\s*/, '').replace(/^\d+分[:：]\s*/, '')}
                              </div>
                            ))}
                          </div>
                          {/* 右欄：評分準則（合併成一欄） */}
                          <div className="w-36 divide-y divide-[#E2E8F0]">
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
                      <ul className="text-sm list-disc list-inside space-y-1 text-[#718096]">{getFormatRequirements().map((r: string, idx: number) => <li key={idx}>{r}</li>)}</ul>
                    </div>
                  )}
                  {getInfoPoints().length === 0 && getDevelopmentPoints().length === 0 && getFormatRequirements().length === 0 && (
                    <div className="text-center py-6 text-[#718096]"><p className="text-sm">未能生成評分參考，請重新生成模擬卷</p></div>
                  )}
                </TabsContent>

                <TabsContent value="model" className="space-y-4 pt-4">
                  {generatedExam.modelEssay ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                        <span className="text-xs text-blue-700"><strong style={{color:'#2563eb'}}>藍色粗體部分</strong> 為內容拓展示範，供學生參考</span>
                      </div>
                      <div className="bg-[#F7F9FB] p-4 rounded-lg text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: parseEssayToHtml(generatedExam.modelEssay) }} />
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
