# SoulMate（SM）—— 可定制化人机恋体验

> 核心主张：不是 AI 定你，而是你定 AI——每个恋人都为你而生

## 项目结构

```
SoulMate/
├── frontend/          # React 18 + Vite + Zustand + Ant Design Mobile
├── backend/           # FastAPI + SQLAlchemy + Alembic + Celery
├── docs/              # 产品文档 / 技术方案
├── deploy/            # Docker Compose / Nginx 配置
└── README.md
```

## 快速开始

```bash
# 前端
cd frontend && npm install && npm run dev

# 后端
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload
```

## 文档

- [需求文档](../人机恋AI项目需求文档.md)
- [技术方案](../SoulMate技术方案.md)

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18, Vite, Zustand, Ant Design Mobile, Workbox (PWA), WebRTC |
| 后端 | FastAPI, SQLAlchemy 2, Alembic, Celery, JWT |
| 数据 | MySQL 8, Redis 7, Milvus/Chroma, MinIO |
| AI | DeepSeek-V3 / Qwen-Max (对话), Qwen-Turbo (记忆提取) |
| 语音 | 火山/讯飞 STT, 火山/微软 情感 TTS |

## License

Proprietary © 2026 SoulMate
