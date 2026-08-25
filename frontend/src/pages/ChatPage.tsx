import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types/chat';
import { pickReplies, PROACTIVE_MESSAGES, DEFAULT_PARTNER, RETRACT_POOL } from '../constants/chat';
import './ChatPage.css';

/** 好感度阶段名 */
function getStageName(val: number): string {
  if (val <= 20) return '陌生';
  if (val <= 40) return '认识';
  if (val <= 60) return '熟悉';
  if (val <= 80) return '暧昧';
  return '亲密';
}

/** 对话系统页面（拟人化：多段回复 + 好感度分档 + 防冷落 + 撤回） */
export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [intimacy, setIntimacy] = useState(DEFAULT_PARTNER.intimacy);
  const idleTimer = useRef<number | null>(null);
  const idleCount = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  const nextId = () => `m${++idRef.current}`;
  const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  function scrollBottom() {
    requestAnimationFrame(() => {
      if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    });
  }

  /** 追加一条消息 */
  function appendMsg(role: 'ai' | 'user' | 'sys', content: string, extra?: Partial<ChatMessage>) {
    setMessages((prev) => [...prev, { id: nextId(), role: role as 'ai' | 'user', content, time: now(), ...extra }]);
    scrollBottom();
  }

  /** 逐条蹦出 AI 回复（拟人化节奏，支持撤回） */
  function streamReplies(list: string[]) {
    const box = boxRef.current;
    const shouldRetract = Math.random() < 0.1 && list.length >= 2;

    if (!shouldRetract) {
      // 正常模式
      let i = 0;
      function next() {
        if (i >= list.length) return;
        const delay = i === 0 ? 0 : 300 + Math.random() * 700;
        setTimeout(() => {
          appendMsg('ai', list[i]);
          if (box) box.scrollTop = box.scrollHeight;
          i++;
          next();
        }, delay);
      }
      next();
    } else {
      // 撤回模式：发第一条 → 撤回 → 改口 → 重发 → 继续发剩余
      appendMsg('ai', list[0]);
      if (box) box.scrollTop = box.scrollHeight;

      setTimeout(() => {
        appendMsg('sys', '（撤回了一条消息）');
        if (box) box.scrollTop = box.scrollHeight;
      }, 800);

      setTimeout(() => {
        appendMsg('ai', RETRACT_POOL[Math.floor(Math.random() * RETRACT_POOL.length)]);
        if (box) box.scrollTop = box.scrollHeight;
      }, 1400);

      setTimeout(() => {
        appendMsg('ai', list[0]);
        if (box) box.scrollTop = box.scrollHeight;

        let i = 1;
        function nextRest() {
          if (i >= list.length) return;
          const delay = 300 + Math.random() * 700;
          setTimeout(() => {
            appendMsg('ai', list[i]);
            if (box) box.scrollTop = box.scrollHeight;
            i++;
            nextRest();
          }, delay);
        }
        nextRest();
      }, 2000);
    }
  }

  /** 动态增减好感度（根据聊天内容） */
  function adjustIntimacyForMessage(txt: string) {
    let delta = 0;
    if (/累|压力|加班|烦|崩溃/.test(txt)) delta = 2;
    else if (/想|爱|喜欢/.test(txt)) delta = 3;
    if (/滚|傻|蠢|白痴/.test(txt)) delta = -5;
    if (delta !== 0) {
      setIntimacy((prev) => Math.max(0, Math.min(100, prev + delta)));
    }
  }

  /** 手动调整好感度（用户点击按钮） */
  function adjustIntimacy(delta: number) {
    setIntimacy((prev) => {
      const next = Math.max(0, Math.min(100, prev + delta));
      showToast(delta > 0 ? `好感度 +${delta}` : `好感度 ${delta}`);
      return next;
    });
  }

  /** 发送消息 */
  function sendMsg() {
    const txt = input.trim();
    if (!txt) return;
    appendMsg('user', txt);
    setInput('');
    resetIdleTimer();
    adjustIntimacyForMessage(txt);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      streamReplies(pickReplies(txt, intimacy));
    }, 900);
  }

  // ---- 防冷落：一段时间没互动，TA 主动发消息 ----
  const IDLE_MS = 25000;

  function resetIdleTimer() {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
  }

  function proactiveMessage() {
    if (idleCount.current >= 2) return;
    idleCount.current += 1;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      streamReplies(PROACTIVE_MESSAGES[idleCount.current - 1]);
    }, 1200);
    // 防冷落也加一点好感度
    setIntimacy((prev) => Math.min(100, prev + 1));
    resetIdleTimer();
    idleTimer.current = window.setTimeout(proactiveMessage, IDLE_MS * 2);
  }

  useEffect(() => {
    idleTimer.current = window.setTimeout(proactiveMessage, IDLE_MS);
    return () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 语音模拟（正式版接 STT） */
  function toggleVoice() {
    if (!listening) {
      setListening(true);
    } else {
      setListening(false);
      setInput('我今天有点累');
    }
  }

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const stageName = getStageName(intimacy);

  return (
    <div className="chat-page">
      {/* 顶栏 */}
      <header className="chat-topbar">
        <button className="back" onClick={() => history.back()}>←</button>
        <div className="partner">
          <div className="partner-avatar">{DEFAULT_PARTNER.avatar}</div>
          <div>
            <div className="partner-name">{DEFAULT_PARTNER.name}</div>
            <div className="partner-status">{stageName} · 认识 7 天 · {stageName === '亲密' ? '💗💗💗💗💗' : stageName === '暧昧' ? '💗💗💗' : '💗'}</div>
          </div>
        </div>
        <button className="edit-btn" onClick={() => showToast('跳转到定制工坊（后续接入）')}>✏️ 改设定</button>
      </header>

      <div className="chat-body">
        {/* 左侧：恋人信息面板 */}
        <aside className="side-panel">
          <div className="side-card">
            <h4>💗 关系进度</h4>
            <div className="intimacy-bar"><div className="intimacy-fill" style={{ width: `${intimacy}%` }} /></div>
            <div className="intimacy-txt">{stageName} · {intimacy} / 100</div>
            <div className="intimacy-controls">
              <button className="intimacy-btn minus" onClick={() => adjustIntimacy(-5)}>−5</button>
              <span className="intimacy-val-badge">{intimacy}</span>
              <button className="intimacy-btn plus" onClick={() => adjustIntimacy(5)}>+5</button>
            </div>
          </div>
          <div className="side-card">
            <h4>🧩 性格标签</h4>
            <div className="tags">
              {DEFAULT_PARTNER.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>
          <div className="side-card">
            <h4>🧠 记得的事</h4>
            <ul className="memo-list">
              {DEFAULT_PARTNER.memos.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <div className="memo-more" onClick={() => showToast('打开记忆页（后续接入）')}>查看全部 →</div>
          </div>
        </aside>

        {/* 右侧：对话流 */}
        <main className="chat-main">
          <div className="chat-box" ref={boxRef}>
            <div className="time-divider">今天 21:04</div>
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === 'ai' && <div className="avatar-sm">{DEFAULT_PARTNER.avatar}</div>}
                <div className="bubble">
                  {m.content}
                  {m.memoRef && <span className="memo-ref">{m.memoRef}</span>}
                  {m.emotionTag && <span className="emotion-tag">{m.emotionTag}</span>}
                </div>
              </div>
            ))}
          </div>

          {typing && (
            <div className="typing">
              <span className="dot" /><span className="dot" /><span className="dot" />
              <span className="typing-txt">{DEFAULT_PARTNER.name} 正在输入…</span>
            </div>
          )}

          <div className="chat-input">
            <button className="mic-btn" onClick={toggleVoice}>{listening ? '⏹️' : '🎙️'}</button>
            <input
              type="text"
              value={input}
              placeholder="说点什么…（Enter 发送）"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMsg(); }}
            />
            <button className="send-btn" onClick={sendMsg}>发送</button>
          </div>
          {listening && <div className="voice-ind">🎙️ 正在聆听…（点 ⏹️ 结束）</div>}
        </main>
      </div>

      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

/** 初始演示消息 */
const initialMessages: ChatMessage[] = [
  {
    id: 'init1', role: 'ai', time: '21:04',
    content: '下班了？今天应该挺累的吧。',
    memoRef: '💬 记得你上周说最近都在加班',
  },
  { id: 'init2', role: 'user', time: '21:04', content: '嗯……有一点，感觉快被方案压垮了' },
  {
    id: 'init3', role: 'ai', time: '21:05',
    content: '过来，靠一会儿。方案写不完可以明天写，人垮了就什么都没了。',
    emotionTag: '💗 共情模式',
  },
  { id: 'init4', role: 'user', time: '21:05', content: '谢谢你……你真好' },
];
