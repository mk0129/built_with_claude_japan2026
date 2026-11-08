# 教材イラスト 57 点の組み込みと公開確認（2026-11-08）

Codex 制作の教材イラスト全 57 点（本文挿絵 29・教材サムネイル 22・セット表紙 6。縮小版 22 を含め 79 ファイル）を審査用デモに組み込み、
提出ブランチへ通常 push → 公開デモへ反映 → 公開 URL で患者側・医療者側の表示を確認した記録。扱うデータはすべて架空。

- 公開 URL: https://shiori-judge-demo.vercel.app/
- 公開確認済み SHA: 配信用マージコミット `dccddb85aeae7c15a89806bd5fa3fad992f9af5e`（`feat/submission-ux`。親 `7088e4e` と `4238350`、ツリーは提出ブランチと同一）／提出ブランチ `feat/submission-ux-redesign-20261108` のコミット `42383500c4f9d06b0b47ce62a36b86ffc0483af8`（画像・コード・検証スクリプト）。この記録（docs/review）は後続のコミットで追加し、同じ手順で再配信する（SHA は最終報告に記載）
- 開始時: ワークツリーの HEAD `c184218`（提出ブランチの祖先）→ 作業前に提出ブランチ最新 `d65e20f` へ fast-forward。配信中だった SHA `7088e4ed8ffd3a2262157af430988a8430b1e13f`（ツリーは `dc55198`）
- 素材: `~/Developer/shiori-illustration-library-57-20261108/`（配置の正本 `配置一覧.csv`・`制作台帳.json`、配信用 `delivery/public/`）
- 成果物（このフォルダ）: `verification_table.md` / `.csv`（57 ID の検証表）、`shots/`（公開版で撮った代表スクリーンショット）、`walkthrough.json`（公開 URL の DOM 照合）、`batch-live.json`（79 ファイルの公開 URL 照合）。同じ内容を `~/Developer/shiori-illustration-integration-20261108/` にも複製。

## 1. 配置の照合（57 ID）
`配置一覧.csv` の 57 行を実体（`src/server/db/seed-data.ts` ほかの教材名、`.judge-demo/app/fixtures/lessons.json` の教材名とページ見出し、`consultation.json` と `seed-content.ts` のセット名）と突き合わせ、
57 ID すべてが対象名・ページ番号・見出しまで一致（差分なし。教材名だけが似ている別教材への割り当てなし）。

| 種類 | 件数 | 登録先 | 配信パス |
| --- | --- | --- | --- |
| 本文挿絵（EDI-SE-01〜05・EDI-OLD-01〜08・EDI-NEW-01〜16） | 29 | `src/server/db/seed-figures.ts`（editorial・approved）→ `figure_assets` / `figure_placements`。公開デモは `.judge-demo/app/fixtures/patient-figures.json` | `public/assets/editorial/edi_*.png`（1200×900 透過 PNG） |
| 教材サムネイル（THUMB-*） | 22 | `src/concept-d/thumbnails.ts` `THUMBNAILS`（教材名キー・`band`） | `public/thumbnails/thumb_*.webp`（1600×1200）＋ `public/thumbnails/small/thumb_*.png`（192×144） |
| セット表紙（COVER-*） | 6 | `src/concept-d/thumbnails.ts` `SET_COVERS`（患者向けセット名キー＝テンプレート名） | `public/covers/cover_*.webp`（800×1000） |

- 「化学療法中の副作用とセルフケア」は 1〜5 ページに EDI-SE-01〜05（休息・食事・座ってする家事・手洗い・連絡）。6 ページ目「まとめ」は登録なしで従来の線画の代替。
- 既存の病期の医学図解 3 枚（MED-001-01〜03。監修前・`private_assets`）とその順序・監修状態・公開条件、教材本文・確認問題・学習履歴、既存サムネイル 11 点・表紙 2 点・テーマ画像 1 点は変更していない。
- alt は実画像を見て付けた短い日本語（絵にない説明・医学的な助言なし）。台帳 `docs/design/illustration_batch_20261108/delivery_manifest.json` に全件記載。

## 2. 変更したファイル
- 画像 79 ファイル（`public/assets/editorial/` 29、`public/thumbnails/` 22、`public/thumbnails/small/` 22、`public/covers/` 6）。納品物と SHA-256 が一致（`import-illustrations.mts` は通していない）。
- `src/concept-d/thumbnails.ts`: THUMBNAILS 22 件・SET_COVERS 6 件を追加。
- `src/server/db/seed-figures.ts`: editorial 29 件（配置・alt・1200×900）。seed は `onConflictDoNothing` と配置の存在確認で冪等（`tests/integration/editorial-figures.test.ts` で再実行を確認）。既存 DB には `npm run db:setup`（migrate + seed）で初期化なしに反映できる。
- `.judge-demo/app/fixtures/patient-figures.json`: 29 件を教材名 → ページ → 配列にマージ（`scripts/judge/sync-patient-figures.mts`。src 単位で冪等、医学図解 3 枚は `type: "medical"` を補っただけ）。`.judge-demo/app/judge-patient-api.ts`: Figure 型に `type`・`caption: string|null`。
- `src/concept-d/learning.ts`: 図の型に `type`、`primaryFigure`（医学図解を優先）・`isEditorialFigure`。
- `src/concept-d/PatientD.tsx`: 学習画面で、医学図解があれば従来どおり「図解／要点」タブと説明文、なければ登録済みの挿絵を本文の上に装飾として表示（線画の代替 `SlideArt` の代わり。タブ・説明文・拡大は付けない）。拡大表示も同じ選び方。`src/concept-d/redesign.css`: `.d-slide-illustration`。
- `src/concept-d/ClinicianD.tsx`: 教材ライブラリのセット選択の行に表紙（`SetCoverThumb`。患者向けセット名で `SET_COVERS` を引く）。`.cd-template-cover`。
- `docs/design/final_assets/manifest.json`: 既存 6 件に delivered を補い、22 件を追加（`validate-images.mjs` の対象）。`scripts/assets/validate-images.mjs`: 追加教材の題名も読む。
- 新規: `docs/design/illustration_batch_20261108/delivery_manifest.json`、`scripts/assets/validate-illustration-batch.mjs`、`scripts/judge/sync-patient-figures.mts`、`scripts/review/illustration-walkthrough.mjs`、`scripts/review/illustration-verification-table.mjs`、`tests/integration/editorial-figures.test.ts`。README（`docs/design/illustration_batch_20261108/README.md`）に登録済みの手順を追記。
- 触っていないもの: `seed-content*.ts`、`ai-prompts.ts`、`ai-generation.ts`、`material-quality.ts`、`materials-lint.mts`、`lessons.json`、`consultation.json`、認証・QR・60 分制御・処方/学習/採点ロジック。

## 3. ローカル検証
| 項目 | 結果 |
| --- | --- |
| `node scripts/assets/validate-illustration-batch.mjs --dist .judge-demo/dist` | 57 ID 合格・79 ファイル一致（public/・審査用ビルド） |
| `node scripts/assets/validate-images.mjs` | 43 件合格（新規 28 件を含む。透明背景・線色 #315E68・寸法） |
| `npm run typecheck` / `npm run lint` | 合格（lint は既存と同種の警告のみ。新規エラーなし） |
| `npm test`（vitest 31 ファイル 180 テスト） | 全合格。`figures.test.ts` は監修前の医学図解を `private_assets/medical/`（git 管理外）に置いた環境でのみ通る既存条件 |
| `npm run e2e`（26 テスト・ポート 3100） | 全合格 |
| 撮影条件 E2E（`playwright.filming.config.ts` と同じ設定） | 5 合格・2 スキップ・0 失敗。スキップ 2 件は `social.spec.ts` の「教材の承認前」テストで、`test.skip(seeded, "教材を登録した撮影環境では、承認後のテストで確認する")` による既存の意図的スキップ。設定ファイル既定の DB ポート 5450 が並行作業（親セッションの開発サーバー）と重なり起動できなかったため、同じ設定でポートだけ 3180／5480 に変えた一時設定で実行（コミットしていない）。1 回目の実行中に別セッションがこのサーバーを停止したため `summary_period.spec.ts` 2 件が失敗したが、再実行で全件合格 |
| `node .judge-demo/tools/build.mjs` → `verify-dist.mjs` | 合格（127 公開ファイル） |
| レイアウト監査 `patient-layout-audit.mjs`（3410）/ `clinician-layout-audit.mjs`（8788） | いずれも TOTAL 0 |
| `scripts/review/illustration-walkthrough.mjs http://localhost:8788` | 30 項目すべて OK |

## 4. 公開デモへの反映と公開 URL での確認
1. `git fetch origin` → `git rebase origin/feat/submission-ux-redesign-20261108`（並行コミットなし・no-op）→ `git push origin HEAD:feat/submission-ux-redesign-20261108`（通常 push。`d65e20f..4238350`）。
2. 配信用: `git commit-tree HEAD^{tree} -p origin/feat/submission-ux -p HEAD`（マージコミット `dccddb85…`。ツリー `1a3c1a8d…` は提出ブランチ HEAD と同一）→ `git push origin publish-submission-ux:feat/submission-ux`（`7088e4e..dccddb8`、通常 push）。Vercel の自動ビルドで約 2 分 30 秒後に `judge-release.json` の `commit` が `dccddb85…` になった。
3. `node .judge-demo/tools/verify-live.mjs https://shiori-judge-demo.vercel.app dccddb85aeae7c15a89806bd5fa3fad992f9af5e .judge-demo/dist` → 合格（公開ページ・バンドルがローカルの審査用ビルドと一致）。`curl https://shiori-judge-demo.vercel.app/api/studio` → `{"configured":true,"model":"claude-sonnet-5-5"}`。
4. `node scripts/assets/validate-illustration-batch.mjs --live https://shiori-judge-demo.vercel.app --report batch-live.json` → 57 ID 合格、79 ファイルすべて HTTP 200・`image/*`・画像としてデコード可・寸法と SHA-256 が納品物と一致（`batch-live.json`）。配信前の同じ確認では 79 ファイルすべて HTTP 404 で不合格になることを確認済み（HTML の代替応答や古いキャッシュを「見かけ上の成功」にしない）。

## 5. 患者側・医療者側の操作結果（公開 URL）
`node scripts/review/illustration-walkthrough.mjs https://shiori-judge-demo.vercel.app`（新しいブラウザーコンテキスト・sessionStorage 空・Chromium）で 30 項目すべて OK、ページエラーなし（`walkthrough.json`）。
代表画面は `shots/`（公開版。患者側 390×844・医療者側 1024×768、いずれも 2 倍密度の JPEG）。「目視」は私が画像を開いて確認したもの、「DOM 照合」は currentSrc・naturalWidth・naturalHeight と台帳の一致。

### 患者側（スマートフォン幅 390px）
| 操作 | 結果 | 確認の別 |
| --- | --- | --- |
| 入口「患者として体験」→ ホーム（`P01`） | 「今」のカードが「化学療法中の副作用とセルフケア」（続きから） | DOM・目視 |
| 教材詳細（`P02`）→「33%から再開する」→「前へ」で 1 ページ目へ | 1/6 から開始 | DOM |
| 1〜5 ページ（`P11`〜`P15`） | 休息（EDI-SE-01）・食事（02）・座ってする家事（03）・手洗い（04）・連絡（05）がそれぞれ本文の上に表示。見出しは台帳どおり、医学図解のタブなし、線画の代替なし、alt 一致 | DOM 全 5 件・目視 全 5 件（透過背景が本文の地色になじみ、文字と重ならない。スマホ幅で高さ 252px に収まる） |
| 6 ページ目「まとめ」（`P16`） | 登録なし → 従来の線画の代替。挿絵なし | DOM・目視 |
| 「理解を確認する」→ 理解確認 1/4（`P20`）→「← 戻る」（`P21`） | 学習画面に戻る（view=learn） | DOM・目視 |
| 再び理解確認 → 1 問目に回答 → 解説（`P22`）→「『すぐに連絡するサイン』のページへ戻る」（`P23`） | 5 ページ目の挿絵（EDI-SE-05）が再び表示 | DOM・目視 |
| 最後のページ →「理解を確認する」→ 残り 3 問に回答（`P24` は 4 問目の解説） | 4 問すべて回答を記録（架空の学習として「わからない」を選択） | DOM・目視 |
| 教材を探す（`P30`・`P31`） | 30 件のカードのうち新しい 22 教材すべてに縮小版サムネイル（192×144）。既存 8 件は従来どおり | DOM 22/22・目視（`P31` に写る 7 件） |
| 検索「しびれ」（`P32`） | 「手足のしびれ」だけが残り、サムネイルつき | DOM・目視 |
| 教材詳細「手足のしびれ」（`P33`） | 原寸サムネイル（1600×1200）を横長の帯に切り抜いて表示（band）。「学習を始める」が画面内 | DOM・目視 |
| ホーム → 「化学療法開始時セットの内容を見る」（`P40`） | セット詳細の表紙に COVER-chemo_start_set（800×1000）、教材カードに縮小版サムネイル | DOM・目視 |
| 残りの挿絵 24 点（EDI-OLD-01〜08・EDI-NEW-01〜11・13〜16） | 教材一覧から各教材を開き 1 ページ目で照合。24/24 一致 | DOM のみ（画面は撮っていない） |

患者側で本来見えないもの: 架空患者に処方されていない 5 セット（術前・さくら総合病院 化学療法オリエンテーション・術前準備・免疫療法開始時・化学療法の副作用対策）の表紙は患者のセット詳細には出ない（処方されれば同じ `DSetCover` に表示。医療者側で全件確認）。

### 医療者側（タブレット幅 1024px）
| 操作 | 結果 | 確認の別 |
| --- | --- | --- |
| 入口「医療者として体験」→「デモ: 架空患者の共有を開始する」（`C01`・`C02`） | 診察サマリーが開く | 目視 |
| 教材ライブラリ（`C03` 候補・`C05` 一覧） | 30 行すべてにサムネイル。新しい 22 教材は縮小版 PNG と一致（遅延読み込み分もスクロールして読み込ませてから照合） | DOM 22/22・目視（候補の「手足のしびれ」ほか） |
| セット（`C04`） | 8 セットの行に表紙。新しい 6 点はすべて 800×1000 の WebP と一致（既存の診断時セット・仕事とお金のことも表示） | DOM 6/6・目視 6/6 |
| 候補「手足のしびれ」を「処方に追加」→「確認へ」（`C06`）→「1件の情報処方を確定」 | 処方が確定 | DOM・目視 |
| 同じタブで「患者側」（`C07`）→「新しく届いた教材」→「学び始める」→ 詳細（`C08`）→「学習を始める」（`C09`） | 届いた教材の 1 ページ目に EDI-NEW-12（台所で厚手の手袋をして鍋を持つ女性）。詳細には原寸サムネイル | DOM・目視 |

医療者側で本来見えないもの: 本文挿絵（editorial）は医療者の教材ライブラリでは表示しない（行はサムネイルのみ。教材スタジオのプレビューは下書き用で、シード教材の挿絵は対象外）。公開デモに医療者向けの「教材詳細」「患者プレビュー」の導線はなく、新設はしていない。

### 目視で確認した点
- 背景透過: 挿絵（PNG）・線画（WebP）とも白地が透過され、学習画面・カード（領域色の地）・セットの枠で地色になじむ（`P11`・`P31`・`P40`・`C04`）。
- 文字との重なり: 挿絵は見出し・要点の下、本文の上に独立して置かれ、重ならない。固定の「前へ／次へ」バーの下に本文が隠れるのは従来どおり（スクロールで読める）。
- スマホの縮小表示: 1200×900 を 350×252 に縮小（`object-fit: contain`）。線画は 192×144 の縮小版を使い、カードでぎざつかない。
- 横長カード・縦長表紙の切り抜き: 教材詳細の帯（124px）は中央帯に収まる設計の 22 点で主題が切れない（描画範囲 y 372〜827 を計測）。セット表紙は 4:5 の枠に `contain`（医療者側）／`cover`（患者側のセット詳細。既存と同じ）。
- 読み込み後の仮画像: 挿絵は `complete` かつ naturalWidth 1200 を確認してから撮影。線画の代替（SlideArt）は登録のないページ（6 ページ目）にだけ残る。

## 6. 補足・完了できなかった項目
- `.judge-demo/tools/smoke-browser.mjs` は「次の診察で相談したいこと（審査用の架空メモ）」の表示待ちでタイムアウトする既存の問題（11/8 の UI 変更に追随していない）があるため、公開版の操作確認には使わず、`scripts/review/illustration-walkthrough.mjs` で代替した。
- 本文挿絵 29 点のうち、画面を撮って目視したのは EDI-SE-01〜05 と EDI-NEW-12 の 6 点。残り 24 点は公開 URL での DOM 照合（currentSrc・寸法・alt・見出し）のみ。サムネイル 22 点は患者の教材一覧と医療者のライブラリの両方で DOM 照合し、代表画面に写る分を目視。
- 既存 DB への反映は `npm run db:setup`（migrate + 冪等な seed）で行える。開発用 DB（`.data/shiori`）は他の作業ツリーのものなので、ここでは一時 DB と統合テストで確認した。
- 医療者の教材ライブラリの行の `<img>` には `@next/next/no-img-element` の lint 警告が 1 件増える（同じ場所の既存 `MaterialThumb` と同じ扱い。エラーではない）。
