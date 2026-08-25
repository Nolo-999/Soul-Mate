/** MBTI 题库聚合入口：40题完整题库 + 计分 */
import { DIM_POLES, type MbtiDim, type MbtiLetter, type MbtiQuestion, type MbtiResult, type MbtiScores } from './types';
import { EI_QUESTIONS } from './questions-ei';
import { SN_QUESTIONS } from './questions-sn';
import { TF_QUESTIONS } from './questions-tf';
import { JP_QUESTIONS } from './questions-jp';
import { MBTI_TYPES_PART1 } from './types-desc';
import { MBTI_TYPES_PART2 } from './types-desc2';

/** 全部40题（EI 10 + SN 10 + TF 10 + JP 10） */
export const MBTI_QUESTIONS: MbtiQuestion[] = [
  ...EI_QUESTIONS,
  ...SN_QUESTIONS,
  ...TF_QUESTIONS,
  ...JP_QUESTIONS,
];

/** 16型人格完整描述表 */
export const MBTI_TYPES: Record<string, { name: string; desc: string; match: string }> = {
  ...MBTI_TYPES_PART1,
  ...MBTI_TYPES_PART2,
};

export const EMPTY_MBTI_SCORES: MbtiScores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

export function getMbtiPole(dim: MbtiDim, option: 0 | 1): MbtiLetter {
  return DIM_POLES[dim][option];
}

/** 由题目选项计分（key: E/I/S/N/T/F/J/P → 得分） */
export function scoreMbti(answers: MbtiQuestion[]): MbtiScores {
  const scores: MbtiScores = { ...EMPTY_MBTI_SCORES };
  for (const q of answers) {
    const key = getMbtiPole(q.dim, q.side);
    scores[key] += 1;
  }
  return scores;
}

/** 由原始得分计算4字母类型 */
export function calcMbti(scores: MbtiScores): MbtiResult {
  const pairs: Array<[MbtiLetter, MbtiLetter]> = [
    ['E', 'I'],
    ['S', 'N'],
    ['T', 'F'],
    ['J', 'P'],
  ];
  let type = '';
  const percentages: MbtiScores = { ...EMPTY_MBTI_SCORES };
  for (const [a, b] of pairs) {
    const total = (scores[a] || 0) + (scores[b] || 0);
    const letter = (scores[a] || 0) >= (scores[b] || 0) ? a : b;
    type += letter;
    percentages[a] = total ? Math.round(((scores[a] || 0) / total) * 100) : 50;
    percentages[b] = 100 - percentages[a];
  }
  return { type, scores, percentages };
}

/** 获取类型名与描述 */
export function getMbtiType(type: string) {
  return MBTI_TYPES[type];
}
