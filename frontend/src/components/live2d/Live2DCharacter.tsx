import { useCallback, useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';
import { LIVE2D_MODEL_PATH, LIVE2D_DEFAULTS, MOOD_MAP, type Live2DMood } from '../../constants/live2d';
import './Live2DCharacter.css';

Object.assign(window, { PIXI });
Live2DModel.registerTicker(PIXI.Ticker);

interface Live2DCharacterProps {
  mood?: Live2DMood;      // 当前情绪，驱动表情切换
  modelPath?: string;     // 模型路径覆盖
  visible?: boolean;      // 是否显示
  onReady?: () => void;   // 模型加载完成回调
  onError?: (err: Error) => void;
}

function fitModel(model: Live2DModel, width: number, height: number) {
  const scale = Math.min(width / model.width, height / model.height) * LIVE2D_DEFAULTS.scale;
  model.scale.set(scale);
  model.anchor.set(LIVE2D_DEFAULTS.anchor.x, LIVE2D_DEFAULTS.anchor.y);
  model.x = width / 2;
  model.y = height / 2;
}

function applyMood(model: Live2DModel, mood: Live2DMood) {
  const { expression, motion } = MOOD_MAP[mood];
  model.expression(expression);
  model.motion(motion);
}

export default function Live2DCharacter({
  mood = 'neutral',
  modelPath = LIVE2D_MODEL_PATH,
  visible = true,
  onReady,
  onError,
}: Live2DCharacterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初始化 PixiJS + Live2D
  useEffect(() => {
    if (!visible || !containerRef.current) return;

    const container = containerRef.current;
    const { clientWidth: w, clientHeight: h } = container;

    const app = new PIXI.Application({
      width: w,
      height: h,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
    });
    container.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    let destroyed = false;

    (async () => {
      try {
        const model = await Live2DModel.from(modelPath, { autoInteract: LIVE2D_DEFAULTS.autoInteract });
        if (destroyed) { model.destroy(); return; }

        fitModel(model, w, h);

        app.stage.addChild(model);
        modelRef.current = model;
        applyMood(model, mood);
        setLoading(false);
        onReady?.();
      } catch (cause: unknown) {
        if (!destroyed) {
          const modelError = cause instanceof Error ? cause : new Error('Live2D 模型加载失败');
          setError(modelError.message);
          setLoading(false);
          onError?.(modelError);
        }
      }
    })();

    return () => {
      destroyed = true;
      app.destroy(true, { children: true, texture: true });
      appRef.current = null;
      modelRef.current = null;
    };
  }, [modelPath, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // 情绪变化 → 切换表情
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;

    try {
      applyMood(model, mood);
    } catch {
      setError('模型不支持当前表情或动作');
    }
  }, [mood]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const app = appRef.current;
      if (!app || !container) return;
      const { clientWidth: w, clientHeight: h } = container;
      app.renderer.resize(w, h);
      const model = modelRef.current;
      if (model) fitModel(model, w, h);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 点击互动
  const handleClick = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;
    try {
      model.motion('Tap');
    } catch {
      setError('模型不支持点击动作');
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="live2d-container" ref={containerRef} onClick={handleClick}>
      {loading && (
        <div className="live2d-loading">
          <div className="live2d-spinner" />
          <span>加载中...</span>
        </div>
      )}
      {error && (
        <div className="live2d-error">
          <span className="live2d-error-icon">😢</span>
          <p>{error}</p>
          <small>请检查模型资源和 Cubism Core 是否已正确加载</small>
        </div>
      )}
    </div>
  );
}
