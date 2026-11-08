# 挿絵・アイコンの一括制作（2026-11-08）— Codex への依頼一式

現状の棚卸し（教材 30 本・スライド 139 枚）: 図解が入っているのは「乳がんの診断と病期の考え方」1 枚目の 3 枚（医学的図解・監修済み）だけ。サムネイルは 30 本中 8 本、セットのカバーは 8 つ中 2 つ。
動画に映る画面（患者ホームから最初に開く教材「化学療法中の副作用とセルフケア」、候補に上がる「手足のしびれ」、教材一覧、医療者のライブラリ）を優先して、以下を制作する。

| 種類 | 枚数 | 画風 | ルール |
| --- | --- | --- | --- |
| 挿絵（editorial） | 29 | 水彩のエディトリアル | [RULES_ILLUSTRATION.md](RULES_ILLUSTRATION.md) |
| 教材サムネイル（アイコン） | 22 | 単色の線画 #315E68 | [RULES_ICON.md](RULES_ICON.md) |
| セットのカバー（アイコン） | 6 | 単色の線画 #315E68（縦） | [RULES_ICON.md](RULES_ICON.md) |

プロンプト（機械可読）: [prompts.json](prompts.json) / [prompts.csv](prompts.csv)。各行の `prompt` をそのまま画像生成に渡す。ファイル名は `id.png`。

## 優先順位
1. **P0（動画に映る）**: EDI-SE-01〜05（化学療法中の副作用とセルフケア）、EDI-NEW-12（手足のしびれ）、THUMB-* の 22 枚（教材一覧・医療者ライブラリに並ぶ）。
2. **P1**: EDI-NEW-*（新教材の 1 枚目 16 枚）、COVER-*（6 枚）。
3. **P2**: EDI-OLD-*（旧教材の 1 枚目 8 枚）。

## 共通プロンプト（先頭に付ける）
### 挿絵
```
Quiet, refined Japanese wellness editorial illustration for an adult cancer patient-education app. Soft watercolor with thin dark teal (#315E68) ink lines, muted palette of sage green, warm sand, dusty rose and blue-grey, generous white space, plain white background. Adult Japanese people with believable proportions, calm dignified expressions, no exaggerated smiles, no childish cartoon style. No text, no letters, no numbers, no arrows, no logos, no border, no frame, no drop shadow, no 3D, no gradient background. Single standalone image.
```
### 教材サムネイル
```
Single continuous-line illustration, monochrome ink line in dark teal (#315E68), thin even stroke, no fill, no shading, on a pure white background, lots of empty margin. Main subject centered within the middle horizontal band of the canvas so it survives a wide crop. Gentle, elegant, adult wellness tone; nothing medical-anatomical, no organs, no blood, no syringes. No text, no letters, no numbers, no arrows, no logos, no border, no frame. Single standalone image.
```
### セットのカバー
```
Single continuous-line illustration, monochrome ink line in dark teal (#315E68), thin even stroke, no fill, no shading, on a pure white background, generous margin, portrait composition with the subject in the upper two thirds. Gentle, elegant, adult wellness tone; nothing medical-anatomical. No text, no letters, no numbers, no arrows, no logos, no border, no frame. Single standalone image.
```
### 禁止（末尾に付ける）
```
Must not show: anatomy, tumours, surgery, needles, blood, pills in detail, brand names, hospital logos, children in distress.
```

## 一覧
### 挿絵（editorial）
| id | 教材 | スライド | 場面 | 納品名 |
| --- | --- | --- | --- | --- |
| EDI-SE-01 | 化学療法中の副作用とセルフケア | 1 副作用の出方は人それぞれ | 自宅のソファで静かに休む成人女性。膝にブランケット、そばにお茶と小さなメモ帳。 | `EDI-SE-01.png` |
| EDI-SE-02 | 化学療法中の副作用とセルフケア | 2 吐き気・食欲が落ちたとき | 台所のテーブルで、小さな器から少量ずつ食べる女性。水のコップとクラッカーの皿。 | `EDI-SE-02.png` |
| EDI-SE-03 | 化学療法中の副作用とセルフケア | 3 だるさと、仕事や家事 | 椅子に座って洗濯物を畳む女性。無理をしない家事の工夫。足元にかご。 | `EDI-SE-03.png` |
| EDI-SE-04 | 化学療法中の副作用とセルフケア | 4 感染を防ぐ工夫 | 洗面台で丁寧に手を洗う女性。石けんとタオル、窓からの光。 | `EDI-SE-04.png` |
| EDI-SE-05 | 化学療法中の副作用とセルフケア | 5 すぐに連絡するサイン | 自宅で体温計を手に、スマートフォンと病院の案内カードを見る女性。少し離れた小さな場面で電話を受ける医療者。 | `EDI-SE-05.png` |
| EDI-OLD-01 | サブタイプと治療方針のつながり | 1 サブタイプとは | 診察室の机で、結果の用紙を一緒に見ながら説明を聞く女性と医療者（文字は描かない）。 | `EDI-OLD-01.png` |
| EDI-OLD-02 | 乳房の手術の種類と選び方 | 1 手術の2つの方法 | 自宅のテーブルで家族と向かい合い、落ち着いて相談する女性。お茶と一冊のノート。 | `EDI-OLD-02.png` |
| EDI-OLD-03 | 手術後の生活と気をつけること | 1 傷のケア | 朝の洗面所で、ゆっくり腕を上げて身支度をする女性。やわらかいタオル。 | `EDI-OLD-03.png` |
| EDI-OLD-04 | 薬物療法の種類（化学療法・ホルモン療法・分子標的） | 1 薬物療法の3つの種類 | 壁のカレンダーを見ながら手帳に予定を書く女性。机の上にお茶。 | `EDI-OLD-04.png` |
| EDI-OLD-05 | 放射線治療の進め方と皮膚のケア | 1 治療の進め方 | 通院の朝、玄関でやわらかい素材のカーディガンを羽織る女性。小さなバッグ。 | `EDI-OLD-05.png` |
| EDI-OLD-06 | こころのケアと相談先 | 1 不安や落ち込みは自然な反応 | 窓辺の椅子で、日記を膝に置いて外を眺める女性。穏やかな表情。 | `EDI-OLD-06.png` |
| EDI-OLD-07 | さくら総合病院 外来化学療法室のご案内 | 1 当日の流れ | 明るい待合スペースで、ひざ掛けと本を持って静かに待つ女性。観葉植物（実在の施設に似せない）。 | `EDI-OLD-07.png` |
| EDI-OLD-08 | さくら総合病院 術後リンパ浮腫外来 | 1 リンパ浮腫外来とは | 外来の受付カウンターで、案内を受ける女性と受付の人（文字・ロゴなし）。 | `EDI-OLD-08.png` |
| EDI-NEW-01 | 大腸がんの診断と病期 | 1 検査で調べていること | 診察室で画像をうつすモニターの前（画面は無地）、医療者の説明を聞く男性。 | `EDI-NEW-01.png` |
| EDI-NEW-02 | 肺がんの検査と遺伝子・バイオマーカー検査 | 1 組織型を調べる | 窓辺で深呼吸をする年配の男性。カーテンと観葉植物。 | `EDI-NEW-02.png` |
| EDI-NEW-03 | セカンドオピニオンの受け方 | 1 セカンドオピニオンとは | 封筒に入った紹介状と資料を手に、別の病院の入口へ向かう女性。 | `EDI-NEW-03.png` |
| EDI-NEW-04 | 手術前の準備（禁煙・口腔ケア・体力づくり） | 1 禁煙は早いほどよい | 朝の公園を軽く歩く中年の男性。深呼吸、やわらかい木漏れ日。 | `EDI-NEW-04.png` |
| EDI-NEW-05 | 胃・大腸の手術のあとの食事 | 1 少量ずつ、ゆっくり、よく噛む | 小さな器に盛られた少量の食事（おかゆ・豆腐・スープ）が並ぶ食卓と、箸を持つ手元。 | `EDI-NEW-05.png` |
| EDI-NEW-06 | 免疫チェックポイント阻害薬の治療と注意する症状 | 1 免疫の働きを使う薬 | 外来の点滴室で、リクライニングチェアに座り本を読む女性（点滴スタンドは遠景でさりげなく）。 | `EDI-NEW-06.png` |
| EDI-NEW-07 | 飲み薬の抗がん剤を安全に続けるために | 1 飲み方は「決められたとおり」 | 台所のテーブルで、ピルケースと手帳、コップの水を前に座る年配の女性（薬は小さく、文字なし）。 | `EDI-NEW-07.png` |
| EDI-NEW-08 | 手術の前後に行う薬物療法の目的 | 1 手術の前に行う薬物療法 | 診察室で治療の見通しを一緒に確認する女性と医療者。机に手帳。 | `EDI-NEW-08.png` |
| EDI-NEW-09 | 放射線治療の種類と部位ごとの副作用 | 1 放射線治療の種類 | 明るく静かな治療室の入口で、スタッフに案内される女性（装置は描かない）。 | `EDI-NEW-09.png` |
| EDI-NEW-10 | 痛みをやわらげる放射線治療（緩和照射） | 1 症状をやわらげる放射線治療 | 自宅のベッドの縁に腰かけ、ゆっくり伸びをする年配の男性。朝の光。 | `EDI-NEW-10.png` |
| EDI-NEW-11 | 発熱したときの対応（白血球が減っている時期） | 1 なぜ発熱に注意するのか | 体温計を見て、横のスマートフォンに手を伸ばす女性。テーブルに病院の案内カード。 | `EDI-NEW-11.png` |
| EDI-NEW-12 | 手足のしびれ（末梢神経障害）とのつきあい方 | 1 しびれの出方 | 厚手の手袋をして鍋をつかむ女性の手元と、足元の滑りにくいスリッパ。台所。 | `EDI-NEW-12.png` |
| EDI-NEW-13 | 口内炎・味覚の変化と食事の工夫 | 1 口の中のケア | 洗面台でやわらかい歯ブラシを手に取る女性。コップと小さな植物。 | `EDI-NEW-13.png` |
| EDI-NEW-14 | 脱毛と外見のケア（アピアランスケア） | 1 脱毛の時期と経過 | 鏡の前でやわらかい帽子を整える女性。穏やかな表情。鏡台に帽子とスカーフ。 | `EDI-NEW-14.png` |
| EDI-NEW-15 | 家族や子どもに病気をどう伝えるか | 1 伝え方に正解はない | リビングのソファで、子どもと並んで座り絵本を開く女性。落ち着いた雰囲気。 | `EDI-NEW-15.png` |
| EDI-NEW-16 | 緩和ケアは早い時期から | 1 緩和ケアとは | 静かな部屋で、椅子に座る女性と、同じ目の高さで話を聴く看護師。 | `EDI-NEW-16.png` |

### 教材サムネイル（thumbnail）
| id | 教材 | | 主題 | 納品名 |
| --- | --- | --- | --- | --- |
| THUMB-colorectal_staging | 大腸がんの診断と病期 |  | 机の上の開いた手帳とマグカップ | `THUMB-colorectal_staging.png` |
| THUMB-lung_biomarker | 肺がんの検査と遺伝子・バイオマーカー検査 |  | 窓辺の椅子と観葉植物 | `THUMB-lung_biomarker.png` |
| THUMB-second_opinion | セカンドオピニオンの受け方 |  | 封筒と一輪の花 | `THUMB-second_opinion.png` |
| THUMB-prehab | 手術前の準備（禁煙・口腔ケア・体力づくり） |  | 歩きやすい靴とタオル | `THUMB-prehab.png` |
| THUMB-post_surgery_diet | 胃・大腸の手術のあとの食事 |  | 小さな器とれんげ | `THUMB-post_surgery_diet.png` |
| THUMB-immunotherapy | 免疫チェックポイント阻害薬の治療と注意する症状 |  | リクライニングチェアと本 | `THUMB-immunotherapy.png` |
| THUMB-oral_anticancer | 飲み薬の抗がん剤を安全に続けるために |  | ピルケースと手帳 | `THUMB-oral_anticancer.png` |
| THUMB-perioperative_therapy | 手術の前後に行う薬物療法の目的 |  | カレンダーとペン | `THUMB-perioperative_therapy.png` |
| THUMB-radiation_types | 放射線治療の種類と部位ごとの副作用 |  | 玄関のカーディガンと小さなバッグ | `THUMB-radiation_types.png` |
| THUMB-palliative_radiation | 痛みをやわらげる放射線治療（緩和照射） |  | ベッドサイドのランプと水 | `THUMB-palliative_radiation.png` |
| THUMB-fever_response | 発熱したときの対応（白血球が減っている時期） |  | 体温計とスマートフォン | `THUMB-fever_response.png` |
| THUMB-neuropathy | 手足のしびれ（末梢神経障害）とのつきあい方 |  | 厚手の手袋とスリッパ | `THUMB-neuropathy.png` |
| THUMB-mouth_taste | 口内炎・味覚の変化と食事の工夫 |  | 歯ブラシとコップ | `THUMB-mouth_taste.png` |
| THUMB-appearance_care | 脱毛と外見のケア（アピアランスケア） |  | 帽子とスカーフ | `THUMB-appearance_care.png` |
| THUMB-family_children | 家族や子どもに病気をどう伝えるか |  | ソファと絵本 | `THUMB-family_children.png` |
| THUMB-palliative_care | 緩和ケアは早い時期から |  | 向かい合う椅子と小さなテーブル | `THUMB-palliative_care.png` |
| THUMB-surgery_choice | 乳房の手術の種類と選び方 |  | テーブルの上の二つのカップとノート | `THUMB-surgery_choice.png` |
| THUMB-after_surgery | 手術後の生活と気をつけること |  | タオルとハンドクリーム | `THUMB-after_surgery.png` |
| THUMB-drug_therapy | 薬物療法の種類（化学療法・ホルモン療法・分子標的） |  | 手帳と鉛筆とお茶 | `THUMB-drug_therapy.png` |
| THUMB-radiation | 放射線治療の進め方と皮膚のケア |  | 保湿クリームとやわらかい衣類 | `THUMB-radiation.png` |
| THUMB-sakura_chemo_room | さくら総合病院 外来化学療法室のご案内 |  | 待合の椅子と観葉植物 | `THUMB-sakura_chemo_room.png` |
| THUMB-sakura_lymph | さくら総合病院 術後リンパ浮腫外来 |  | 受付カウンターの小さな植物 | `THUMB-sakura_lymph.png` |

### セットのカバー（cover）
| id | セット | | 主題 | 納品名 |
| --- | --- | --- | --- | --- |
| COVER-preop_set | 術前セット |  | テーブルの上の二つのカップと開いたノート | `COVER-preop_set.png` |
| COVER-chemo_start_set | 化学療法開始時セット |  | 手帳とカレンダーとお茶 | `COVER-chemo_start_set.png` |
| COVER-sakura_chemo_orientation | さくら総合病院 化学療法オリエンテーション |  | 待合の椅子と観葉植物と窓 | `COVER-sakura_chemo_orientation.png` |
| COVER-prehab_set | 術前準備セット |  | 歩きやすい靴・タオル・水のボトル | `COVER-prehab_set.png` |
| COVER-immunotherapy_set | 免疫療法開始時セット |  | リクライニングチェアと本とひざ掛け | `COVER-immunotherapy_set.png` |
| COVER-side_effect_care_set | 化学療法の副作用対策セット |  | やわらかい帽子・手袋・歯ブラシ・体温計が並ぶ棚 | `COVER-side_effect_care_set.png` |

## 登録済み（2026-11-08）
57 点すべてを審査用デモに組み込んだ。配信ファイルは納品物の `delivery/public/`（透過・色・縮小時の余白を調整済み）を同じ相対パスで `public/` に置いたもので、
下の取り込みスクリプトは通していない（白の再透過・縮小版の再生成を避けるため）。登録先と検証:
- 台帳: [delivery_manifest.json](delivery_manifest.json)（57 ID・79 ファイル・SHA-256・寸法・alt・配置先）。
- サムネイル 22・表紙 6: `src/concept-d/thumbnails.ts`（`THUMBNAILS`・`SET_COVERS`）。`docs/design/final_assets/manifest.json` にも追記（`node scripts/assets/validate-images.mjs` の対象）。
- 本文挿絵 29: `src/server/db/seed-figures.ts`（editorial・納品済み → seed で approved。再実行しても重複しない）。公開デモは `npx tsx scripts/judge/sync-patient-figures.mts` で `.judge-demo/app/fixtures/patient-figures.json` に同期（`--check` で差分確認）。
- 検証: `node scripts/assets/validate-illustration-batch.mjs [--dist .judge-demo/dist] [--live <url>] [--report <json>]`（欠落・SHA-256・寸法・二重登録・大文字小文字違い・別教材への登録、公開 URL の実応答）、
  `node scripts/review/illustration-walkthrough.mjs <url> <出力>`（患者 390px・医療者 1024px で審査員と同じ入口から操作し DOM で照合、代表画面を撮る）、
  `node scripts/review/illustration-verification-table.mjs`（検証表）。結果は `docs/review/illustration_integration_20261108/`。

## 受け取ってからの手順
1. 画像を 1 つのフォルダに置く（`id.png`）。
2. `npx tsx scripts/assets/import-illustrations.mts <フォルダ>` を実行する。サムネイル・カバーは `public/thumbnails/`・`public/covers/` に WebP で書き出し、挿絵は `public/assets/editorial/` に PNG で置く。`docs/design/illustration_batch_20261108/generated/` に登録用の断片（`thumbnails.registry.txt`・`seed-figures.entries.txt`・`patient-figures.additions.json`）を出力する。
3. 画像を目で確認する（ルールの受け入れ基準）。
4. 断片を `src/concept-d/thumbnails.ts`・`src/server/db/seed-figures.ts`・`.judge-demo/app/fixtures/patient-figures.json` に反映し、`node scripts/assets/validate-images.mjs` と `npm test` を通す。
5. 公開デモを再ビルドして配信する。

## 参考（既存の決まり）
- 図解の制作方針: `docs/design/ILLUSTRATION_SPECS.md`、`docs/design/handoff_visual_v1/VISUAL_ASSET_SPECS_5.md`
- 画像の置き場所・命名・検査: `docs/design/ASSET_INTEGRATION_SPEC.md`、`docs/design/final_assets/manifest.json`
- サムネイルの枠と切り抜き: `docs/design/phase2/step5/thumbnails.md`
