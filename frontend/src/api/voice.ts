/**
 * 语音模块 API 客户端
 * 对应 backend /api/v1/voice
 */

const BASE = 'http://127.0.0.1:8000/api/v1/voice';

export interface VoiceInfo {
  id: string;
  name: string;
  gender: '男' | '女' | '中性';
  style: string;
  desc: string;
}

export type TtsEmotion = 'happy' | 'shy' | 'sad' | 'angry' | 'flirty' | 'surprise' | 'neutral';

/** 音色目录 */
export async function listVoices(): Promise<VoiceInfo[]> {
  const resp = await fetch(`${BASE}/voices`);
  if (!resp.ok) throw new Error(`音色目录 ${resp.status}`);
  const data = (await resp.json()) as { voices: VoiceInfo[] };
  return data.voices;
}

/** 合成语音并返回可播放的 blob URL（调用方负责 revoke） */
export async function synthesizeSpeech(text: string, voice: string, emotion: TtsEmotion = 'neutral'): Promise<string> {
  const resp = await fetch(`${BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, emotion }),
  });
  if (!resp.ok) throw new Error(`语音合成失败 ${resp.status}`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

/**
 * 播放队列管理器：AI 多条消息按顺序朗读，不打架
 * （单例；新消息入队自动接续播放）
 */
class SpeechQueue {
  private queue: { text: string; emotion: TtsEmotion }[] = [];
  private playing = false;
  private audio: HTMLAudioElement | null = null;
  private _enabled = false;
  private _voice = 'zh-CN-XiaoxiaoNeural';
  private listeners = new Set<() => void>();

  get enabled() { return this._enabled; }
  get voice() { return this._voice; }
  /** 当前是否正在朗读（UI 显示"正在说话"状态用） */
  get busy() { return this.playing; }

  setEnabled(on: boolean) {
    this._enabled = on;
    if (!on) this.stop();
    this.emit();
  }

  setVoice(voiceId: string) {
    this._voice = voiceId;
  }

  /** 入队一条朗读（未启用时忽略） */
  enqueue(text: string, emotion: TtsEmotion = 'neutral') {
    if (!this._enabled || !text.trim()) return;
    this.queue.push({ text, emotion });
    void this.pump();
  }

  /** 立即停止并清空 */
  stop() {
    this.queue = [];
    this.audio?.pause();
    this.audio = null;
    this.playing = false;
    this.emit();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() { this.listeners.forEach((fn) => fn()); }

  private async pump() {
    if (this.playing || this.queue.length === 0) return;
    this.playing = true;
    this.emit();

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const url = await synthesizeSpeech(item.text, this._voice, item.emotion);
        await new Promise<void>((resolve) => {
          const audio = new Audio(url);
          this.audio = audio;
          audio.onended = () => resolve();
          audio.onerror = () => resolve(); // 播放失败跳过，不阻塞队列
          void audio.play().catch(() => resolve());
        });
        URL.revokeObjectURL(url);
      } catch {
        // 单条合成失败继续下一条
      }
    }

    this.playing = false;
    this.audio = null;
    this.emit();
  }
}

export const speechQueue = new SpeechQueue();
