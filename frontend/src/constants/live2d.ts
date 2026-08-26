/**
 * Live2D 形象系统配置
 */

// 免费 Live2D 模型路径（放到 public/live2d/ 目录下）
export const LIVE2D_MODEL_PATH = '/live2d/hiyori/haru_greeter_t03.model3.json';

// 表情/动作 ID 映射（haru 模型的表情名为 f00-f07）
export const MOOD_MAP = {
  happy: { expression: 'f00', motion: 'Idle' },
  shy: { expression: 'f01', motion: 'Idle' },
  sad: { expression: 'f02', motion: 'Idle' },
  angry: { expression: 'f03', motion: 'Idle' },
  flirty: { expression: 'f04', motion: 'Idle' },
  surprise: { expression: 'f05', motion: 'Idle' },
  neutral: { expression: 'f06', motion: 'Idle' },
};

export type Live2DMood = keyof typeof MOOD_MAP;

// 默认配置
export const LIVE2D_DEFAULTS = {
  scale: 0.88,            // 预留少量画布边距
  position: { x: 0, y: 0 },
  anchor: { x: 0.5, y: 0.5 },
  bgColor: 'transparent', // 背景透明
  autoInteract: true,     // 自动鼠标追踪
  breathe: true,          // 自动呼吸动画
};
