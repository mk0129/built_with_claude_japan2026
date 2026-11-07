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
