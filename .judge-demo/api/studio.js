// Vercel の関数の入口。実体は tools/build-api.mjs が api/_bundle/studio.cjs に一つのファイルとして束ねる
// （依存を同梱するので、Root Directory の外にある src/ や node_modules の配置に左右されない）。
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Vercel の Node 関数は CommonJS の入口にする
module.exports = require("./_bundle/studio.cjs").default;
