import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Download, RefreshCw, Users, FileText,
  TrendingUp, Lightbulb, PenTool, Loader2, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useStore } from '@/hooks/useStore';
import { generateClassAnalysisWithAPI, isAPIAvailable } from '@/lib/api';
import { getPracticalGradeLabel } from '@/lib/gradingCriteria';
import type { APIConfig } from '@/types';

interface PracticalClassReportPageProps {
  onPrev: () => void;
}

const emptyAnalysis = {
  materialAnalysis: '',
  relevanceAnalysis: '',
  themeAnalysis: '',
  techniqueAnalysis: '',
  teachingSuggestion: '',
};

export function PracticalClassReportPage({ onPrev }: PracticalClassReportPageProps) {
  const {
    practicalReports,
    customQuestion,
    apiKey, apiType, apiModel,
    setAppMode, setStep,
  } = useStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<typeof emptyAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState({
    overallComment: true,
    info: true,
    development: true,
    tone: true,
    organization: true,
    enhancedText: true,
    modelEssay: true,
  });

  const question = customQuestion || '';

  // 統計計算
  const stats = useMemo(() => {
    if (practicalReports.length === 0) return null;
    const scores = practicalReports.map(r => r.totalScore);
    const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    const distribution = Array(5).fill(0); // 0-9,10-19,20-29,30-39,40-50
    scores.forEach(s => { const i = Math.min(Math.floor(s / 10), 4); distribution[i]++; });
    const avgInfo = (practicalReports.reduce((a, r) => a + r.grading.info, 0) / practicalReports.length).toFixed(1);
    const avgDev = (practicalReports.reduce((a, r) => a + r.grading.development, 0) / practicalReports.length).toFixed(1);
    const avgTone = (practicalReports.reduce((a, r) => a + r.grading.tone, 0) / practicalReports.length).toFixed(1);
    const avgOrg = (practicalReports.reduce((a, r) => a + r.grading.organization, 0) / practicalReports.length).toFixed(1);
    return {
      totalStudents: practicalReports.length,
      averageScore: avgScore,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      distribution,
      avgInfo, avgDev, avgTone, avgOrg,
    };
  }, [practicalReports]);

  // 找最弱維度（按百分比）
  const weakestDimension = useMemo(() => {
    if (!stats) return '';
    const dims = [
      { name: '內容發展', pct: parseFloat(stats.avgDev) / 8 },
      { name: '行文語氣', pct: parseFloat(stats.avgTone) / 10 },
      { name: '組織', pct: parseFloat(stats.avgOrg) / 10 },
    ];
    return dims.reduce((a, b) => a.pct < b.pct ? a : b).name;
  }, [stats]);

  const generateAIAnalysis = async () => {
    if (!isAPIAvailable(apiKey)) return;
    setIsGenerating(true); setError(null);
    try {
      const apiConfig: APIConfig = { apiKey, apiType: apiType as any, model: apiModel };
      const result = await generateClassAnalysisWithAPI(practicalReports, question, apiConfig, 'practical');
      setAnalysis(result);
    } catch (e: any) {
      setError(e.message || '生成分析失敗');
    } finally {
      setIsGenerating(false);
    }
  };

  // 清除無意義符號
  const cleanText = (s: string) => s ? s.replace(/\*+/g, '').replace(/#{1,6}\s?/g, '').replace(/_{2,}/g, '').trim() : '';

  const commonStyle = `
    body{font-family:"Microsoft JhengHei","PingFang HK",sans-serif;max-width:900px;margin:0 auto;padding:30px 20px;line-height:1.8;color:#333}
    h1{text-align:center;color:#B5726E;font-size:22px;margin-bottom:4px}
    h2{color:#B5726E;border-bottom:2px solid #B5726E;padding-bottom:5px;margin-top:30px;font-size:17px}
    h3{color:#555;margin-top:16px;font-size:15px}
    .meta{text-align:center;color:#718096;margin-bottom:24px;font-size:14px}
    .score-box{background:#f9f5f5;border:1px solid #B5726E;border-radius:8px;padding:16px 20px;margin:16px 0;display:flex;gap:24px;align-items:center;flex-wrap:wrap}
    .score-total{font-size:28px;font-weight:bold;color:#B5726E}
    .score-item{font-size:14px;color:#555}
    .strengths{background:#f0f7f0;padding:12px 16px;border-radius:6px;margin:8px 0;border-left:3px solid #5A9A7D}
    .improvements{background:#fff5f0;padding:12px 16px;border-radius:6px;margin:8px 0;border-left:3px solid #E89B5C}
    ul{margin:6px 0;padding-left:22px}li{margin:4px 0;font-size:14px}
    .card{background:#f9f9fb;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0;page-break-inside:avoid}
    table{border-collapse:collapse;width:100%;font-size:14px}
    th{background:#B5726E;color:white;padding:8px 10px;text-align:left}
    td{padding:6px 10px;border:1px solid #e2e8f0}
    @media print{.card{page-break-after:always}}
  `;

  // 導出1：各學生個別批改報告
  const handleDownloadAllStudentReports = (opts = downloadOptions) => {
    if (practicalReports.length === 0) return;
    const sorted = [...practicalReports].sort((a, b) => b.totalScore - a.totalScore);
    const reportCards = sorted.map(report => {
      const r = report;
      const orgBase = (r.grading as any).organizationBase;
      const orgDeduction = (r.grading as any).formatDeduction;
      const orgDisplay = (orgBase && orgDeduction && orgDeduction > 0)
        ? `${r.grading.organization}（${orgBase}-${orgDeduction}）`
        : `${r.grading.organization}`;
      const buildList = (items: string[]) => items.map(s => `<li>${cleanText(s)}</li>`).join('');
      const essayStyle = 'font-size:14px;line-height:2;white-space:pre-wrap;background:#f9f9fb;padding:14px;border-radius:6px;margin:8px 0';
      return `
      <div class="card">
        <h2>${r.studentWork.name || '未命名'}${r.studentWork.studentId ? ` (${r.studentWork.studentId})` : ''}</h2>
        <div class="score-box">
          <div><div class="score-total">${r.totalScore}/50</div><div style="font-size:13px;color:#718096">${getPracticalGradeLabel(r.totalScore)}</div></div>
          <div class="score-item"><b>資訊：</b>${r.grading.info}/2</div>
          <div class="score-item"><b>內容發展：</b>${r.grading.development}/8</div>
          <div class="score-item"><b>內容小計：</b>${r.contentScore}/30</div>
          <div class="score-item"><b>行文語氣：</b>${r.grading.tone}/10</div>
          <div class="score-item"><b>組織：</b>${orgDisplay}/10</div>
        </div>
        ${opts.overallComment ? `<h3>總評</h3><p>${cleanText(r.overallComment)}</p>` : ''}
        ${opts.info ? `<h3>資訊（${r.grading.info}/2）</h3>
        <div class="strengths"><b>優點：</b><ul>${buildList(r.infoFeedback.strengths)}</ul></div>
        <div class="improvements"><b>改善：</b><ul>${buildList(r.infoFeedback.improvements)}</ul></div>` : ''}
        ${opts.development ? `<h3>內容發展（${r.grading.development}/8）</h3>
        <div class="strengths"><b>優點：</b><ul>${buildList(r.developmentFeedback.strengths)}</ul></div>
        <div class="improvements"><b>改善：</b><ul>${buildList(r.developmentFeedback.improvements)}</ul></div>` : ''}
        ${opts.tone ? `<h3>行文語氣（${r.grading.tone}/10）</h3>
        <div class="strengths"><b>優點：</b><ul>${buildList(r.toneFeedback.strengths)}</ul></div>
        <div class="improvements"><b>改善：</b><ul>${buildList(r.toneFeedback.improvements)}</ul></div>` : ''}
        ${opts.organization ? `<h3>組織（${orgDisplay}/10）</h3>
        <div class="strengths"><b>優點：</b><ul>${buildList(r.organizationFeedback.strengths)}</ul></div>
        <div class="improvements"><b>改善：</b><ul>${buildList(r.organizationFeedback.improvements)}</ul></div>
        ${r.formatIssues?.length > 0 ? `<div style="background:#fff8e6;padding:12px;border-radius:6px;border-left:3px solid #E8A838;margin:8px 0"><b>格式問題：</b><ul>${r.formatIssues.map((i: string) => `<li>${cleanText(i)}</li>`).join('')}</ul></div>` : ''}` : ''}
        ${opts.enhancedText && r.enhancedText ? `<h3>增潤文章</h3><div style="${essayStyle}">${cleanText(r.enhancedText)}</div>` : ''}
        ${opts.modelEssay && r.modelEssay ? `<h3>示範文章</h3><div style="${essayStyle}">${cleanText(r.modelEssay)}</div>` : ''}
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="zh-HK"><head><meta charset="UTF-8">
      <title>各學生實用寫作批改報告</title><style>${commonStyle}</style></head><body>
      <h1>各學生實用寫作批改報告</h1>
      <p class="meta">題目：${question} ｜ 共 ${sorted.length} 人</p>
      ${reportCards}</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `各學生實用批改報告_${new Date().toLocaleDateString('zh-HK').replace(/\//g, '-')}.html`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  // 導出2：全班總體報告（統計 + AI分析 + 學生列表）
  const handleDownloadClassSummary = () => {
    if (!stats) return;
    const sorted = [...practicalReports].sort((a, b) => b.totalScore - a.totalScore);

    const studentTableRows = sorted.map((r, i) => {
      const scoreColor = r.totalScore >= 40 ? '#5A9A7D' : r.totalScore >= 25 ? '#4A6FA5' : '#B5726E';
      return `<tr>
        <td>${i + 1}</td>
        <td>${r.studentWork.name || '未命名'}</td>
        <td style="text-align:center">${r.grading.info}</td>
        <td style="text-align:center">${r.grading.development}</td>
        <td style="text-align:center">${r.contentScore}</td>
        <td style="text-align:center">${r.grading.tone}</td>
        <td style="text-align:center">${r.grading.organization}</td>
        <td style="text-align:center;font-weight:bold;color:${scoreColor}">${r.totalScore}</td>
        <td style="text-align:center">${getPracticalGradeLabel(r.totalScore)}</td>
      </tr>`;
    }).join('');

    const analysisHtml = analysis ? `
      <h2>整體分析</h2>
      ${[
        ['內容資訊分析', analysis.materialAnalysis],
        ['內容發展分析', analysis.relevanceAnalysis],
        ['行文語氣分析', analysis.themeAnalysis],
        ['組織結構分析', analysis.techniqueAnalysis],
      ].map(([title, content]) => content ? `<h3>${title}</h3><p style="line-height:1.9">${cleanText(content as string)}</p>` : '').join('')}
      ${analysis.teachingSuggestion ? `<h2>教學建議</h2><p style="line-height:1.9">${cleanText(analysis.teachingSuggestion)}</p>` : ''}
    ` : '<p style="color:#718096">（尚未生成AI分析，請在頁面上按「AI生成分析」後再導出）</p>';

    const html = `<!DOCTYPE html><html lang="zh-HK"><head><meta charset="UTF-8">
      <title>全班實用寫作總體報告</title><style>${commonStyle}</style></head><body>
      <h1>全班實用寫作總體報告</h1>
      <p class="meta">題目：${question} ｜ 共 ${stats.totalStudents} 人 ｜ ${new Date().toLocaleDateString('zh-HK')}</p>

      <h2>成績統計</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:16px 0">
        ${[['平均分', stats.averageScore, '#B5726E'],['最高分', stats.maxScore, '#5A9A7D'],['最低分', stats.minScore, '#E89B5C'],['總人數', stats.totalStudents, '#718096']]
          .map(([label, val, color]) => `<div style="background:#f9f5f5;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center"><div style="font-size:13px;color:#718096">${label}</div><div style="font-size:24px;font-weight:bold;color:${color}">${val}</div></div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:16px 0">
        ${[['資訊平均', stats.avgInfo, '/ 2'],['內容發展平均', stats.avgDev, '/ 8'],['行文語氣平均', stats.avgTone, '/ 10'],['組織平均', stats.avgOrg, '/ 10']]
          .map(([label, val, max]) => `<div style="background:#fff5f5;border:1px solid #e8c8c8;border-radius:8px;padding:12px;text-align:center"><div style="font-size:12px;color:#718096">${label}</div><div style="font-size:20px;font-weight:bold;color:#B5726E">${val} <span style="font-size:12px;color:#718096">${max}</span></div></div>`).join('')}
      </div>
      <p style="color:#B5726E;font-size:14px">本班最弱維度：<strong>${weakestDimension}</strong></p>

      ${analysisHtml}

      <h2>學生成績列表</h2>
      <table>
        <thead><tr>
          <th>排名</th><th>姓名</th><th>資訊(/2)</th><th>發展(/8)</th><th>內容(/30)</th><th>語氣(/10)</th><th>組織(/10)</th><th>總分(/50)</th><th>等級</th>
        </tr></thead>
        <tbody>${studentTableRows}</tbody>
      </table>
    </body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `全班實用批改總體報告_${new Date().toLocaleDateString('zh-HK').replace(/\//g, '-')}.html`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  // 導出CSV
  const handleDownloadCSV = () => {
    if (practicalReports.length === 0) return;
    const headers = ['姓名', '學號', '資訊(/2)', '內容發展(/8)', '內容小計(/30)', '行文語氣(/10)', '組織(/10)', '總分(/50)', '等級'];
    const rows = practicalReports.map(r => [
      r.studentWork.name || '未命名', r.studentWork.studentId || '',
      r.grading.info, r.grading.development, r.contentScore,
      r.grading.tone, r.grading.organization, r.totalScore, getPracticalGradeLabel(r.totalScore),
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `實用批改成績_${new Date().toLocaleDateString('zh-HK').replace(/\//g, '-')}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  if (practicalReports.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-[#718096]">沒有批改報告數據</p>
      </div>
    );
  }

  const sorted = [...practicalReports].sort((a, b) => b.totalScore - a.totalScore);
  const distLabels = ['0-9', '10-19', '20-29', '30-39', '40-50'];
  const maxDist = stats ? Math.max(...stats.distribution, 1) : 1;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="max-w-6xl mx-auto pb-24">

      {/* 統計概覽 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: '總人數', value: stats?.totalStudents, color: 'text-[#718096]' },
          { label: '平均分', value: stats?.averageScore, color: 'text-[#B5726E]' },
          { label: '最高分', value: stats?.maxScore, color: 'text-[#5A9A7D]' },
          { label: '最低分', value: stats?.minScore, color: 'text-[#B5726E]' },
        ].map(({ label, value, color }) => (
          <Card key={label}><CardContent className="pt-6">
            <p className="text-sm text-[#718096]">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* 各維度平均 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#B5726E]" />各維度平均分
            {weakestDimension && <Badge className="ml-2 bg-[#B5726E] text-xs">最弱：{weakestDimension}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: '資訊', value: stats?.avgInfo, max: 2, color: '#718096' },
              { label: '內容發展', value: stats?.avgDev, max: 8, color: '#B5726E' },
              { label: '行文語氣', value: stats?.avgTone, max: 10, color: '#5A9A7D' },
              { label: '組織', value: stats?.avgOrg, max: 10, color: '#C9A959' },
            ].map(dim => (
              <div key={dim.label}>
                <div className="text-xs text-[#718096] mb-1">{dim.label} (/{dim.max})</div>
                <div className="text-xl font-bold" style={{ color: dim.color }}>{dim.value}</div>
                <div className="mt-2 bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: `${(parseFloat(dim.value || '0') / dim.max) * 100}%`, backgroundColor: dim.color }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 分數分佈 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#B5726E]" />分數分佈（/50）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-32">
            {stats?.distribution.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-[#718096]">{count > 0 ? count : ''}</span>
                <div className="w-full rounded-t" style={{ height: `${(count / maxDist) * 96}px`, minHeight: count > 0 ? '4px' : '0', backgroundColor: i >= 4 ? '#5A9A7D' : i >= 3 ? '#4A6FA5' : i >= 2 ? '#C9A959' : '#B5726E' }} />
                <span className="text-[10px] text-[#718096] text-center leading-tight">{distLabels[i]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 報告 Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="students">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="students">學生列表</TabsTrigger>
              <TabsTrigger value="feedback">整體分析</TabsTrigger>
              <TabsTrigger value="teaching">教學建議</TabsTrigger>
            </TabsList>

            <TabsContent value="students" className="mt-4">
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead className="text-center">資訊</TableHead>
                      <TableHead className="text-center">發展</TableHead>
                      <TableHead className="text-center">語氣</TableHead>
                      <TableHead className="text-center">組織</TableHead>
                      <TableHead className="text-center">總分</TableHead>
                      <TableHead className="text-center">等級</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((report) => (
                      <TableRow key={report.studentWork.id}>
                        <TableCell className="font-medium">{report.studentWork.name || '未命名'}</TableCell>
                        <TableCell className="text-center">{report.grading.info}/2</TableCell>
                        <TableCell className="text-center">{report.grading.development}/8</TableCell>
                        <TableCell className="text-center">{report.grading.tone}/10</TableCell>
                        <TableCell className="text-center">{report.grading.organization}/10</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${report.totalScore >= 40 ? 'text-[#5A9A7D]' : report.totalScore >= 25 ? 'text-[#4A6FA5]' : 'text-[#B5726E]'}`}>
                            {report.totalScore}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-[#B5726E] text-xs">{getPracticalGradeLabel(report.totalScore)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="feedback" className="mt-4 space-y-4">
              {!analysis ? (
                <div className="text-center py-12 text-[#718096]">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="mb-4">按下方按鈕，AI 將根據本班實際批改結果生成分析</p>
                  <Button onClick={generateAIAnalysis} disabled={isGenerating || !isAPIAvailable(apiKey)} className="gap-2 bg-[#B5726E] hover:bg-[#a5625e]">
                    {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : <><RefreshCw className="w-4 h-4" />生成 AI 分析</>}
                  </Button>
                  {!isAPIAvailable(apiKey) && <p className="text-xs mt-2 text-[#B5726E]">請先設定 API 密鑰</p>}
                </div>
              ) : (
                <>
                  {[
                    { icon: BarChart3, title: '內容資訊分析', key: 'materialAnalysis' },
                    { icon: TrendingUp, title: '內容發展分析', key: 'relevanceAnalysis' },
                    { icon: Users, title: '行文語氣分析', key: 'themeAnalysis' },
                    { icon: FileText, title: '組織結構分析', key: 'techniqueAnalysis' },
                  ].map(({ icon: Icon, title, key }) => (
                    <div key={key}>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Icon className="w-5 h-5 text-[#B5726E]" />{title}
                      </h3>
                      <div className="p-4 bg-[#F7F9FB] rounded-lg text-sm leading-relaxed">
                        {analysis[key as keyof typeof analysis]}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </TabsContent>

            <TabsContent value="teaching" className="mt-4">
              {!analysis ? (
                <div className="text-center py-12 text-[#718096]">
                  <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>先在「整體分析」Tab 生成 AI 分析</p>
                </div>
              ) : (
                <div className="p-4 bg-[#F7F9FB] rounded-lg text-sm leading-relaxed">
                  {analysis.teachingSuggestion}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {error && (
        <Alert className="mt-4 bg-yellow-50 border-yellow-200">
          <AlertDescription className="text-yellow-700">{error}</AlertDescription>
        </Alert>
      )}

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#E2E8F0] flex items-center justify-between px-6 z-40">
        <Button variant="outline" onClick={onPrev} className="gap-2">
          <ChevronLeft className="w-4 h-4" />返回批改
        </Button>
        <div className="flex items-center gap-2">
          {isAPIAvailable(apiKey) && (
            <Button variant="outline" onClick={generateAIAnalysis} disabled={isGenerating} className="gap-2">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isGenerating ? '生成中...' : 'AI 生成分析'}
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadCSV} className="gap-2">
            <Download className="w-4 h-4" />成績CSV
          </Button>
          <Button variant="outline" onClick={() => setShowDownloadDialog(true)} className="gap-2">
            <FileText className="w-4 h-4" />各學生報告HTML
          </Button>
          <Button variant="outline" onClick={handleDownloadClassSummary} className="gap-2">
            <FileText className="w-4 h-4" />全班總體報告HTML
          </Button>
          <Button onClick={() => { setAppMode('exam-generator'); setStep(0); }} className="gap-2 bg-[#B5726E] hover:bg-[#a5625e]">
            <PenTool className="w-4 h-4" />針對弱項生成模擬卷
          </Button>
        </div>
      </div>
    {/* 下載選項 Dialog */}
    <AlertDialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>選擇下載內容</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          {([
            { key: 'overallComment', label: '總評' },
            { key: 'info',           label: '資訊評語' },
            { key: 'development',    label: '內容發展評語' },
            { key: 'tone',           label: '行文語氣評語' },
            { key: 'organization',   label: '組織評語' },
            { key: 'enhancedText',   label: '增潤文章' },
            { key: 'modelEssay',     label: '示範文章' },
          ] as const).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <Checkbox
                id={`pdl-${key}`}
                checked={downloadOptions[key]}
                onCheckedChange={(checked) =>
                  setDownloadOptions(prev => ({ ...prev, [key]: !!checked }))
                }
              />
              <label htmlFor={`pdl-${key}`} className="text-sm cursor-pointer select-none">{label}</label>
            </div>
          ))}
          <div className="flex gap-3 pt-1 border-t">
            <button className="text-xs text-[#B5726E] underline" onClick={() =>
              setDownloadOptions({ overallComment: true, info: true, development: true, tone: true, organization: true, enhancedText: true, modelEssay: true })
            }>全選</button>
            <button className="text-xs text-[#718096] underline" onClick={() =>
              setDownloadOptions({ overallComment: false, info: false, development: false, tone: false, organization: false, enhancedText: false, modelEssay: false })
            }>全不選</button>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-[#B5726E] hover:bg-[#a5625e]"
            onClick={() => { setShowDownloadDialog(false); handleDownloadAllStudentReports(downloadOptions); }}
          >
            下載
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    </motion.div>
  );
}
