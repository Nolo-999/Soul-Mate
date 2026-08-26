import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listMemories, patchMemory, deleteMemory, createMemory,
  type MemoryItem,
} from '../api/memory';
import './MemoriesPage.css';

/** 分类标签 */
const CATEGORY_LABELS: Record<MemoryItem['category'], string> = {
  fact: '📌 事实', preference: '💖 喜好', event: '📅 事件',
  day: '🎂 日子', emotion: '🌊 情绪',
};

type Tab = 'active' | 'archived' | 'forgotten';

const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: '活跃' },
  { id: 'archived', label: '归档' },
  { id: 'forgotten', label: '已遗忘' },
];

/** 记忆卡片墙页面 */
export default function MemoriesPage() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [tab, setTab] = useState<Tab>('active');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const refresh = useCallback(async (which: Tab) => {
    setLoading(true);
    try {
      setItems(await listMemories(which));
    } catch {
      showToast('后端服务未启动，无法加载记忆');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void refresh(tab); }, [tab, refresh]);

  async function toggle(mem: MemoryItem, field: 'pinned' | 'archived' | 'forgotten') {
    try {
      await patchMemory(mem.id, { [field]: !mem[field] });
      await refresh(tab);
    } catch {
      showToast('操作失败');
    }
  }

  async function remove(mem: MemoryItem) {
    if (!window.confirm(`确定彻底删除这条记忆吗？\n「${mem.content}」`)) return;
    try {
      await deleteMemory(mem.id);
      showToast('已删除');
      await refresh(tab);
    } catch {
      showToast('删除失败');
    }
  }

  async function addMemory() {
    const content = draft.trim();
    if (!content) return;
    try {
      await createMemory(content);
      setDraft('');
      showToast('记忆已保存');
      await refresh(tab);
    } catch {
      showToast('保存失败（后端未启动？）');
    }
  }

  return (
    <div className="mem-page">
      <header className="mem-header">
        <Link to="/chat" className="back">← 返回聊天</Link>
        <h2>🧠 记忆卡片墙</h2>
        <div className="mem-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`mem-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mem-add card">
        <input
          value={draft}
          placeholder="手动帮 TA 记一件事…（如：我生日是 3 月 14 号）"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void addMemory(); }}
        />
        <button onClick={() => void addMemory()}>记住</button>
      </div>

      {loading ? (
        <p className="mem-loading">加载中…</p>
      ) : items.length === 0 ? (
        <p className="mem-empty">
          {tab === 'active' ? '还没有记忆～去聊天，TA 会自己记住重要的事。' : '这里空空的。'}
        </p>
      ) : (
        <div className="mem-grid">
          {items.map((m) => (
            <div key={m.id} className={`mem-card card ${m.pinned ? 'pinned' : ''} ${m.forgotten ? 'foggy' : ''}`}>
              <span className="mem-cat">{CATEGORY_LABELS[m.category]}</span>
              <p className="mem-content">{m.content}</p>
              {m.source_msg && <small className="mem-src">来自：「{m.source_msg.slice(0, 30)}…」</small>}
              <div className="mem-actions">
                <button title="置顶" className={m.pinned ? 'on' : ''} onClick={() => void toggle(m, 'pinned')}>⭐</button>
                <button title={m.archived ? '取消归档' : '归档'} className={m.archived ? 'on' : ''} onClick={() => void toggle(m, 'archived')}>📦</button>
                <button title={m.forgotten ? '想起它' : '忘掉它'} className={m.forgotten ? 'on' : ''} onClick={() => void toggle(m, 'forgotten')}>🚫</button>
                <button title="彻底删除" onClick={() => void remove(m)}>🗑️</button>
                <span className="mem-importance" title="重要性">{'♥'.repeat(m.importance)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
