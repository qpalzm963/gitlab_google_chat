# GitLab × Google Chat — TODO

## 延伸功能（第一版完成後）

### 平台支援
- [ ] **GitHub 支援**：新增 `platform` 欄位（`gitlab` / `github`）；驗證改用 `X-Hub-Signature-256`（HMAC-SHA256）；事件識別改用 `X-GitHub-Event` / `X-GitHub-Delivery`；Payload 解析對應 GitHub PR 結構；Merge/Approve/Close 改呼叫 GitHub REST API（`PUT /repos/:owner/:repo/pulls/:number/merge` 等）
- [ ] **Slack 支援**：通知目標新增 Slack Incoming Webhook 選項

### 通知功能
- [ ] **@mention Reviewer**：MR 通知卡片自動 @mention 指定 Reviewer（需 Google Chat user ID 對應）
- [ ] **CI 狀態卡片更新**：Pipeline 通過後更新原本通知卡片（需 Google Chat update message API）
- [ ] **Group Webhook**：一次綁定整個 GitLab Group，所有 Project 自動套用

### 資料庫
- [x] **MongoDB 切換**：`src/repositories/mongodb/` 已實作，部署於 MongoDB Atlas M0 + Vercel（sin1 region）
- [ ] **PostgreSQL 切換**：補 `src/repositories/postgres/` 實作，支援 Railway / Render 部署
- [ ] **資料保留策略**：定期清理 90 天以上的 webhook_logs

### 安全性
- [ ] **ENCRYPTION_KEY 輪換**：新舊 key 並存，重新加密所有 token 後切換
- [ ] **Webhook Secret 輪換**：從後台觸發，自動同步更新 GitLab 上的 Webhook 設定

### 可靠性
- [ ] **重試升級**：process crash 後仍存活；改用 `better-queue`（SQLite）或 `Agenda`（MongoDB）

### 數據
- [ ] **統計儀表板**：各部門 MR 數量、通知成功率、平均 Review 時間
