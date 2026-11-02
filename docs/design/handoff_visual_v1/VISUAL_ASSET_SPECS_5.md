# 初回制作：医療図解4点＋ホーム用イラスト1点／ビジュアル資産制作仕様 v1.0

- プロダクト：乳がん情報処方サービス `shiori`（正式名未定）
- デザイン：**C 静かなウェルネス案**を基調。B案は明確な学習構造のみ参照し、幾何学図の表現は踏襲しない。
- 用途：患者向けスマートフォン教材の主図解（4点）、ホームの情緒的なイラスト（1点）
- 医学的な図解の構想は**作画指示**であり、医学的な内容の監修・利用許諾・一般公開の承認を意味しない。

## 共通スタイル（全5点）
- 大人向けの日本のウェルネスサービスに似合う、**静かで上質なエディトリアル・イラストレーション**。
- 主線は細めの落ち着いたダークネイビー／チャコールグリーン。繊細だが消えない線。淡いセージグリーン、温かいサンド、くすんだローズ、ブルーグレーなどの控えめな水彩色を**実際に適度に用いる**。完全なモノクロ線画にはしない。
- 背景は透明（アルファ付きPNG）。四角い背景カード、白ベタ、枠線、ドロップシャドウ、グラデーション、濃い彩度、3D、幼児的キャラクター、素材シート化を避ける。
- **1点につき独立した1画像**。同一キャンバスに複数アセット、タイトル、説明文、記号リストをまとめない。
- **画像自体には文字・数字・矢印・医学ラベル・ロゴを描かない。** 文言はUI側で重ねる。正確な医学説明・注意書きは原稿とHTML/SVGで提供する。
- 推奨原画：1536×1024pxの透明PNG（図解4点）。ホーム挿絵は1024×1280px程度の縦型も検討し、スマホ切り抜きに余裕を確保。最終表示領域とファイル容量は別途調整。
- 図像はイラストのみで病態や治療方針を断定しない。解剖位置や手技の描画は監修必須。

### アセットと図解の分離原則
医学的図解は、(1) ChatGPTで制作する**写実的すぎない解剖・人・物・場面の絵**、(2) UIコードで作る**線・順序・ラベル・凡例**、(3) 医療者が確認した**説明文**の3層で構築する。概念を丸や四角だけに置き換えない。

---

## MED-001｜病期の考え方：がんの広がりを理解する
- **優先度：P0**／配置：`病期とは`、主図解の最初の画面／画像ファイル：`med_001_breast_stage_anatomy.png`
- **1画面の学習目標：** 乳がんの病期を理解するためには、乳房内の病変だけでなく、近くのリンパ節や離れた場所への広がりなどを確認する必要があると知る。
- **描くもの：** 成人女性の上半身の、医学書ほど生々しくない端正な解剖イラスト。片側の乳房の位置、わきの下のリンパ節の位置が自然に読み取れる構図。小さな「全身シルエット」の別領域（同じ主図解の中）に、離れた臓器の位置関係を控えめに示す。身体の左右関係・病変の位置・臓器の関係を不自然に描かない。病変は誇張しない。
- **UI側の表示：** `乳房内の病変`、`近くのリンパ節`、`離れた場所への広がり` の短いラベルを適切なアンカーから表示。必要なら「病期の判断には他の検査情報・腫瘍の性質も関わる」という監修済み補足を表示。0〜IVの帯と機械的な計算矢印は**使わない**。
- **避けること：** 3要素を単純に足すと病期が決まるように見せる／病期が必ず順に進行すると見せる／乳腺・腋窩の不正確な解剖／乳がんにおける解剖学的病期と予後病期の混同。厳密なT/N/M表現と適用版は医療者確認。
- **作画ブリーフ（画像生成向け）：** “Single refined patient-education illustration, adult woman's upper torso as an anatomically plausible gentle medical schematic, accurate natural position of one breast and axillary lymph-node region, small separate whole-body silhouette as secondary visual reference for distant spread, clear organic anatomical forms, no alarming depiction, calm Japanese wellness editorial watercolor with fine dark green-navy outlines, muted sage, sand, rose and pale blue-gray washes, elegant spacious composition, isolated transparent background. No words, symbols, stage numbers, arrows, diagram boxes, labels, logos, or extra panels. One cohesive illustration, not a sticker sheet.”
- **医学的承認前の注意：** 解剖の位置関係・病期説明の分類体系を必ず監修者が確認する。

## MED-002｜治療の進み方：患者によって順序が異なる
- **優先度：P0**／配置：`薬物療法の目的と種類` または `治療の流れ`／画像ファイル：`med_002_treatment_journey.png`
- **学習目標：** 乳がんの治療は、薬物療法・手術などの組み合わせや順番が一人ひとり異なり、医療者が個別に説明することを理解する。
- **描くもの：** 連続したひとつの患者の生活場面を軸に、**点滴スタンド／医療者との相談／手術を象徴する病院の風景／自宅での日常**を適度に写実的に描き分けた穏やかな小情景。各場面は視覚的に独立し、あとからUI上で順序を構成できるよう、十分な余白を持つ。手術室器具の誤描写や強い医療行為表現は避ける。
- **UI側の表示：** 監修済み教材に沿って、`薬物療法 → 手術 → その後の治療` または `手術 → その後の治療` といった**複数の例**を並べる。画像内部には固定の矢印を描かず、画面側で可変の時系列を表現する。
- **避けること：** すべての患者に同じ治療順序を示唆する／治療後の再発がないと保証する／転移再発乳がんに早期乳がん向けの治療順序をそのまま適用する。素材の適用対象は早期乳がん等と明示する。
- **作画ブリーフ：** “A cohesive set of gentle real-life medical scene motifs within one spacious editorial illustration for breast-cancer patient learning: a consultation with a clinician, recognizable infusion stand and treatment chair, calm hospital treatment environment, adult woman's everyday life after an appointment. Anatomically plausible adult people, subtle Japanese context, sophisticated fine navy-green line work and light watercolor in sage, warm sand, dusty rose and blue gray. Individual motifs visually separated by whitespace to allow later sequencing in the app. Transparent background. No text, arrows, numbered steps, symbols, boxes, stock-photo realism, childish icons, or labels.”
- **実装補足：** 最終的には複数の小情景を個別アセットに分ける方が可変レイアウトに適する。今回の優先制作は絵柄検証用の1点とし、必要な分割は後で承認する。

## MED-003｜副作用で困ったとき：相談までの流れ
- **優先度：P0**／配置：`副作用と病院への連絡`／画像ファイル：`med_003_symptom_contact.png`
- **学習目標：** 気になる症状を一人で抱え込まず、病院から案内された連絡方法や説明資料を確認して相談につなげられることを知る。
- **描くもの：** 自宅で体調を気にしている成人女性と、手元のスマートフォン／説明カード、少し離れて電話を受ける医療者を、自然な生活空間と医療者の存在がわかる落ち着いた情景として描く。身体症状を過度にドラマチックに見せない。
- **UI側の表示：** `症状に気づく → 連絡先を確認する → 医療者に相談する` を個別の監修済みテキストと明確なナビで示す。病院固有の連絡先・具体的な緊急連絡基準は**病院独自の承認済み教材**を優先。
- **避けること：** 生成AIによる緊急度判定、特定の発熱閾値・待機時間の断定、医師に相談せず自己判断することを促す図、常時オンライン相談が可能な印象。
- **作画ブリーフ：** “Quiet adult Japanese home-life patient education scene: a woman in comfortable everyday clothes noticing a health concern, holding her phone and a simple information card, with a gentle visually separated vignette of a healthcare professional available by telephone. Restrained emotionally honest expression, respectful and calm, realistic recognizable objects, fine dark green-navy outlines with tasteful watercolor washes in muted sage, dusty rose, sand and blue-gray. Balanced spacious single illustration, transparent background. No text, letters, numerals, arrows, chat bubbles, red alert symbols, staged emergency scenes, or logo.”
- **安全確認：** 原資料の症状別注意点と相談窓口が一致しているか承認者が確認する。

## MED-004｜こころのケア・相談先：一人で抱えない
- **優先度：P0**／配置：`こころのケア・相談先`／画像ファイル：`med_004_support_conversation.png`
- **学習目標：** 気持ちや生活の悩みを話せる相手には、診療チームやがん相談支援センターなど複数の選択肢があり、相談先を選べると知る。
- **描くもの：** 落ち着いた室内で、一人の成人患者と、話を聴く医療者・相談員の対話を描く。患者は笑顔を強制されず、重すぎない表情。相手の目線の高さが揃い、見守る距離感。具体的な職種の識別は、白衣だけに頼らず後からUIラベルで示す。人間らしい手・顔の描写、現代の日本の生活感。
- **UI側の表示：** `主治医・看護師`、`がん相談支援センター`、`心理・社会的な支援` など、**教材原資料で案内される相談先**を確認しながら選択肢として表示。誰に相談するかは患者の希望を尊重する。
- **避けること：** 説明資料だけで悩みが解決する表現／AIが心理相談を代替する描写／相談すれば必ず安心・解決するという断定／不自然な励ましや笑顔。
- **作画ブリーフ：** “Sensitive sophisticated healthcare editorial illustration: adult Japanese woman sitting at eye level in a quiet supportive conversation with an attentive healthcare worker or counselor, natural gestures and believable adult proportions, compassionate but not performatively cheerful, uncluttered comfortable interior hints, tasteful fine navy-green ink lines with pale sage, warm cream, muted dusty rose and blue-gray watercolor. One cohesive illustration with visual space for UI text nearby, transparent background. No text, cartoon speech bubbles, hearts, clichés, large gradients, boxes, logos, or shadows.”
- **監修観点：** 施設で実際に利用できる相談経路、患者にとって誤認のない紹介文になっているか。

## EDI-001｜患者ホーム：学びを始められる日常の情景
- **優先度：P0**／配置：患者ホーム上部／画像ファイル：`edi_001_home_window.png`
- **役割：** 医学的知識を説明しない。アプリに戻ってくる心理的な抵抗を下げる**控えめな情緒的ビジュアル**。
- **描くもの：** 日本の穏やかな住居の窓辺で、成人女性が椅子に座りマグカップや本を手にしている自然な横顔・後ろ姿。小さな鉢植え、柔らかな外光を感じさせる。過度な笑顔、闘病記号、ピンクリボン、髪の毛の欠如など患者像の決めつけは入れない。
- **UI側：** ホームの主CTA・教材名・学習進捗・通知は画像の外側にHTMLで表示。イラストはヘッダーの一部にコンパクトに配置し、情報を押し下げない。`alt="窓辺で静かに過ごす女性のイラスト"`（装飾なら空altも可）。
- **作画ブリーフ：** “Elegant quiet Japanese lifestyle watercolor editorial illustration, calm adult woman seen in relaxed three-quarter rear view seated by a window with a cup and a small open book, subtle potted greenery and gentle daylight suggested with delicate watercolor washes, fine dark navy-green ink outlines, pale sage green, warm cream, muted rose and blue-gray accents. Mature understated visual language, graceful negative space, isolated on a truly transparent background. A single cohesive subject, no literal white rectangle background, no typography, captions, text, icon sheet, logos, pink ribbons, medical props, artificial smile, gradients, frames or shadows.”
- **注意：** Cの主情報の可読性を最優先し、飾り絵にホームの高さを占有させない。

---

## 医学的・デザイン面の公開前レビュー
1. 原資料と学習目標が一致するか。根拠資料の出典・版数・利用許諾が確認されているか。
2. 画像に誤った解剖、誤った位置関係、誤解を生む治療順序がないか。
3. 図解とUIラベルの結びつきが自然か。画像だけでは理解できない箇所を短文で補えているか。
4. 画像サイズが375/390/430pxで崩れず、文字・図を拡大できるか。
5. 装飾イラストの価値と、医学的図解の説明責任を混同していないか。
6. 未承認の医学的図解は患者に公開されないか。
7. ファイル名・asset_id・使用画面・alt text・バージョンを管理しているか。

## 受け入れ基準
- [ ] 5点それぞれが**独立したPNGファイル**であり、コンタクトシートの切り抜きではない。
- [ ] 全ファイルのピクセルサイズとアルファチャンネルを自動検査済み。
- [ ] 背景が正しく透明で、白い縁・ハロー・長方形の地色がない。
- [ ] C案の穏やかな色調・統一された線の表情が保たれている。
- [ ] 「丸や四角の組み合わせだけ」の抽象的説明図ではない。
- [ ] ラベル・矢印・出典・数値はアプリ側で管理し、小画面でも読める。
- [ ] 医学的図解は公開前に医療者が監修する。未承認の時点では患者へ配信しない。
- [ ] 1点ずつ実画面にはめて視認性を評価し、必要なら差し戻せる。
