import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EMPTY_MBTI_SCORES, MBTI_QUESTIONS, calcMbti, getMbtiPole, getMbtiType } from '../constants/mbti';
import { DIM_POLES, type MbtiScores } from '../constants/mbti/types';
import './MbtiTestPage.css';

/** MBTI 完整测试页（40题 · 四维度计分） */
export default function MbtiTestPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 当前题号（0开始）
  const [answers, setAnswers] = useState<MbtiScores>({ ...EMPTY_MBTI_SCORES });
  const [done, setDone] = useState(false);

  const q = MBTI_QUESTIONS[step];
  const total = MBTI_QUESTIONS.length;
  const progress = Math.round((step / total) * 100);

  /** 选择答案 */
  function choose(side: 0 | 1) {
    const key = getMbtiPole(q.dim, side);
    setAnswers((current) => ({ ...current, [key]: current[key] + 1 }));
    if (step + 1 >= total) {
      setDone(true);
    } else {
      setStep(step + 1);
    }
  }

  /** 跳过测试 */
  function skip() {
    navigate('/');
  }

  if (done) {
    const result = calcMbti(answers);
    const info = getMbtiType(result.type);
    return (
      <div className="mbti-page">
        <div className="mbti-done card">
          <div className="done-icon">🎉</div>
          <h2>你是 <span className="grad-text">{result.type}</span></h2>
          {info && <p className="type-name">{info.name}</p>}
          {info && <p className="type-desc">{info.desc}</p>}
          <div className="dim-bars">
            {(['EI', 'SN', 'TF', 'JP'] as const).map((dim) => {
              const [left, right] = DIM_POLES[dim];
              return (
                <div key={dim} className="dim-row">
                  <span className="dim-letter">{left}</span>
                  <div className="dim-bar">
                    <div className="dim-fill" style={{ width: `${result.percentages[left]}%` }} />
                  </div>
                  <span className="dim-letter">{right}</span>
                </div>
              );
            })}
          </div>
          {info && <div className="match-card"><b>💞 为你推荐：</b><span>{info.match}</span></div>}
          <button className="btn-primary" onClick={() => navigate('/', { state: { mbti: result.type } })}>
            进入定制工坊 →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mbti-page">
      <div className="mbti-header">
        <button className="back" onClick={() => navigate(-1)}>← 返回</button>
        <h2>MBTI 完整测试</h2>
        <span className="progress-txt">{step + 1} / {total}</span>
      </div>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>

      <div className="mbti-card card">
        <p className="mbti-q">{q.q}</p>
        <button className="option-btn" onClick={() => choose(0)}>{q.o[0]}</button>
        <button className="option-btn" onClick={() => choose(1)}>{q.o[1]}</button>
      </div>

      <div className="mbti-footer">
        <button className="skip-btn" onClick={skip}>跳过测试，直接定制</button>
      </div>
    </div>
  );
}
