# Experience Reset 01 — Phase A 実装報告（共通部品＋患者ホーム＋教材学習）2026-11-03

- 参照デザイン: `.design-reference/shiori_reset_design/`（Git 管理外。`index.html` をブラウザで表示して 6 画面を確認、`previews/` と照合）。
- 実装: 本番の患者画面 `/home` と `/learn/{versionId}`（実データ・既存機能に接続）。クイズ・結果・診察・スタジオは未着手（Phase B/C）。
- 画像: `reference/`（参照 HTML を端末内側だけで撮影。iPhone 風の外枠・偽ステータスバーは除外）、`app/`（実装）、`compare/`（左: 参照、右: 実装）。計測は `app/metrics.json`。
- データはすべて架空（seed の 佐藤 花子・MED-001・EDI-001）。参照素材（`assets/`）は public にコピーしていない。画像は既存の承認済みアセット（`/assets/editorial/EDI-001.png`、`/assets/medical/med_001_*.png`）を使う。

## 1. 参照 HTML から抽出したデザイントークン（`src/app/reset.css` の `.reset-shell`）

| トークン | 値 | 用途（参照の CSS） |
|---|---|---|
| `--ink` | `#203744` | 本文・見出し |
| `--blue` | `#365C79` | 主ボタン、リンク、進捗、選択中、ブランド |
| `--blue2` | `#587E99` | 補助の青 |
| `--bluePale` | `#E9F1F7` | アイコン面、要点の箱 `#e9f2f7` |
| `--canvas` | `#F5F8FA` | 画面背景 |
| `--white` | `#FFFFFF` | カード・ヘッダー |
| `--border` | `#DDE7EB` | 罫線（カードは `#e4ecf0` / `#e7edf0`） |
| `--coral` / `--coralPale` | `#C9957E` / `#F8EEE9` | eyebrow の点、注意表示ではない |
| `--sage` / `--sagePale` | `#5A867B` / `#EAF3EE` | 状態ピル（つづきから）、確認できた |
| `--muted` / `--muted2` | `#5C7180` / `#798B95` | 補助文 |
| `--shadow` | `0 10px 36px rgba(31,62,83,.055)` | 大カードの影 |
| `--rad` | `20px` | 大カード角。小カード 15px、ヒーロー 18px、主カード 19px、ボタン 14px |
| フォント | Noto Sans JP（`next/font/google`、400/500/700/900）→ Hiragino Kaku Gothic ProN → system-ui | 参照の `--font`。ブランド「shiori」は Georgia / Noto Serif JP |
| 文字 | eyebrow 13px/800、h1 25px（ヒーロー 26px）/850/-0.055em/1.38、h2 18px、本文 16px/1.8、補助 14px、主カード見出し 21px、短い説明 16px/1.7、図の caption 14px、注記 13px、タブ 11px | 参照の `.h1` `.body` `.muted` `.rx-card h2` `.lesson-short` 等。**可読性のため参照の 15/12/11px から本文 16px・補助 14px・注記 13px に引き上げ**（2026-11-03 承認時の指示） |
| 余白 | 画面 17px 18px 28px、大カード 18px、主カード 19px 17px 17px、小カード 13px、ヒーロー 22px 17px | 参照の `.phone-content` `.big-card` `.rx-card` `.small-card` `.home-hero` |
| 操作 | 主ボタン min-height 52px（固定 CTA 内は 55px）、radius 14px、15px/800、アイコンボタン 44px、下部タブ 76px、固定 CTA 84px（10px 18px 18px） | 参照の `.btn` `.phone-bottom` `.phone-cta` |
| 既存ユーティリティへの対応 | `--bg --surface --ink-soft --ink-muted --line --accent --sakura --wakakusa --sora --suna` を上記に割り当て | 未移行の患者画面（クイズ・記録・共有）も同じ配色になる |

文字拡大（`html[data-textsize="large"]`）: 本文系 16→18px、h1 25→28px、補助 14→16px、タブ 11→13px。

## 2. 再利用する共通コンポーネント

| 部品 | ファイル | 参照の要素 |
|---|---|---|
| 外枠・下部タブ | `src/app/(patient)/layout.tsx`（`.reset-shell`、`.rs-page`）、`src/components/PatientTabs.tsx`（`.rs-tabs` `.rs-tab`、線画アイコン） | `.phone` 内側、`.phone-bottom` `.tab-link` |
| ヘッダー | `.rs-header`（56px、ブランド `.rs-brand` / 戻る＋タイトル `.rs-heading-small`、`.rs-icon-btn`） | `.phone-header` `.brand` `.heading-small` `.icon-btn` |
| ボタン | `.rs-btn` `.primary` `.outline` `.ghost` `.wide`、固定バー `.rs-cta` | `.btn` `.phone-cta` |
| 見出し階層 | `.rs-eyebrow`（コーラルの点）`.rs-h1` `.rs-h2` `.rs-body` `.rs-muted` `.rs-section-label` | 同名 |
| カード | `.rs-big-card` `.rs-small-card` `.rs-rx`（主カード）`.rs-item-row`（行）`.rs-mini-icon` `.rs-pill` `.rs-meta` | `.big-card` `.small-card` `.rx-card` `.item-row` `.mini-icon` `.pill` `.meta` |
| ヒーロー | `.rs-hero` `.rs-hero-photo` `.rs-hero-text` | `.home-hero` `.hero-photo` `.hero-text` |
| 教材 | `.rs-progress` `.rs-prop` `.rs-listen`（`SpeakButton variant="reset"`、音声ロジックは共通）`.rs-short` `.rs-figure` `.rs-segments` `.rs-figmain` `.rs-figcaption` `.rs-fignote` `.rs-details` | `.lesson-progress` `.lesson-prop` `.listen` `.lesson-short` `.figure-frame` `.figure-segments` `.figure-main` `.figure-caption` `.figure-note` |
| アイコン | `src/components/reset/Icons.tsx`（参照 `icons` の path をそのまま。線幅 1.8、21/17/25px） | `ico()` |
| 文字サイズ切替 | `FontSizeToggle variant="icon"`（ヘッダー右の「あ+」） | 参照には無い既存機能（アクセシビリティ）を残した |

## 3. 患者ホーム: 参照と実装（`compare/compare_home_390.png`、`compare_home_430.png`、全体は `_full`）

| 要素（390） | 参照（px、画面上端から） | 実装 | 差 |
|---|---|---|---|
| ヘッダー | 0–56 | 0–56 | 0 |
| ヒーロー | top 73、高さ 210、幅 356 | 73 / 210 / 356 | 0 |
| ヒーローのイラスト | top 91、left 153、245×202 | 91 / 153 / 245×202 | 0（EDI-001 を右下に contain・乗算） |
| ヒーロー見出し | top 122、幅 210 | 125 | +3（kicker の 1 行分の行高差） |
| 主カード | top 298、幅 354、高さ 297 | 298 / 354 / 264 | 高さ −33: 参照はタイトル 2 行＋説明 2 行、実装は次の教材「こころのケアと相談先」が 1 行。内容依存 |
| 主カード見出し | top 361、21px | 362 | +1 |
| 主ボタン | top 525、幅 318、高さ 52 | 492 / 318 / 52 | −33（上記と同じ理由。カード内の位置関係は同じ） |
| 下部タブ | 高さ 76 | 76（768–844） | 0 |
| ファーストビュー | ヒーロー＋主カード＋主ボタン＋「これまでの学び」の見出し | 同じ＋小カードの 2 行目まで | 主カードが短い分、下の内容が多く見える |

- 430 も同じ関係（主カード幅 394、ボタン幅 358、参照と一致）。
- 文字拡大（390）: ヒーロー見出し 128、主ボタン 502、横スクロール 0。820 / 1180 は 448px に中央寄せ（`max-w-md`）し、崩れなし。
- 参照からの意図的な差: (1) 下部タブは 4（ホーム・まなぶ・記録・共有）→ 3（ホーム・記録・共有）。「まなぶ」に対応する一覧画面が現行アプリに無いため（新機能になる）。(2) ヘッダー右のベルは通知機能が無いため置かず、文字サイズ切替「あ+」を置いた。(3) kicker を「あなたの学びの場所」→「{氏名} さん、こんにちは」にして、本人のログインであることを示した。(4) 主カードの説明文は教材の summary（無ければ届いた日時・医療機関）。(5) 「これまでの学び」は届いた教材のうち主役以外を状態（学習済み／つづきから／未着手）付きで並べ、「すべて見る →」は記録画面へ。

## 4. 教材学習: 参照と実装（`compare/compare_learn_390.png`、`compare_learn_430.png`）

| 要素（390） | 参照 | 実装 | 差 |
|---|---|---|---|
| ヘッダー | 0–56、戻る＋タイトル＋ベル | 0–56、戻る＋タイトル＋目次＋あ+ | ベル→目次・文字サイズ |
| 進捗バー | 5px、下余白 23 | 同じ | 0 |
| eyebrow「1 / 4 今日の学び」 | — | 同じ | 0 |
| 見出し h1 | top 127、2 行（69px） | 132、1 行（35px） | +5。参照は疑問文 2 行、実装は教材データの見出し「病期（ステージ）とは」1 行 |
| 要点の箱 | top 210、高さ 75 | 181 / 78 | −29（見出しが 1 行のため） |
| 説明を聞く | top 299、高さ 55 | 273 / 56 | −26 / +1 |
| 短い説明 | top 342、高さ 48 | 342 / 82（16px で 3 行） | 0 / +34 |
| 図解の枠 | top 428、高さ 339（タブ 47＋図 236＋caption 54） | 437（タブ 56＋図 236＋凡例＋caption） | タブ行 +9（操作領域 44px を確保、参照 README の「44px 前後以上」に従う）、凡例の行を追加 |
| 図本体 | 236px、contain | 236px、contain | 0 |
| 固定 CTA | 高さ 84、戻る（outline）＋次のページへ（primary、flex） | 84、同じ構成、ボタン 55px | 0 |
| ファーストビュー | 見出し・要点・聞く・短い説明・タブ・図の上 3/4 | 同じ＋図の全体と caption の 1 行目 | 見出しが短い分、図が 30px 多く入る |

- 図の切り替えは 3 タブ。タブ名は短い表現 `乳房 / リンパ節 / ほかの臓器`（`FigureView.shortLabel`、文字拡大でも省略されない）。正式な説明は図の caption に残す。小さいサムネイルは使わない。
- 図の上のラベル: 名称の重なりで図が隠れていたため、図の上には **番号の点（①②③）だけ** を置き、名称は図の直下の凡例（番号＋名称）に移した。意味（どこを指すか）は維持。「リンパ節」タブ（3 ラベル: 乳房内の病変・わきの下のリンパ節・鎖骨のあたりのリンパ節）でも重ならない（`app/app_learn_{390,430}[_large]_fig{1,2,3}.png`）。
- 「くわしい説明・監修情報を確認する」（小カード、折りたたみ）に本文の残り・補足・図の監修情報と出典を入れた。
- 参照からの意図的な差: (1) 図の上に番号の点（承認済みラベルの位置）を置き、名称は凡例に。参照の図は無地。(2) 目次は参照に無いが既存機能として残し、ヘッダーのアイコンに移した。(3) 文字拡大時は本文 18px、見出し 28px。390 で図の上端 521、CTA 内に収まる。
- 1180 / 820: 448px 中央寄せ。図は 236px のまま（参照のスマホ構図を維持）。

## 5. 視覚的な差分と未解決事項
- 位置の差は、見出し・主カードの行数（内容）と、タブの操作領域（44px）に由来する。ヘッダー・ヒーロー・イラスト・主ボタン・固定 CTA・図本体のサイズと位置は参照と一致。
- フォント: 参照は Noto Sans CJK JP（OS 依存）。実装は Noto Sans JP を Web フォントで読み込む。太さ 850/750/650 は 900/700/700 に丸めた。
- 未解決（判断待ち）: 図のラベルピンを残すか／下部タブ「まなぶ」を作るか（一覧画面が必要）／ヘッダーのベル（通知）は実装しない方針でよいか。
- Phase A では、クイズ・記録・共有の画面は旧構造のまま新トークン（配色）だけが当たる。Phase B/C で順に置き換える。

## 6. 実際の操作・テスト結果

| 種別 | 結果 |
|---|---|
| TypeScript / ESLint | エラー 0（既存 warning 1） |
| Vitest | 8 ファイル 61 件合格（認証・QR・60 分セッション・処方・採点・スナップショット・質問保存・生成/承認のロジックは変更なし） |
| Playwright 全体（擬似生成） | 20 本中、新レイアウトの文言・構造に依存していた 6 本（`cta` `edi_home` `flow` `learn_layout` `med001_preview` `real_generation`）が失敗 → 期待値を更新して再実行し合格。残り 14 本は変更なしで合格 |
| 更新した期待値 | 「次へ」→「次のページへ」、「読み上げる」→「説明を聞く」、図の注記の文言、ホームの「医療者から届いた教材」、挿絵の重なり判定（Reset 01 では挿絵と見出しの箱が意図的に重なるため、見出しの文字が左 60% に収まり挿絵がヒーロー内にあることを検証） |
| 実操作（`flow.spec`） | 情報処方 → 患者ホームの主ボタン「読む・聞く」→ 学習（説明を聞く・目次・次のページへ×3）→ 確認問題へ → 中断してホームの「確認問題の続きから」→ 結果 → 次回診察、まで通し合格 |
| Phase A 撮影（`reset_phase_a.spec`） | 390 / 430 / 820 / 1180、文字拡大で横スクロール 0、44px 未満の操作要素 0、図の 3 タブ切り替え（タブ名の省略なし）と「次のページへ」の動作を確認。**最下部までスクロールしたとき、ホームは下部タブ、学習は固定 CTA に最後の要素（ログアウト／監修情報）が隠れないことを `elementFromPoint` で確認**（`app/metrics.json` の `*_bottom`） |

参照 HTML は `.git/info/exclude` で Git 管理外。参照の `assets/` は public にコピーしていない。
