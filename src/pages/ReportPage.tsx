import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, RefreshCw, FileText, User, Award, AlertTriangle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStore } from '@/hooks/useStore';
import { GradingSlider } from '@/components/GradingSlider';
import { ReportSection } from '@/components/ReportSection';
import { ComparisonView } from '@/components/ComparisonView';
import type { SecondaryReport, SecondaryGrading } from '@/types';
import {
  getGradeLabel,
  validateGrading,
  getMaxStructureScore,
} from '@/lib/gradingCriteria';
import { exportReportToWord } from '@/lib/export';
import { gradeSecondaryEssayWithAPI, isAPIAvailable, BACKEND_URL } from '@/lib/api';
import type { APIConfig } from '@/types';

interface ReportPageProps {
  onNext: () => void;
  onPrev: () => void;
}

function generateMockReport(studentWork: any, question: string): SecondaryReport {
  const grading: SecondaryGrading = { content: 5, expression: 5, structure: 5, punctuation: 7 };
  const totalScore = (grading.content * 4) + (grading.expression * 3) + (grading.structure * 2) + grading.punctuation;
  return {
    studentWork,
    grading,
    totalScore,
    gradeLabel: getGradeLabel(totalScore),
    overallComment: `本文能圍繞「${question.substring(0, 20)}」的主題展開，立意尚算明確，取材大致恰當。惟內容深度有待加強，論述可更為飽滿。`,
    contentFeedback: { strengths: ['立意尚算明確'], improvements: ['內容深度有待加強'] },
    expressionFeedback: { strengths: ['文句大致通順'], improvements: ['用詞可更精準豐富'] },
    structureFeedback: { strengths: ['結構完整'], improvements: ['詳略安排可更得宜'] },
    punctuationFeedback: { strengths: ['標點大致正確'], improvements: ['部分標點可更準確'] },
    enhancedText: studentWork.correctedText,
    enhancementNotes: ['（模擬數據）'],
    modelEssay: '（模擬數據）',
  };
}

export function ReportPage({ onNext, onPrev }: ReportPageProps) {
  const {
    studentWorks,
    currentWorkIndex,
    secondaryReports,
    selectedQuestion,
    customQuestion,
    useCustomQuestion,
    customCriteria,
    apiKey,
    apiType,
    apiModel,
    addSecondaryReport,
    updateSecondaryReportGrading,
    contentPriority,
    enhancementDirection,
    setCurrentWorkIndex,
    setStep,
  } = useStore();

  const [currentReport, setCurrentReport] = useState<SecondaryReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegeneratingFeedback, setIsRegeneratingFeedback] = useState(false);
  const [gradingChanged, setGradingChanged] = useState(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 用 ref 追蹤目前正在批改的 workId，避免 useEffect 重複觸發
  const generatingForId = useRef<string | null>(null);

  const question = useCustomQuestion ? customQuestion : selectedQuestion?.title || '';
  const currentWork = studentWorks[currentWorkIndex];

  useEffect(() => {
    if (!currentWork) return;

    // 已有報告，直接顯示
    const existingReport = secondaryReports.find(r => r.studentWork.id === currentWork.id);
    if (existingReport) {
      setCurrentReport(existingReport);
      setGradingChanged(false);
      return;
    }

    // 避免對同一篇文章重複觸發生成
    if (generatingForId.current === currentWork.id) return;

    generateReportForWork(currentWork);
  }, [currentWorkIndex, currentWork?.id]);
  // 注意：依賴只用 currentWorkIndex 和 currentWork.id，不依賴 secondaryReports
  // 避免 addSecondaryReport 後再次觸發 useEffect

  const generateReportForWork = async (work: typeof currentWork) => {
    if (!work) return;
    generatingForId.current = work.id;
    setIsGenerating(true);
    setError(null);
    setGradingChanged(false);
    setCurrentReport(null);

    try {
      let newReport: SecondaryReport;
      if (isAPIAvailable(apiKey)) {
        try {
          const apiConfig: APIConfig = { apiKey, apiType: apiType as any, model: apiModel };
          const apiResult = await gradeSecondaryEssayWithAPI(
            work.correctedText,
            question,
            customCriteria,
            apiConfig,
            { contentPriority, enhancementDirection }
          );
          newReport = { ...apiResult, studentWork: work };
        } catch (apiError: any) {
          setError(`API 批改失敗: ${apiError.message}，已切換至模擬數據`);
          newReport = generateMockReport(work, question);
        }
      } else {
        newReport = generateMockReport(work, question);
      }
      addSecondaryReport(newReport);
      setCurrentReport(newReport);
    } catch (err: any) {
      setError(err.message || '生成報告失敗');
    } finally {
      setIsGenerating(false);
      generatingForId.current = null;
    }
  };

  // 重新生成整份報告（含增潤和示範）
  const handleRegenerate = () => {
    if (!currentWork) return;
    generatingForId.current = null; // 重置，允許重新生成
    generateReportForWork(currentWork);
  };

  // 【按老師評分重新生成評語】（不重新生成增潤文章和示範文章）
  const handleRegenerateFeedback = async () => {
    if (!currentReport || !currentWork) return;
    setIsRegeneratingFeedback(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          apiType,
          model: apiModel,
          essayText: currentWork.correctedText,
          question,
          gradingMode: 'secondary',
          regenerateFeedbackOnly: true,
          teacherGrading: currentReport.grading,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '重新生成評語失敗');

      const updatedReport: SecondaryReport = {
        ...currentReport,
        overallComment: data.overallComment || currentReport.overallComment,
        contentFeedback: data.contentFeedback || currentReport.contentFeedback,
        expressionFeedback: data.expressionFeedback || currentReport.expressionFeedback,
        structureFeedback: data.structureFeedback || currentReport.structureFeedback,
        punctuationFeedback: data.punctuationFeedback || currentReport.punctuationFeedback,
        // 保留原有增潤和示範
        enhancedText: currentReport.enhancedText,
        enhancementNotes: currentReport.enhancementNotes,
        modelEssay: currentReport.modelEssay,
      };
      addSecondaryReport(updatedReport);
      setCurrentReport(updatedReport);
      setGradingChanged(false);
    } catch (err: any) {
      setError(`重新生成評語失敗: ${err.message}`);
    } finally {
      setIsRegeneratingFeedback(false);
    }
  };

  const handleGradingChange = (field: keyof SecondaryGrading, value: number) => {
    if (!currentReport) return;
    const newGrading = { ...currentReport.grading, [field]: value };
    if (field === 'content' || field === 'structure') {
      const validation = validateGrading(newGrading.content, newGrading.structure);
      setValidationWarning(validation.valid ? null : validation.message || null);
    }
    const newTotalScore = (newGrading.content * 4) + (newGrading.expression * 3) + (newGrading.structure * 2) + newGrading.punctuation;
    updateSecondaryReportGrading(currentWork.id, newGrading);
    setCurrentReport({
      ...currentReport,
      grading: newGrading,
      totalScore: newTotalScore,
      gradeLabel: getGradeLabel(newTotalScore),
    });
    setGradingChanged(true);
  };

  const handleExportWord = async () => {
    if (!currentReport) return;
    await exportReportToWord(currentReport, question);
  };

  const handleNextWork = () => {
    if (currentWorkIndex < studentWorks.length - 1) {
      setCurrentWorkIndex(currentWorkIndex + 1);
    } else {
      setStep(3);
      onNext();
    }
  };

  const handlePrevWork = () => {
    if (currentWorkIndex > 0) setCurrentWorkIndex(currentWorkIndex - 1);
  };

  if (!currentWork) {
    return <div className="flex items-center justify-center h-96"><p className="text-[#718096]">沒有學生作品</p></div>;
  }

  if (isGenerating) {
    const doneCount = secondaryReports.filter(r => r.studentWork.id !== currentWork?.id).length;
    const estSeconds = Math.max(30, (studentWorks.length - doneCount) * 45);
    const estMin = Math.floor(estSeconds / 60);
    const estSec = estSeconds % 60;
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 border-4 border-[#4A6FA5] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#2D3748] font-medium mb-1">
            正在批改第 {currentWorkIndex + 1} / {studentWorks.length} 篇
          </p>
          <p className="text-sm text-[#718096] mb-3">{currentWork?.name}</p>
          {/* 進度條 */}
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-[#4A6FA5] h-2 rounded-full transition-all"
              style={{ width: `${((currentWorkIndex) / studentWorks.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-[#718096]">
            已完成 {currentWorkIndex} 篇 · 預計剩餘約 {estMin > 0 ? `${estMin} 分 ` : ''}{estSec} 秒
          </p>
          <p className="text-xs text-[#718096] mt-1">每篇約需 30–60 秒，請耐心等待</p>
        </div>
      </div>
    );
  }

  if (!currentReport) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-[#718096]">無法生成報告</p>
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          <Button onClick={handleRegenerate} className="mt-4 bg-[#4A6FA5]">重試</Button>
        </div>
      </div>
    );
  }

  const { grading, totalScore, gradeLabel } = currentReport;
  const maxStructureScore = getMaxStructureScore(grading.content);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-7xl mx-auto"
    >
      {error && (
        <Alert className="mb-6 bg-yellow-50 border-yellow-200">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700">{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* Left Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5 text-[#4A6FA5]" />
                評分調整
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {validationWarning && (
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-700 text-xs">{validationWarning}</AlertDescription>
                </Alert>
              )}

              <GradingSlider label="內容" value={grading.content} onChange={(v) => handleGradingChange('content', v)} scoreMultiplier={4} description="40分" />
              <GradingSlider label="表達" value={grading.expression} onChange={(v) => handleGradingChange('expression', v)} scoreMultiplier={3} description="30分" />
              <GradingSlider
                label="結構"
                value={grading.structure}
                onChange={(v) => handleGradingChange('structure', v)}
                max={maxStructureScore}
                scoreMultiplier={2}
                description="20分"
                warning={grading.structure >= maxStructureScore ? `內容品級限制，結構最高${getGradeLabel(maxStructureScore)}` : undefined}
              />
              <GradingSlider label="標點" value={grading.punctuation} onChange={(v) => handleGradingChange('punctuation', v)} min={5} max={10} description="10分" />

              <Separator />

              <div className="text-center">
                <p className="text-sm text-[#718096]">總分</p>
                <p className="text-3xl font-bold text-[#4A6FA5]">{totalScore}</p>
                <Badge className="mt-2 text-lg px-3 py-1">{gradeLabel}</Badge>
              </div>

              {/* 調分後才顯示的按鈕 */}
              {gradingChanged && (
                <Button
                  onClick={handleRegenerateFeedback}
                  disabled={isRegeneratingFeedback}
                  className="w-full gap-2 bg-[#4A6FA5] hover:bg-[#3a5f95]"
                >
                  {isRegeneratingFeedback ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />重新生成評語中...</>
                  ) : (
                    <><MessageSquare className="w-4 h-4" />按現有評分重新生成評語</>
                  )}
                </Button>
              )}

              <Button onClick={handleRegenerate} variant="outline" className="w-full gap-2">
                <RefreshCw className="w-4 h-4" />
                重新生成整份報告
              </Button>

              {!isAPIAvailable(apiKey) && (
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertDescription className="text-yellow-700 text-xs">
                    API 未設定，正在使用模擬數據。
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel */}
        <div id="report-content">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <User className="w-5 h-5 text-[#4A6FA5]" />
                    <span className="font-semibold">{currentWork.name || '未命名'}</span>
                    <span className="text-[#718096]">{currentWork.studentId}</span>
                  </div>
                  <p className="text-sm text-[#718096]">{question}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-[#718096]">總分</p>
                    <p className="text-2xl font-bold text-[#4A6FA5]">{totalScore}/100</p>
                  </div>
                  <Badge className="text-lg px-4 py-2">{gradeLabel}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="feedback" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="feedback">評語</TabsTrigger>
                  <TabsTrigger value="enhanced">原文增潤</TabsTrigger>
                  <TabsTrigger value="model">奪星示範</TabsTrigger>
                </TabsList>

                <TabsContent value="feedback" className="mt-6 space-y-6">
                  {isRegeneratingFeedback ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="text-center">
                        <div className="w-10 h-10 border-4 border-[#4A6FA5] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-[#718096] text-sm">正在按調整後的評分重新生成評語...</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold mb-3">總評</h3>
                        <p className="text-[#2D3748] leading-relaxed">{currentReport.overallComment}</p>
                      </div>
                      <Separator />
                      <ReportSection title="內容" feedback={currentReport.contentFeedback} />
                      <ReportSection title="表達" feedback={currentReport.expressionFeedback} />
                      <ReportSection title="結構" feedback={currentReport.structureFeedback} />
                      <ReportSection title="標點" feedback={currentReport.punctuationFeedback} />
                    </>
                  )}
                </TabsContent>

                <TabsContent value="enhanced" className="mt-6">
                  <ComparisonView
                    originalText={currentWork.correctedText}
                    enhancedText={currentReport.enhancedText}
                    notes={currentReport.enhancementNotes}
                  />
                </TabsContent>

                <TabsContent value="model" className="mt-6">
                  <div className="p-4 bg-[#F7F9FB] rounded-lg">
                    <p className="text-[#2D3748] whitespace-pre-wrap leading-relaxed">{currentReport.modelEssay}</p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#E2E8F0] flex items-center justify-between px-6 z-40">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onPrev} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            返回上一步
          </Button>
          {studentWorks.length > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrevWork} disabled={currentWorkIndex === 0}>上一篇</Button>
              <span className="text-sm text-[#718096]">{currentWorkIndex + 1} / {studentWorks.length}</span>
              <Button variant="outline" size="sm" onClick={handleNextWork} disabled={currentWorkIndex === studentWorks.length - 1}>下一篇</Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handleExportWord} className="gap-2">
            <FileText className="w-4 h-4" />
            下載 HTML
          </Button>
          <Button onClick={handleNextWork} className="gap-2 bg-[#4A6FA5] hover:bg-[#3a5f95]">
            {currentWorkIndex < studentWorks.length - 1 ? '下一篇' : '全班報告'}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
