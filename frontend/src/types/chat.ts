/** 对话系统 - 类型定义 */

/** 消息角色 */
export type MsgRole = 'ai' | 'user' | 'sys';

/** 单条消息 */
export interface ChatMessage {
  id: string;
  role: MsgRole;
  content: string;
  /** 记忆引用（可选，AI 消息里提到用户过去说过的话） */
  memoRef?: string;
  /** 情绪标注（可选，如"共情模式"） */
  emotionTag?: string;
  /** 发送时间 */
  time: string;
}

/** 恋人（对话页头部信息） */
export interface ChatPartner {
  name: string;
  avatar: string;
  status: string;
  /** 关系阶段 */
  stage: string;
  /** 亲密度 0-100 */
  intimacy: number;
  /** 性格标签 */
  tags: string[];
  /** 记得的事 */
  memos: string[];
}
