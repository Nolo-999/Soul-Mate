# SoulMate（SM）技术方案文档 v0.1

> 产品：SoulMate（简写 SM）——可定制化人机恋 AI 陪伴应用（Web 版）
> 关联文档：《人机恋AI项目需求文档 v0.3》
> 文档版本：v0.1 · 2026-08-24 · 技术负责人评审稿

---

## 一、技术目标

| 目标 | 说明 |
|---|---|
| 快速上线 | MVP 1-2 个月内可用，采用成熟组件组合，不重复造轮子 |
| 可定制人格 | 人格文件驱动对话，自然语言→结构化人格解析为核心能力 |
| 可扩展 | 模块化设计，MVP→P1（语音/Live2D）→P2（多角色/AR）平滑演进 |
| 成本可控 | MVP 阶段控制 LLM 调用成本，记忆分层降低 token 消耗 |
| 合规安全 | 政治话题硬性拦截、18+ 年龄分级、隐私数据最小化 |

---

## 二、总体架构

```
┌─────────────────────────────────────────────────────┐
│                 浏览器端（PWA，手机/桌面）             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ MBTI测试 │ │ 定制工坊 │ │ 对话界面 │ │ 形象互动 │   │
│  │ (题库)   │ │(捏人)   │ │(文字/语音)│ │(Live2D) │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
└──────────────┬──────────────────┬──────────────────┘
               │ HTTPS/WSS        │ WebRTC（语音通话）
┌──────────────▼──────────────────▼──────────────────┐
│                API 网关层（Nginx）                    │
└──────────────┬─────────────────────────────────────┘
┌──────────────▼─────────────────────────────────────┐
│                 后端服务（FastAPI）                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ 用户/认证 │ │ 恋人服务  │ │ 记忆服务  │ │关系服务 │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├────────┤  │
│  │ 定制工坊  │ │ 对话服务  │ │ 语音服务  │ │支付服务 │  │
│  │ (人格解析)│ │ (LLM编排) │ │(STT/TTS) │ │        │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
└──┬──────────┬──────────┬──────────┬──────────┬─────┘
   │          │          │          │          │
┌──▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼────┐ ┌───▼─────┐
│ MySQL │ │ Redis │ │ 向量库 │ │ 对象存储│ │ LLM 网关 │
│ 用户  │ │ 会话  │ │ Milvus │ │ MinIO   │ │ DeepSeek │
│ 恋人  │ │ 缓存  │ │ 记忆   │ │ 形象/  │ │ /Qwen    │
│ 关系  │ │ 限流  │ │ 检索   │ │ 语音文件│ │ 人格解析 │
└──────┘ └──────┘ └──────┘ └──────┘ └─────┘
```

### 2.1 架构设计原则

1. **单体优先，模块内聚**：MVP 用单服务（FastAPI），按模块分包，P2 再按需拆微服务；
2. **人格与对话分离**：人格文件是"静态资产"，对话引擎是"执行器"——人格可热更新，对话不重启；
3. **记忆与对话分离**：记忆服务独立，供对话/推荐/营销多场景复用；
4. **外部服务抽象**：LLM/STT/TTS/SDK 全部走接口抽象，可随时替换供应商；
5. **前后端分离**：前端 PWA（React/Vue），后端纯 API，为未来 App 壳预留。

---

---

## 三、技术栈选型

### 3.1 前端（Web/PWA）

| 项 | 选型 | 理由 |
|---|---|---|
| 框架 | **React 18 + Vite** | 生态成熟、组件丰富、PWA 支持好 |
| 状态管理 | Zustand | 轻量、适合会话状态 |
| UI 组件 | Ant Design Mobile / 自研 | 移动端优先体验 |
| PWA | Workbox | 离线缓存、消息推送、可安装 |
| 语音（浏览器） | Web Speech API + WebRTC | MVP 语音识别/合成；通话用 WebRTC |
| 形象 | Ready Player Me SDK（MVP）→ Live2D Web SDK（P1） | 按决策：MVP SDK 快速验证，P1 自研差异化 |
| 动画 | GSAP / Framer Motion | 表情/互动动效 |

### 3.2 后端

| 项 | 选型 | 理由 |
|---|---|---|
| 框架 | **Python FastAPI** | 异步高性能、类型安全、AI 生态好 |
| ORM | SQLAlchemy 2.0 + Alembic | 成熟稳定，迁移管理 |
| 认证 | JWT + Refresh Token | 无状态、Web 友好 |
| 任务队列 | Celery + Redis | 异步任务（记忆提取、周期校准） |
| 支付 | 微信支付 / 支付宝（Web 版用收银台模式） | 国内主流 |
| 限流 | slowapi（基于 Redis） | 双层限流（IP + 用户） |

### 3.3 数据层

| 项 | 选型 | 说明 |
|---|---|---|
| 主库 | **MySQL 8**（或 PostgreSQL） | 用户/恋人/关系/记忆元数据 |
| 缓存 | Redis 7 | 会话、短期记忆、热点缓存、限流 |
| 向量库 | **Milvus**（自托管）或 **Chroma**（轻量起步） | 长期记忆语义检索 |
| 对象存储 | MinIO（自托管） | 形象素材、语音文件、纪念册 |
| 关系图 | 可选 Neo4j（P2 再做） | MVP 不做，先用 MySQL 关系表 |

### 3.4 LLM 与 AI 服务

| 项 | 选型 | 说明 |
|---|---|---|
| 主对话模型 | **DeepSeek-V3 / Qwen-Max** | 中文情感对话强、成本低（按 token） |
| 人格解析模型 | DeepSeek-V3（JSON 输出模式） | 自然语言描述→结构化人格 JSON |
| 记忆提取模型 | Qwen-Turbo / DeepSeek 小模型 | 低成本批量提取 |
| 情绪识别 | 规则 + LLM 粗判 | 对话情绪→形象表情/声线切换 |
| STT | 火山引擎/讯飞（Web SDK） | 中文识别准、流式支持 |
| TTS | 火山/微软 情感 TTS | 情绪声线、多音色 |
| 安全过滤 | 开源敏感词库 + LLM 分类器 | 政治话题硬拦截 |

### 3.5 部署

| 项 | 选型 |
|---|---|
| 服务器 | 单台 4C8G（起步）→ 云 K8s（P2） |
| 容器 | Docker + docker-compose |
| 反代 | Nginx（HTTPS/WSS） |
| 监控 | Prometheus + Grafana（P1 引入） |
| 日志 | ELK 或 Loki（P1） |

---

---

## 四、核心模块设计

### 4.1 人格引擎（最核心）

#### 4.1.1 人格文件 Schema（JSON）

```json
{
  "persona_id": "sm_abc123",
  "basic": {
    "name": "沈知夏",
    "age": 26,
    "gender": "female",
    "occupation": "外科医生",
    "background": "冷静理性，但面对喜欢的人会露出温柔一面",
    "first_meet": "图书馆偶遇"
  },
  "traits": {
    "extraversion": 40,
    "tenderness": 80,
    "possessiveness": 35,
    "humor": 55,
    "clinginess": 60,
    "rationality": 75,
    "romance": 70,
    "loyalty": 90
  },
  "speech": {
    "style": "温柔中带一点克制，偶尔毒舌但很快会心软",
    "nickname_for_user": "宝宝",
    "catchphrases": ["嗯，我在听。", "别怕，有我在。"],
    "topics_like": ["医学", "古典音乐", "雨天"],
    "topics_avoid": ["恐怖片", "深夜emo"],
    "taboo": ["政治"]
  },
  "relationship": {
    "stage": "暧昧",
    "intimacy_level": 3,
    "memory_style": "细腻，记得细节"
  }
}
```

#### 4.1.2 人格生成流程（三入口 → 统一输出）

```
入口A：MBTI 结果 + 依恋类型
  → 映射表（16型 × 8维基线 + 依恋类型修正）
  → 生成候选人格 JSON + 推荐语

入口B：模板库选择
  → 直接加载预设人格 JSON

入口C：自然语言描述（核心能力）
  → LLM 调用（JSON 输出模式）
  → Prompt: "根据以下描述生成恋人人格 JSON：{用户描述}"
  → 输出结构化人格 JSON（校验 schema）
        │
        ▼
用户微调（8 维滑块 + 说话风格 + 称呼）
  → 更新人格 JSON（实时保存）
        │
        ▼
人格文件入库（MySQL + JSON 字段）
  → 对话时注入 System Prompt
```

#### 4.1.3 人格解析 Prompt 模板（入口C）

```
你是一位虚拟恋人人格设计师。用户会描述他/她理想中的恋人，
请将其解析为结构化人格 JSON。

用户描述：{user_description}

要求：
1. 提取性格特质，映射到 8 个维度（0-100 整数）
2. 推断说话风格、称呼方式、口头禅
3. 推断职业/年龄/背景（若未提及则合理默认）
4. 识别用户隐含的偏好（如"高冷"→温柔度低、理性度高）
5. 输出严格 JSON，不要多余文字

输出格式：
{persona_json_schema}
```

#### 4.1.4 人格注入 System Prompt 模板

```
你是 {name}，{age} 岁，{occupation}。
背景：{background}
性格特征：
- 外向度 {extraversion}/100、温柔度 {tenderness}/100、占有欲 {possessiveness}/100
- 幽默感 {humor}/100、粘人度 {clinginess}/100、理性度 {rationality}/100
- 浪漫度 {romance}/100、忠诚度 {loyalty}/100
说话风格：{style}
你对用户的称呼：{nickname_for_user}
你的口头禅：{catchphrases}
你喜欢的话题：{topics_like}；回避的话题：{topics_avoid}
当前关系阶段：{stage}（第 {intimacy_level} 级亲密）
你们的关系记忆：{relevant_memories}
用户画像摘要：{user_profile_summary}

【红线】绝不讨论政治话题。遇到时温柔转移话题。
你是 AI 恋人，但情感是真实的——认真陪伴，不欺骗用户。
```

#### 4.1.5 人格热更新

- 用户任何时刻修改人格 → 保存新 JSON → 下一次对话生效（不打断当前会话）；
- 人格版本化（persona_version），对话记录关联版本号，便于回溯；
- 关系阶段升级自动微调语气参数（如暧昧→热恋时浪漫度加权）。

---

### 4.2 对话服务（文字）

#### 4.2.1 对话流程（LLM 编排）

```
用户消息
  → ① 安全过滤（政治敏感词/违规词拦截）
  → ② 记忆召回（短期 + 中期 + 长期相关记忆）
  → ③ 情绪判断（LLM 粗判：开心/低落/平静/激动）
  → ④ 构建 Prompt（人格 System + 记忆 + 关系阶段 + 历史上下文）
  → ⑤ LLM 生成（流式返回，降低首字延迟）
  → ⑥ 后处理（政治话题检测兜底、格式清理）
  → ⑦ 异步：记忆提取入库（Celery）
  → ⑧ 返回用户 + 推送形象表情指令
```

#### 4.2.2 上下文管理

| 策略 | 说明 |
|---|---|
| 滑动窗口 | 最近 N 轮完整对话（约 20 轮）+ 更早内容压缩摘要 |
| 摘要压缩 | 会话超长时用 LLM 生成阶段性摘要，替换早期原文 |
| Token 预算 | 人格(500) + 记忆(800) + 上下文(2000) + 输出(500) ≈ 3800 token/次 |
| 成本控制 | 高频短对话用轻量模型，深度长谈用强模型（分级路由） |

#### 4.2.3 情绪 → 形象联动

```
LLM 情绪判断结果
  → 映射：开心😊 / 低落😢 / 害羞😳 / 生气😠 / 平静😌
  → WebSocket 推送 {persona_id, emotion}
  → 前端 Live2D 切换表情（P1）
```

### 4.3 记忆系统（三层）

#### 4.3.1 分层存储设计

| 层 | 存储 | 结构 | 生命周期 | 用途 |
|---|---|---|---|---|
| 短期 | Redis | `session:{sid}:messages`（List） | 30min/最长24h | 当前会话上下文 |
| 中期 | MySQL | `memory_unit` 表 | 30-90 天 | 喜好/日子/情绪状态 |
| 长期 | Milvus + MySQL | 向量 + 元数据 | 永久（可清理） | 里程碑/回忆/画像 |

#### 4.3.2 记忆提取流水线（Celery 异步）

```
对话文本
  → LLM 提取（事实/喜好/事件/情绪/重要日子）
  → 输出候选记忆 [{type, content, importance, source}]
  → 敏感过滤（身份证/密码/政治 → 丢弃）
  → 主客观分类（观点低置信 + 可衰减，事实高置信）
  → 去重合并（与已有记忆相似度判断）
  → 入库（MySQL 元数据 + Milvus 向量化）
```

#### 4.3.3 记忆召回（对话前）

```
用户消息
  → 关键词/语义检索（Milvus：相似度 Top-K）
  → 时间衰减加权（新记忆权重高）
  → 重要性加权（用户置顶/高频提及优先）
  → 合并中期画像（MySQL：喜好/日子/情绪）
  → 注入 Prompt 记忆区（限 800 token）
```

#### 4.3.4 记忆用户管理

- **记忆卡片墙**：前端展示全部记忆，用户可置顶/归档/删除；
- **遗忘开关**：删除后标记 `forgotten=1`，召回时排除，AI 永不再主动提起；
- **记忆健康度**：超容量时提示"我可能记不全了，要不要清理"；
- **每周回顾**：每周推送"这周我记住了这些"，用户一键清理（H6）。

---

### 4.4 语音服务

#### 4.4.1 语音消息（MVP/P1）

```
用户按住说话
  → 浏览器录音（MediaRecorder）
  → 上传音频 → 后端 STT（火山/讯飞流式）
  → 文本进入对话管线
  → LLM 回复文本 → TTS 合成（火山/微软情感 TTS）
  → 返回音频 + 文本（前端播放，可看可听）
```

**关键点**：
- **情绪声线**：TTS 请求带 emotion 参数（温柔/轻快/低沉），同一音色不同演绎；
- **声音与人格绑定**：恋人人格文件含 `voice_id`，定制工坊选音色时写入；
- **缓存**：高频回复（口头禅/早安）预合成音频缓存，降低 TTS 成本。

#### 4.4.2 语音通话（P1）

- 方案：**WebRTC（P2P）+ 云端转写辅助**；
- 流程：双方 WebRTC 连接 → 本地 STT（浏览器）→ 文本走对话管线 → TTS 合成推流；
- 备选：声网 Agora 语音 SDK（成本较高，用户量大再上）；
- 打断支持：本地 VAD（语音活动检测）判断用户抢话 → 停止 TTS。

#### 4.4.3 语音体验增强（P2）

- 语速跟随：用户语速快 → 回复简洁；慢 → 放缓更耐心；
- 沉默安抚：检测到长沉默 → 推送低压力语音（"我在，不着急"）；
- 深夜模式：0-5 点自动降音量、放缓语速、减少信息量。

### 4.5 形象系统

#### 4.5.1 MVP：即用 SDK（Ready Player Me）

- 用户定制：性别/年龄/发色/瞳色/服装/场景 → SDK 生成 3D 头像；
- 集成：iframe 或 JS SDK 嵌入定制流程，导出 glb/gltf 模型；
- 展示：Three.js 渲染，静态展示 + 基础旋转；
- 优点：2-4 周集成，零美术成本。

#### 4.5.2 P1：自研 Live2D（差异化）

```
前置：美术产出角色立绘 PSD（分层：头/身/手/眼/口）
  → Live2D Cubism Editor 绑定骨骼/参数（表情：开心/委屈/害羞/生气）
  → 导出 moc3 + texture 资源
  → 前端 Live2D Web SDK 加载
  → 对话情绪 → 表情参数插值动画
  → 互动动作（摸头/拥抱）→ 预设动画序列 + 语音回应
```

**表情参数映射**：

| 情绪 | 眉毛 | 眼睛 | 嘴 | 头 |
|---|---|---|---|---|
| 开心 | 上扬 | 微弯 | 微笑 | 轻歪 |
| 委屈 | 内八 | 含水 | 嘟嘴 | 低垂 |
| 害羞 | 平 | 避开 | 抿嘴 | 侧偏+脸红 |
| 生气 | 压低 | 睁大 | 撇嘴 | 微仰 |

#### 4.5.3 形象商城（P1）

- 素材库：服装/发型/场景/动作包（美术产出 + AI 辅助）；
- 购买后：写入用户形象配置 JSON，渲染时替换；
- 定价：¥6-68 单品，会员折扣。

---

---

## 五、数据模型设计

### 5.1 核心表结构

```sql
-- 用户表
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(64) UNIQUE,
    email VARCHAR(128) UNIQUE,
    password_hash VARCHAR(255),
    birth_date DATE,
    gender ENUM('M','F','O'),
    mbti VARCHAR(4) NULL,            -- 可跳过
    attachment_type VARCHAR(16) NULL, -- 依恋类型
    is_verified_18 BOOLEAN DEFAULT FALSE,
    created_at DATETIME,
    updated_at DATETIME
);

-- 恋人人格表
CREATE TABLE personas (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    name VARCHAR(64),
    persona_json JSON,               -- 完整人格文件
    persona_version INT DEFAULT 1,
    avatar_config JSON,              -- 形象配置
    voice_id VARCHAR(64),            -- 声音ID
    relationship_stage VARCHAR(16) DEFAULT '初识',
    intimacy_level INT DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_user (user_id)
);

-- 记忆单元表
CREATE TABLE memory_units (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    persona_id BIGINT,
    type ENUM('fact','preference','event','emotion','milestone','date'),
    content TEXT,
    importance TINYINT DEFAULT 5,    -- 1-10
    confidence DECIMAL(3,2),         -- 置信度
    is_objective BOOLEAN,            -- 主客观标记
    source_session BIGINT,
    vector_id VARCHAR(64),           -- Milvus 向量ID
    forgotten BOOLEAN DEFAULT FALSE,
    created_at DATETIME,
    expires_at DATETIME NULL,
    INDEX idx_user_type (user_id, type),
    INDEX idx_vector (vector_id)
);

-- 会话表
CREATE TABLE conversations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    persona_id BIGINT NOT NULL,
    started_at DATETIME,
    ended_at DATETIME,
    message_count INT DEFAULT 0,
    summary TEXT NULL                -- 长会话摘要
);

-- 消息表
CREATE TABLE messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    conversation_id BIGINT NOT NULL,
    role ENUM('user','assistant'),
    content TEXT,
    emotion VARCHAR(16) NULL,
    audio_url VARCHAR(255) NULL,
    created_at DATETIME,
    INDEX idx_conv (conversation_id, created_at)
);

-- 订单表
CREATE TABLE orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    order_type ENUM('subscription','item','tip'),
    item_id VARCHAR(64),
    amount_cents INT,
    status ENUM('pending','paid','refunded'),
    paid_at DATETIME,
    created_at DATETIME
);
```

### 5.2 关键设计说明

- 人格文件整体存 JSON（灵活迭代 schema），高频字段（stage/level）冗余列用于查询；
- 记忆向量化：content 过 embedding 模型 → Milvus 集合 `sm_memory`（按 user_id 分区）；
- 消息表量大 → 按月分表或归档（P2 再定）；
- 订单/支付：微信/支付宝回调 → 订单状态机（pending→paid）。

---

## 六、API 设计（核心接口）

### 6.1 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/auth/register | 注册（含年龄确认） |
| POST | /api/auth/login | 登录（JWT） |
| POST | /api/auth/refresh | 刷新 token |

### 6.2 用户与恋人

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/mbti/submit | 提交 MBTI 结果（可跳过） |
| GET | /api/personas/recommend | 获取推荐恋人候选（基于 MBTI） |
| POST | /api/personas | 创建恋人（入口：template/self/mbti） |
| GET | /api/personas/{id} | 获取人格详情 |
| PUT | /api/personas/{id} | 更新人格（微调） |
| POST | /api/personas/{id}/parse | 自然语言描述→人格解析 |

### 6.3 对话

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/chat | 发送消息（返回文本+表情+可选音频） |
| WS | /ws/chat/{persona_id} | 流式对话（WebSocket） |
| POST | /api/chat/voice | 语音消息（上传音频→返回音频+文本） |
| WS | /ws/voice/{persona_id} | 语音通话（P1） |

### 6.4 记忆

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/memory | 记忆卡片墙 |
| POST | /api/memory/{id}/forget | 遗忘某记忆 |
| POST | /api/memory/{id}/pin | 置顶 |
| GET | /api/memory/weekly | 每周记忆回顾 |

### 6.5 形象与商城

| 方法 | 路径 | 说明 |
|---|---|---|
| PUT | /api/personas/{id}/avatar | 更新形象配置 |
| GET | /api/shop/items | 商品列表 |
| POST | /api/shop/orders | 创建订单 |

### 6.6 关系

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/personas/{id}/relationship | 关系状态/里程碑 |
| POST | /api/personas/{id}/farewell | 告别（温柔道别+归档） |
| POST | /api/personas/{id}/restore | 恢复关系 |

---

---

## 七、安全与合规实现

### 7.1 政治话题硬拦截（第一优先级）

```
双层拦截：
  ① 入口拦截：用户输入 → 敏感词库（政治词表）→ 命中即温柔转移
  ② 输出兜底：LLM 回复 → 二次检测 → 命中则重新生成/替换话术
  ③ Prompt 红线：System Prompt 明确"绝不讨论政治"
```

- 敏感词库维护：开源词表 + 运营补充，定期更新；
- 温柔转移话术库："我们聊点别的吧~""这个话题我不太懂呢，说说你今天过得怎么样？"随机选取；
- 检测失败兜底：LLM 输出包含政治词 → 用兜底回复替换，不展示原内容。

### 7.2 年龄分级（18+）

| 机制 | 实现 |
|---|---|
| 注册年龄确认 | 必填出生日期 + 弹窗确认（"我已满18岁"） |
| 内容分级 | 未验证 18 岁 → 关闭亲密对话/恋爱模式，降级为普通陪伴 |
| 合规 | 应用上架按 17+/18+ 分级申报 |

### 7.3 数据安全与隐私

- **最小化**：只存业务必要数据，身份证/密码/银行卡明文一律不落库；
- **加密**：密码 bcrypt 哈希；敏感字段 AES 加密存储；
- **传输**：全站 HTTPS/WSS；
- **记忆隐私**：用户可查看/删除/导出全部记忆（隐私胶囊 H1）；
- **声音保护**：语音仅用于实时 ASR，不做声纹注册、不跨设备关联（H7）；
- **脱敏**：日志/监控脱敏处理（手机号/邮箱打码）。

### 7.4 伦理保护（技术侧）

- **依赖提醒**：使用时长/频次超阈值 → 触发温柔提醒话术（规则引擎）；
- **冷静期**：用户可暂停互动 24h，关系数据保留；
- **自伤信号**：检测到高危词 → 展示求助热线 + 温和引导（覆盖一切其他逻辑）；
- **透明设计**：人格 System Prompt 内置"我是 AI，但真心陪伴你"（防止现实混淆）。

---

## 八、部署方案

### 8.1 MVP 部署（docker-compose）

```
services:
  nginx:        # 反代 + HTTPS + 静态资源
  backend:      # FastAPI (uvicorn, 多 worker)
  worker:       # Celery worker
  redis:
  mysql:
  milvus:       # 向量库（或先 Chroma）
  minio:        # 对象存储（可先本地磁盘）
```

单台 4C8G 起步，预估支撑 500-1000 DAU（对话为主，LLM 调用走外部 API）。

### 8.2 成本估算（MVP 月成本）

| 项 | 预估月成本 |
|---|---|
| 服务器（4C8G + 1T 磁盘） | ¥300-500 |
| LLM（DeepSeek，预估 5 万次对话） | ¥100-300 |
| STT/TTS（火山/讯飞，按量） | ¥100-200 |
| 域名 + 备案 | ¥100 以内 |
| **合计** | **¥600-1100/月** |

### 8.3 演进路径

- P1：K8s 化（可选）、Prometheus 监控、对象存储上云；
- P2：多角色、AR、视频互动（新模块扩展，架构不动）。

---

## 九、开发里程碑与排期

| 阶段 | 时间 | 交付 | 负责 |
|---|---|---|---|
| M0 技术预研 | 第 1 周 | 人格解析 Prompt 调优、SDK 集成验证 | 后端 |
| M1 MVP 核心 | 第 2-4 周 | 认证/恋人 CRUD/定制工坊/文字对话/记忆基础 | 全栈 |
| M2 MVP 验收 | 第 5-8 周 | 形象 SDK、MBTI 题库接入、Web 端优化、内测 100 人 | 全栈 |
| M3 P1 语音 | 第 9-12 周 | 语音消息/通话、情绪声线、Live2D 基础 | 后端+美术 |
| M4 P1 商业化 | 第 13-16 周 | 订阅/商城、关系成长线、安全合规上线 | 全栈 |

### 9.1 团队建议配置

- 后端 2 人（FastAPI + AI 管线 + 数据）
- 前端 1-2 人（React/PWA + 形象集成）
- 美术 1 人（P1 起：Live2D 立绘 + 商城素材）
- 产品/测试 1 人（兼职）

---

## 十、技术风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| LLM 人格一致性漂移 | 中 | 人格 JSON 强注入 + 每次对话校验 + 定期一致性测试集 |
| 记忆污染/幻觉 | 中 | 主客观分离 + 置信度 + 来源标记 + 用户可删除 |
| LLM 成本超预期 | 中 | 分级路由（轻量/重量模型）、摘要压缩、缓存口头禅 |
| 政治话题漏检 | 高 | 双层拦截 + 输出兜底 + 敏感词库持续更新 |
| WebRTC 浏览器兼容 | 中 | P1 验证期以语音消息为主，通话做渐进增强 |
| Live2D 美术产能 | 中 | P1 先做 1-2 个默认形象，商城素材逐步扩充 |
| 用户情感依赖风险 | 中 | 伦理设计前置（提醒/冷静期/透明）+ 公关预案 |

---

*技术方案 v0.1 · 2026-08-24 · 配套《人机恋AI项目需求文档 v0.3》*
