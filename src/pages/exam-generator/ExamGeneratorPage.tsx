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
import { Separator } from '@/components/ui/separator';
import { useStore } from '@/hooks/useStore';
import { generatePracticalExamWithAPI, isAPIAvailable } from '@/lib/api';
import { generateId, readFileAsDataURL, readFileAsText } from '@/lib/utils';
import type { FileInfo } from '@/types';

interface ExtendedFileInfo extends FileInfo {
  file?: File;
}

export function ExamGeneratorPage() {
  const { apiKey, apiType, apiModel, apiBaseURL, generatedExam, setGeneratedExam } = useStore();
  
  const [genre, setGenre] = useState('speech');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<ExtendedFileInfo | null>(null);
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [pastedQuestion, setPastedQuestion] = useState('');
  const [pastedCriteria, setPastedCriteria] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    // 支持圖像、PDF、Word 和純文本
    const validTypes = [
      'image/jpeg', 'image/png', 'image/jpg', 
      'application/pdf', 
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const isValidType = validTypes.some(type => 
      file.type === type || 
      file.name.toLowerCase().endsWith(type.split('/').pop() || '')
    );
    
    // 額外檢查文件擴展名
    const validExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.doc', '.docx'];
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    if (!isValidType && !hasValidExtension) {
      setError(`不支持的文件類型: ${file.name}。請上傳 JPG、PNG、PDF、Word 或 TXT 文件。`);
      return;
    }

    const fileInfo: ExtendedFileInfo = {
      id: generateId(),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      file: file,
    };
    setUploadedFile(fileInfo);
    setError(null);
    setSuccess(`已上傳文件: ${file.name}`);
    setTimeout(() => setSuccess(null), 3000);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleGenerate = async () => {
    if (!isAPIAvailable(apiKey)) {
      setError('請先在右上角設定有效的 API 密鑰');
      return;
    }

    if (!genre) {
      setError('請選擇文體');
      return;
    }

    // 檢查輸入內容
    if (inputMode === 'upload' && !uploadedFile) {
      setError('請上傳一份模擬卷文件');
      return;
    }

    if (inputMode === 'paste' && !pastedQuestion.trim()) {
      setError('請貼上題目內容');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      let fileContent: string;
      let fileType: string;

      if (inputMode === 'upload') {
        if (!uploadedFile?.file) {
          throw new Error('文件無效');
        }
        if (uploadedFile.type.startsWith('image/') || uploadedFile.type.includes('pdf')) {
          fileContent = await readFileAsDataURL(uploadedFile.file);
        } else {
          fileContent = await readFileAsText(uploadedFile.file);
        }
        fileType = uploadedFile.type;
      } else {
        // 粘貼模式：組合題目和評分準則
        const combinedContent = `【題目】\n${pastedQuestion}\n\n【評分準則】\n${pastedCriteria || '（無特定評分準則）'}`;
        fileContent = combinedContent;
        fileType = 'text/plain';
      }

      const result = await generatePracticalExamWithAPI(
        fileContent,
        fileType,
        genre,
        {
          apiKey,
          apiType: apiType as any,
          model: apiModel,
          baseURL: apiBaseURL,
        }
      );
      setGeneratedExam(result);
      setSuccess('模擬卷生成成功！');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      console.error('Generate exam error:', e);
      setError(e.message || '生成失敗，請重試');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportTxt = () => {
    if (!generatedExam) return;
    
    const content = `
DSE 中文卷二甲部：實用寫作模擬試卷

${generatedExam.examPaper.title}

考試時間：${generatedExam.examPaper.time}
佔分：${generatedExam.examPaper.marks}

考生須知：
${generatedExam.examPaper.instructions.map((i: string) => `• ${i}`).join('\n')}

題目：
${generatedExam.examPaper.question}

${generatedExam.examPaper.material1.title}：
${generatedExam.examPaper.material1.content}

${generatedExam.examPaper.material2.title}：
${generatedExam.examPaper.material2.content}

---
評分參考

內容要求：
${generatedExam.markingScheme.content.infoPoints.map((p: string) => `• ${p}`).join('\n')}

發展要求：
${generatedExam.markingScheme.content.developmentPoints.map((p: string) => `• ${p}`).join('\n')}

格式要求：
${generatedExam.markingScheme.organization.formatRequirements.map((r: string) => `• ${r}`).join('\n')}

語氣要求：
${generatedExam.markingScheme.organization.toneRequirements.map((r: string) => `• ${r}`).join('\n')}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `實用寫作模擬卷_${genre}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportHtml = () => {
    if (!generatedExam) return;
    
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${generatedExam.examPaper.title}</title>
  <style>
    body { font-family: "Microsoft JhengHei", "PingFang HK", sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.8; color: #333; }
    h1 { text-align: center; font-size: 24px; margin-bottom: 10px; }
    .meta { text-align: center; color: #666; margin-bottom: 30px; }
    h2 { font-size: 18px; margin-top: 30px; margin-bottom: 15px; border-bottom: 2px solid #B5726E; padding-bottom: 5px; }
    h3 { font-size: 16px; margin-top: 20px; margin-bottom: 10px; color: #555; }
    .instructions { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .instructions ul { margin: 0; padding-left: 20px; }
    .material { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #B5726E; }
    .material-title { font-weight: bold; margin-bottom: 10px; color: #B5726E; }
    .marking-section { margin-top: 30px; }
    .marking-section ul { margin: 10px 0; padding-left: 25px; }
    .marking-section li { margin: 5px 0; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>${generatedExam.examPaper.title}</h1>
  <p class="meta">考試時間：${generatedExam.examPaper.time} | 佔分：${generatedExam.examPaper.marks}</p>
  
  <div class="instructions">
    <h3>考生須知</h3>
    <ul>
      ${generatedExam.examPaper.instructions.map((i: string) => `<li>${i}</li>`).join('\n      ')}
    </ul>
  </div>
  
  <h2>題目</h2>
  <p>${generatedExam.examPaper.question.replace(/\n/g, '<br>')}</p>
  
  <div class="material">
    <div class="material-title">${generatedExam.examPaper.material1.title}</div>
    <p>${generatedExam.examPaper.material1.content.replace(/\n/g, '<br>')}</p>
  </div>
  
  <div class="material">
    <div class="material-title">${generatedExam.examPaper.material2.title}</div>
    <p>${generatedExam.examPaper.material2.content.replace(/\n/g, '<br>')}</p>
  </div>
  
  <div class="marking-section">
    <h2>評分參考</h2>
    
    <h3>內容要求</h3>
    <ul>
      ${generatedExam.markingScheme.content.infoPoints.map((p: string) => `<li>${p}</li>`).join('\n      ')}
    </ul>
    
    <h3>發展要求</h3>
    <ul>
      ${generatedExam.markingScheme.content.developmentPoints.map((p: string) => `<li>${p}</li>`).join('\n      ')}
    </ul>
    
    <h3>格式要求</h3>
    <ul>
      ${generatedExam.markingScheme.organization.formatRequirements.map((r: string) => `<li>${r}</li>`).join('\n      ')}
    </ul>
    
    <h3>語氣要求</h3>
    <ul>
      ${generatedExam.markingScheme.organization.toneRequirements.map((r: string) => `<li>${r}</li>`).join('\n      ')}
    </ul>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `實用寫作模擬卷_${genre}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      {error && (
        <Alert className="mb-6 bg-red-50 border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-6 bg-green-50 border-green-200">
          <BookOpen className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-[1fr_1.5fr] gap-6">
        {/* Left - Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#B5726E]" />
              生成設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 輸入方式選擇 */}
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'upload' | 'paste')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">上傳文件</TabsTrigger>
                <TabsTrigger value="paste">貼上文字</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>上傳模擬卷</Label>
                  <div
                    className="border-2 border-dashed border-[#E2E8F0] rounded-lg p-6 text-center hover:border-[#B5726E] hover:bg-[#F7F9FB] transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 text-[#718096] mx-auto mb-2" />
                    <p className="text-sm text-[#2D3748]">點擊上傳模擬卷文件</p>
                    <p className="text-xs text-[#718096]">支持 JPG、PNG、PDF、Word、TXT 格式</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>

                {uploadedFile && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">已上傳文件</p>
                    <div className="flex items-center justify-between p-2 bg-[#F7F9FB] rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-[#B5726E] flex-shrink-0" />
                        <span className="text-sm truncate">{uploadedFile.name}</span>
                        <span className="text-xs text-[#718096] flex-shrink-0">({formatFileSize(uploadedFile.size)})</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={handleRemoveFile}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="paste" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    貼上題目
                  </Label>
                  <Textarea
                    placeholder="請貼上題目內容..."
                    value={pastedQuestion}
                    onChange={(e) => setPastedQuestion(e.target.value)}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" />
                    貼上評分準則（可選）
                  </Label>
                  <Textarea
                    placeholder="請貼上評分準則內容（可選）..."
                    value={pastedCriteria}
                    onChange={(e) => setPastedCriteria(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label>選擇輸出文體</Label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger>
                  <SelectValue />
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

            <div className="text-sm text-[#718096] bg-[#F7F9FB] p-3 rounded-lg">
              <p className="font-medium mb-1">生成說明：</p>
              <p>AI將分析您上傳的模擬卷或貼上的題目內容，理解其主題和結構，然後生成一份全新的模擬卷。新模擬卷會保持相同的主題方向，但內容完全不同，並符合您選擇的文體格式要求。</p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || (inputMode === 'upload' ? !uploadedFile : !pastedQuestion.trim())}
              className="w-full gap-2 bg-[#B5726E] hover:bg-[#a5625e]"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  生成模擬卷
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right - Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#4A6FA5]" />
              預覽
            </CardTitle>
          </CardHeader>
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
                    <p className="text-sm text-[#718096]">
                      考試時間：{generatedExam.examPaper.time} | 佔分：{generatedExam.examPaper.marks}
                    </p>
                  </div>

                  <div>
                    <p className="font-medium mb-2">考生須知：</p>
                    <ul className="text-sm list-disc list-inside space-y-1 text-[#718096]">
                      {generatedExam.examPaper.instructions.map((i: string, idx: number) => (
                        <li key={idx}>{i}</li>
                      ))}
                    </ul>
                  </div>

                  <Separator />

                  <div>
                    <p className="font-medium mb-2">題目：</p>
                    <p className="text-sm whitespace-pre-wrap">{generatedExam.examPaper.question}</p>
                  </div>

                  <div className="bg-[#F7F9FB] p-4 rounded-lg">
                    <p className="font-medium mb-2">{generatedExam.examPaper.material1.title}</p>
                    <p className="text-sm whitespace-pre-wrap">{generatedExam.examPaper.material1.content}</p>
                  </div>

                  <div className="bg-[#F7F9FB] p-4 rounded-lg">
                    <p className="font-medium mb-2">{generatedExam.examPaper.material2.title}</p>
                    <p className="text-sm whitespace-pre-wrap">{generatedExam.examPaper.material2.content}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleExportTxt} variant="outline" className="flex-1 gap-2">
                      <Download className="w-4 h-4" />
                      導出 TXT
                    </Button>
                    <Button onClick={handleExportHtml} className="flex-1 gap-2 bg-[#B5726E] hover:bg-[#a5625e]">
                      <Download className="w-4 h-4" />
                      導出 HTML
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="marking" className="space-y-4 pt-4">
                  <div>
                    <p className="font-medium mb-2">內容要求：</p>
                    <ul className="text-sm list-disc list-inside space-y-1 text-[#718096]">
                      {generatedExam.markingScheme.content.infoPoints.map((p: string, idx: number) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium mb-2">發展要求：</p>
                    <ul className="text-sm list-disc list-inside space-y-1 text-[#718096]">
                      {generatedExam.markingScheme.content.developmentPoints.map((p: string, idx: number) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium mb-2">格式要求：</p>
                    <ul className="text-sm list-disc list-inside space-y-1 text-[#718096]">
                      {generatedExam.markingScheme.organization.formatRequirements.map((r: string, idx: number) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="font-medium mb-2">語氣要求：</p>
                    <ul className="text-sm list-disc list-inside space-y-1 text-[#718096]">
                      {generatedExam.markingScheme.organization.toneRequirements.map((r: string, idx: number) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>

                <TabsContent value="model" className="space-y-4 pt-4">
                  {generatedExam.modelEssay ? (
                    <div className="bg-[#F7F9FB] p-4 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{generatedExam.modelEssay}</p>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-[#718096]">
                      <p>未生成示範文章</p>
                    </div>
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
