import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PersonaDraft, Sex } from '../types/persona';
import { SEX_OPTIONS, NAME_MAX_LEN, EMPTY_PERSONA_DRAFT } from '../constants/persona';
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

          {/* 窗口5：音色（预留） */}
          <section className="pe-win pe-full">
            <h3>
              <span className="pe-no">5</span>音色
              <span className="pe-badge">语音模块完成后开放</span>
            </h3>
            <p className="pe-tip">选择 TA 的声音（温柔 / 元气 / 清冷 / 磁性……）</p>
            <div className="pe-lock">🔒 音色选择将在语音模块上线后解锁，敬请期待</div>
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
