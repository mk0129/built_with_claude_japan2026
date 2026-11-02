# 医学的図解の差し替え可能なコンポーネント設計（Phase A、未実装の設計案）

目的: ChatGPT で 1 点ずつ制作・監修した画像を、ラベルや注釈を画像に埋め込まずに UI へ組み込み、`review_status = approved` の図だけを患者に表示する。既存の認証・採点・処方ロジックには触れない。

## 1. 3 層構造

```
<figure class="MedicalFigure">
  ├─ ImageLayer     : public/assets/medical/<file>.png（透過 PNG、文字・矢印なし）。approved 以外は患者に出さない
  ├─ LabelLayer     : HTML/SVG。アンカー（画像に対する % 座標）＋ 引き出し線 ＋ ラベル。文字拡大・VoiceOver 対応
  └─ Description    : figcaption（短い補足）＋ 長い説明（details）＋ 出典 ＋ 監修バッジ
</figure>
```

- **ImageLayer** が無い／未承認のとき: `FigurePlaceholder`（「図解を準備しています」＋ alt 相当の説明文）を表示し、LabelLayer のラベルは「この図で確認すること」のチップ一覧として独立して表示する。学習は監修済みテキストだけで完結する。
- **管理者プレビュー**: 未承認画像を表示し、「模式図・監修待ち（asset_id vN）」バッジと「差し戻す／監修済みにする」操作を付ける。
- ラベルは `labels[]`（text, anchor: {x%, y%}, offset: {x%, y%}）で持つ。画像の縦横比と座標を一緒に保存し、幅 375〜430px で同じ位置に出す。

## 2. Props（React）

```ts
type MedicalFigureProps = {
  asset: {
    assetId: string;                 // MED-001
    version: number;                 // 1
    src: string | null;              // approved のときのみ URL
    width: number; height: number;   // 原画の px（縦横比）
    altText: string;                 // 短い alt
    longDescription?: string;        // 画像の内容を文章で（VoiceOver / 画像なし時）
    reviewStatus: "draft" | "pending_review" | "approved" | "rejected";
    copyrightStatus: "internal_ai_generated" | "licensed" | "unknown";
  };
  labels: { id: string; text: string; anchor: { x: number; y: number }; offset?: { x: number; y: number } }[];
  caption: string;                   // 監修済み短文（学習目標に対応）
  sourceNote?: string;               // 出典
  mode: "patient" | "admin_preview";
};
```

表示規則:

| 状態 | patient | admin_preview |
|---|---|---|
| approved | 画像＋ラベル＋caption | 同左＋「監修済み（日付・監修者）」 |
| pending_review / draft | **Placeholder＋ラベル一覧＋caption**（画像なし） | 画像＋ラベル＋「監修待ち」＋差し戻し/承認 |
| rejected | Placeholder | 画像＋「差し戻し済み」 |
| src が無い | Placeholder | Placeholder |

## 3. データモデル（列追加と新規テーブル。承認後にマイグレーション）

| テーブル | 変更 | 内容 |
|---|---|---|
| `figure_assets`（新規） | 追加 | `asset_id`(PK 例 MED-001), `version`, `filename`, `type`(medical/editorial), `width`, `height`, `alt_text`, `long_description`, `learning_objective`, `source_refs`(json), `review_status`, `reviewer_user_id`, `reviewed_at`, `copyright_status`, `generator_note`（制作元・日付）, `created_at` |
| `figure_placements`（新規） | 追加 | `id`, `asset_id`, `material_version_id`, `slide_seq`, `labels`(json), `caption`, `source_note`, `display_order` |
| `material_slides` | 列追加 | `proposition`（命題 1 文、null 可）, `detail_md`（くわしく、null 可） |

- 既存の `material_slides.image_ref` は当面そのまま（現行の仮イラスト名）。切替後は `figure_placements` を優先し、`image_ref` は未使用に。
- 承認は教材の承認者（病院独自は自組織、共通は運営の別人）と同じ権限モデルを使う（D22）。
- 医学的内容の改訂で画像が変わる場合は `version` を上げ、旧版の `review_status` を引き継がない（D19 と整合）。

## 4. 配信ゲート（サーバー側）

- 患者向け API（`/api/v1/learn/[versionId]`）は `figure_placements` を結合し、`review_status = 'approved'` の資産だけ `src` を返す。それ以外は `src: null` と `altText` / `labels` / `caption` を返す（フロントの非表示だけに頼らない）。
- 管理者プレビュー API は別経路で `review_status` に関わらず返す（編集者・承認者の権限が必要）。
- 画像ファイルは `public/assets/medical/` に置くが、**配置するのは利用許諾と公開可否が確定したファイルだけ**。未許諾・監修前の原画は非公開ストレージ（Day 4 の原資料管理）に置く。

## 5. アクセシビリティ

- `figure` に `aria-labelledby`、画像に `alt`、長い説明は `details` に。
- ラベルは実テキスト（画像化しない）。文字拡大時はラベルが折り返し可能なように `max-width` と改行を許可し、アンカーからの引き出し線は SVG で追従。
- 色だけに依存しない: アンカーは線＋番号付き（① ② ③）も選択可。

## 6. 受け入れ基準（コンポーネント）

- [ ] 375 / 390 / 430px でラベルが画像外へはみ出さない（E2E でアンカー座標の bounding box を検査）。
- [ ] `review_status != approved` の画像 URL が患者 API のレスポンスに含まれない（統合テスト）。
- [ ] 画像なしでも figcaption とラベル一覧で学習目標が読める（スクリーンリーダーで確認）。
- [ ] 文字拡大（21px）と 200% ズームでレイアウトが崩れない。
