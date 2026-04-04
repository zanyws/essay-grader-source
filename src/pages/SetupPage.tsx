import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Type, Sparkles, Settings2, Upload, FileText, X, AlertCircle, Check, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useStore } from '@/hooks/useStore';
import { dseQuestions, getQuestionsByYear } from '@/lib/questions';
import type { FileInfo, StudentWork } from '@/types';
import { generateId, readFileAsText, readFileAsDataURL } from '@/lib/utils';
import { extractTextWithAPI, isAPIAvailable } from '@/lib/api';
import type { APIConfig } from '@/types';
import { detectQuestionType } from '@/lib/gradingCriteria';

interface SetupPageProps { onNext: () => void; }
interface ExtendedFileInfo extends FileInfo { file?: File; }

export function SetupPage({ onNext }: SetupPageProps) {
  const {
    selectedQuestion, customQuestion, useCustomQuestion,
    autoGrade, ignoreRedInk, contentPriority, enhancementDirection,
    customCriteria, uploadedFiles, studentWorks,
    apiKey, apiType, apiModel,
    appMode, secondaryReports, primaryReports, practicalReports,
    setSelectedQuestion, setCustomQuestion, setUseCustomQuestion,
    setAutoGrade, setIgnoreRedInk, setContentPriority, setEnhancementDirection,
    setCustomCriteria, addStudentWork, addUploadedFile, removeUploadedFile,
    clearUploadedFiles, setCurrentWorkIndex, setStep,
  } = useStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [manualText, setManualText] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const questionsByYear = getQuestionsByYear();
  const years = Object.keys(questionsByYear).sort((a, b) => Number(b) - Number(a));

  const detectedDirection = useCustomQuestion
    ? detectQuestionType(customQuestion)
    : selectedQuestion ? detectQuestionType(selectedQuestion.title) : 'mixed';

  // 計算已累積的報告數
  const accumulatedCount =
    appMode === 'primary' ? primaryReports.length :
    appMode === 'practical' ? practicalReports.length :
    secondaryReports.length;

  const handleStudentFilesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    for (const file of files) {
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!validTypes.some(type => file.type === type || file.name.toLowerCase().endsWith(type.split('/')[1]))) {
        setError(`不支持的文件類型: ${file.name}`); continue;
      }
      const fileInfo: ExtendedFileInfo = { id: generateId(), name: file.name, size: file.size, type: file.type || 'application/octet-stream', file };
      addUploadedFile(fileInfo);
    }
    if (studentFileInputRef.current) studentFileInputRef.current.value = '';
    setSuccess(`已添加 ${files.length} 個文件`);
    setTimeout(() => setSuccess(null), 3000);
  }, [addUploadedFile]);

  const handleRemoveStudentFile = useCallback((id: string) => { removeUploadedFile(id); }, [removeUploadedFile]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleStartProcessing = async () => {
    setError(null); setSuccess(null);
    if (uploadedFiles.length === 0 && !manualText.trim()) { setError('請上傳文件或輸入文字'); return; }
    if (!isAPIAvailable(apiKey)) { setError('請先在右上角設定有效的 API 密鑰'); return; }
    if (!selectedQuestion && !customQuestion.trim()) { setError('請選擇或輸入題目'); return; }
    setIsProcessing(true);
    try {
      const apiConfig: APIConfig = { apiKey, apiType: apiType as any, model: apiModel };
      if (uploadedFiles.length > 0) {
        for (const fileInfo of uploadedFiles) {
          try {
            if (!fileInfo.file) continue;
            let fileContent: string;
            if (fileInfo.type.startsWith('image/') || fileInfo.type.includes('pdf')) {
              fileContent = await readFileAsDataURL(fileInfo.file);
            } else {
              fileContent = await readFileAsText(fileInfo.file);
            }
            const result = await extractTextWithAPI(fileContent, fileInfo.type, apiConfig, ignoreRedInk);
            if (result.articles && result.articles.length > 1) {
              for (const article of result.articles) {
                addStudentWork({ id: generateId(), name: article.name || '未命名', studentId: article.studentId || '', originalText: article.text, correctedText: article.text, fileName: `${fileInfo.name} - ${article.name || '未命名'}` });
              }
            } else {
              addStudentWork({ id: generateId(), name: result.name || '未命名', studentId: result.studentId || '', originalText: result.text, correctedText: result.text, fileName: fileInfo.name });
            }
          } catch (e: any) { setError(`處理文件 ${fileInfo.name} 失敗: ${e.message}`); setIsProcessing(false); return; }
        }
      }
      if (manualText.trim()) {
        try {
          const result = await extractTextWithAPI(manualText, 'text/plain', apiConfig, ignoreRedInk);
          if (result.articles && result.articles.length > 0) {
            for (const article of result.articles) {
              addStudentWork({ id: generateId(), name: article.name || `學生${result.articles.indexOf(article) + 1}`, studentId: article.studentId || '', originalText: article.text, correctedText: article.text });
            }
          } else {
            addStudentWork({ id: generateId(), name: result.name || '未命名', studentId: result.studentId || '', originalText: result.text, correctedText: result.text });
          }
        } catch (e: any) {
          addStudentWork({ id: generateId(), name: '手動輸入', studentId: '', originalText: manualText, correctedText: manualText });
        }
      }
      clearUploadedFiles();
      setCurrentWorkIndex(0);
      if (autoGrade) { setStep(2); } else { setStep(1); onNext(); }
    } catch (error: any) {
      setError(error.message || '處理過程中發生錯誤，請重試');
    } finally {
      setIsProcessing(false);
    }
  };

  const canProceed = (selectedQuestion || customQuestion.trim()) && (uploadedFiles.length > 0 || manualText.trim() || studentWorks.length > 0);

  const handleContinueProcessing = () => {
    if (autoGrade) { setStep(2); } else { setStep(1); }
    onNext();
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="max-w-6xl mx-auto">

      {/* 【新增】已累積報告橫幅 */}
      {accumulatedCount > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-[#4A6FA5] rounded-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Layers className="w-5 h-5 text-[#4A6FA5] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#4A6FA5]">
                已累積 {accumulatedCount} 篇批改報告
              </p>
              <p className="text-xs text-[#718096] truncate">
                上傳下一批作文後，報告將繼續累積。完成全班後可查看全班報告。
              </p>
            </div>
          </div>
          <Button
            variant="outline" size="sm"
            className="border-[#4A6FA5] text-[#4A6FA5] flex-shrink-0 hover:bg-blue-50"
            onClick={() => { setStep(3); onNext(); }}
          >
            查看全班報告
          </Button>
        </div>
      )}

      {error && <Alert className="mb-6 bg-red-50 border-red-200"><AlertCircle className="w-4 h-4 text-red-600" /><AlertDescription className="text-red-700">{error}</AlertDescription></Alert>}
      {success && <Alert className="mb-6 bg-green-50 border-green-200"><Check className="w-4 h-4 text-green-600" /><AlertDescription className="text-green-700">{success}</AlertDescription></Alert>}

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Upload className="w-5 h-5 text-[#4A6FA5]" />上傳學生作品</CardTitle></CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">文件上傳</TabsTrigger>
                  <TabsTrigger value="manual">貼上原文</TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="space-y-4 pt-4">
                  <div className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-8 text-center hover:border-[#4A6FA5] hover:bg-[#F7F9FB] transition-colors cursor-pointer" onClick={() => studentFileInputRef.current?.click()}>
                    <Upload className="w-10 h-10 text-[#718096] mx-auto mb-3" />
                    <p className="text-[#2D3748] font-medium mb-1">點擊或拖放文件至此</p>
                    <p className="text-sm text-[#718096]">支持 JPG、PNG、PDF、Word 格式</p>
                    <p className="text-xs text-[#718096] mt-2">支援多篇作文自動分辨</p>
                    <input ref={studentFileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" className="hidden" onChange={handleStudentFilesChange} />
                  </div>
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">已上傳文件</p>
                        <Button variant="ghost" size="sm" onClick={() => clearUploadedFiles()}>清除全部</Button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {uploadedFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-2 bg-[#F7F9FB] rounded-lg">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 text-[#4A6FA5] flex-shrink-0" />
                              <span className="text-sm truncate">{file.name}</span>
                              <span className="text-xs text-[#718096] flex-shrink-0">({formatFileSize(file.size)})</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveStudentFile(file.id)}><X className="w-4 h-4" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="manual" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>貼上學生作文（支援多篇自動分辨）</Label>
                    <Textarea placeholder="請貼上學生作文原文。若有多篇作文，可用「---」分隔，或讓AI自動分辨..." value={manualText} onChange={(e) => setManualText(e.target.value)} className="min-h-[200px]" />
                    <p className="text-xs text-[#718096]">提示：可用「---」分隔多篇作文，AI會自動分辨每篇作文並分別列出</p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Settings2 className="w-5 h-5 text-[#4A6FA5]" />批改設定</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="font-medium">評分準則模式</Label>
                <RadioGroup value={contentPriority ? 'content' : 'standard'} onValueChange={(v) => setContentPriority(v === 'content')} className="space-y-2">
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="standard" id="standard" />
                    <Label htmlFor="standard" className="font-normal cursor-pointer"><div className="font-medium">標準模式</div><div className="text-xs text-[#718096]">各項目獨立評分</div></Label>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="content" id="content" />
                    <Label htmlFor="content" className="font-normal cursor-pointer"><div className="font-medium">以內容為主</div><div className="text-xs text-[#718096]">優先考慮內容品級，結構品級不應高於內容超過1級</div></Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-3">
                <Label className="font-medium">增潤文章方向</Label>
                <RadioGroup value={enhancementDirection} onValueChange={(v) => setEnhancementDirection(v as any)} className="space-y-2">
                  {[
                    { value: 'auto', label: '自動判斷', desc: `根據題目自動判斷（景物描寫/人物描寫/記敘抒情/議論說理）${detectedDirection !== 'mixed' ? \` - 檢測到：${detectedDirection === 'argumentative' ? '議論類' : detectedDirection === 'descriptive' ? '描寫類' : '記敘抒情類'}\` : ''}` },
                    { value: 'narrative', label: '記敘說理/抒情', desc: '優先考慮記敘文體風格' },
                    { value: 'argumentative', label: '議論說理', desc: '優先考慮議論文體風格' },
                    { value: 'descriptive', label: '景物描寫/人物描寫', desc: '優先考慮描寫文體風格' },
                  ].map(({ value, label, desc }) => (
                    <div key={value} className="flex items-start space-x-2">
                      <RadioGroupItem value={value} id={value} />
                      <Label htmlFor={value} className="font-normal cursor-pointer"><div className="font-medium">{label}</div><div className="text-xs text-[#718096]">{desc}</div></Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center space-x-2">
                  <Checkbox id="ignoreRedInk" checked={ignoreRedInk} onCheckedChange={(checked) => setIgnoreRedInk(checked as boolean)} />
                  <Label htmlFor="ignoreRedInk" className="font-normal cursor-pointer">忽略手寫紅筆批改</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="autoGrade" checked={autoGrade} onCheckedChange={(checked) => setAutoGrade(checked as boolean)} />
                  <Label htmlFor="autoGrade" className="font-normal cursor-pointer">跳過校對，直接批改</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Type className="w-5 h-5 text-[#4A6FA5]" />選擇題目</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={useCustomQuestion ? 'custom' : 'preset'} onValueChange={(v) => setUseCustomQuestion(v === 'custom')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preset">預設題目</TabsTrigger>
                  <TabsTrigger value="custom">自定義</TabsTrigger>
                </TabsList>
                <TabsContent value="preset" className="space-y-4 pt-4">
                  <Select value={selectedQuestion?.title || ''} onValueChange={(value) => { const question = dseQuestions.find(q => q.title === value); setSelectedQuestion(question || null); }}>
                    <SelectTrigger><SelectValue placeholder="選擇題目" /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {years.map(year => (
                        <SelectGroup key={year}>
                          <SelectLabel>{year}年</SelectLabel>
                          {(questionsByYear[year as unknown as number] as Array<{title: string}>).map((question: {title: string}, idx: number) => (
                            <SelectItem key={idx} value={question.title}>{question.title.substring(0, 40)}...</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedQuestion && <div className="p-4 bg-[#F7F9FB] rounded-lg"><p className="text-sm text-[#2D3748]">{selectedQuestion.title}</p></div>}
                </TabsContent>
                <TabsContent value="custom" className="space-y-4 pt-4">
                  <Textarea placeholder="輸入自定義題目..." value={customQuestion} onChange={(e) => setCustomQuestion(e.target.value)} className="min-h-[100px]" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#4A6FA5]" />自定義批改準則</CardTitle></CardHeader>
            <CardContent>
              <Textarea placeholder="輸入自定義批改準則（可選）。例如：本題要求以第一人稱敘事，描寫需有五感描寫……" value={customCriteria} onChange={(e) => setCustomCriteria(e.target.value)} className="min-h-[100px]" />
            </CardContent>
          </Card>

          <Button
            onClick={studentWorks.length > 0 ? handleContinueProcessing : handleStartProcessing}
            disabled={!canProceed || isProcessing}
            className="w-full gap-2" size="lg"
          >
            {isProcessing ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />處理中...</>
            ) : studentWorks.length > 0 ? (
              <>繼續處理 ({studentWorks.length}篇)<ChevronRight className="w-5 h-5" /></>
            ) : (
              <>開始處理<ChevronRight className="w-5 h-5" /></>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
