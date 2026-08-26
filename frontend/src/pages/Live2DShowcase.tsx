import { useState } from 'react';
import { Link } from 'react-router-dom';
import Live2DCharacter from '../components/live2d/Live2DCharacter';
import type { Live2DMood } from '../constants/live2d';
import './Live2DShowcase.css';

const MOODS = [
  { id: 'neutral', label: '😐 平静', color: '#999' },
  { id: 'happy',   label: '😊 开心', color: '#ff7eb3' },
  { id: 'shy',     label: '😳 害羞', color: '#ff9ec6' },
  { id: 'sad',     label: '😢 难过', color: '#7eb3ff' },
  { id: 'angry',   label: '😠 生气', color: '#ff5555' },
  { id: 'flirty',  label: '😏 撩人', color: '#e87eb3' },
  { id: 'surprise',label: '😮 惊讶', color: '#ffb87e' },
];

export default function Live2DShowcase() {
  const [mood, setMood] = useState<Live2DMood>('neutral');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="showcase-page">
      <div className="showcase-header">
        <Link to="/" className="back">← 返回</Link>
        <h2>Live2D 形象测试</h2>
        <span className={`status ${ready ? 'ok' : ''}`}>
          {error ? `❌ ${error}` : ready ? '✅ 模型已加载' : '⏳ 加载中...'}
        </span>
      </div>

      <div className="showcase-body">
        {/* Live2D 角色显示区 */}
        <div className="showcase-canvas">
          <Live2DCharacter
            mood={mood}
            visible={true}
            onReady={() => { setError(null); setReady(true); }}
            onError={(loadError) => { setReady(false); setError(loadError.message); }}
          />
        </div>

        {/* 控制面板 */}
        <div className="showcase-controls card">
          <h3>表情切换</h3>
          <div className="mood-grid">
            {MOODS.map((m) => (
              <button
                key={m.id}
                className={`mood-btn ${mood === m.id ? 'active' : ''}`}
                style={{ '--btn-color': m.color } as React.CSSProperties}
                onClick={() => setMood(m.id as Live2DMood)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <h3>交互测试</h3>
          <p className="hint">点击角色触发动作</p>
          <p className="hint">鼠标移动 → 眼睛/头部跟踪</p>

          <div className="tips card">
            <b>💡 使用说明</b>
            <ul>
              <li>模型来自 Cubism SDK 官方示例 (Haru)</li>
              <li>后续替换为自定义角色模型</li>
              <li>情绪标签会自动驱动表情切换</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
