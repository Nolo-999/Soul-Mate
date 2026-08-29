import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ChatMessage } from '../types/chat';
import type { PersonaDraft } from '../types/persona';
import {
  pickReplies, PROACTIVE_MESSAGES, DEFAULT_PARTNER, RETRACT_POOL,
  inferEmotion, type ChatEmotion,
} from '../constants/chat';
import Live2DCharacter from '../components/live2d/Live2DCharacter';
import { recallMemories, extractMemories } from '../api/memory';
import { speechQueue, type TtsEmotion } from '../api/voice';
import { decideProactiveMessage, type ProactiveDecision } from '../api/relationship';
import { requestAgentReply } from '../api/chat';
import { useSettingsStore } from '../stores/settings';
import './ChatPage.css';

/** 等待用户停止输入的时间（ms） */
const REPLY_WAIT_MS = 4000;

/** 情绪表情持续多久后回落到平静（ms） */
const MOOD_DECAY_MS = 12000;

/** 情绪徽标文案 */
const MOOD_LABELS: Record<ChatEmotion, string> = {
  happy: '😊 开心', shy: '😳 害羞', sad: '🥺 心疼',
  angry: '😠 生气', flirty: '😏 撩人', surprise: '😮 惊讶', neutral: '😌 平静',
};

function proactiveReply(tone: ProactiveDecision['tone'], intimacy: number): string[] {
  if (intimacy <= 60) {
    return tone === 'gentle'
      ? ['路过想起你。要是在忙，不用急着回。']
      : ['有空再回我就好。'];
  }
  return PROACTIVE_MESSAGES[Math.floor(Math.random() * PROACTIVE_MESSAGES.length)];
}

/** 对话系统页面 */
export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routePersona = location.state?.persona as PersonaDraft | undefined;
  const settings = useSettingsStore();
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
  const [intimacy, setIntimacy] = useState(settings.intimacy);
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
  const roundsSinceMemo = useRef(0);          // 距上次记忆引用的对话轮数
  const memoCiteTimes = useRef<number[]>([]); // 最近引用时间戳（每小时上限用）
  const idleTimer = useRef<number | null>(null);
  const replyTimer = useRef<number | null>(null);
  const delayedTimers = useRef(new Set<number>());
  const pendingMessages = useRef<string[]>([]); // 待回复的用户消息队列
  const idleCount = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const intimacyRef = useRef(intimacy);
  const proactiveChecking = useRef(false);
  const proactiveDelay = settings.companionship === 'gentle' ? 600_000 : 180_000;

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
    if (role === 'ai' && settings.notificationsEnabled && document.visibilityState === 'hidden'
      && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(partner.name, { body: content.slice(0, 80) });
    }
    scrollBottom();
  }

  /** 逐条蹦出 AI 回复（拟人化节奏，支持撤回；memoRef 为真实记忆引用，可选） */
  function streamReplies(list: string[], memoRef?: string, emotionOverride?: ChatEmotion) {
    const shouldRetract = Math.random() < 0.1 && list.length >= 2;

    // 情绪联动：AI 开口说话时，形象同步变表情
    const emotion = emotionOverride ?? inferEmotion(list.join(' '), intimacyRef.current);
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
    if (settings.autoMemory) {
      void extractMemories(context, context);
    }

    try {
      const agentReply = await requestAgentReply({
        message: context,
        intimacy: intimacyRef.current,
        personaName: partner.name,
        personaSetting: routePersona?.setting ?? '',
        replyStyle: settings.replyStyle,
        history: messages.slice(-10).reduce<{ role: 'user' | 'ai'; content: string }[]>((history, message) => {
          if (message.role === 'user' || message.role === 'ai') {
            history.push({ role: message.role, content: message.content });
          }
          return history;
        }, []),
      });
      schedule(() => {
        setTyping(false);
        if (agentReply.intimacyDelta !== 0) {
          setIntimacy((previous) => {
            const next = Math.max(0, Math.min(100, previous + agentReply.intimacyDelta));
            settings.updateSettings({ intimacy: next });
            return next;
          });
        }
        streamReplies([agentReply.reply], memoRef, agentReply.emotion);
      }, 350);
    } catch {
      // 后端不可用时保持关系不变，并采用当前阶段的保守本地回复。
      schedule(() => {
        setTyping(false);
        streamReplies(pickReplies(context, intimacyRef.current, settings.replyStyle), memoRef);
      }, 350);
    }
  }

  /** 发送消息：聚合成批，等用户停了再回 */
  function sendMsg() {
    const txt = input.trim();
    if (!txt) return;
    appendMsg('user', txt);
    setInput('');
    resetIdleTimer();

    // 加入待处理队列
    pendingMessages.current.push(txt);

    // 重置等待计时器（每次新消息都重新计时4秒）
    if (replyTimer.current) window.clearTimeout(replyTimer.current);
    replyTimer.current = window.setTimeout(processPendingReplies, REPLY_WAIT_MS);

    scrollBottom();
  }

  // ---- 防冷落 ----
  function resetIdleTimer(delay = proactiveDelay) {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (settings.companionship !== 'off') {
      idleTimer.current = window.setTimeout(proactiveMessage, delay);
    }
  }

  async function proactiveMessage() {
    if (settings.companionship === 'off') return;
    if (idleCount.current >= 2) return;
    if (intimacyRef.current <= 40 || proactiveChecking.current) return;

    proactiveChecking.current = true;
    let decision: ProactiveDecision;
    try {
      decision = await decideProactiveMessage({
        intimacy: intimacyRef.current,
        personaSetting: routePersona?.setting ?? '',
        recentMessages: messages.slice(-8).reduce<{ role: 'user' | 'ai'; content: string }[]>((history, message) => {
          if (message.role === 'user' || message.role === 'ai') {
            history.push({ role: message.role, content: message.content });
          }
          return history;
        }, []),
        idleSeconds: Math.floor(proactiveDelay / 1000),
      });
    } catch {
      resetIdleTimer(proactiveDelay * 2);
      proactiveChecking.current = false;
      return;
    }
    proactiveChecking.current = false;

    if (!decision.shouldInitiate) {
      resetIdleTimer(proactiveDelay * 2);
      return;
    }

    idleCount.current += 1;
    setTyping(true);
    schedule(() => {
      setTyping(false);
      streamReplies(proactiveReply(decision.tone, intimacyRef.current));
    }, 1200);
    resetIdleTimer(proactiveDelay * 2);
  }

  useEffect(() => {
    intimacyRef.current = intimacy;
  }, [intimacy]);

  useEffect(() => {
    setIntimacy(settings.intimacy);
  }, [settings.intimacy]);

  useEffect(() => {
    speechQueue.setPlaybackRate(settings.ttsSpeed);
  }, [settings.ttsSpeed]);

  useEffect(() => {
    const timers = delayedTimers.current;
    resetIdleTimer();
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (replyTimer.current) window.clearTimeout(replyTimer.current);
      if (moodTimer.current) window.clearTimeout(moodTimer.current);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
    // Timers are recreated when the companionship mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.companionship]);

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
  return (
    <div
      className={`chat-page${settings.backgroundImage ? ' has-custom-background' : ''}`}
      style={{
        '--chat-font-size': settings.fontSize === 'small' ? '13px' : settings.fontSize === 'large' ? '16px' : '14px',
        ...(settings.backgroundImage ? {
          backgroundImage: `linear-gradient(var(--bg-glass-wash, rgba(250,250,248,0.8)), var(--bg-glass-wash, rgba(250,250,248,0.8))), url(${settings.backgroundImage})`,
        } : {}),
      } as React.CSSProperties}
    >
      <header className="chat-topbar">
        <button className="back" onClick={() => navigate(-1)} aria-label="返回">←</button>
        <div className="partner">
          <div className="partner-avatar">{partner.avatar}</div>
          <div className="partner-name">{partner.name}</div>
        </div>
        <button className={`edit-btn ${ttsOn ? 'tts-on' : ''}`} onClick={toggleTts} title="语音朗读开关">
          {ttsOn ? '🔊 语音中' : '🔈 语音'}
        </button>
        <button className="edit-btn" onClick={() => navigate('/settings', { state: { persona: routePersona } })}>⚙️ 设置</button>
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
