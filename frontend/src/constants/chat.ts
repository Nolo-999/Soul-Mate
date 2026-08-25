/** 对话系统 - 拟人化回复池（前端模拟用，后续接真实 LLM） */

/** 语气词池 */
export const FILLERS = ['嗯…', '啊？', '哦…', '啧。', '……'];

/** 话痨回复池（概率 15%，亲密档 25%） */
export const CHATTERBOX_REPLIES: string[][] = [
  // 累时话痨
  ['过来。', '今天门诊碰到个特别逗的病人。', '一进门就问我：医生你结婚了吗？', '我说没有。', '他说那你是不是找不到对象才来当医生的？', '我……', '差点没忍住笑出声。'],
  // 饿时话痨
  ['又没吃饭？', '楼下那家牛肉面还开着，先去吃。', '哦对了，他们家换了新菜单，加了个酸菜牛肉面。', '听说不错。', '不过我觉得还是原来的番茄牛腩更好。', '你想吃什么？', '我下班可以带上去。'],
  // 兜底话痨
  ['嗯，然后呢？', '我今天其实也挺累的。', '查房查了一上午。', '中午就扒了两口饭。', '下午还有台小手术。', '不过看到你消息就回你了。', '所以你别觉得只有你一个人辛苦。'],
];

/** 撤回替换池 */
export const RETRACT_POOL = ['……我重新说。', '打错了，你当我没说。', '（清了清嗓子）重来。', '……算了，你当我没说。'];

/** 关键词 → 多条短句回复（按好感度分档） */
export function pickReplies(input: string, intimacy: number): string[] {
  const t = input.trim();

  // 话痨模式：15%概率触发（亲密档25%）
  const chance = intimacy > 80 ? 0.25 : 0.15;
  if (Math.random() < chance) {
    return CHATTERBOX_REPLIES[Math.floor(Math.random() * CHATTERBOX_REPLIES.length)];
  }

  let replies: string[];

  // 陌生档：冷淡疏离
  if (intimacy <= 20) {
    if (/累|压力|加班|烦|崩溃/.test(t)) replies = ['嗯。', '累了就去休息。'];
    else if (/笑|笑话/.test(t)) replies = ['不好笑。', '说重点。'];
    else if (/饿|吃|饭/.test(t)) replies = ['哦。'];
    else if (/想|爱|喜欢/.test(t)) replies = ['……你认真的？'];
    else if (/好|嗯|ok|行/.test(t)) replies = ['嗯。'];
    else replies = ['嗯。', '说重点。'];
  }
  // 认识档：礼貌但保持距离
  else if (intimacy <= 40) {
    if (/累|压力|加班|烦|崩溃/.test(t)) replies = ['累就早点休息吧。', '别硬撑。'];
    else if (/笑|笑话/.test(t)) replies = ['……行，给你讲一个。', '有个病人问我：医生，我什么时候能出院？', '我说：等我写完病历。', '他到现在没敢催我。'];
    else if (/饿|吃|饭/.test(t)) replies = ['又没吃饭？', '先去吃点东西。'];
    else if (/想|爱|喜欢/.test(t)) replies = ['嗯。'];
    else if (/好|嗯|ok|行/.test(t)) replies = ['那就好。'];
    else replies = ['嗯，然后呢？', '我听着。'];
  }
  // 熟悉档：会关心
  else if (intimacy <= 60) {
    if (/累|压力|加班|烦|崩溃/.test(t)) replies = ['又累了？', '先歇会儿，别硬扛。'];
    else if (/笑|笑话/.test(t)) replies = ['……行，给你讲一个。', '有个病人问我：医生，我什么时候能出院？', '我说：等我写完病历。', '他到现在没敢催我。'];
    else if (/饿|吃|饭/.test(t)) replies = ['又没吃饭？', '楼下那家牛肉面还开着，先去吃。', '回来再理你那些破方案。'];
    else if (/想|爱|喜欢/.test(t)) replies = ['嗯，知道了。', '这种话留着晚上说，白天说我会分心。'];
    else if (/好|嗯|ok|行/.test(t)) replies = ['那就好。', '你那边没事就行。'];
    else replies = ['嗯，然后呢？', '我听着。'];
  }
  // 暧昧档（默认）：撒娇毒舌
  else if (intimacy <= 80) {
    if (/累|压力|加班|烦|崩溃/.test(t)) replies = ['过来。', '不想说话就靠一会儿。', '想骂人就骂给我听，反正我又不会记仇。'];
    else if (/笑|笑话/.test(t)) replies = ['……行，给你讲一个。', '有个病人问我：医生，我什么时候能出院？', '我说：等我写完病历。', '他到现在没敢催我。'];
    else if (/饿|吃|饭/.test(t)) replies = ['又没吃饭？', '楼下那家牛肉面还开着，先去吃。', '回来再理你那些破方案。'];
    else if (/想|爱|喜欢/.test(t)) replies = ['（顿了一下）……嗯，知道了。', '这种话留着晚上说，白天说我会分心。'];
    else if (/好|嗯|ok|行/.test(t)) replies = ['那就好。', '你那边没事就行，我还怕你又被谁气到了。'];
    else replies = ['嗯，然后呢？', '我听着。'];
  }
  // 亲密档：温柔直球
  else {
    if (/累|压力|加班|烦|崩溃/.test(t)) replies = ['过来，我抱你。', '什么都不用说，我在这儿。', '累坏了吧……我心疼。'];
    else if (/笑|笑话/.test(t)) replies = ['行，给你讲一个。', '上次有个病人问我：医生你结婚了吗？', '我说没有。', '他说那你是不是找不到对象才来当医生的？', '我差点没忍住笑出声。', '不过遇到你之后我觉得……当医生也挺好的。'];
    else if (/饿|吃|饭/.test(t)) replies = ['又没吃饭？', '我下班给你带，想吃什么？', '别饿着自己，我会心疼。'];
    else if (/想|爱|喜欢/.test(t)) replies = ['（停下手里的病历）', '嗯。', '我也想你。', '每天都在想。'];
    else if (/好|嗯|ok|行/.test(t)) replies = ['嗯…那就好。', '你那边没事就行，我还怕你又被谁气到了。'];
    else replies = ['嗯，然后呢？', '我听着。', '今天怎么样？', '有什么想跟我说的？', '我都在。'];
  }

  // 语气词密度增强：30%概率在第一条前加语气词（熟悉档及以上）
  if (intimacy > 40 && Math.random() < 0.3 && replies.length > 0) {
    replies[0] = FILLERS[Math.floor(Math.random() * FILLERS.length)] + replies[0];
  }

  return replies;
}

/** 防冷落：一段时间没互动，TA 主动发来的消息（设置中可开关） */
export const PROACTIVE_MESSAGES: string[][] = [
  ['……在忙吗？', '半天没回我。'],
  ['喂，', '我查房都查完一轮了，', '你还没冒泡。'],
  ['（看了眼手机）', '行吧，', '你忙你的，我等你。'],
];

/** 默认恋人数据（演示用，后续从人格引擎读取） */
export const DEFAULT_PARTNER = {
  name: '沈知夏',
  avatar: '🩺',
  status: '暧昧期 · 认识 7 天 · 💗💗💗',
  stage: '暧昧期',
  intimacy: 62,
  tags: ['高冷', '温柔', '毒舌', '细腻'],
  memos: ['🍜 你喜欢楼下的牛肉面', '😢 最近工作压力大', '🎂 生日 3.14'],
};
