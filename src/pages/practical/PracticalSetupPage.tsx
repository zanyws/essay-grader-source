import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Upload, FileText, X, AlertCircle, Check, FileEdit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStore } from '@/hooks/useStore';
import type { FileInfo, StudentWork } from '@/types';
import { generateId, readFileAsText, readFileAsDataURL } from '@/lib/utils';
import { extractTextWithAPI, extractQuestionCriteriaWithAPI, isAPIAvailable } from '@/lib/api';
import type { APIConfig } from '@/types';
import { PRACTICAL_FORMAT_REQUIREMENTS } from '@/lib/gradingCriteria';

interface PracticalSetupPageProps {
  onNext: () => void;
}

interface ExtendedFileInfo extends FileInfo {
  file?: File;
}

export function PracticalSetupPage({ onNext }: PracticalSetupPageProps) {
  const {
    customQuestion,
    practicalGenre,
    autoGrade,
    ignoreRedInk,
    uploadedFiles,
    customCriteriaFiles,
    apiKey,
    apiType,
    apiModel,
    setCustomQuestion,
    setPracticalGenre,
    setAutoGrade,
    setIgnoreRedInk,
    addStudentWork,
    addUploadedFile,
    removeUploadedFile,
    clearUploadedFiles,
    addCustomCriteriaFile,
    removeCustomCriteriaFile,
    clearCustomCriteriaFiles,
    setCurrentWorkIndex,
    setStep,
  } = useStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isExtractingQuestion, setIsExtractingQuestion] = useState(false);
  const [manualText, setManualText] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [extractedCriteria, setExtractedCriteria] = useState('');
  
  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const questionFileInputRef = useRef<HTMLInputElement>(null);

  const handleStudentFilesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files);
    
    for (const file of files) {
      // 支持圖像、PDF、Word 文件
      const validTypes = [
        'image/jpeg', 'image/png', 'image/jpg', 
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      const isValidType = validTypes.some(type => 
        file.type === type || 
        file.name.toLowerCase().endsWith(type.split('/').pop() || '')
      );
      
      const validExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];
      const hasValidExtension = validExtensions.some(ext => 
        file.name.toLowerCase().endsWith(ext)
      );
      
      if (!isValidType && !hasValidExtension) {
        setError(`不支持的文件類型: ${file.name}。請上傳 JPG、PNG、PDF 或 Word 文件。`);
        continue;
      }

      const fileInfo: ExtendedFileInfo = {
        id: generateId(),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        file: file,
      };
      addUploadedFile(fileInfo);
    }
    
    if (studentFileInputRef.current) {
      studentFileInputRef.current.value = '';
    }
    
    setSuccess(`已添加 ${files.length} 個文件`);
    setTimeout(() => setSuccess(null), 3000);
  }, [addUploadedFile]);

  const handleQuestionFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    // 支持圖像、PDF、Word、純文本
    const validTypes = [
      'image/jpeg', 'image/png', 'image/jpg', 
      'application/pdf', 
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!validTypes.some(type => file.type === type || file.name.toLowerCase().endsWith(type.split('/')[1]))) {
      setError(`不支持的文件類型: ${file.name}`);
      return;
    }

    if (!isAPIAvailable(apiKey)) {
      setError('請先在右上角設定有效的 API 密鑰');
      return;
    }

    setIsExtractingQuestion(true);
    setError(null);

    try {
      const fileInfo: ExtendedFileInfo = {
        id: generateId(),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        file: file,
      };
      addCustomCriteriaFile(fileInfo);

      let fileContent: string;
      if (file.type.startsWith('image/') || file.type.includes('pdf')) {
        fileContent = await readFileAsDataURL(file);
      } else {
        fileContent = await readFileAsText(file);
      }

      const apiConfig: APIConfig = {
        apiKey,
        apiType: apiType as any,
        model: apiModel,
      };

      const result = await extractQuestionCriteriaWithAPI(fileContent, file.type, apiConfig);
      
      if (result.question) {
        setCustomQuestion(result.question);
      }
      if (result.criteria) {
        setExtractedCriteria(result.criteria);
      }
      
      setSuccess('已成功提取題目' + (result.criteria ? '和評分準則' : ''));
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(`提取題目失敗: ${e.message}`);
    } finally {
      setIsExtractingQuestion(false);
      if (questionFileInputRef.current) {
        questionFileInputRef.current.value = '';
      }
    }
  }, [apiKey, apiType, apiModel, addCustomCriteriaFile, setCustomQuestion]);

  const handleRemoveStudentFile = useCallback((id: string) => {
    removeUploadedFile(id);
  }, [removeUploadedFile]);

  const handleRemoveQuestionFile = useCallback((id: string) => {
    removeCustomCriteriaFile(id);
    setCustomQuestion('');
    setExtractedCriteria('');
  }, [removeCustomCriteriaFile, setCustomQuestion]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleStartProcessing = async () => {
    setError(null);
    setSuccess(null);
    
    if (uploadedFiles.length === 0 && !manualText.trim()) {
      setError('請上傳文件或輸入文字');
      return;
    }

    if (!isAPIAvailable(apiKey)) {
      setError('請先在右上角設定有效的 API 密鑰');
      return;
    }

    if (!customQuestion.trim()) {
      setError('請上傳題目文件以提取題目');
      return;
    }

    setIsProcessing(true);

    try {
      const apiConfig: APIConfig = {
        apiKey,
        apiType: apiType as any,
        model: apiModel,
      };

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
            
            const result = await extractTextWithAPI(
              fileContent,
              fileInfo.type,
              apiConfig,
              ignoreRedInk
            );
            
            if (result.articles && result.articles.length > 1) {
              for (const article of result.articles) {
                const studentWork: StudentWork = {
                  id: generateId(),
                  name: article.name || '未命名',
                  studentId: article.studentId || '',
                  originalText: article.text,
                  correctedText: article.text,
                  fileName: `${fileInfo.name} - ${article.name || '未命名'}`,
                };
                addStudentWork(studentWork);
              }
            } else {
              const studentWork: StudentWork = {
                id: generateId(),
                name: result.name || '未命名',
                studentId: result.studentId || '',
                originalText: result.text,
                correctedText: result.text,
                fileName: fileInfo.name,
              };
              addStudentWork(studentWork);
            }
          } catch (e: any) {
            setError(`處理文件 ${fileInfo.name} 失敗: ${e.message}`);
            setIsProcessing(false);
            return;
          }
        }
      }

      if (manualText.trim()) {
        try {
          const result = await extractTextWithAPI(
            manualText,
            'text/plain',
            apiConfig,
            ignoreRedInk
          );
          
          if (result.articles && result.articles.length > 0) {
            for (const article of result.articles) {
              const studentWork: StudentWork = {
                id: generateId(),
                name: article.name || `學生${result.articles.indexOf(article) + 1}`,
                studentId: article.studentId || '',
                originalText: article.text,
                correctedText: article.text,
              };
              addStudentWork(studentWork);
            }
          } else {
            const studentWork: StudentWork = {
              id: generateId(),
              name: result.name || '未命名',
              studentId: result.studentId || '',
              originalText: result.text,
              correctedText: result.text,
            };
            addStudentWork(studentWork);
          }
        } catch (e: any) {
          const studentWork: StudentWork = {
            id: generateId(),
            name: '手動輸入',
            studentId: '',
            originalText: manualText,
            correctedText: manualText,
          };
          addStudentWork(studentWork);
        }
      }

      clearUploadedFiles();
      clearCustomCriteriaFiles();
      setCurrentWorkIndex(0);
      
      if (autoGrade) {
        setStep(2);
      } else {
        setStep(1);
        onNext();
      }
    } catch (error: any) {
      setError(error.message || '處理過程中發生錯誤，請重試');
    } finally {
      setIsProcessing(false);
    }
  };

  const canProceed = customQuestion.trim() && (uploadedFiles.length > 0 || manualText.trim());
  const formatInfo = practicalGenre ? PRACTICAL_FORMAT_REQUIREMENTS[practicalGenre] : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto"
    >
      {error && (
        <Alert className="mb-6 bg-red-50 border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert className="mb-6 bg-green-50 border-green-200">
          <Check className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#B5726E]" />
                上傳學生作品
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">文件上傳</TabsTrigger>
                  <TabsTrigger value="manual">貼上原文</TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-4 pt-4">
                  <div
                    className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-8 text-center hover:border-[#B5726E] hover:bg-[#F7F9FB] transition-colors cursor-pointer"
                    onClick={() => studentFileInputRef.current?.click()}
                  >
                    <Upload className="w-10 h-10 text-[#718096] mx-auto mb-3" />
                    <p className="text-[#2D3748] font-medium mb-1">點擊或拖放文件至此</p>
                    <p className="text-sm text-[#718096]">支持 JPG、PNG、PDF、Word 格式</p>
                    <input
                      ref={studentFileInputRef}
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                      className="hidden"
                      onChange={handleStudentFilesChange}
                    />
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">已上傳文件</p>
                        <Button variant="ghost" size="sm" onClick={() => clearUploadedFiles()}>
                          清除全部
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {uploadedFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-2 bg-[#F7F9FB] rounded-lg">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 text-[#B5726E] flex-shrink-0" />
                              <span className="text-sm truncate">{file.name}</span>
                              <span className="text-xs text-[#718096] flex-shrink-0">({formatFileSize(file.size)})</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveStudentFile(file.id)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="manual" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>貼上學生作文</Label>
                    <Textarea
                      placeholder="請貼上學生實用文原文..."
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      className="min-h-[200px]"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {formatInfo && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileEdit className="w-5 h-5 text-[#B5726E]" />
                  {formatInfo.name}格式要求
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">必備格式：</p>
                  <ul className="text-sm text-[#718096] list-disc list-inside space-y-1">
                    {formatInfo.required.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2 text-orange-600">扣分陷阱：</p>
                  <ul className="text-sm text-orange-600 list-disc list-inside space-y-1">
                    {formatInfo.traps.map((trap, i) => (
                      <li key={i}>{trap}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#B5726E]" />
                上傳題目與評分準則
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>選擇文體</Label>
                <Select value={practicalGenre} onValueChange={setPracticalGenre}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇文體類型" />
                  </SelectTrigger>
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
              
              <div className="space-y-2">
                <Label>上傳題目文件</Label>
                <div
                  className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-4 text-center hover:border-[#B5726E] hover:bg-[#F7F9FB] transition-colors cursor-pointer"
                  onClick={() => questionFileInputRef.current?.click()}
                >
                  <Upload className="w-6 h-6 text-[#718096] mx-auto mb-2" />
                  <p className="text-sm text-[#2D3748]">點擊上傳題目文件</p>
                  <p className="text-xs text-[#718096]">AI將自動分辨題目與評分準則</p>
                  <input
                    ref={questionFileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={handleQuestionFileChange}
                  />
                </div>
              </div>

              {isExtractingQuestion && (
                <div className="flex items-center justify-center p-4 bg-[#F7F9FB] rounded-lg">
                  <div className="w-5 h-5 border-2 border-[#B5726E] border-t-transparent rounded-full animate-spin mr-2" />
                  <span className="text-sm text-[#718096]">正在提取題目...</span>
                </div>
              )}

              {customQuestion && (
                <div className="space-y-2">
                  <Label>提取的題目</Label>
                  <div className="p-3 bg-[#F7F9FB] rounded-lg text-sm max-h-40 overflow-y-auto">
                    {customQuestion}
                  </div>
                </div>
              )}

              {customCriteriaFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">已上傳題目文件</p>
                  {customCriteriaFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-2 bg-[#F7F9FB] rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-[#B5726E] flex-shrink-0" />
                        <span className="text-sm truncate">{file.name}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveQuestionFile(file.id)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {extractedCriteria && (
                <div className="space-y-2">
                  <Label>提取的評分準則</Label>
                  <div className="p-3 bg-[#F7F9FB] rounded-lg text-sm max-h-40 overflow-y-auto">
                    {extractedCriteria}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">批改設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="ignoreRedInk" 
                  checked={ignoreRedInk}
                  onCheckedChange={(checked) => setIgnoreRedInk(checked as boolean)}
                />
                <Label htmlFor="ignoreRedInk" className="font-normal cursor-pointer">
                  忽略手寫紅筆批改
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="autoGrade" 
                  checked={autoGrade}
                  onCheckedChange={(checked) => setAutoGrade(checked as boolean)}
                />
                <Label htmlFor="autoGrade" className="font-normal cursor-pointer">
                  跳過校對，直接批改
                </Label>
              </div>
            </CardContent>
          </Card>

          <Button 
            onClick={handleStartProcessing} 
            disabled={!canProceed || isProcessing}
            className="w-full gap-2 bg-[#B5726E] hover:bg-[#a5625e]"
            size="lg"
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                處理中...
              </>
            ) : (
              <>
                開始處理
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
