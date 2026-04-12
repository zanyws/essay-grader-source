// 功能模式
export type AppMode = 'secondary' | 'primary' | 'practical' | 'exam-generator';

// API 配置
export interface APIConfig {
  apiKey: string;
  apiType: 'openai' | 'gemini' | 'custom';
  model?: string;
  baseURL?: string;
}

// 題目類型
export type QuestionType = 'narrative' | 'descriptive' | 'argumentative';

// 題目
export interface Question {
  year: number;
  title: string;
  type: QuestionType;
}

// 學生作品
export interface StudentWork {
  id: string;
  name: string;
  studentId: string;
  originalText: string;
  correctedText: string;
  fileName?: string;
}

// ========== 中學命題寫作評分 ==========
export type GradeLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface SecondaryGrading {
  content: GradeLevel;
  expression: GradeLevel;
  structure: GradeLevel;
  punctuation: number;
}

export interface SecondaryReport {
  studentWork: StudentWork;
  grading: SecondaryGrading;
  totalScore: number;
  gradeLabel: string;
  overallComment: string;
  contentFeedback: Feedback;
  expressionFeedback: Feedback;
  structureFeedback: Feedback;
  punctuationFeedback: Feedback;
  enhancedText: string;
  enhancementNotes: string[];
  modelEssay: string;
}

// ========== 小學命題寫作評分 ==========
export type PrimaryGradeLevel = 0 | 1 | 2 | 3 | 4;

export interface PrimaryGrading {
  content: PrimaryGradeLevel;
  feeling: PrimaryGradeLevel;
  structure: PrimaryGradeLevel;
  language: PrimaryGradeLevel;
  format: PrimaryGradeLevel;
}

export interface PrimaryReport {
  studentWork: StudentWork;
  grading: PrimaryGrading;
  totalScore: number;
  gradeLevel: string;
  overallComment: string;
  contentFeedback: Feedback;
  feelingFeedback: Feedback;
  structureFeedback: Feedback;
  languageFeedback: Feedback;
  formatFeedback: Feedback;
  enhancedText: string;
  enhancementNotes: string[];
  modelEssay: string;
}

// ========== 實用寫作評分 ==========
export interface PracticalGrading {
  info: number;              // 資訊分 (0-2)
  development: number;       // 內容發展分 (0-8)
  tone: number;              // 行文語氣 (0-10)
  organization: number;      // 組織最終分，已扣格式分 (0-10)
  organizationBase?: number; // 格式扣分前的原始組織分
  formatDeduction?: number;  // 格式扣分數（0, 1 或 2）
}

export interface PracticalReport {
  studentWork: StudentWork;
  grading: PracticalGrading;
  contentScore: number;
  organizationScore: number;
  totalScore: number;
  overallComment: string;
  infoFeedback: Feedback;
  developmentFeedback: Feedback;
  toneFeedback: Feedback;
  organizationFeedback: Feedback;
  formatIssues: string[];
  enhancedText: string;
  enhancementNotes: string[];
  modelEssay: string;
}

// 統合報告類型
export type GradingReport = SecondaryReport | PrimaryReport | PracticalReport;

// 反饋
export interface Feedback {
  strengths: string[];
  improvements: string[];
}

// 批改偏好
export interface GradingPreferences {
  autoGrade: boolean;
  ignoreRedInk: boolean;
  contentPriority?: boolean;
  enhancementDirection?: 'auto' | 'narrative' | 'argumentative' | 'descriptive';
}

// 文件信息
export interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string;
}

// 全班統計
export interface ClassStats {
  totalStudents: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  scoreDistribution: number[];
}

// ========== 品級標籤 ==========
export const SECONDARY_GRADE_LABELS: Record<number, string> = {
  10: '上上', 9: '上中', 8: '上下', 7: '中上',
  6: '中中（上）', 5: '中中（下）', 4: '中下',
  3: '下上', 2: '下中', 1: '下下', 0: '極差'
};

export const PRIMARY_GRADE_LABELS: Record<number, string> = {
  4: '優異', 3: '良好', 2: '一般', 1: '有待改善', 0: '極差'
};

export const PRACTICAL_GRADE_LABELS: Record<number, string> = {
  45: '5**', 40: '5*', 35: '5', 30: '4', 25: '3', 20: '2', 15: '1', 0: 'U'
};

// ========== 計分函數 ==========
export function calculateSecondaryTotalScore(grading: SecondaryGrading): number {
  return (grading.content * 4) + (grading.expression * 3) + (grading.structure * 2) + grading.punctuation;
}

export function calculatePrimaryTotalScore(grading: PrimaryGrading): number {
  const scores = {
    content: [0, 9, 18, 24, 30],
    feeling: [0, 6, 12, 16, 20],
    structure: [0, 6, 12, 16, 20],
    language: [0, 6, 12, 16, 20],
    format: [0, 3, 6, 8, 10]
  };
  return scores.content[grading.content] + scores.feeling[grading.feeling] +
    scores.structure[grading.structure] + scores.language[grading.language] +
    scores.format[grading.format];
}

export function calculatePracticalTotalScore(grading: PracticalGrading): number {
  const contentScore = (grading.info + grading.development) * 3;
  const orgScore = grading.tone + grading.organization;
  return contentScore + orgScore;
}

export function getSecondaryGradeLabel(totalScore: number): string {
  if (totalScore >= 90) return '上上';
  if (totalScore >= 85) return '上中';
  if (totalScore >= 80) return '上下';
  if (totalScore >= 70) return '中上';
  if (totalScore >= 60) return '中中';
  if (totalScore >= 50) return '中下';
  if (totalScore >= 40) return '下上';
  if (totalScore >= 30) return '下中';
  if (totalScore >= 10) return '下下';
  return '極差';
}

export function getPrimaryGradeLabel(totalScore: number): string {
  if (totalScore >= 85) return '優異';
  if (totalScore >= 70) return '良好';
  if (totalScore >= 50) return '一般';
  return '有待改善';
}

export function getPracticalGradeLabel(totalScore: number): string {
  if (totalScore >= 45) return '5**';
  if (totalScore >= 40) return '5*';
  if (totalScore >= 35) return '5';
  if (totalScore >= 30) return '4';
  if (totalScore >= 25) return '3';
  if (totalScore >= 20) return '2';
  if (totalScore >= 15) return '1';
  return 'U';
}

// ========== 實用寫作模擬卷 ==========
export interface PracticalExamPaper {
  title: string;
  time: string;
  marks: string;
  instructions: string[];
  question: string;
  material1: { title: string; content: string };
  material2: { title: string; content: string };
}

export interface PracticalMarkingScheme {
  content: {
    infoPoints: string[];
    factualPoints: string[];
    developmentPoints: string[];
  };
  organization: {
    formatRequirements: string[];
    toneRequirements: string[];
  };
}

export interface GeneratedExam {
  examPaper: PracticalExamPaper;
  markingScheme: PracticalMarkingScheme;
  modelEssay?: string;
}

export const PRACTICAL_GENRES = [
  { value: 'speech', label: '演講辭', icon: 'Mic' },
  { value: 'letter', label: '書信/公開信', icon: 'Mail' },
  { value: 'proposal', label: '建議書', icon: 'FileText' },
  { value: 'report', label: '報告', icon: 'Clipboard' },
  { value: 'commentary', label: '評論文章', icon: 'MessageSquare' },
  { value: 'article', label: '專題文章', icon: 'BookOpen' },
] as const;
