import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ChatMessage } from '../types/chat';
import type { PersonaDraft } from '../types/persona';
import {
  pickReplies, PROACTIVE_MESSAGES, DEFAULT_PARTNER, RETRACT_POOL,
  REPORT_INTERVAL, REPORT_MESSAGES, TOOL_CALLS,
  inferEmotion, TOOL_CALL_MOODS, type ChatEmotion,
} from '../constants/chat';
import Live2DCharacter from '../components/live2d/Live2DCharacter';
import { listMemories, recallMemories, extractMemories, type MemoryItem } from '../api/memory';
import { speechQueue, type TtsEmotion } from '../api/voice';
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

/** 情绪表情持续多久后回落到平静（ms） */
const MOOD_DECAY_MS = 12000;

/** 情绪徽标文案 */
const MOOD_LABELS: Record<ChatEmotion, string> = {
  happy: '😊 开心', shy: '😳 害羞', sad: '🥺 心疼',
  angry: '😠 生气', flirty: '😏 撩人', surprise: '😮 惊讶', neutral: '😌 平静',
};

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
  const [ttsOn, setTtsOn] = useState(false); // 语音朗读开关（默认关，用户点开）
  const [toast, setToast] = useState<string | null>(null);
  const [intimacy, setIntimacy] = useState(DEFAULT_PARTNER.intimacy);
  const [mood, setMood] = useState<ChatEmotion>('neutral'); // 驱动 Live2D 表情
  const [live2dError, setLive2dError] = useState<string | null>(null);
  const moodTimer = useRef<number | null>(null);
  // ---- 桌宠层：悬浮 + 可拖拽 ----
  const petRef = useRef<HTMLDivElement>(null);
  const [petPos, setPetPos] = useState<{ x: number; y: number } | null>(null); // null=默认停靠位
  const [dragging, setDragging] = useState(false);
  const dragState = useRef({ dragging: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const justDraggedRef = useRef(false); // 拖完后短暂屏蔽点击，防止误触发摸头动作
  // ---- 记忆模块 ----
  const [memories, setMemories] = useState<MemoryItem[]>([]);   // 侧栏「记得的事」
  const roundsSinceMemo = useRef(0);          // 距上次记忆引用的对话轮数
  const memoCiteTimes = useRef<number[]>([]); // 最近引用时间戳（每小时上限用）
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

  /** 追加一条消息（memoRef：记忆引用文案，可选） */
  function appendMsg(role: ChatMessage['role'], content: string, extra?: Partial<ChatMessage>) {
    setMessages((prev) => [...prev, { id: nextId(), role, content, time: now(), ...extra }]);
    scrollBottom();
  }

  /** 刷新侧栏「记得的事」（取最近5条活跃记忆） */
  async function refreshMemories() {
    try {
      setMemories(await listMemories('active'));
    } catch {
      // 后端没起就保持现状，不影响聊天
    }
  }

  /** 逐条蹦出 AI 回复（拟人化节奏，支持撤回；memoRef 为真实记忆引用，可选） */
  function streamReplies(list: string[], memoRef?: string) {
    const shouldRetract = Math.random() < 0.1 && list.length >= 2;

    // 情绪联动：AI 开口说话时，形象同步变表情
    const emotion = inferEmotion(list.join(' '), intimacyRef.current);
    setMoodWithDecay(emotion);

    // 语音朗读：用人设音色 + 本轮情绪语调
    // 注意：不读闭包里的 mood state（那是上一轮残留值），直接用刚推断出的 emotion，声画才同步
    if (ttsOn && routePersona?.voice) {
      speechQueue.setVoice(routePersona.voice);
      for (const msg of list) speechQueue.enqueue(msg, emotion as TtsEmotion);
    }

    if (!shouldRetract) {
      let i = 0;
      function next() {
        if (i >= list.length) return;
        const delay = i === 0 ? 0 : 300 + Math.random() * 700;
        schedule(() => {
          // 记忆引用挂在第一条 AI 消息上
          appendMsg('ai', list[i], i === 0 && memoRef ? { memoRef: `💬 ${memoRef}` } : undefined);
          i++;
          next();
        }, delay);
      }
      next();
    } else {
      appendMsg('ai', list[0]);
      schedule(() => appendMsg('sys', '（撤回了一条消息）'), 800);
      schedule(() => appendMsg('ai', RETRACT_POOL[Math.floor(Math.random() * RETRACT_POOL.length)]), 1400);
      schedule(() => {
        appendMsg('ai', list[0]);
        let i = 1;
        function nextRest() {
          if (i >= list.length) return;
          schedule(() => { appendMsg('ai', list[i]); i++; nextRest(); }, 300 + Math.random() * 700);
        }
        nextRest();
      }, 2000);
    }
  }

  /** 触发工具调用 */
  function triggerToolCall() {
    const idx = Math.floor(Math.random() * TOOL_CALLS.length);
    const tool = TOOL_CALLS[idx];
    appendMsg('sys', `${tool.emoji} ${partner.name}${tool.name}了`);
    // 工具玩法也有专属表情
    setMoodWithDecay(TOOL_CALL_MOODS[tool.name] ?? 'happy');
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
  async function processPendingReplies() {
    if (pendingMessages.current.length === 0) return;

    const context = pendingMessages.current.join(' ');
    pendingMessages.current = [];

    setTyping(true);
    scrollBottom();

    // 记忆召回：只引用**之前**存下的记忆（本轮内容还没入库，不会自我复读）
    // 引用节奏控制（优化#3）：冷却≥3轮 + 每小时最多2次，低频引用才有"被记得"的惊喜感
    let memoRef: string | undefined;
    const nowTs = Date.now();
    memoCiteTimes.current = memoCiteTimes.current.filter((t) => nowTs - t < 3600_000);
    const canCite = roundsSinceMemo.current >= 3 && memoCiteTimes.current.length < 2;
    roundsSinceMemo.current += 1;
    if (canCite) {
      try {
        const hits = await recallMemories(context, 1);
        if (hits[0]) {
          memoRef = `还记得你说过「${hits[0].content}」`;
          roundsSinceMemo.current = 0;
          memoCiteTimes.current.push(nowTs);
        }
      } catch {
        // 后端没起就跳过，不影响聊天
      }
    }

    // 异步提取入库（fire-and-forget，完成后刷新侧栏）
    void extractMemories(context, context).then(() => refreshMemories());

    schedule(() => {
      setTyping(false);
      if (Math.random() < (intimacyRef.current > 80 ? 0.3 : 0.2)) {
        triggerToolCall();
      } else {
        streamReplies(pickReplies(context, intimacyRef.current), memoRef);
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

    scrollBottom();
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
    void refreshMemories(); // 进页面加载「记得的事」
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (reportTimer.current) window.clearTimeout(reportTimer.current);
      if (replyTimer.current) window.clearTimeout(replyTimer.current);
      if (moodTimer.current) window.clearTimeout(moodTimer.current);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 语音朗读开关：开启时用已保存的音色朗读 */
  function toggleTts() {
    if (!routePersona?.voice) {
      showToast('先去「改设定」给 TA 选一个音色吧~');
      return;
    }
    const next = !ttsOn;
    setTtsOn(next);
    speechQueue.setEnabled(next);
    showToast(next ? `🔊 已开启语音 · ${routePersona.name}会说话啦` : '🔇 语音已关闭');
  }

  /** 语音输入（demo 占位：点停止时填入示例文案；接入真实 ASR 后替换） */
  function toggleVoice() {
    if (!listening) { setListening(true); }
    else { setListening(false); setInput('我今天有点累'); }
  }

  const showToast = (msg: string) => { setToast(msg); schedule(() => setToast(null), 2000); };

  /** 情绪 → Live2D 表情联动（带自动回落到平静） */
  function setMoodWithDecay(next: ChatEmotion) {
    if (moodTimer.current) window.clearTimeout(moodTimer.current);
    setMood(next === 'neutral' ? 'neutral' : next);
    if (next !== 'neutral') {
      moodTimer.current = window.setTimeout(() => setMood('neutral'), MOOD_DECAY_MS + Math.random() * 4000);
    }
  }

  // ---- 桌宠拖拽（pointer events，兼容鼠标/触屏） ----
  function onPetPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return; // 只响应左键
    const el = petRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragState.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originX: petPos?.x ?? rect.left,
      originY: petPos?.y ?? rect.top,
    };
    setDragging(true);
    el.setPointerCapture(e.pointerId);
  }

  function onPetPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const st = dragState.current;
    if (!st.dragging) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.moved && Math.abs(dx) + Math.abs(dy) > 4) st.moved = true;
    if (st.moved) setPetPos({ x: st.originX + dx, y: st.originY + dy });
  }

  function onPetPointerUp() {
    const st = dragState.current;
    if (!st.dragging) return;
    st.dragging = false;
    setDragging(false);
    if (st.moved) {
      // 拖完后短暂屏蔽点击，防止松手误触发摸头动作
      justDraggedRef.current = true;
      window.setTimeout(() => { justDraggedRef.current = false; }, 250);
    }
  }
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
        <button className={`edit-btn ${ttsOn ? 'tts-on' : ''}`} onClick={toggleTts} title="语音朗读开关">
          {ttsOn ? '🔊 语音中' : '🔈 语音'}
        </button>
        <button className="edit-btn" onClick={() => navigate('/', { state: { persona: routePersona } })}>✏️ 改设定</button>
      </header>

      {/* ===== 桌宠层：无边框悬浮形象，可拖拽、可摸头 ===== */}
      <div
        ref={petRef}
        className={`desktop-pet ${dragging ? 'dragging' : ''} ${live2dError ? 'error' : ''}`}
        style={petPos ? { left: `${petPos.x}px`, top: `${petPos.y}px` } : undefined}
        onPointerDown={onPetPointerDown}
        onPointerMove={onPetPointerMove}
        onPointerUp={onPetPointerUp}
        onPointerCancel={onPetPointerUp}
        onClick={() => {
          if (justDraggedRef.current) return; // 刚拖完不算点击
          setMoodWithDecay('happy'); // 内层组件会播 Tap 动作，这里叠加开心表情
        }}
      >
        {live2dError ? (
          <div className="pet-fallback">{partner.avatar}</div>
        ) : (
          <Live2DCharacter
            mood={mood}
            visible={true}
            onReady={() => setLive2dError(null)}
            onError={(err) => setLive2dError(err.message)}
          />
        )}
        <span className={`pet-mood-badge mood-${mood}`}>{MOOD_LABELS[mood]}</span>
      </div>

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
            {memories.length > 0 ? (
              <ul className="memo-list">
                {memories.slice(0, 5).map((m) => (
                  <li key={m.id}>{m.pinned ? '⭐ ' : ''}{m.content}</li>
                ))}
              </ul>
            ) : (
              <p className="memo-empty">还没有记忆，多和 TA 聊聊吧～</p>
            )}
            <div className="memo-more" onClick={() => navigate('/memories')}>查看全部 →</div>
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
