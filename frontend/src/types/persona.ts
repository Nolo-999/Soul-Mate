/**
 * 人格引擎 - 类型定义
 * 对应 docs/人格引擎原型.html 的数据结构
 */

/** 性别（单选） */
export type Sex = '男' | '女' | '其他';

/** 人格创建草稿（前端表单数据） */
export interface PersonaDraft {
  /** 昵称 */
  name: string;
  /** 性别：男 / 女 / 其他 */
  sex: Sex | '';
  /** 智能体设定（性格、背景、说话风格等） */
  setting: string;
  /** 对外简介 */
  bio: string;
  /** 音色（Edge-TTS 音色 id；语音模块已上线，可为 null 表示不用语音） */
  voice: string | null;
}

/** 保存后的完整人格结构（后端 persona_json 对应） */
export interface Persona {
  id?: string;
  /** 基本信息 */
  basic: {
    name: string;
    sex: Sex;
    /** 对外简介 */
    bio: string;
  };
  /** 性格 8 维（后续由 LLM 从设定解析生成） */
  traits: {
    gentle: number;    // 温柔度
    clingy: number;    // 粘人度
    humor: number;     // 幽默感
    possessive: number; // 占有欲
    romance: number;   // 浪漫度
  };
  /** 说话风格 */
  speech: {
    style: string;
    nickname: string;
    catchphrases: string[];
    topics: string[];
  };
  /** 语音（语音模块完成后填充） */
  voice_id?: string | null;
  /** 关系阶段 */
  relationship: {
    stage: string;
    intimacy_level: number;
  };
  created_at?: string;
}
