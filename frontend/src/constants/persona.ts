import type { Sex } from '../types/persona';

/** 性别选项（单选） */
export const SEX_OPTIONS: { value: Sex; emoji: string; label: string }[] = [
  { value: '男', emoji: '👨', label: '男' },
  { value: '女', emoji: '👩', label: '女' },
  { value: '其他', emoji: '🌈', label: '其他' },
];

/** 昵称长度上限 */
export const NAME_MAX_LEN = 12;

/** 人格草稿初始值 */
export const EMPTY_PERSONA_DRAFT = {
  name: '',
  sex: '' as Sex | '',
  setting: '',
  bio: '',
  voice: null, // 音色：默认不用语音，用户在捏人页可选
};
