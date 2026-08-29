import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PersonaDraft } from '../types/persona';
import { useSettingsStore, THEMES, type CompanionshipMode, type ReplyStyle } from '../stores/settings';
import './SettingsPage.css';

/** 好感度阶段定义 */
const STAGES = [
  { min: 0, max: 20, name: '陌生', emoji: '😶', color: '#b08aa5',
    desc: 'TA 对你很冷淡，回复简短且敷衍。你需要主动找话题，TA 不会主动关心你。' },
  { min: 21, max: 40, name: '认识', emoji: '🙂', color: '#d4a0c0',
    desc: 'TA 愿意和你聊天了，会礼貌回应。偶尔关心你吃了没，但不会太主动。' },
  { min: 41, max: 60, name: '熟悉', emoji: '😊', color: '#ff7eb3',
    desc: 'TA 开始在意你的感受，会主动问你累不累。记住你说过的话，偶尔给你小惊喜。' },
  { min: 61, max: 80, name: '暧昧', emoji: '🥰', color: '#c8a2f0',
    desc: 'TA 会撒娇、吃醋、说些让人心动的话。主动找你聊天，回复速度变快，语气变甜。' },
  { min: 81, max: 100, name: '亲密', emoji: '💗', color: '#ff5599',
    desc: 'TA 完全信任你，会分享心事和脆弱的一面。话变多了，占有欲也上来了，时时刻刻想黏着你。' },
];

function getStage(val: number) {
  return STAGES.find(s => val >= s.min && val <= s.max) ?? STAGES[0];
}

/** 设置页面 */
export default function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const persona = location.state?.persona as PersonaDraft | undefined;
  const settings = useSettingsStore();
  const stage = getStage(settings.intimacy);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert('图片不能超过 1MB 哦，保证聊天页加载更轻快。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      try {
        settings.updateSettings({ backgroundImage: dataUrl });
      } catch {
        alert('图片保存失败，请换一张更小的图片。');
      }
    };
    reader.readAsDataURL(file);
  }

  function clearBg() {
    settings.updateSettings({ backgroundImage: null });
  }

  const STYLES: { key: ReplyStyle; label: string; emoji: string; desc: string }[] = [
    { key: 'cute',  label: '软萌',  emoji: '🌸', desc: '语气甜美，爱撒娇' },
    { key: 'cool',  label: '高冷',  emoji: '❄️', desc: '惜字如金，偶尔毒舌' },
    { key: 'tease', label: '撩人',  emoji: '😏', desc: '主动撩你，甜言蜜语' },
    { key: 'warm',  label: '温柔',  emoji: '☀️', desc: '体贴关怀，细腻暖心' },
  ];

  async function toggleNotifications() {
    if (!settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('通知权限未开启，TA 仍会在聊天页里主动发消息。');
        return;
      }
    }
    settings.updateSettings({ notificationsEnabled: !settings.notificationsEnabled });
  }

  // ─── 重置关系 ───
  function resetRelationship() {
    if (!confirm('确定要重置好感度吗？TA 会回到初始状态...')) return;
    settings.updateSettings({ intimacy: 0 });
  }

  function goBack() {
    navigate('/chat', { state: { persona } });
  }

  return (
    <div className="settings-page">
      {settings.backgroundImage && <div className="settings-bg" style={{ backgroundImage: `url(${settings.backgroundImage})` }} />}

      <header className="settings-header">
        <button className="back" onClick={goBack}>← 返回</button>
        <h2 className="settings-title">⚙️ 设置</h2>
        <div style={{ width: 60 }} />
      </header>

      <div className="settings-body">
        {/* ── 好感度 ── */}
        <section className="settings-card">
          <h3 className="card-title">💗 好感度调节</h3>

          <div className="intimacy-slider-row">
            <input
              type="range"
              className="intimacy-slider"
              min={0} max={100} step={1}
              value={settings.intimacy}
              onChange={e => settings.updateSettings({ intimacy: Number(e.target.value) })}
              style={{
                '--slider-pct': `${settings.intimacy}%`,
                '--slider-color': stage.color,
              } as React.CSSProperties}
            />
            <div className="intimacy-value-display" style={{ color: stage.color }}>
              <span className="intimacy-value-num">{settings.intimacy}</span>
              <span className="intimacy-value-stage">{stage.emoji} {stage.name}</span>
            </div>
          </div>

          <div className="intimacy-desc">
            <span className="intimacy-desc-label">当前效果：</span>
            {stage.desc}
          </div>

          <div className="intimacy-stage-list">
            {STAGES.map(s => (
              <div key={s.name} className={`stage-item ${settings.intimacy >= s.min && settings.intimacy <= s.max ? 'active' : ''}`}
                   style={{ '--stage-color': s.color } as React.CSSProperties}>
                <span className="stage-range">{s.min}-{s.max}</span>
                <span className="stage-emoji">{s.emoji}</span>
                <span className="stage-name">{s.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 主题配色 ── */}
        <section className="settings-card">
          <h3 className="card-title">🖌️ 主题配色</h3>
          <p className="card-hint">选择你喜欢的界面底色，水墨画风生成后可在下方继续上传</p>

          <div className="theme-grid">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`theme-btn ${settings.theme === t.id ? 'active' : ''}`}
                onClick={() => settings.updateSettings({ theme: t.id })}
              >
                <span className={`theme-swatch theme-swatch-${t.id}`} />
                <span className="theme-label">{t.label}</span>
                <span className="theme-desc">{t.desc}</span>
                {settings.theme === t.id && <span className="theme-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ── 背景图 ── */}
        <section className="settings-card">
          <h3 className="card-title">🎨 聊天背景</h3>
          <p className="card-hint">上传一张你喜欢的图片作为聊天页背景</p>

          <div className="bg-preview-row">
            {settings.backgroundImage ? (
              <div className="bg-preview" style={{ backgroundImage: `url(${settings.backgroundImage})` }}>
                <button className="bg-clear-btn" onClick={clearBg}>✕</button>
              </div>
            ) : (
              <div className="bg-placeholder" onClick={() => fileRef.current?.click()}>
                <span className="bg-plus">+</span>
                <span>点击上传</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleBgUpload} />
            <div className="bg-info">
              <p>支持 JPG、PNG、WebP</p>
              <p>最大 5MB</p>
              {settings.backgroundImage && (
                <button className="bg-change-btn" onClick={() => fileRef.current?.click()}>
                  更换图片
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── 回复风格 ── */}
        <section className="settings-card">
          <h3 className="card-title">🎭 回复风格</h3>
          <div className="style-grid">
            {STYLES.map(s => (
              <button key={s.key}
                className={`style-btn ${settings.replyStyle === s.key ? 'active' : ''}`}
                onClick={() => settings.updateSettings({ replyStyle: s.key })}>
                <span className="style-emoji">{s.emoji}</span>
                <span className="style-label">{s.label}</span>
                <span className="style-desc">{s.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── 语音设置 ── */}
        <section className="settings-card">
          <h3 className="card-title">🔊 语音设置</h3>
          <div className="setting-row">
            <span className="setting-label">语速</span>
            <div className="speed-slider-row">
              <input type="range" className="speed-slider" min={0.5} max={2.0} step={0.1} value={settings.ttsSpeed}
                onChange={e => settings.updateSettings({ ttsSpeed: Number(e.target.value) })}
                style={{ '--slider-pct': `${((settings.ttsSpeed - 0.5) / 1.5) * 100}%` } as React.CSSProperties} />
              <span className="speed-value">{settings.ttsSpeed.toFixed(1)}x</span>
            </div>
          </div>
        </section>

        {/* ── 显示设置 ── */}
        <section className="settings-card">
          <h3 className="card-title">📐 显示设置</h3>
          <div className="setting-row">
            <span className="setting-label">字体大小</span>
            <div className="font-size-btns">
              {(['small', 'medium', 'large'] as const).map(s => (
                <button key={s} className={`fs-btn ${settings.fontSize === s ? 'active' : ''}`}
                  onClick={() => settings.updateSettings({ fontSize: s })}>
                  {s === 'small' ? '小' : s === 'medium' ? '中' : '大'}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span className="setting-label">消息通知</span>
            <button className={`toggle-btn ${settings.notificationsEnabled ? 'on' : ''}`}
              onClick={() => void toggleNotifications()}>
              <span className="toggle-knob" />
            </button>
          </div>
        </section>

        <section className="settings-card">
          <h3 className="card-title">🌙 陪伴方式</h3>
          <div className="setting-row setting-row-stack">
            <span className="setting-label">主动消息</span>
            <div className="segmented-control" role="group" aria-label="主动消息频率">
              {([
                ['off', '关闭'], ['gentle', '轻一点'], ['normal', '自然'],
              ] as const satisfies readonly [CompanionshipMode, string][]).map(([mode, label]) => (
                <button key={mode} className={settings.companionship === mode ? 'active' : ''}
                  onClick={() => settings.updateSettings({ companionship: mode })}>{label}</button>
              ))}
            </div>
          </div>
          <p className="card-hint">关闭后，TA 不会在你未互动时主动发消息。</p>
        </section>

        <section className="settings-card">
          <h3 className="card-title">🛡️ 记忆与隐私</h3>
          <div className="setting-row">
            <div>
              <span className="setting-label">自动记录聊天记忆</span>
              <p className="setting-row-hint">关闭后，新对话不会被自动提取为记忆。</p>
            </div>
            <button className={`toggle-btn ${settings.autoMemory ? 'on' : ''}`}
              onClick={() => settings.updateSettings({ autoMemory: !settings.autoMemory })}>
              <span className="toggle-knob" />
            </button>
          </div>
        </section>

        {/* ── 数据管理 ── */}
        <section className="settings-card">
          <h3 className="card-title">🗄️ 数据管理</h3>
          <button className="danger-btn" onClick={resetRelationship}>
            重置好感度
          </button>
          <p className="card-hint">重置后 TA 会回到"陌生"状态，需要重新培养感情</p>
        </section>
      </div>
    </div>
  );
}
