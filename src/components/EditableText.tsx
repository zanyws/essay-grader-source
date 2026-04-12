import { useState, useRef, useEffect } from 'react';
import { Pencil } from 'lucide-react';

interface EditableTextProps {
  value: string;
  onSave: (newValue: string) => void;
  /** 顯示模式的 className（不影響 textarea） */
  className?: string;
  /** 是否為多行模式（預設 true） */
  multiline?: boolean;
  /** textarea 最小高度（px，預設 80） */
  minHeight?: number;
}

/**
 * 行內可編輯文字組件（方案C）
 * - 顯示時：文字 + 右上角 ✏️ 圖示
 * - 點擊後：原地變 textarea，自動撐高
 * - 失焦或按 Escape：儲存並回到顯示模式
 */
export function EditableText({
  value,
  onSave,
  className = '',
  multiline = true,
  minHeight = 80,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 每次 value 從外部更新時同步 draft（例如重新生成報告後）
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // 進入編輯模式後 focus 並自動調整高度
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
      autoResize(el);
    }
  }, [editing]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.max(minHeight, el.scrollHeight) + 'px';
  };

  const handleSave = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setDraft(value); // 放棄修改
      setEditing(false);
    }
    // Shift+Enter = 換行；單獨 Enter = 儲存（單行模式）
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); autoResize(e.target); }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full rounded-md border border-[#4A6FA5] bg-white px-3 py-2 text-sm text-[#2D3748] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#4A6FA5]/40 shadow-inner"
        style={{ minHeight: `${minHeight}px` }}
      />
    );
  }

  return (
    <div
      className={`group relative cursor-pointer rounded-md px-2 py-1 -mx-2 -my-1 hover:bg-[#EBF2FB] transition-colors ${className}`}
      onClick={() => setEditing(true)}
      title="點擊編輯"
    >
      <span className="whitespace-pre-wrap leading-relaxed">{value}</span>
      <Pencil className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-[#4A6FA5] opacity-0 group-hover:opacity-70 transition-opacity" />
    </div>
  );
}

/** 用於列表項目（strengths / improvements）的行內編輯 */
interface EditableListProps {
  items: string[];
  onSave: (newItems: string[]) => void;
  className?: string;
}

export function EditableList({ items, onSave, className = '' }: EditableListProps) {
  const handleItemSave = (index: number, newValue: string) => {
    const updated = items.map((item, i) => (i === index ? newValue : item));
    onSave(updated);
  };

  return (
    <ul className={`space-y-1 ${className}`}>
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-1.5">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
          <EditableText
            value={item}
            onSave={(v) => handleItemSave(index, v)}
            className="flex-1 text-sm"
            minHeight={40}
          />
        </li>
      ))}
    </ul>
  );
}
