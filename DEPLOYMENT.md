# GitLab × Google Chat — 部署指南 & 踩坑紀錄

## 目前部署狀態

| 項目 | URL | 備註 |
|---|---|---|
| 後端 API | https://gitlabgooglechat.vercel.app | Vercel Serverless, `sin1` region |
| 前端 | https://gitlab-chat-frontend.vercel.app | Vercel Static, 獨立專案 |
| 資料庫 | MongoDB Atlas M0 (Free) | cluster: `cluster0` |
| Git repo | https://github.com/qpalzm963/gitlab_google_chat | main branch |

### Vercel 環境變數（後端）
```
DB_TYPE=mongodb
MONGODB_URI=mongodb+srv://vince_huang:***@cluster0.xxx.mongodb.net/gitlab_chat
ENCRYPTION_KEY=<64 char hex>
JWT_SECRET=<random string>
JWT_EXPIRES_IN=8h
FRONTEND_URL=https://gitlab-chat-frontend.vercel.app
NODE_ENV=production
```

---

## 本地開發

### 啟動
```bash
# 後端（SQLite，不需要 MongoDB）
node index.js

# 前端（另開 terminal）
cd frontend && npm run dev
```

### 本地環境變數
`.env` 預設使用 SQLite，本地開發不需要改：
```
DB_TYPE=sqlite
DB_PATH=./data/app.db
```

前端需 `frontend/.env.local`（讓 Webhook URL 顯示正確 IP）：
```
VITE_API_URL=http://<你的機器IP>:3000
```

### 初始化 DB（僅第一次）
```bash
npm rebuild better-sqlite3  # Node 版本更新後需要重建
node db/seed.js             # 建立 admin 帳號
```
預設帳號：`admin@company.com` / `changeme123`

---

## 已踩過的坑

### 1. Vercel 環境變數 trailing newline
**問題**：透過 Vercel CLI `echo "value" | vercel env add` 設定的環境變數，值結尾會帶換行符（`\n`）。

**影響**：
- `DB_TYPE=mongodb\n` → `require('./mongodb\n')` → `Cannot find module`
- `DB_TYPE=mongodb\n` → middleware condition `=== 'mongodb'` 永遠 false → MongoDB 連線不啟動 → query timeout
- `FRONTEND_URL=xxx\n` → CORS header 含非法字元 → `ERR_INVALID_CHAR`
- `JWT_EXPIRES_IN=8h\n` → `jsonwebtoken` 拋錯

**修正**：所有讀取 env var 的地方加 `.trim()`：
```js
const type = (process.env.DB_TYPE || 'sqlite').trim()
(process.env.JWT_SECRET || '').trim()
(process.env.ENCRYPTION_KEY || '').trim()
```

---

### 2. MongoDB middleware 初始化順序
**問題**：`app.use(connectMongo middleware)` 放在 `const app = express()` 前面。

**錯誤**：`ReferenceError: Cannot access 'app' before initialization`

**修正**：middleware 必須在 `express()` 之後掛載。

---

### 3. Vercel serverless 不能用 `process.exit`
**問題**：原本在啟動時 `connectMongo().catch(() => process.exit(1))`，在 serverless 環境 `process.exit` 直接殺掉整個 function instance。

**錯誤**：`FUNCTION_INVOCATION_FAILED`

**修正**：改為 per-request middleware，連線失敗回 503，不 crash：
```js
app.use(async (req, res, next) => {
  try {
    await connectMongo()
    next()
  } catch (err) {
    res.status(503).json({ error: 'Database unavailable' })
  }
})
```

---

### 4. Express `trust proxy` 未設定
**問題**：Vercel 是反向代理，會設 `X-Forwarded-For` header；但 Express 預設 `trust proxy = false`，`express-rate-limit` 偵測到不一致會拋 `ValidationError`，造成 webhook 請求失敗。

**錯誤**：`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` → webhook 回應 404/500

**修正**：
```js
app.set('trust proxy', 1)  // 放在 app.use(helmet()) 之前
```

---

### 5. MongoDB async/await 遺漏
**問題**：SQLite repository 是同步的，改成 MongoDB 後所有方法變 async，但 route handler 沒有加 `await`。

**影響**：`chatCallback.js` 的 `findById` 回傳 Promise 而非 dept 物件，後續操作全部出錯。

**修正**：所有 `repo.dept.*`、`repo.log.*`、`repo.user.*` 呼叫都加 `await`，route handler 加 `async`。

---

### 6. Vercel 路由設定
**問題**：Vercel 的新 build system（`@vercel/vc-build`）對 `vercel.json` 的處理方式：
- `rewrites` 的 `/(.*)`  pattern 在某些 edge node 可能不生效
- `trust proxy` 問題導致部分請求在 edge 層被 404

**最終 `vercel.json` 設定**：
```json
{
  "version": 2,
  "regions": ["sin1"],
  "builds": [{ "src": "api/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.js" }]
}
```

> 注意：加 `"regions": ["sin1"]`（新加坡）原因是部署在 `iad1`（美東）時，台灣的請求走到特定 Hong Kong edge node（`hkg1::sw952`）無法轉發到 function，改到 sin1 後路由正常。

---

### 7. 自架 GitLab Webhook 到 local network
**問題**：GitLab 預設封鎖 Webhook 打到 local network IP（SSRF 保護）。

**解法**：
- 需要 GitLab admin 在 Admin Area → Settings → Network → Outbound requests → 勾選「Allow requests to the local network」
- 或用 ngrok 暴露本地 port：`ngrok http 3000`

---

### 8. better-sqlite3 Node 版本相依
**問題**：`better-sqlite3` 是 native addon，Node 版本更新後需重建。

**錯誤**：`ERR_DLOPEN_FAILED: NODE_MODULE_VERSION mismatch`

**修正**：
```bash
npm rebuild better-sqlite3
```

---

## 部署流程

### 後端部署到 Vercel
```bash
# 確認在 /gitlab_google_chat 目錄
vercel deploy --prod --yes
```

---

## 啟用互動按鈕（Google Chat Space ID）

互動按鈕（例如 Merge / Approve / Close）需要走 Google Chat API，因此每個要啟用的部門都必須填 `Chat Space ID`（格式：`spaces/XXXXXXXXX`）。

### 你要做（手動）

每個要開啟互動按鈕的部門：

1. 開啟 Google Chat Space
2. 複製網址列的 Space ID（格式 `spaces/XXXXXXXXX`）
3. 登入 `https://gitlabgooglechat.vercel.app`
4. 編輯部門 → `Chat Space ID` 欄位 → 貼上 `spaces/XXXXXXXXX`
5. 儲存

### 輔助指令（本機）

列出各部門 `Chat Space ID` 是否已填、格式是否正確：
```bash
npm run dept:space-status
```

查 Vercel production logs（只看 `chat-callback`）：
```bash
npm run logs:chat-callback
```

### 驗證方式（部署後）

部署後觸發一個 webhook，查 Vercel logs：

- 看到 `POST /chat-callback 200` → 按鈕成功回調 ✅
- 看到 `POST /chat-callback 403` → JWT audience 不符（檢查 `CHAT_BOT_ENDPOINT` env var）
- 完全無 `POST` → `Chat Space ID` 未填或格式錯誤（或訊息不是透過 Chat API 發送）

### 前端部署到 Vercel
```bash
cd frontend
VITE_API_URL=https://gitlabgooglechat.vercel.app npm run build
vercel deploy --prod --yes --build-env VITE_API_URL=https://gitlabgooglechat.vercel.app
```

### 種子資料（MongoDB）
```bash
MONGODB_URI=<your-uri> node db/seed.mongo.js
```

### 資料遷移（SQLite → MongoDB）
```bash
MONGODB_URI=<your-uri> DB_TYPE=sqlite node scripts/migrate-sqlite-to-mongo.js
```
