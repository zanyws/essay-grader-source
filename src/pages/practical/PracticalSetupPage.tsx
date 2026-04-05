import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Upload, FileText, X, AlertCircle, Check, FileEdit, Wand2, Download, FolderOpen, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/hooks/useStore';
import type { FileInfo, StudentWork } from '@/types';
import { generateId, readFileAsText, readFileAsDataURL } from '@/lib/utils';
import { extractTextWithAPI, extractQuestionCriteriaWithAPI, isAPIAvailable } from '@/lib/api';
import type { APIConfig } from '@/types';
import { PRACTICAL_FORMAT_REQUIREMENTS } from '@/lib/gradingCriteria';

interface PracticalSetupPageProps { onNext: () => void; }
interface ExtendedFileInfo extends FileInfo { file?: File; }

const GENRE_LABELS: Record<string, string> = {
  speech: '演講辭',
  letter: '書信／公開信',
  proposal: '建議書',
  report: '報告',
  commentary: '評論文章',
  article: '專題文章',
};

export function PracticalSetupPage({ onNext }: PracticalSetupPageProps) {
  const {
    customQuestion, practicalGenre, autoGrade, ignoreRedInk,
    uploadedFiles, customCriteriaFiles, practicalCriteriaConfirmed,
    apiKey, apiType, apiModel,
    setCustomQuestion, setPracticalGenre, setAutoGrade, setIgnoreRedInk,
    addStudentWork, addUploadedFile, removeUploadedFile, clearUploadedFiles,
    addCustomCriteriaFile, removeCustomCriteriaFile, clearCustomCriteriaFiles,
    setPracticalInfoPoints, setPracticalDevItems, setPracticalFormatRequirements,
    setPracticalCriteriaConfirmed, setPracticalMaterials, resetPracticalCriteria,
    setCurrentWorkIndex, setStep,
    practicalReports,
    addPracticalReport,
  } = useStore();

  const accumulatedCount = practicalReports.length;

  const [isProcessing, setIsProcessing] = useState(false);
  const [isExtractingQuestion, setIsExtractingQuestion] = useState(false);
  const [manualText, setManualText] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [extractedCriteria, setExtractedCriteria] = useState('');
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [pastedContent, setPastedContent] = useState('');
  const [isExtractingCriteria, setIsExtractingCriteria] = useState(false);
  const [extractedMaterials, setExtractedMaterials] = useState('');
  const [aiDetectedGenre, setAiDetectedGenre] = useState<string>(''); // AI 判斷的文體
  const [genreManuallyChanged, setGenreManuallyChanged] = useState(false); // 用戶是否手動更改過文體

  // 評分準則確認區塊
  const [localInfoPoints, setLocalInfoPoints] = useState<string[]>([]);
  const [localDevLabel, setLocalDevLabel] = useState('');
  const [newInfoPoint, setNewInfoPoint] = useState('');
  const [criteriaReady, setCriteriaReady] = useState(false);

  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const questionFileInputRef = useRef<HTMLInputElement>(null);

  // ══ 匯出批改記錄 ══
  const handleExportRecords = () => {
    if (practicalReports.length === 0) return;
    const exportData = { version: '1.0', exportDate: new Date().toISOString(), appMode: 'practical', question: customQuestion, reports: practicalReports };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `實用批改記錄_${new Date().toLocaleDateString('zh-HK').replace(/\//g, '-')}.json`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const importInputRef = useRef<HTMLInputElement>(null);
  const handleImportRecords = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.reports || !Array.isArray(data.reports)) { setError('無效的批改記錄文件'); return; }
      let imported = 0;
      for (const report of data.reports) {
        if (report.studentWork && report.grading) { addPracticalReport(report); imported++; }
      }
      setSuccess(`已成功匯入 ${imported} 篇批改記錄！`);
      setTimeout(() => setSuccess(null), 4000);
      if (data.question) setCustomQuestion(data.question);
    } catch { setError('讀取文件失敗，請確認是有效的批改記錄JSON文件'); }
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleStudentFilesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    for (const file of files) {
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const validExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];
      const isValid = validTypes.some(type => file.type === type) || validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      if (!isValid) { setError(`不支持的文件類型: ${file.name}`); continue; }
      addUploadedFile({ id: generateId(), name: file.name, size: file.size, type: file.type || 'application/octet-stream', file } as ExtendedFileInfo);
    }
    if (studentFileInputRef.current) studentFileInputRef.current.value = '';
    setSuccess(`已添加 ${files.length} 個文件`);
    setTimeout(() => setSuccess(null), 3000);
  }, [addUploadedFile]);

  // 處理題目文件上傳，AI自動判斷文體
  const handleQuestionFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.txt'];
    const isValid = validTypes.some(type => file.type === type) || validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!isValid) { setError(`不支持的文件類型: ${file.name}`); return; }
    if (!isAPIAvailable(apiKey)) { setError('請先在右上角設定有效的 API 密鑰'); return; }

    setIsExtractingQuestion(true);
    setError(null);
    try {
      addCustomCriteriaFile({ id: generateId(), name: file.name, size: file.size, type: file.type || 'application/octet-stream', file } as ExtendedFileInfo);
      let fileContent: string;
      if (file.type.startsWith('image/') || file.type.includes('pdf')) {
        fileContent = await readFileAsDataURL(file);
      } else {
        fileContent = await readFileAsText(file);
      }
      const apiConfig: APIConfig = { apiKey, apiType: apiType as any, model: apiModel };
      const result = await extractQuestionCriteriaWithAPI(fileContent, file.type, apiConfig);
      if (result.question) setCustomQuestion(result.question);
      if (result.materials) { setPracticalMaterials(result.materials); setExtractedMaterials(result.materials); }
      if (result.criteria) setExtractedCriteria(result.criteria);

      // AI 自動設定文體（若用戶未手動更改）
      if (result.genre && !genreManuallyChanged) {
        setPracticalGenre(result.genre);
        setAiDetectedGenre(result.genre);
      } else if (result.genre) {
        setAiDetectedGenre(result.genre); // 記錄AI判斷，但不覆蓋用戶選擇
      }

      // 初始化評分準則
      initCriteriaDefaults(result.genre || practicalGenre);
      setSuccess(`已成功提取題目${result.genre ? `，AI 判斷文體為「${GENRE_LABELS[result.genre] || result.genre}」` : ''}，請在下方確認評分準則`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: any) {
      setError(`提取題目失敗: ${e.message}`);
    } finally {
      setIsExtractingQuestion(false);
      if (questionFileInputRef.current) questionFileInputRef.current.value = '';
    }
  }, [apiKey, apiType, apiModel, addCustomCriteriaFile, setCustomQuestion, genreManuallyChanged, practicalGenre]);

  const handleExtractCriteria = async () => {
    const hasUploadedFile = customCriteriaFiles.length > 0;
    const hasPastedContent = pastedContent.trim().length > 0;
    if (!hasUploadedFile && !hasPastedContent) { setError('請先上傳文件或貼上內容'); return; }
    if (!isAPIAvailable(apiKey)) { setError('請先設定有效的 API 密鑰'); return; }
    setIsExtractingCriteria(true);
    setError(null);
    try {
      const apiConfig: APIConfig = { apiKey, apiType: apiType as any, model: apiModel };
      const result = hasPastedContent
        ? await extractQuestionCriteriaWithAPI(pastedContent, 'text/plain', apiConfig)
        : { question: customQuestion, materials: '', criteria: extractedCriteria, genre: '' };
      if (result.question) setCustomQuestion(result.question);
      if (result.materials) { setPracticalMaterials(result.materials); setExtractedMaterials(result.materials); }
      if (result.criteria) setExtractedCriteria(result.criteria);
      if (result.genre && !genreManuallyChanged) {
        setPracticalGenre(result.genre);
        setAiDetectedGenre(result.genre);
      } else if (result.genre) {
        setAiDetectedGenre(result.genre);
      }
      initCriteriaDefaults(result.genre || practicalGenre);
      setSuccess(`AI 已整理內容${result.genre ? `，判斷文體為「${GENRE_LABELS[result.genre] || result.genre}」` : ''}，請在下方確認評分準則`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: any) {
      setError(`整理失敗：${e.message}`);
    } finally {
      setIsExtractingCriteria(false);
    }
  };

  const initCriteriaDefaults = (genre: string) => {
    const devDefaults: Record<string, string> = {
      speech: '2項措施、4個措施細項、3項同學意見',
      letter: '2項個人條件、4個條件細項、3項同學意見',
      proposal: '2個建議、4個建議細項、3項同學意見',
      report: '2個調查類別、4個調查意見、2個改善建議',
      commentary: '2個目標、4項活動、4項同學意見',
      article: '2個目標、4項活動細項、4項意見',
    };
    setLocalDevLabel(devDefaults[genre] || '相關細項');
    setLocalInfoPoints(['計劃名稱／活動名稱', '計劃目的／背景', '寫作身份／動機']);
    resetPracticalCriteria();
    setCriteriaReady(false);
  };

  const handleConfirmCriteria = () => {
    if (localInfoPoints.length === 0) { setError('請至少填寫一項資訊分考核項目'); return; }
    setPracticalInfoPoints(localInfoPoints);
    setPracticalDevItems({ label: localDevLabel });
    setPracticalFormatRequirements([]);
    setPracticalCriteriaConfirmed(true);
    setCriteriaReady(true);
    setError(null);
    setSuccess('評分準則已確認！');
    setTimeout(() => setSuccess(null), 2000);
  };

  const handleAddInfoPoint = () => {
    if (newInfoPoint.trim()) { setLocalInfoPoints([...localInfoPoints, newInfoPoint.trim()]); setNewInfoPoint(''); }
  };

  const handleRemoveInfoPoint = (idx: number) => {
    setLocalInfoPoints(localInfoPoints.filter((_, i) => i !== idx));
  };

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
    if (!customQuestion.trim()) { setError('請上傳題目文件以提取題目'); return; }
    setIsProcessing(true);
    try {
      const apiConfig: APIConfig = { apiKey, apiType: apiType as any, model: apiModel };
      if (uploadedFiles.length > 0) {
        for (const fileInfo of uploadedFiles as ExtendedFileInfo[]) {
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
                addStudentWork({ id: generateId(), name: article.name || '未命名', studentId: article.studentId || '', originalText: article.text, correctedText: article.text, fileName: `${fileInfo.name} - ${article.name || '未命名'}` } as StudentWork);
              }
            } else {
              addStudentWork({ id: generateId(), name: result.name || '未命名', studentId: result.studentId || '', originalText: result.text, correctedText: result.text, fileName: fileInfo.name } as StudentWork);
            }
          } catch (e: any) { setError(`處理文件 ${fileInfo.name} 失敗: ${e.message}`); setIsProcessing(false); return; }
        }
      }
      if (manualText.trim()) {
        try {
          const result = await extractTextWithAPI(manualText, 'text/plain', apiConfig, ignoreRedInk);
          if (result.articles && result.articles.length > 0) {
            for (const article of result.articles) {
              addStudentWork({ id: generateId(), name: article.name || `學生${result.articles.indexOf(article) + 1}`, studentId: article.studentId || '', originalText: article.text, correctedText: article.text } as StudentWork);
            }
          } else {
            addStudentWork({ id: generateId(), name: result.name || '未命名', studentId: result.studentId || '', originalText: result.text, correctedText: result.text } as StudentWork);
          }
        } catch {
          addStudentWork({ id: generateId(), name: '手動輸入', studentId: '', originalText: manualText, correctedText: manualText } as StudentWork);
        }
      }
      clearUploadedFiles();
      clearCustomCriteriaFiles();
      setCurrentWorkIndex(0);
      if (autoGrade) { setStep(2); } else { setStep(1); onNext(); }
    } catch (error: any) {
      setError(error.message || '處理過程中發生錯誤，請重試');
    } finally {
      setIsProcessing(false);
    }
  };

  const canProceed = customQuestion.trim() && (uploadedFiles.length > 0 || manualText.trim()) && (practicalCriteriaConfirmed || criteriaReady);
  const formatInfo = practicalGenre ? PRACTICAL_FORMAT_REQUIREMENTS[practicalGenre] : null;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="max-w-6xl mx-auto">
      {error && <Alert className="mb-6 bg-red-50 border-red-200"><AlertCircle className="w-4 h-4 text-red-600" /><AlertDescription className="text-red-700">{error}</AlertDescription></Alert>}
      {success && <Alert className="mb-6 bg-green-50 border-green-200"><Check className="w-4 h-4 text-green-600" /><AlertDescription className="text-green-700">{success}</AlertDescription></Alert>}

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          {/* 上傳學生作品 */}
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Upload className="w-5 h-5 text-[#B5726E]" />上傳學生作品</CardTitle></CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">文件上傳</TabsTrigger>
                  <TabsTrigger value="manual">貼上原文</TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="space-y-4 pt-4">
                  <div className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-8 text-center hover:border-[#B5726E] hover:bg-[#F7F9FB] transition-colors cursor-pointer" onClick={() => studentFileInputRef.current?.click()}>
                    <Upload className="w-10 h-10 text-[#718096] mx-auto mb-3" />
                    <p className="text-[#2D3748] font-medium mb-1">點擊或拖放文件至此</p>
                    <p className="text-sm text-[#718096]">支持 JPG、PNG、PDF、Word 格式</p>
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
                              <FileText className="w-4 h-4 text-[#B5726E] flex-shrink-0" />
                              <span className="text-sm truncate">{file.name}</span>
                              <span className="text-xs text-[#718096] flex-shrink-0">({formatFileSize(file.size)})</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeUploadedFile(file.id)}><X className="w-4 h-4" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="manual" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>貼上學生作文</Label>
                    <Textarea placeholder="請貼上學生實用文原文..." value={manualText} onChange={(e) => setManualText(e.target.value)} className="min-h-[200px]" />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* 格式要求提示 */}
          {formatInfo && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileEdit className="w-5 h-5 text-[#B5726E]" />{formatInfo.name}格式要求</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">必備格式：</p>
                  <ul className="text-sm text-[#718096] list-disc list-inside space-y-1">{formatInfo.required.map((req, i) => <li key={i}>{req}</li>)}</ul>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2 text-orange-600">扣分陷阱：</p>
                  <ul className="text-sm text-orange-600 list-disc list-inside space-y-1">{formatInfo.traps.map((trap, i) => <li key={i}>{trap}</li>)}</ul>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* 文體選擇（AI自動判斷 + 可手動更改）*/}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>文體</Label>
                  {aiDetectedGenre && (
                    <Badge className="text-xs bg-blue-100 text-blue-700 font-normal">
                      <Wand2 className="w-3 h-3 mr-1" />
                      AI 判斷
                    </Badge>
                  )}
                </div>
                <Select
                  value={practicalGenre}
                  onValueChange={(val) => {
                    setPracticalGenre(val);
                    setGenreManuallyChanged(true); // 標記用戶已手動更改
                    if (val !== aiDetectedGenre) {
                      // 用戶選了和AI不同的文體，重置準則預設值
                      initCriteriaDefaults(val);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="上傳題目後AI自動判斷，或手動選擇" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="speech">演講辭</SelectItem>
                    <SelectItem value="letter">書信／公開信</SelectItem>
                    <SelectItem value="proposal">建議書</SelectItem>
                    <SelectItem value="report">報告</SelectItem>
                    <SelectItem value="commentary">評論文章</SelectItem>
                    <SelectItem value="article">專題文章</SelectItem>
                  </SelectContent>
                </Select>
                {!aiDetectedGenre && (
                  <p className="text-xs text-[#718096]">上傳題目文件後，AI 將自動判斷文體；你亦可手動選擇或更改</p>
                )}
                {aiDetectedGenre && genreManuallyChanged && practicalGenre !== aiDetectedGenre && (
                  <p className="text-xs text-orange-600">
                    AI 判斷為「{GENRE_LABELS[aiDetectedGenre]}」，你已改為「{GENRE_LABELS[practicalGenre]}」
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 題目、資料及評分準則 */}
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-[#B5726E]" />題目、資料及評分準則</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-[#718096]">上傳或貼上完整的題目文件（包含題目、資料一、資料二及評分準則），AI 將自動分別提取各項內容。</p>
              <div className="flex gap-2">
                <Button size="sm" variant={inputMode === 'upload' ? 'default' : 'outline'} className={inputMode === 'upload' ? 'bg-[#B5726E] hover:bg-[#a5625e]' : ''} onClick={() => setInputMode('upload')}>上傳文件</Button>
                <Button size="sm" variant={inputMode === 'paste' ? 'default' : 'outline'} className={inputMode === 'paste' ? 'bg-[#B5726E] hover:bg-[#a5625e]' : ''} onClick={() => setInputMode('paste')}>貼上文字</Button>
              </div>

              {inputMode === 'upload' ? (
                <div className="space-y-2">
                  <div className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-6 text-center hover:border-[#B5726E] hover:bg-[#F7F9FB] transition-colors cursor-pointer" onClick={() => questionFileInputRef.current?.click()}>
                    <Upload className="w-8 h-8 text-[#718096] mx-auto mb-2" />
                    <p className="text-sm text-[#2D3748] font-medium">點擊上傳題目文件</p>
                    <p className="text-xs text-[#718096] mt-1">支持 JPG、PNG、PDF、Word 格式</p>
                    <p className="text-xs text-[#718096]">AI 將自動提取題目、資料、文體及評分準則</p>
                    <input ref={questionFileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleQuestionFileChange} />
                  </div>
                  {isExtractingQuestion && (
                    <div className="flex items-center p-3 bg-[#F7F9FB] rounded-lg">
                      <div className="w-4 h-4 border-2 border-[#B5726E] border-t-transparent rounded-full animate-spin mr-2" />
                      <span className="text-sm text-[#718096]">正在提取內容（包括判斷文體）...</span>
                    </div>
                  )}
                  {customCriteriaFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-2 bg-[#F7F9FB] rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-[#B5726E] flex-shrink-0" />
                        <span className="text-sm truncate">{file.name}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { removeCustomCriteriaFile(file.id); setCustomQuestion(''); setExtractedCriteria(''); setAiDetectedGenre(''); }}><X className="w-4 h-4" /></Button>
                    </div>
                  ))}
                  {customQuestion && (
                    <div className="space-y-2 mt-2">
                      <div><p className="text-xs font-medium text-[#718096] mb-1">✅ 題目：</p><div className="p-3 bg-[#F7F9FB] rounded-lg text-sm max-h-24 overflow-y-auto">{customQuestion}</div></div>
                      {extractedMaterials && <div><p className="text-xs font-medium text-[#718096] mb-1">✅ 資料內容：</p><div className="p-3 bg-[#F7F9FB] rounded-lg text-sm max-h-32 overflow-y-auto whitespace-pre-wrap">{extractedMaterials}</div></div>}
                      {extractedCriteria && <div><p className="text-xs font-medium text-[#718096] mb-1">✅ 評分準則：</p><div className="p-3 bg-[#F7F9FB] rounded-lg text-sm max-h-24 overflow-y-auto text-[#718096]">{extractedCriteria}</div></div>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea placeholder="請貼上完整的題目文件內容（包含題目、資料一、資料二及評分準則）..." value={pastedContent} onChange={(e) => setPastedContent(e.target.value)} className="min-h-[200px] text-sm" />
                  <Button onClick={handleExtractCriteria} disabled={isExtractingCriteria || !pastedContent.trim()} className="w-full gap-2 bg-[#B5726E] hover:bg-[#a5625e]" size="sm">
                    {isExtractingCriteria ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />AI 整理中...</> : <><FileEdit className="w-4 h-4" />AI 整理內容（自動判斷文體）</>}
                  </Button>
                  {customQuestion && (
                    <div className="space-y-2 mt-2">
                      <div><p className="text-xs font-medium text-[#718096] mb-1">✅ 題目：</p><div className="p-3 bg-[#F7F9FB] rounded-lg text-sm max-h-24 overflow-y-auto">{customQuestion}</div></div>
                      {extractedMaterials && <div><p className="text-xs font-medium text-[#718096] mb-1">✅ 資料內容：</p><div className="p-3 bg-[#F7F9FB] rounded-lg text-sm max-h-32 overflow-y-auto whitespace-pre-wrap">{extractedMaterials}</div></div>}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 確認評分準則 */}
          {customQuestion && (
            <Card className={practicalCriteriaConfirmed ? 'border-green-300' : 'border-amber-200'}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileEdit className="w-5 h-5 text-[#B5726E]" />確認評分準則
                  {practicalCriteriaConfirmed && <span className="ml-auto text-xs text-green-600 font-normal flex items-center gap-1"><Check className="w-3 h-3" />已確認</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">資訊分考核項目 <span className="ml-1 text-xs text-[#718096] font-normal">（全部提及得2分，欠1項得1分）</span></Label>
                  <div className="space-y-1">
                    {localInfoPoints.map((point, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-[#F7F9FB] rounded-lg">
                        <span className="text-xs text-[#718096] w-4">{idx + 1}.</span>
                        <span className="text-sm flex-1">{point}</span>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveInfoPoint(idx)} className="h-6 w-6 p-0"><X className="w-3 h-3" /></Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" placeholder="新增考核項目..." value={newInfoPoint} onChange={(e) => setNewInfoPoint(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddInfoPoint()} className="flex-1 text-sm px-3 py-1.5 border border-[#E2E8F0] rounded-md focus:outline-none focus:border-[#B5726E]" />
                    <Button variant="outline" size="sm" onClick={handleAddInfoPoint}>新增</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">內容發展細項數量 <span className="ml-1 text-xs text-[#718096] font-normal">（影響齊全／大致齊全判斷）</span></Label>
                  <input type="text" value={localDevLabel} onChange={(e) => setLocalDevLabel(e.target.value)} className="w-full text-sm px-3 py-1.5 border border-[#E2E8F0] rounded-md focus:outline-none focus:border-[#B5726E]" placeholder="例如：2個建議、4個細項、3項同學意見" />
                </div>
                <Button onClick={handleConfirmCriteria} className="w-full gap-2 bg-[#B5726E] hover:bg-[#a5625e]" size="sm">
                  <Check className="w-4 h-4" />{practicalCriteriaConfirmed ? '更新評分準則' : '確認評分準則'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 批改設定 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">批改設定</CardTitle>
                {practicalCriteriaConfirmed && (
                  <Button variant="ghost" size="sm" className="text-xs text-[#718096] h-7" onClick={() => { resetPracticalCriteria(); setLocalInfoPoints([]); setLocalDevLabel(''); setCriteriaReady(false); }}>清除批改設定</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="ignoreRedInk" checked={ignoreRedInk} onCheckedChange={(checked) => setIgnoreRedInk(checked as boolean)} />
                <Label htmlFor="ignoreRedInk" className="font-normal cursor-pointer">忽略手寫紅筆批改</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="autoGrade" checked={autoGrade} onCheckedChange={(checked) => setAutoGrade(checked as boolean)} />
                <Label htmlFor="autoGrade" className="font-normal cursor-pointer">跳過校對，直接批改</Label>
              </div>
            </CardContent>
          </Card>

          {customQuestion && !practicalCriteriaConfirmed && !criteriaReady && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">請在上方確認評分準則後才能開始批改</p>
            </div>
          )}

          
          {/* 已累積報告橫幅 */}
          {accumulatedCount > 0 && (
            <div className="p-3 bg-red-50 border border-[#B5726E] rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 text-[#B5726E] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#B5726E]">已累積 {accumulatedCount} 篇批改報告</p>
                    <p className="text-xs text-[#718096]">上傳下一批後繼續累積</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="border-[#B5726E] text-[#B5726E] hover:bg-red-50 gap-1 flex-shrink-0"
                  onClick={handleExportRecords}>
                  <Download className="w-3 h-3" />匯出記錄
                </Button>
              </div>
            </div>
          )}

          {/* 匯入批改記錄 */}
          <div className="w-full">
            <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImportRecords} />
            <Button variant="outline" onClick={() => importInputRef.current?.click()}
              className="w-full gap-2 text-[#718096]" size="sm">
              <FolderOpen className="w-4 h-4" />匯入上次批改記錄（.json）
            </Button>
          </div>

          <Button onClick={handleStartProcessing} disabled={!canProceed || isProcessing} className="w-full gap-2 bg-[#B5726E] hover:bg-[#a5625e]" size="lg">
            {isProcessing ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />處理中...</> : <>開始處理<ChevronRight className="w-5 h-5" /></>}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
