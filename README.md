# Timetabo — Static MVP (GitHub Pages)

這個倉庫包含 Timetabo 的 Phase 1 靜態 MVP，放在 `docs/` 資料夾，適合部署到 GitHub Pages（master branch 或 main branch 的 `docs/` 資料夾）。

快速說明
- 開發者已加入簡單的 single-page app：`docs/index.html`。
- 功能：月曆檢視、點選日期來輸入時段（簡單輸入）、本機 localStorage 保存、SVG 預覽、下載 PNG 與 ICS。

要部署到 GitHub Pages（手動）：
1. 推送到 GitHub。
2. 到倉庫 Settings -> Pages，選擇 Branch: `master`、Folder: `/docs`（或對應你的預設 branch）。

下一步建議
- 將前端重構為 React + TypeScript（Spec 建議的路線），加入可視化時段編輯器、匯出選項、更多模板。
