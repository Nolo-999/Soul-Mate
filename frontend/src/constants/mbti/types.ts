/** MBTI 维度与题型定义 */

export type MbtiDim = 'EI' | 'SN' | 'TF' | 'JP';
export type MbtiLetter = 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';
export type MbtiScores = Record<MbtiLetter, number>;

export interface MbtiQuestion {
  id: number;
  q: string;
  /** 两个选项 [左极选项, 右极选项]，选中后给对应维度加分 */
  o: [string, string];
  dim: MbtiDim;
  /** 0 = 左极（E/S/T/J），1 = 右极（I/N/F/P） */
  side: 0 | 1;
}

/** 维度反向索引：某维度第一极加分 */
export const DIM_POLES: Record<MbtiDim, [MbtiLetter, MbtiLetter]> = {
  EI: ['E', 'I'],
  SN: ['S', 'N'],
  TF: ['T', 'F'],
  JP: ['J', 'P'],
};

/** 计分结果 */
export interface MbtiResult {
  type: string; // 4字母，如 INFP
  scores: MbtiScores; // 每个字母得分
  percentages: MbtiScores; // 每个字母占比
}
