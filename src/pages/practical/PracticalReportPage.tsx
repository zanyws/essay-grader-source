import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, RefreshCw, User, Award, AlertTriangle, FileText, CheckSquare, XSquare, MinusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStore } from '@/hooks/useStore';
import { gradePracticalEssayWithAPI, isAPIAvailable } from '@/lib/api';
import type { APIConfig } from '@/types';
import { getPracticalGradeLabel } from '@/lib/gradingCriteria';
import type { PracticalReport, PracticalGrading } from '@/types';

interface PracticalReportPageProps {
  onNext: () => void;
  onPrev: () => void;
}

// 各文體格式核查規則
const FORMAT_CHECK_RULES: Record<string, Array<{ label: string; check: (text: string) => boolean; deduction: string }>> = {
  speech: [
    { label: '稱謂（開首頂格，含冒號，如：校長、各位老師、各位同學：）', check: (t) => /^[^
]{0,30}[：:]/.test(t.trim()), deduction: '欠稱謂扣1分' },
    { label: '自我介紹（開首交代身份，如：大家好，我是……）', check: (t) => /大家好|我是|本人是/.test(t.substring(0, 200)), deduction: '欠自我介紹扣1分' },
    { label: '文末致謝（如：多謝各位。）', check: (t) => /多謝各位|謝謝各位/.test(t.substring(t.length - 100)), deduction: '欠文末致謝扣1分' },
    { label: '無書信格式（不含：鈞鑒、敬啟者、此致、祝頌語）', check: (t) => !/鈞鑒|敬啟者|此致|祝頌|敬祝/.test(t), deduction: '添加多餘格式扣2分' },
  ],
  letter: [
    { label: '上款／稱謂（開首頂格，末尾有冒號）', check: (t) => /^[^
]{0,20}[：:]/.test(t.trim()), deduction: '欠上款扣1分' },
    { label: '祝頌語（「祝」獨立成行，下一行頂格寫祝福語）', check: (t) => /祝
|祝
/.test(t) || /祝[^
]{0,3}
[^
]{1,15}[安好康]/.test(t), deduction: '欠祝頌語扣1分' },
    { label: '署名（含啟告語，如：謹啟、敬啟）', check: (t) => /謹啟|敬啟|拜啟|謹上/.test(t), deduction: '欠署名扣1分' },
    { label: '日期（含年月日）', check: (t) => /[二零一九八七六五四三兩〇0-9]{4}年.{0,5}月.{0,5}[日號]/.test(t), deduction: '欠日期扣1分' },
    { label: '無演講辭格式（不含：大家好，我是……開首）', check: (t) => !/^大家好/.test(t.trim()), deduction: '添加多餘格式扣2分' },
  ],
  proposal: [
    { label: '上款（開首頂格，末尾有冒號）', check: (t) => /^[^
]{0,20}[：:]/.test(t.trim()), deduction: '欠上款扣1分' },
    { label: '標題（含「建議」二字，置中）', check: (t) => /建議/.test(t.substring(0, 150)), deduction: '欠標題扣1分' },
    { label: '署名（含謹啟）', check: (t) => /謹啟|敬啟/.test(t), deduction: '欠署名扣1分' },
    { label: '日期（含年月日）', check: (t) => /[二零一九八七六五四三兩〇0-9]{4}年.{0,5}月.{0,5}[日號]/.test(t), deduction: '欠日期扣1分' },
    { label: '無祝頌語（建議書不應有祝頌語）', check: (t) => !/祝頌|敬祝|順頌/.test(t), deduction: '添加多餘格式扣2分' },
  ],
  report: [
    { label: '上款（開首頂格，末尾有冒號）', check: (t) => /^[^
]{0,20}[：:]/.test(t.trim()), deduction: '欠上款扣1分' },
    { label: '標題（含「報告」二字）', check: (t) => /報告/.test(t.substring(0, 150)), deduction: '欠標題扣1分' },
    { label: '署名（含謹啟）', check: (t) => /謹啟|敬啟/.test(t), deduction: '欠署名扣1分' },
    { label: '日期（含年月日）', check: (t) => /[二零一九八七六五四三兩〇0-9]{4}年.{0,5}月.{0,5}[日號]/.test(t), deduction: '欠日期扣1分' },
    { label: '無多餘格式（不含：多謝各位、祝頌語、專此）', check: (t) => !/多謝各位|祝頌|專此/.test(t), deduction: '添加多餘格式扣2分' },
  ],
  commentary: [
    { label: '標題（文章頂部置中）', check: (t) => t.trim().split('\n')[0].trim().length > 0 && t.trim().split('\n')[0].trim().length < 30, deduction: '欠標題扣1分' },
    { label: '署名（文末，不含「啟」字）', check: (t) => { const last = t.substring(t.length - 150); return last.trim().length > 0 && !/謹啟|敬啟/.test(last); }, deduction: '欠署名扣1分' },
    { label: '無書信格式（不含上款、祝頌語、日期）', check: (t) => !/祝頌|鈞鑒|[二零一九八七六五四三兩〇]{4}年/.test(t), deduction: '添加多餘格式扣2分' },
  ],
  article: [
    { label: '標題（文章頂部置中）', check: (t) => t.trim().split('\n')[0].trim().length > 0 && t.trim().split('\n')[0].trim().length < 30, deduction: '欠標題扣1分' },
    { label: '署名（文末，不含「啟」字）', check: (t) => { const last = t.substring(t.length - 150); return last.trim().length > 0 && !/謹啟|敬啟/.test(last); }, deduction: '欠署名扣1分' },
    { label: '無書信格式（不含上款、祝頌語、日期）', check: (t) => !/祝頌|鈞鑒|[二零一九八七六五四三兩〇]{4}年/.test(t), deduction: '添加多餘格式扣2分' },
  ],
};

export function PracticalReportPage({ onNext, onPrev }: PracticalReportPageProps) {
  const {
    studentWorks, currentWorkIndex, customQuestion, practicalGenre,
    customCriteria, practicalInfoPoints, practicalDevItems,
    practicalFormatRequirements, practicalMaterials,
    apiKey, apiType, apiModel, practicalReports,
    addPracticalReport, updatePracticalReportGrading,
    setCurrentWorkIndex, setStep,
  } = useStore();

  const [currentReport, setCurrentReport] = useState<PracticalReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentWork = studentWorks[currentWorkIndex];

  // 自動格式核查
  const formatCheckResults = useMemo(() => {
    if (!currentWork?.correctedText || !practicalGenre) return [];
    const rules = FORMAT_CHECK_RULES[practicalGenre] || [];
    return rules.map(rule => ({
      label: rule.label,
      deduction: rule.deduction,
      passed: rule.check(currentWork.correctedText),
    }));
  }, [currentWork?.correctedText, practicalGenre]);

  const formatIssueCount = formatCheckResults.filter(r => !r.passed).length;

  useEffect(() => {
    if (!currentWork) return;
    const existingReport = practicalReports.find(r => r.studentWork.id === currentWork.id);
    if (existingReport) {
      setCurrentReport(existingReport);
    } else {
      generateReport();
    }
  }, [currentWork, practicalReports, customQuestion]);

  // 把【拓展】...【/拓展】標記轉換成藍色粗體 HTML
  const ROLE_KEYWORDS = ['主席', '會長', '幹事', '大使', '委員', '代表', '老師', '負責人', '召集人', '社長', '學生會'];
  const SIGN_KEYWORDS = ['謹啟', '謹呈', '謹上', '敬啟', '敬呈', '拜啟', '頓首', '謹識'];

  const parseEssayToHtml = (text: string): string => {
    const processExpand = (t: string) => t
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
      if (idx >= lastFewStart && SIGN_KEYWORDS.some(k => trimmed.includes(k))) {
        signNameIndexes.add(idx);
      }
    });

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) { result.push('<div style="margin:0.8em 0"></div>'); return; }
      const processed = processExpand(trimmed);
      const isInLastSection = idx >= lastFewStart;
      const isInFirstSection = idx < 8;
      const TITLE_EXCLUDE = ['同學', '希望', '匯報', '上報', '計劃中', '提出', '相信', '認為'];
      const isTitle = isInFirstSection && ((/建議/.test(trimmed) || /報告/.test(trimmed))) && trimmed.length < 30 && !trimmed.includes('：') && !TITLE_EXCLUDE.some(w => trimmed.includes(w));
      const isSignName = signNameIndexes.has(idx);
      const noSignKeywords = signNameIndexes.size === 0;
      const isSignRole = isInLastSection && !isSignName && (signNameIndexes.has(idx + 1) || (ROLE_KEYWORDS.some(k => trimmed.includes(k)) && trimmed.length < 15) || (noSignKeywords && idx >= totalLines - 3 && trimmed.length < 12 && !/[。！？，]$/.test(trimmed))) && !trimmed.includes('：');
      const isDate = isInLastSection && /[二零一九八七六五四三兩〇0-9]{4}年.*月.*[日號]/.test(trimmed);

      if (isTitle) result.push(`<div style="text-align:center;font-weight:bold;margin:0.6em 0">${processed}</div>`);
      else if (isSignRole) result.push(`<div style="text-align:right;padding-right:3em;margin:0.1em 0">${processed}</div>`);
      else if (isSignName) result.push(`<div style="text-align:right;padding-right:0;margin:0.1em 0">${processed}</div>`);
      else if (isDate) result.push(`<div style="text-align:left;margin:0.3em 0">${processed}</div>`);
      else result.push(`<div style="margin:0.2em 0">${processed}</div>`);
    });
    return result.join('');
  };

  const generateReport = async () => {
    if (!currentWork) return;
    setIsGenerating(true);
    setError(null);
    try {
      let newReport: PracticalReport;
      if (isAPIAvailable(apiKey)) {
        try {
          const apiConfig: APIConfig = { apiKey, apiType: apiType as any, model: apiModel };
          const apiResult = await gradePracticalEssayWithAPI(
            currentWork.correctedText, customQuestion, customCriteria, apiConfig,
            { genre: practicalGenre, infoPoints: practicalInfoPoints, devItems: practicalDevItems, formatRequirements: practicalFormatRequirements, materials: practicalMaterials }
          );
          newReport = { ...apiResult, studentWork: currentWork };
        } catch (apiError: any) {
          setError(`API 批改失敗: ${apiError.message}`);
          newReport = generateMockReport(currentWork);
        }
      } else {
        newReport = generateMockReport(currentWork);
      }
      addPracticalReport(newReport);
      setCurrentReport(newReport);
    } catch (error: any) {
      setError(error.message || '生成報告失敗');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateMockReport = (work: typeof currentWork): PracticalReport => {
    const grading: PracticalGrading = { info: 2, development: 6, tone: 7, organization: 7 };
    const contentScore = (grading.info + grading.development) * 3;
    const organizationScore = grading.tone + grading.organization;
    return { studentWork: work!, grading, contentScore, organizationScore, totalScore: contentScore + organizationScore, overallComment: '文章能回應題目要求，內容發展尚可，行文語氣合宜。', infoFeedback: { strengths: ['涵蓋主要資訊'], improvements: ['可更完整'] }, developmentFeedback: { strengths: ['有回應意見'], improvements: ['闡述可更深入'] }, toneFeedback: { strengths: ['語氣合宜'], improvements: ['措辭可更精準'] }, organizationFeedback: { strengths: ['結構完整'], improvements: ['格式可更準確'] }, formatIssues: [], enhancedText: work!.correctedText, enhancementNotes: ['加強說服力'], modelEssay: '參考範文...' };
  };

  const handleGradingChange = (field: keyof PracticalGrading, value: number) => {
    if (!currentReport) return;
    const maxVal = field === 'info' ? 2 : field === 'development' ? 8 : 10;
    const newGrading = { ...currentReport.grading, [field]: Math.max(0, Math.min(maxVal, value)) };
    updatePracticalReportGrading(currentWork.id, newGrading);
    setCurrentReport({ ...currentReport, grading: newGrading });
  };

  const handleNextWork = () => {
    if (currentWorkIndex < studentWorks.length - 1) setCurrentWorkIndex(currentWorkIndex + 1);
    else { setStep(3); onNext(); }
  };

  const handleDownloadReport = () => {
    if (!currentReport || !currentWork) return;
    const { grading, contentScore, organizationScore, totalScore } = currentReport;
    const formatChecksHtml = formatCheckResults.length > 0 ? `
      <h2>格式自動核查</h2>
      <ul>${formatCheckResults.map(r => `<li style="color:${r.passed ? '#5A9A7D' : '#B5726E'}">${r.passed ? '✅' : '❌'} ${r.label}${!r.passed ? ` <span style="font-size:0.85em">(${r.deduction})</span>` : ''}</li>`).join('')}</ul>
    ` : '';
    const html = `<!DOCTYPE html><html lang="zh-HK"><head><meta charset="UTF-8"><title>實用寫作批改報告 - ${currentWork.name || '未命名'}</title>
    <style>body{font-family:"Microsoft JhengHei","PingFang HK",sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;line-height:1.8;color:#333}h1{text-align:center;color:#B5726E}h2{border-bottom:2px solid #B5726E;padding-bottom:5px;color:#B5726E;margin-top:30px}.score-box{background:#f9f5f5;padding:20px;border-radius:8px;margin:20px 0;text-align:center;border:2px solid #B5726E}.total{font-size:36px;font-weight:bold;color:#B5726E}.strengths{background:#f0f7f0;padding:15px;border-radius:8px;margin:10px 0;border-left:4px solid #5A9A7D}.improvements{background:#fff5f0;padding:15px;border-radius:8px;margin:10px 0;border-left:4px solid #E89B5C}ul{margin:10px 0;padding-left:25px}li{margin:5px 0}.essay-box{background:#f9f9f9;padding:20px;border-radius:8px;margin:20px 0}</style>
    </head><body>
    <h1>實用寫作批改報告</h1>
    <p style="text-align:center;color:#666">${currentWork.name || '未命名'} | 題目：${customQuestion || '未設定'}</p>
    <div class="score-box"><div style="font-size:14px;color:#666">總分</div><div class="total">${totalScore}/50</div><div style="font-size:14px;color:#666">等級：${getPracticalGradeLabel(totalScore)}</div>
    <div style="display:flex;justify-content:center;gap:30px;margin-top:15px"><div style="text-align:center"><div style="font-size:20px;font-weight:bold;color:#4A6FA5">${contentScore}</div><div style="font-size:12px;color:#666">內容(30)</div></div><div style="text-align:center"><div style="font-size:20px;font-weight:bold;color:#4A6FA5">${organizationScore}</div><div style="font-size:12px;color:#666">行文組織(20)</div></div></div></div>
    <h2>總評</h2><p>${currentReport.overallComment}</p>
    ${formatChecksHtml}
    ${currentReport.formatIssues.length > 0 ? `<div style="background:#fff8e6;padding:15px;border-radius:8px;border-left:4px solid #E8A838"><h3 style="color:#B5726E;margin-top:0">AI 發現的格式問題</h3><ul>${currentReport.formatIssues.map((i: string) => `<li>${i}</li>`).join('')}</ul></div>` : ''}
    <h2>各項評語</h2>
    ${[['資訊', grading.info, 2, currentReport.infoFeedback], ['內容發展', grading.development, 8, currentReport.developmentFeedback], ['行文語氣', grading.tone, 10, currentReport.toneFeedback], ['組織', grading.organization, 10, currentReport.organizationFeedback]].map(([name, score, max, fb]: any) => `<h3>${name} (${score}/${max})</h3><div class="strengths"><b>優點：</b><ul>${fb.strengths.map((s: string) => `<li>${s}</li>`).join('')}</ul></div><div class="improvements"><b>改善：</b><ul>${fb.improvements.map((s: string) => `<li>${s}</li>`).join('')}</ul></div>`).join('')}
    <h2>增潤文章</h2><p style="font-size:13px;color:#4a6fa5">藍色粗體部分為內容拓展示範。</p><div class="essay-box" style="white-space:normal;line-height:2">${parseEssayToHtml(currentReport.enhancedText)}</div>
    <h2>示範文章</h2><p style="font-size:13px;color:#4a6fa5">藍色粗體部分為內容拓展示範。</p><div class="essay-box" style="white-space:normal;line-height:2">${parseEssayToHtml(currentReport.modelEssay)}</div>
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `實用寫作批改報告_${currentWork.name || '未命名'}.html`;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  if (isGenerating) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#B5726E] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#718096]">正在生成批改報告...</p>
      </div>
    </div>
  );

  if (!currentReport) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <p className="text-[#718096]">無法生成報告</p>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        <Button onClick={generateReport} className="mt-4 bg-[#B5726E]">重試</Button>
      </div>
    </div>
  );

  const { grading, contentScore, organizationScore, totalScore } = currentReport;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="max-w-6xl mx-auto">
      {error && <Alert className="mb-6 bg-yellow-50 border-yellow-200"><AlertTriangle className="w-4 h-4 text-yellow-600" /><AlertDescription className="text-yellow-700">{error}</AlertDescription></Alert>}

      <div className="grid lg:grid-cols-[280px_1fr_1fr] gap-4">
        {/* 左欄：評分調整 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-lg flex items-center gap-2"><Award className="w-5 h-5 text-[#B5726E]" />評分調整</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { field: 'info', label: '資訊分', max: 2 },
                { field: 'development', label: '內容發展', max: 8 },
                { field: 'tone', label: '行文語氣', max: 10 },
                { field: 'organization', label: '組織', max: 10 },
              ].map(({ field, label, max }) => (
                <div key={field} className="space-y-1">
                  <div className="flex justify-between text-sm"><span>{label}</span><span>{grading[field as keyof PracticalGrading]}/{max}</span></div>
                  <input type="range" min={0} max={max} value={grading[field as keyof PracticalGrading]} onChange={(e) => handleGradingChange(field as keyof PracticalGrading, parseInt(e.target.value))} className="w-full" />
                </div>
              ))}
              <div className="text-center pt-4 border-t">
                <p className="text-sm text-[#718096]">總分</p>
                <p className="text-3xl font-bold text-[#B5726E]">{totalScore}</p>
                <div className="text-sm text-[#718096] mt-1">內容：{contentScore}/30 | 行文組織：{organizationScore}/20</div>
                <Badge className="mt-2 bg-[#B5726E]">{getPracticalGradeLabel(totalScore)}</Badge>
              </div>
              <Button onClick={generateReport} variant="outline" className="w-full gap-2"><RefreshCw className="w-4 h-4" />重新生成</Button>
            </CardContent>
          </Card>

          {/* 格式自動核查 */}
          {formatCheckResults.length > 0 && (
            <Card className={formatIssueCount > 0 ? 'border-orange-300' : 'border-green-300'}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {formatIssueCount === 0
                    ? <><CheckSquare className="w-4 h-4 text-green-600" />格式核查：全部通過</>
                    : <><XSquare className="w-4 h-4 text-orange-500" />格式核查：{formatIssueCount} 項問題</>
                  }
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {formatCheckResults.map((result, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded ${result.passed ? 'bg-green-50' : 'bg-orange-50'}`}>
                    {result.passed
                      ? <CheckSquare className="w-3 h-3 text-green-600 flex-shrink-0 mt-0.5" />
                      : <XSquare className="w-3 h-3 text-orange-500 flex-shrink-0 mt-0.5" />
                    }
                    <div>
                      <div className={result.passed ? 'text-green-700' : 'text-orange-700'}>{result.label.split('（')[0]}</div>
                      {!result.passed && <div className="text-orange-500 font-medium">{result.deduction}</div>}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-[#718096] pt-1">* 系統自動偵測，僅供參考，以AI評語為準</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 中欄：學生原文 */}
        <div>
          <Card className="h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-[#718096]" />學生原文</CardTitle></CardHeader>
            <CardContent><div className="text-sm whitespace-pre-wrap leading-8 max-h-[70vh] overflow-y-auto text-[#2D3748]">{currentWork.correctedText}</div></CardContent>
          </Card>
        </div>

        {/* 右欄：批改報告 */}
        <div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><User className="w-5 h-5 text-[#B5726E]" /><span className="font-semibold">{currentWork.name || '未命名'}</span></div>
                <div className="flex items-center gap-4"><p className="text-2xl font-bold text-[#B5726E]">{totalScore}/50</p><Badge className="bg-[#B5726E]">{getPracticalGradeLabel(totalScore)}</Badge></div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="feedback">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="feedback">評語</TabsTrigger>
                  <TabsTrigger value="enhanced">增潤</TabsTrigger>
                  <TabsTrigger value="model">示範</TabsTrigger>
                </TabsList>
                <TabsContent value="feedback" className="mt-4 space-y-4">
                  <div><h3 className="font-semibold mb-2">總評</h3><p className="text-[#2D3748]">{currentReport.overallComment}</p></div>
                  {currentReport.formatIssues.length > 0 && (
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <h4 className="font-medium text-orange-700 mb-2">格式問題</h4>
                      <ul className="list-disc list-inside text-orange-700">{currentReport.formatIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
                    </div>
                  )}
                  {[
                    { title: '資訊', feedback: currentReport.infoFeedback },
                    { title: '內容發展', feedback: currentReport.developmentFeedback },
                    { title: '行文語氣', feedback: currentReport.toneFeedback },
                    { title: '組織', feedback: currentReport.organizationFeedback },
                  ].map((item) => (
                    <div key={item.title} className="border-t pt-4">
                      <h4 className="font-medium mb-2">{item.title}</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><p className="text-green-600 mb-1">優點：</p><ul className="list-disc list-inside">{item.feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                        <div><p className="text-orange-600 mb-1">改善：</p><ul className="list-disc list-inside">{item.feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                      </div>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="enhanced" className="mt-4">
                  <p className="text-xs text-[#718096] mb-2">藍色粗體部分為內容拓展示範，供學生參考。</p>
                  <div className="p-4 bg-[#F7F9FB] rounded-lg text-sm leading-8" dangerouslySetInnerHTML={{ __html: parseEssayToHtml(currentReport.enhancedText) }} />
                </TabsContent>
                <TabsContent value="model" className="mt-4">
                  <p className="text-xs text-[#718096] mb-2">藍色粗體部分為內容拓展示範，供學生參考。</p>
                  <div className="p-4 bg-[#F7F9FB] rounded-lg text-sm leading-8" dangerouslySetInnerHTML={{ __html: parseEssayToHtml(currentReport.modelEssay) }} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#E2E8F0] flex items-center justify-between px-6 z-40">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPrev} className="gap-2"><ChevronLeft className="w-4 h-4" />返回上一步</Button>
          {currentWorkIndex > 0 && <Button variant="outline" onClick={() => setCurrentWorkIndex(currentWorkIndex - 1)} className="gap-2"><ChevronLeft className="w-4 h-4" />上一篇</Button>}
        </div>
        <span className="text-sm text-[#718096]">{currentWorkIndex + 1} / {studentWorks.length}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownloadReport} className="gap-2"><FileText className="w-4 h-4" />下載 HTML</Button>
          {currentWorkIndex < studentWorks.length - 1 && <Button variant="outline" onClick={() => setCurrentWorkIndex(currentWorkIndex + 1)} className="gap-2">下一篇<ChevronRight className="w-4 h-4" /></Button>}
          <Button onClick={handleNextWork} className="gap-2 bg-[#B5726E] hover:bg-[#a5625e]">
            {currentWorkIndex < studentWorks.length - 1 ? '完成並下一篇' : '全班報告'}<ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
