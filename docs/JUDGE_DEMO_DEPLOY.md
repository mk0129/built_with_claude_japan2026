# 審査用デモの自動公開

公開URLは https://shiori-judge-demo.vercel.app/ です。Claude Codeで提出版のUIを更新したら、変更を `feat/submission-ux` にコミットしてpushします。

Git連携した Vercel プロジェクト shiori-judge-build の Production ブランチは `feat/submission-ux` です。従来の審査URLの shiori-judge-demo は、この本番の配信結果を同じURLで表示します。

Vercelはそのコミットの `src/concept-d/`、Concept D のレイアウトが読み込むCSS、`public/` の画像を使い、`.judge-demo/` の架空症例と組み合わせて審査画面をビルドします。古いUIを別の作業フォルダにコピーする手順はありません。新しいAPIや症例に依存する機能を作ったときは、同じコミットで審査用データの対応も追加してください。審査用の診察データはタブ内で動作します。

ビルドでは公開ファイルの範囲、JavaScript・CSSのハッシュ、コミット情報を検証します。失敗した場合はビルドログを確認し、修正を同じブランチへpushしてください。成功した版を審査用URLに配信します。

## 公開を確認する

1. `https://shiori-judge-demo.vercel.app/judge-release.json` を開き、`commit` がpushしたコミットの40桁のSHAと一致することを確認します。入口のHTMLにも同じSHAが入ります。
2. 同じURLの「患者として体験」「医療者として体験」を開き、変更した画面を操作します。以前から開いているタブは再読み込みします。

リポジトリのルートから次のコマンドでも、公開URLのコミットと実際のJavaScript・CSSを検証できます。

```sh
node .judge-demo/tools/verify-live.mjs https://shiori-judge-demo.vercel.app "$(git rev-parse HEAD)"
```

## 公開デモで実際に Claude を呼ぶ（任意）

公開デモの教材スタジオは、既定では記録済みの Claude 出力を再生します。実際に Claude で構成案と下書きを作れるようにするには、Vercel プロジェクト shiori-judge-build の Settings → Environment Variables に次を追加して再デプロイします。

| 変数 | 内容 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API の鍵（サーバー関数だけが読む。ブラウザには渡らない） |
| `JUDGE_STUDIO_PASSCODE` | 合言葉。画面でこれを入れた人だけが生成できる |
| `CLAUDE_MODEL`（任意） | 既定 `claude-sonnet-5-5` |
| `JUDGE_STUDIO_DAILY_CAP`（任意） | 1 日の生成回数の上限（既定 30。サーバー関数のインスタンス内の目安） |

実装は `.judge-demo/api/studio.ts`（Vercel の関数。`maxDuration` 300 秒）。プロンプトと出力スキーマは本番と同じ `src/server/services/ai-prompts.ts` を使い、DB と個人情報は扱いません。原資料は TXT / Markdown（20,000 文字まで）か、画面の「サンプル原資料を使う」。PDF / Word の読み取りは本番サーバーだけです。

使い方: 医師側 → 教材スタジオ → 上の帯の「合言葉を入れて実際に Claude で作る」→ 合言葉 → 以後その端末のセッションでは Claude を呼びます（帯の「記録の再生に戻す」で戻せます）。鍵が未設定のときはこのボタン自体が出ません。
