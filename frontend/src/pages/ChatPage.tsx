import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ChatMessage } from '../types/chat';
import type { PersonaDraft } from '../types/persona';
import {
  pickReplies, PROACTIVE_MESSAGES, DEFAULT_PARTNER, RETRACT_POOL,
  REPORT_INTERVAL, REPORT_MESSAGES, TOOL_CALLS,
} from '../constants/chat';
import './ChatPage.css';

/** 好感度阶段名 */
function getStageName(val: number): string {
  if (val <= 20) return '陌生';
  if (val <= 40) return '认识';
  if (val <= 60) return '熟悉';
  if (val <= 80) return '暧昧';
  return '亲密';
}

/** 等待用户停止输入的时间（ms） */
const REPLY_WAIT_MS = 4000;

/** 对话系统页面 */
export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routePersona = location.state?.persona as PersonaDraft | undefined;
  const partner = {
    ...DEFAULT_PARTNER,
    name: routePersona?.name.trim() || DEFAULT_PARTNER.name,
    avatar: routePersona?.sex === '男' ? '👨' : routePersona?.sex === '女' ? '👩' : routePersona?.sex === '其他' ? '🌈' : DEFAULT_PARTNER.avatar,
  };
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [intimacy, setIntimacy] = useState(DEFAULT_PARTNER.intimacy);
  const idleTimer = useRef<number | null>(null);
  const reportTimer = useRef<number | null>(null);
  const replyTimer = useRef<number | null>(null);
  const delayedTimers = useRef(new Set<number>());
  const pendingMessages = useRef<string[]>([]); // 待回复的用户消息队列
  const idleCount = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const intimacyRef = useRef(intimacy);

  const nextId = () => `m${++idRef.current}`;
  const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      delayedTimers.current.delete(timer);
      callback();
    }, delay);
    delayedTimers.current.add(timer);
    return timer;
  }, []);

  function scrollBottom() {
    requestAnimationFrame(() => {
      if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    });
  }

  /** 追加一条消息 */
  function appendMsg(role: ChatMessage['role'], content: string, extra?: Partial<ChatMessage>) {
    setMessages((prev) => [...prev, { id: nextId(), role, content, time: now(), ...extra }]);
    scrollBottom();
  }

  /** 逐条蹦出 AI 回复（拟人化节奏，支持撤回） */
  function streamReplies(list: string[]) {
    const box = boxRef.current;
    const shouldRetract = Math.random() < 0.1 && list.length >= 2;

    if (!shouldRetract) {
      let i = 0;
      function next() {
        if (i >= list.length) return;
        const delay = i === 0 ? 0 : 300 + Math.random() * 700;
        schedule(() => {
          appendMsg('ai', list[i]);
          if (box) box.scrollTop = box.scrollHeight;
          i++;
          next();
        }, delay);
      }
      next();
    } else {
      appendMsg('ai', list[0]);
      if (box) box.scrollTop = box.scrollHeight;
      schedule(() => { appendMsg('sys', '（撤回了一条消息）'); if (box) box.scrollTop = box.scrollHeight; }, 800);
      schedule(() => { appendMsg('ai', RETRACT_POOL[Math.floor(Math.random() * RETRACT_POOL.length)]); if (box) box.scrollTop = box.scrollHeight; }, 1400);
      schedule(() => {
        appendMsg('ai', list[0]);
        if (box) box.scrollTop = box.scrollHeight;
        let i = 1;
        function nextRest() {
          if (i >= list.length) return;
          schedule(() => { appendMsg('ai', list[i]); if (box) box.scrollTop = box.scrollHeight; i++; nextRest(); }, 300 + Math.random() * 700);
        }
        nextRest();
      }, 2000);
    }
  }

  /** 触发工具调用 */
  function triggerToolCall() {
    const tool = TOOL_CALLS[Math.floor(Math.random() * TOOL_CALLS.length)];
    appendMsg('sys', `${tool.emoji} ${partner.name}${tool.name}了`);
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    schedule(() => streamReplies(tool.messages), 800);
  }

  /** 动态增减好感度 */
  function adjustIntimacyForMessage(txt: string) {
    let delta = 0;
    if (/累|压力|加班|烦|崩溃/.test(txt)) delta = 2;
    else if (/想|爱|喜欢/.test(txt)) delta = 3;
    if (/滚|傻|蠢|白痴/.test(txt)) delta = -5;
    if (delta !== 0) setIntimacy((prev) => Math.max(0, Math.min(100, prev + delta)));
  }

  /** 手动调整好感度 */
  function adjustIntimacy(delta: number) {
    setIntimacy((prev) => {
      const next = Math.max(0, Math.min(100, prev + delta));
      showToast(delta > 0 ? `好感度 +${delta}` : `好感度 ${delta}`);
      return next;
    });
  }

  /** 处理待回复消息（等待用户停了再统一回复） */
  function processPendingReplies() {
    if (pendingMessages.current.length === 0) return;

    const context = pendingMessages.current.join(' ');
    pendingMessages.current = [];

    setTyping(true);
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;

    schedule(() => {
      setTyping(false);
      if (Math.random() < (intimacyRef.current > 80 ? 0.3 : 0.2)) {
        triggerToolCall();
      } else {
        streamReplies(pickReplies(context, intimacyRef.current));
      }
    }, 900);
  }

  /** 发送消息：聚合成批，等用户停了再回 */
  function sendMsg() {
    const txt = input.trim();
    if (!txt) return;
    appendMsg('user', txt);
    setInput('');
    resetIdleTimer();
    adjustIntimacyForMessage(txt);

    // 加入待处理队列
    pendingMessages.current.push(txt);

    // 重置等待计时器（每次新消息都重新计时4秒）
    if (replyTimer.current) window.clearTimeout(replyTimer.current);
    replyTimer.current = window.setTimeout(processPendingReplies, REPLY_WAIT_MS);

    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }

  // ---- 防冷落 ----
  const IDLE_MS = 25000;
  function resetIdleTimer() { if (idleTimer.current) window.clearTimeout(idleTimer.current); }

  function proactiveMessage() {
    if (idleCount.current >= 2) return;
    idleCount.current += 1;
    setTyping(true);
    schedule(() => {
      setTyping(false);
      streamReplies(PROACTIVE_MESSAGES[idleCount.current - 1]);
    }, 1200);
    setIntimacy((prev) => Math.min(100, prev + 1));
    resetIdleTimer();
    idleTimer.current = window.setTimeout(proactiveMessage, IDLE_MS * 2);
  }

  // ---- 报备系统 ----
  function startReportTimer() {
    reportTimer.current = window.setTimeout(() => {
      if (Math.random() < 0.4) {
        const msg = REPORT_MESSAGES[Math.floor(Math.random() * REPORT_MESSAGES.length)];
        streamReplies(msg);
      }
      startReportTimer();
    }, REPORT_INTERVAL);
  }

  useEffect(() => {
    intimacyRef.current = intimacy;
  }, [intimacy]);

  useEffect(() => {
    const timers = delayedTimers.current;
    idleTimer.current = window.setTimeout(proactiveMessage, IDLE_MS);
    startReportTimer();
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (reportTimer.current) window.clearTimeout(reportTimer.current);
      if (replyTimer.current) window.clearTimeout(replyTimer.current);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleVoice() {
    if (!listening) { setListening(true); }
    else { setListening(false); setInput('我今天有点累'); }
  }

  const showToast = (msg: string) => { setToast(msg); schedule(() => setToast(null), 2000); };
  const stageName = getStageName(intimacy);

  return (
    <div className="chat-page">
      <header className="chat-topbar">
        <button className="back" onClick={() => navigate(-1)} aria-label="返回">←</button>
        <div className="partner">
          <div className="partner-avatar">{partner.avatar}</div>
          <div>
            <div className="partner-name">{partner.name}</div>
            <div className="partner-status">{stageName} · 认识 7 天 · {stageName === '亲密' ? '💗💗💗💗💗' : stageName === '暧昧' ? '💗💗💗' : '💗'}</div>
          </div>
        </div>
        <button className="edit-btn" onClick={() => navigate('/', { state: { persona: routePersona } })}>✏️ 改设定</button>
      </header>

      <div className="chat-body">
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
            <div className="tags">{DEFAULT_PARTNER.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          </div>
          <div className="side-card">
            <h4>🧠 记得的事</h4>
            <ul className="memo-list">{DEFAULT_PARTNER.memos.map((m) => <li key={m}>{m}</li>)}</ul>
            <div className="memo-more" onClick={() => showToast('打开记忆页（后续接入）')}>查看全部 →</div>
          </div>
        </aside>

        <main className="chat-main">
          <div className="chat-box" ref={boxRef}>
            <div className="time-divider">今天 21:04</div>
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === 'ai' && <div className="avatar-sm">{partner.avatar}</div>}
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
              <span className="typing-txt">{partner.name} 正在输入…</span>
            </div>
          )}

          <div className="chat-input">
            <button className="mic-btn" onClick={toggleVoice}>{listening ? '⏹️' : '🎙️'}</button>
            <input type="text" value={input} placeholder="说点什么…（Enter 发送）"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMsg(); }} />
            <button className="send-btn" onClick={sendMsg}>发送</button>
          </div>
          {listening && <div className="voice-ind">🎙️ 正在聆听…（点 ⏹️ 结束）</div>}
        </main>
      </div>

      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

const initialMessages: ChatMessage[] = [
  { id: 'init1', role: 'ai', time: '21:04', content: '下班了？今天应该挺累的吧。', memoRef: '💬 记得你上周说最近都在加班' },
  { id: 'init2', role: 'user', time: '21:04', content: '嗯……有一点，感觉快被方案压垮了' },
  { id: 'init3', role: 'ai', time: '21:05', content: '过来，靠一会儿。方案写不完可以明天写，人垮了就什么都没了。', emotionTag: '💗 共情模式' },
  { id: 'init4', role: 'user', time: '21:05', content: '谢谢你……你真好' },
];
