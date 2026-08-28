# SoulMate 记忆图谱 + RAG 技术方案

## 一、架构总览

```
用户聊天消息
     │
     ▼
┌─────────────────────────────────────────┐
│           记忆抽取层 (GLM-5.2)           │
│  输入：最近对话                            │
│  输出：① 结构化记忆 ② 知识三元组           │
└────────────┬────────────────────┬────────┘
             │                    │
     ┌───────▼───────┐    ┌──────▼───────┐
     │  Embedding层   │    │  三元组存储层  │
     │ (embedding-3)  │    │  (Neo4j图库)  │
     └───────┬───────┘    └──────┬───────┘
             │                    │
     ┌───────▼───────┐    ┌──────▼───────┐
     │  Milvus 向量库  │    │  Neo4j 图库   │
     │  (语义检索)     │    │  (关系查询)    │
     └───────┬───────┘    └──────┬───────┘
             │                    │
             └────────┬───────────┘
                      ▼
        ┌─────────────────────────┐
        │    智能召回层 (RAG)       │
        │  向量相似度 + 图谱2跳扩展  │
        │  + 时序衰减 + 去重排序     │
        └────────────┬────────────┘
                     ▼
              注入 LLM 上下文
```

## 二、模块设计

### 2.1 记忆抽取 (GLM-5.2)

**替换 Ollama 的抽取 prompt**，输出两部分：

```json
{
  "memories": [
    {"content": "用户在字节跳动做前端", "category": "fact", "importance": 4},
    {"content": "用户不喜欢吃香菜", "category": "preference", "importance": 3}
  ],
  "triples": [
    {"subject": "用户", "relation": "就职于", "object": "字节跳动"},
    {"subject": "用户", "relation": "不喜欢", "object": "香菜"}
  ]
}
```

**抽取规则：**
- 只提取值得长期记住的信息（和现有规则一致）
- 三元组用于图谱，记忆用于向量库，两者互补
- 矛盾检测仍由 GLM-5.2 负责（比7B模型更准）

### 2.2 Embedding (智谱 embedding-3)

- 模型：`embedding-3`（智谱最新，2048维）
- 维度：2048（可选 1024 省空间，建议先 2048）
- 输入：记忆内容文本（content 字段）
- 输出：2048维向量 → 存入 Milvus

### 2.3 向量库 (Milvus)

**Collection：`memories`**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT64 | 自增主键 |
| memory_id | INT64 | 关联 SQLite memory_unit.id |
| embedding | FLOAT_VECTOR(2048) | 向量 |
| category | VARCHAR | fact/preference/event/day/emotion |
| created_at | INT64 | 时间戳（衰减用） |
| pinned | BOOL | 置顶优先 |

**索引：** IVF_FLAT（小数据量够用，百万级前无需优化）

### 2.4 图库 (Neo4j)

**节点类型：**

```cypher
// 用户节点（每个聊天实例一个）
(:User {id, name, persona_id})

// 实体节点（自动发现）
(:Entity {name, type})  
// type: person/place/org/event/food/hobby/object/emotion/...
```

**关系类型：**

```cypher
(:User)-[:KNOWS]->(:Entity)           // 用户知道/认识
(:User)-[:LIKES]->(:Entity)           // 喜欢
(:User)-[:DISLIKES]->(:Entity)        // 不喜欢
(:User)-[:WORKS_AT]->(:Entity)        // 就职于
(:User)-[:LIVES_IN]->(:Entity)        // 居住在
(:User)-[:FRIENDS_WITH]->(:Entity)    // 朋友
(:User)-[:ATTENDED]->(:Entity)        // 参加过
(:Entity)-[:RELATED_TO]->(:Entity)    // 实体间关联
```

**示例图谱：**

```
(用户)──就职于──▶(字节跳动)
   │                  
   ├──朋友──▶(小美)──喜欢──▶(咖啡)
   │
   ├──不喜欢──▶(香菜)
   │
   └──住在──▶(北京)
```

### 2.5 智能召回 (RAG)

**召回流程：**

```
用户当前消息
     │
     ├─→ ① Milvus 向量检索（Top-10，余弦相似度）
     │
     ├─→ ② Neo4j 图谱扩展（从①命中的实体出发，2跳内关联记忆）
     │
     ├─→ ③ SQLite 时序召回（最近7天 + 置顶 + 高重要度）
     │
     └─→ ④ 合并去重 + 交叉评分排序 → Top-5 注入上下文
```

**评分公式：**
```
score = 0.5 × vector_sim      # 向量相似度 (0-1)
      + 0.3 × graph_relevance  # 图谱关联度 (0-1，2跳内=1，3跳=0.5)
      + 0.2 × time_decay       # 时间衰减 (越新越高)
      + 0.1 × importance       # 重要度归一化
```

## 三、Docker 端口规划

| 服务 | 端口 | 说明 |
|---|---|---|
| Milvus | 19530 (gRPC) / 9091 (Web UI) | 向量存储 |
| Neo4j | 7687 (Bolt) / 7474 (Web UI) | 图数据库 |
| Ollama | 11434 | 保留（embedding 备选/其他用途） |

## 四、依赖变更

**后端新增 Python 包：**
```
zhipuai          # 智谱 GLM-5.2 + embedding-3 SDK
pymilvus         # Milvus Python SDK
neo4j            # Neo4j Python driver
```

**删除/替换：**
- `httpx` 调 Ollama → 替换为 `zhipuai` SDK
- 保留 SQLite memory_unit 表（元数据层，Milvus 管向量，Neo4j 管关系）

## 五、分阶段实施

### 阶段 0：基础接入（3-5天）

**目标：** GLM-5.2 替换 Ollama，embedding 写入 Milvus

```
改动文件：
├── backend/app/config.py          [新建] 统一配置（API key、端口等）
├── backend/app/llm_client.py      [新建] GLM-5.2 统一调用层
├── backend/app/embedding.py       [新建] embedding-3 封装
├── backend/app/milvus_client.py   [新建] Milvus 连接+CRUD
├── backend/app/memory_engine.py   [改造] 抽取改用 GLM，存入 Milvus
├── backend/app/api/v1/memories.py [改造] recall 升级为向量搜索
└── docker-compose.yml             [新建] Milvus + Neo4j 编排
```

### 阶段 1：图谱构建（2-3周）

**目标：** 抽取三元组 → Neo4j，图谱辅助召回

```
改动文件：
├── backend/app/neo4j_client.py    [新建] Neo4j 连接+CRUD
├── backend/app/graph_engine.py    [新建] 三元组抽取+图谱写入+查询
├── backend/app/memory_engine.py   [改造] 抽取同时输出三元组
├── backend/app/api/v1/memories.py [改造] recall 增加图谱扩展
└── frontend/src/pages/MemoriesPage.tsx [改造] 增加图谱可视化
```

### 阶段 2：深度优化（长期）

- 混合搜索（Milvus 全文+向量联合）
- 社区检测（工作圈/生活圈自动聚类）
- 时序推理（事件链：面试→拿到offer→入职）

## 六、兼容性

- **降级策略保持不变：** GLM API 不可用 → 返回空，不影响聊天
- **SQLite memory_unit 保留：** 作为元数据层（Milvus 丢了可重建，Neo4j 丢了可重建）
- **旧记忆迁移：** 首次启动时批量 embedding 已有记忆，写入 Milvus
