import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Download, RefreshCw, Users, FileText,
  TrendingUp, BookOpen, Lightbulb, PenTool, Loader2,
  BarChart3, PenSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStore } from '@/hooks/useStore';
import { exportClassReportToWord } from '@/lib/export';
import { generateClassAnalysisWithAPI, isAPIAvailable } from '@/lib/api';
import type { APIConfig } from '@/types';

interface ClassReportPageProps {
  onPrev: () => void;
}

export function ClassReportPage({ onPrev }: ClassReportPageProps) {
  const {
    secondaryReports,
    selectedQuestion,
    customQuestion,
    useCustomQuestion,
    apiKey,
    apiType,
    apiModel,
    setAppMode,
    setStep,
  } = useStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<typeof emptyAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const question = useCustomQuestion ? customQuestion : selectedQuestion?.title || '';

  const emptyAnalysis = {
    materialAnalysis: '',
    relevanceAnalysis: '',
    themeAnalysis: '',
    techniqueAnalysis: '',
    teachingSuggestion: '',
  };

  // 計算統計數據
  const stats = useMemo(() => {
    if (secondaryReports.length === 0) return null;
    const scores = secondaryReports.map(r => r.totalScore);
    const totalStudents = secondaryReports.length;
    const averageScore = scores.reduce((a, b) => a + b, 0) / totalStudents;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    // 分數分佈（每10分一區間：0-9, 10-19, ..., 90-100）
    const distribution = Array(10).fill(0);
    scores.forEach(score => {
      const index = Math.min(Math.floor(score / 10), 9);
      distribution[index]++;
    });

    // 各維度平均
    const avgContent = secondaryReports.reduce((a, r) => a + r.grading.content * 4, 0) / totalStudents;
    const avgExpression = secondaryReports.reduce((a, r) => a + r.grading.expression * 3, 0) / totalStudents;
    const avgStructure = secondaryReports.reduce((a, r) => a + r.grading.structure * 2, 0) / totalStudents;
    const avgPunctuation = secondaryReports.reduce((a, r) => a + r.grading.punctuation, 0) / totalStudents;

    return {
      totalStudents,
      averageScore: averageScore.toFixed(1),
      maxScore,
      minScore,
      distribution,
      avgContent: avgContent.toFixed(1),
      avgExpression: avgExpression.toFixed(1),
      avgStructure: avgStructure.toFixed(1),
      avgPunctuation: avgPunctuation.toFixed(1),
    };
  }, [secondaryReports]);

  // 找出最弱維度（供生成模擬卷用）
  const weakestDimension = useMemo(() => {
    if (!stats) return '';
    const dims = [
      { name: '內容', score: parseFloat(stats.avgContent), max: 40 },
      { name: '表達', score: parseFloat(stats.avgExpression), max: 30 },
      { name: '結構', score: parseFloat(stats.avgStructure), max: 20 },
    ];
    const weakest = dims.reduce((a, b) => (a.score / a.max < b.score / b.max ? a : b));
    return weakest.name;
  }, [stats]);

  const generateAIAnalysis = async () => {
    if (!isAPIAvailable(apiKey)) {
      setError('請先設定 API 密鑰');
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const apiConfig: APIConfig = { apiKey, apiType: apiType as any, model: apiModel };
      const result = await generateClassAnalysisWithAPI(secondaryReports, question, apiConfig, 'secondary');
      setAnalysis(result);
    } catch (e: any) {
      setError(`生成 AI 分析失敗: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 【一鍵下載全部】：匯出CSV成績表
  const handleDownloadCSV = () => {
    if (secondaryReports.length === 0) return;

    const headers = ['姓名', '學號', '內容(/40)', '表達(/30)', '結構(/20)', '標點(/10)', '總分(/100)'];
    const rows = secondaryReports.map(r => [
      r.studentWork.name || '未命名',
      r.studentWork.studentId || '',
      r.grading.content * 4,
      r.grading.expression * 3,
      r.grading.structure * 2,
      r.grading.punctuation,
      r.totalScore,
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // 加BOM讓Excel正確顯示中文
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `全班成績_${new Date().toLocaleDateString('zh-HK')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 【一鍵下載全部】：匯出所有學生報告為單一HTML
  const handleDownloadAllHTML = () => {
    if (secondaryReports.length === 0) return;

    const reportCards = secondaryReports.map(report => `
      <div class="report-card" style="page-break-after:always;padding:30px;border-bottom:3px solid #4A6FA5;margin-bottom:30px">
        <h2 style="color:#4A6FA5">${report.studentWork.name || '未命名'} ${report.studentWork.studentId ? `(${report.studentWork.studentId})` : ''}</h2>
        <div class="score-row" style="display:flex;gap:20px;margin:15px 0;flex-wrap:wrap">
          <span><b>內容：</b>${report.grading.content * 4}/40</span>
          <span><b>表達：</b>${report.grading.expression * 3}/30</span>
          <span><b>結構：</b>${report.grading.structure * 2}/20</span>
          <span><b>標點：</b>${report.grading.punctuation}/10</span>
          <span style="font-size:1.2em;font-weight:bold;color:#4A6FA5"><b>總分：</b>${report.totalScore}/100</span>
        </div>
        <h3>總評</h3><p>${report.overallComment}</p>
        <h3>內容</h3>
        <p><b>優點：</b>${report.contentFeedback.strengths.join('；')}</p>
        <p><b>改善：</b>${report.contentFeedback.improvements.join('；')}</p>
        <h3>表達</h3>
        <p><b>優點：</b>${report.expressionFeedback.strengths.join('；')}</p>
        <p><b>改善：</b>${report.expressionFeedback.improvements.join('；')}</p>
        <h3>結構</h3>
        <p><b>優點：</b>${report.structureFeedback.strengths.join('；')}</p>
        <p><b>改善：</b>${report.structureFeedback.improvements.join('；')}</p>
      </div>
    `).join('');

    const html = `<!DOCTYPE html><html lang="zh-HK"><head><meta charset="UTF-8">
      <title>全班批改報告</title>
      <style>body{font-family:"Microsoft JhengHei","PingFang HK",sans-serif;max-width:900px;margin:0 auto;padding:20px;line-height:1.8}h2{margin-top:0}h3{color:#555;margin-top:15px}</style>
    </head><body>
      <h1 style="text-align:center;color:#4A6FA5">全班批改報告</h1>
      <p style="text-align:center;color:#718096">題目：${question}</p>
      ${reportCards}
    </body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `全班批改報告_${new Date().toLocaleDateString('zh-HK')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 【生成模擬卷快捷入口】：跳到模擬卷生成頁並帶入弱點資訊
  const handleGenerateExam = () => {
    setAppMode('exam-generator');
    setStep(0);
  };

  const handleExportClassReport = async () => {
    if (!stats) return;
    await exportClassReportToWord(secondaryReports, question, stats, analysis || undefined);
  };

  if (secondaryReports.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-[#718096]">沒有批改報告數據</p>
      </div>
    );
  }

  const distLabels = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'];
  const maxDist = stats ? Math.max(...stats.distribution, 1) : 1;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto pb-24"
    >
      {/* 統計概覽 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-[#718096]">總人數</p>
          <p className="text-2xl font-bold text-[#4A6FA5]">{stats?.totalStudents}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-[#718096]">平均分</p>
          <p className="text-2xl font-bold text-[#4A6FA5]">{stats?.averageScore}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-[#718096]">最高分</p>
          <p className="text-2xl font-bold text-[#5A9A7D]">{stats?.maxScore}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-[#718096]">最低分</p>
          <p className="text-2xl font-bold text-[#B5726E]">{stats?.minScore}</p>
        </CardContent></Card>
      </div>

      {/* 各維度平均 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#4A6FA5]" />
            各維度平均分
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: '內容', value: stats?.avgContent, max: 40, color: '#4A6FA5' },
              { label: '表達', value: stats?.avgExpression, max: 30, color: '#5A9A7D' },
              { label: '結構', value: stats?.avgStructure, max: 20, color: '#C9A959' },
              { label: '標點', value: stats?.avgPunctuation, max: 10, color: '#B5726E' },
            ].map(dim => (
              <div key={dim.label}>
                <div className="text-xs text-[#718096] mb-1">{dim.label} (/{dim.max})</div>
                <div className="text-xl font-bold" style={{ color: dim.color }}>{dim.value}</div>
                <div className="mt-2 bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${(parseFloat(dim.value || '0') / dim.max) * 100}%`,
                      backgroundColor: dim.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 分數分佈圖 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#4A6FA5]" />
            分數分佈
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-32">
            {stats?.distribution.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-[#718096]">{count > 0 ? count : ''}</span>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${(count / maxDist) * 96}px`,
                    minHeight: count > 0 ? '4px' : '0',
                    backgroundColor: i >= 7 ? '#5A9A7D' : i >= 5 ? '#4A6FA5' : i >= 3 ? '#C9A959' : '#B5726E',
                  }}
                />
                <span className="text-[10px] text-[#718096] leading-tight text-center">{distLabels[i]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 主內容 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-[#4A6FA5]" />
              全班寫作報告
            </CardTitle>
            {analysis && <Badge className="bg-green-100 text-green-700">AI 生成分析</Badge>}
          </div>
          <p className="text-sm text-[#718096]">{question}</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="students" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="students">學生列表</TabsTrigger>
              <TabsTrigger value="feedback">整體分析</TabsTrigger>
              <TabsTrigger value="teaching">教學建議</TabsTrigger>
            </TabsList>

            {/* 學生列表 */}
            <TabsContent value="students" className="mt-6">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>學號</TableHead>
                      <TableHead className="text-center">內容<br/>/40</TableHead>
                      <TableHead className="text-center">表達<br/>/30</TableHead>
                      <TableHead className="text-center">結構<br/>/20</TableHead>
                      <TableHead className="text-center">標點<br/>/10</TableHead>
                      <TableHead className="text-center font-bold">總分<br/>/100</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {secondaryReports
                      .slice()
                      .sort((a, b) => b.totalScore - a.totalScore)
                      .map((report) => (
                      <TableRow key={report.studentWork.id}>
                        <TableCell className="font-medium">{report.studentWork.name || '未命名'}</TableCell>
                        <TableCell className="text-[#718096]">{report.studentWork.studentId || '-'}</TableCell>
                        <TableCell className="text-center">{report.grading.content * 4}</TableCell>
                        <TableCell className="text-center">{report.grading.expression * 3}</TableCell>
                        <TableCell className="text-center">{report.grading.structure * 2}</TableCell>
                        <TableCell className="text-center">{report.grading.punctuation}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold text-lg ${
                            report.totalScore >= 70 ? 'text-[#5A9A7D]' :
                            report.totalScore >= 50 ? 'text-[#4A6FA5]' : 'text-[#B5726E]'
                          }`}>{report.totalScore}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            {/* 整體分析 */}
            <TabsContent value="feedback" className="mt-6 space-y-6">
              {!analysis ? (
                <div className="text-center py-12 text-[#718096]">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="mb-4">按下方按鈕，AI 將根據本班實際批改結果生成分析</p>
                  <Button onClick={generateAIAnalysis} disabled={isGenerating || !isAPIAvailable(apiKey)} className="gap-2 bg-[#4A6FA5]">
                    {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" />生成中...</> : <><RefreshCw className="w-4 h-4" />生成 AI 分析</>}
                  </Button>
                  {!isAPIAvailable(apiKey) && <p className="text-xs mt-2 text-[#B5726E]">請先設定 API 密鑰</p>}
                </div>
              ) : (
                <>
                  {[
                    { icon: BookOpen, title: '選材分析', key: 'materialAnalysis' },
                    { icon: TrendingUp, title: '扣題分析', key: 'relevanceAnalysis' },
                    { icon: Lightbulb, title: '立意分析', key: 'themeAnalysis' },
                    { icon: PenTool, title: '寫作手法分析', key: 'techniqueAnalysis' },
                  ].map(({ icon: Icon, title, key }) => (
                    <div key={key}>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Icon className="w-5 h-5 text-[#4A6FA5]" />{title}
                      </h3>
                      <div className="p-4 bg-[#F7F9FB] rounded-lg whitespace-pre-wrap text-sm leading-relaxed">
                        {analysis[key as keyof typeof analysis]}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </TabsContent>

            {/* 教學建議 */}
            <TabsContent value="teaching" className="mt-6">
              {!analysis ? (
                <div className="text-center py-12 text-[#718096]">
                  <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="mb-4">先在「整體分析」Tab 生成 AI 分析</p>
                </div>
              ) : (
                <div className="p-4 bg-[#F7F9FB] rounded-lg whitespace-pre-wrap text-sm leading-relaxed">
                  {analysis.teachingSuggestion}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 根據本班弱點生成模擬卷 */}
      {stats && (
        <Card className="mt-6 border-[#4A6FA5] bg-gradient-to-r from-blue-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-semibold text-[#4A6FA5] flex items-center gap-2">
                  <PenSquare className="w-5 h-5" />
                  根據本班弱點生成實用寫作模擬卷
                </h3>
                <p className="text-sm text-[#718096] mt-1">
                  本班最弱維度：<span className="font-medium text-[#B5726E]">{weakestDimension}</span>
                  （平均{
                    weakestDimension === '內容' ? stats.avgContent + '/40' :
                    weakestDimension === '表達' ? stats.avgExpression + '/30' :
                    stats.avgStructure + '/20'
                  }）
                  ——可生成針對性練習題讓同學加強
                </p>
              </div>
              <Button onClick={handleGenerateExam} className="gap-2 bg-[#4A6FA5] hover:bg-[#3a5f95] whitespace-nowrap">
                <PenSquare className="w-4 h-4" />
                前往模擬卷生成
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert className="mt-4 bg-yellow-50 border-yellow-200">
          <AlertDescription className="text-yellow-700">{error}</AlertDescription>
        </Alert>
      )}

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#E2E8F0] flex items-center justify-between px-6 z-40">
        <Button variant="outline" onClick={onPrev} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          返回上一步
        </Button>
        <div className="flex items-center gap-2">
          {isAPIAvailable(apiKey) && (
            <Button variant="outline" onClick={generateAIAnalysis} disabled={isGenerating} className="gap-2">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isGenerating ? '生成中...' : 'AI 生成分析'}
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadCSV} className="gap-2">
            <Download className="w-4 h-4" />
            下載成績CSV
          </Button>
          <Button variant="outline" onClick={handleExportClassReport} className="gap-2">
            <FileText className="w-4 h-4" />
            下載報告HTML
          </Button>
          <Button onClick={handleDownloadAllHTML} className="gap-2 bg-[#4A6FA5] hover:bg-[#3a5f95]">
            <Download className="w-4 h-4" />
            一鍵下載全部報告
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
