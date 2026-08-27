import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PersonaDraft, Sex } from '../types/persona';
import { SEX_OPTIONS, NAME_MAX_LEN, EMPTY_PERSONA_DRAFT } from '../constants/persona';
import { listVoices, synthesizeSpeech, type VoiceInfo } from '../api/voice';
import './PersonaCreatePage.css';

/** 人格引擎 - 创建页面（多窗口布局） */
export default function PersonaCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState<PersonaDraft>(() => ({
    ...EMPTY_PERSONA_DRAFT,
    ...location.state?.persona,
  }));
  const [toast, setToast] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // 加载音色目录
  useEffect(() => {
    listVoices().then(setVoices).catch(() => setVoices([]));
  }, []);

  // 卸载时停止试听
  useEffect(() => () => previewAudioRef.current?.pause(), []);

  /** 试听音色 */
  async function previewVoice(v: VoiceInfo) {
    if (previewingId === v.id) { // 再点一次 = 停止
      previewAudioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    previewAudioRef.current?.pause();
    setPreviewingId(v.id);
    try {
      const sampleText =
        v.gender === '男' ? '你好，我是你的专属恋人。往后余生，请多指教。'
        : v.gender === '中性' ? '嗨，很高兴认识你。我的声音，你喜欢吗？'
        : '嗨~我是你的专属恋人哦。今天也要开开心心的！';
      const url = await synthesizeSpeech(sampleText, v.id, 'neutral');
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingId(null);
      audio.onerror = () => { setPreviewingId(null); showToast('试听失败，请稍后再试'); };
      await audio.play();
    } catch {
      setPreviewingId(null);
      showToast('试听失败（后端未启动？）');
    }
  }

  // ---- 更新草稿 ----
  const set = <K extends keyof PersonaDraft>(key: K, value: PersonaDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // ---- 性别单选：点同一个取消，否则设为该选项 ----
  const toggleSex = (s: Sex) => set('sex', draft.sex === s ? '' : s);

  // ---- 保存 ----
  const save = () => {
    if (!draft.name.trim()) {
      showToast('先给 TA 起个名字吧~');
      return;
    }
    navigate('/chat', { state: { persona: draft, mbti: location.state?.mbti } });
  };

  // ---- 重置 ----
  const reset = () => {
    setDraft({ ...EMPTY_PERSONA_DRAFT });
    showToast('已重置');
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  // ---- 预览头像 ----
  const avatarEmoji =
    draft.sex === '男' ? '👨' : draft.sex === '女' ? '👩' : draft.sex === '其他' ? '🌈' : '💞';

  return (
    <div className="pe-page">
      {/* 顶栏 */}
      <header className="pe-topbar">
        <h1>SoulMate · 人格引擎</h1>
        <div className="pe-topbar-right">
          <span className="pe-crumb">定制工坊 → 创建恋人</span>
          <button className="pe-back" onClick={() => navigate('/mbti')}>🧭 MBTI 测试</button>
          <button className="pe-back" onClick={() => navigate(-1)}>← 返回</button>
        </div>
      </header>

      <div className="pe-wrap">
        {/* 多窗口网格 */}
        <div className="pe-grid">
          {/* 窗口1：昵称 */}
          <section className="pe-win">
            <h3><span className="pe-no">1</span>昵称</h3>
            <p className="pe-tip">TA 的名字，之后聊天中会一直这样称呼</p>
            <input
              type="text"
              maxLength={NAME_MAX_LEN}
              placeholder="例如：沈知夏"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <div className="pe-counter">{draft.name.length}/{NAME_MAX_LEN}</div>
          </section>

          {/* 窗口2：性别（单选） */}
          <section className="pe-win">
            <h3><span className="pe-no">2</span>性别</h3>
            <p className="pe-tip">单选，决定 TA 的声音与称呼方式</p>
            <div className="pe-sex-group">
              {SEX_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`pe-sex-btn${draft.sex === opt.value ? ' on' : ''}`}
                  onClick={() => toggleSex(opt.value)}
                >
                  <span className="pe-sex-emoji">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* 窗口3：智能体设定 */}
          <section className="pe-win pe-full">
            <h3><span className="pe-no">3</span>智能体设定</h3>
            <p className="pe-tip">TA 的性格、背景故事、说话风格、价值观……越详细越像真人</p>
            <textarea
              rows={5}
              placeholder="例如：28 岁外科医生，表面高冷毒舌，内心细腻温柔。喜欢古典音乐和雨天。对喜欢的人会笨拙地关心，吃醋时嘴硬。说话简洁克制，但会偷偷记下你随口提过的小事……"
              value={draft.setting}
              onChange={(e) => set('setting', e.target.value)}
            />
            <div className="pe-counter">{draft.setting.length} 字</div>
          </section>

          {/* 窗口4：对外简介 */}
          <section className="pe-win pe-full">
            <h3><span className="pe-no">4</span>对外简介</h3>
            <p className="pe-tip">展示在 TA 的档案页 / 广场上的一句话介绍（可以藏一点小彩蛋）</p>
            <textarea
              rows={2}
              placeholder="例如：表面冷静理性，唯独对你温柔。"
              value={draft.bio}
              onChange={(e) => set('bio', e.target.value)}
            />
            <div className="pe-counter">{draft.bio.length} 字</div>
          </section>

          {/* 窗口5：音色选择（语音模块已上线） */}
          <section className="pe-win pe-full">
            <h3>
              <span className="pe-no">5</span>音色
              {draft.voice && <span className="pe-badge on">已选定</span>}
            </h3>
            <p className="pe-tip">点卡片试听 TA 的声音，再选一个最喜欢的（可不选）</p>
            {voices.length === 0 ? (
              <div className="pe-lock">音色目录加载失败，请确认后端服务已启动</div>
            ) : (
              <div className="pe-voice-grid">
                {voices.map((v) => (
                  <div
                    key={v.id}
                    className={`pe-voice-card${draft.voice === v.id ? ' selected' : ''}${previewingId === v.id ? ' playing' : ''}`}
                    onClick={() => set('voice', draft.voice === v.id ? null : v.id)}
                  >
                    <button
                      className="pe-voice-play"
                      title={previewingId === v.id ? '停止试听' : '试听'}
                      onClick={(e) => { e.stopPropagation(); void previewVoice(v); }}
                    >
                      {previewingId === v.id ? '⏹' : '▶'}
                    </button>
                    <div className="pe-voice-name">{v.name}</div>
                    <div className="pe-voice-style">{v.style} · {v.gender}</div>
                    <div className="pe-voice-desc">{v.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* 实时预览 */}
        <section className="pe-preview">
          <h3>👀 实时预览</h3>
          <div className="pe-persona-card">
            <div className="pe-avatar">{avatarEmoji}</div>
            <div className="pe-persona-info">
              <div className="pe-name">
                {draft.name || '未命名恋人'}
                {draft.sex && <span className="pe-sex-tag">{draft.sex}</span>}
              </div>
              <div className="pe-bio">{draft.bio || '一句话简介会在上方生成'}</div>
            </div>
          </div>
        </section>

        {/* 操作按钮 */}
        <div className="pe-actions">
          <button className="pe-btn pe-btn-ghost" onClick={reset}>重置</button>
          <button className="pe-btn pe-btn-primary" onClick={save}>💞 保存并生成 TA</button>
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="pe-toast show">{toast}</div>}
    </div>
  );
}
