// オリジナルのデモ用原資料（架空病院・一般的な患者向け説明・患者情報なし）を .docx として生成する
import JSZip from "jszip";
import { writeFileSync } from "node:fs";

const paras = [
  ["h", "ホルモン療法を続けるために（患者さん向け説明資料・デモ）"],
  ["p", "さくら総合病院（架空） 乳腺外科・薬剤部 作成。この資料はハッカソンのデモ用に作成したオリジナルの説明資料です。実在の病院・患者とは関係ありません。"],
  ["h", "1. ホルモン療法とは"],
  ["p", "ホルモン受容体が陽性の乳がんは、女性ホルモンの影響を受けて増えやすい性質があります。ホルモン療法は、女性ホルモンの働きを抑えたり、作られる量を減らしたりする治療です。"],
  ["p", "ホルモン療法には、毎日飲む薬と、定期的に注射する薬があります。どの薬を使うかは、閉経しているかどうかや、ほかの治療との組み合わせを考えて担当医が決めます。"],
  ["h", "2. 続ける期間"],
  ["p", "手術のあとに行うホルモン療法は、5年以上の長い期間続けることが多い治療です。期間は一人ひとり異なるため、担当医の説明を確認してください。"],
  ["p", "自己判断で薬をやめたり、量を減らしたりしないでください。飲み忘れたときの対応は、薬剤師または担当医に確認してください。"],
  ["h", "3. 起こりやすい体の変化"],
  ["p", "ほてりや発汗、関節のこわばり、気分の落ち込みなどが起こることがあります。症状の出方には個人差があります。"],
  ["p", "つらい症状があるときは、我慢せずに次の診察で伝えてください。症状をやわらげる方法を一緒に考えます。急に強い症状が出たときは、病院から案内された連絡先に連絡してください。"],
  ["h", "4. 続けるための工夫"],
  ["p", "毎日同じ時間に飲む、スマートフォンのアラームを使う、お薬カレンダーを使うなど、自分に合う方法を見つけましょう。"],
  ["p", "通院のたびに、気になっている体の変化や、飲み忘れの有無を伝えてください。治療を続けることが大切です。"],
  ["h", "5. 最後に"],
  ["p", "この資料は一般的な説明です。あなたの治療内容と期間については、担当医の説明が優先されます。わからないことは、次の診察で遠慮なく質問してください。"],
];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const body = paras
  .map(([t, x]) => (t === "h" ? `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(x)}</w:t></w:r></w:p>` : `<w:p><w:r><w:t>${esc(x)}</w:t></w:r></w:p>`))
  .join("");
const zip = new JSZip();
zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
const out = process.argv[2] ?? "tests/fixtures/sources/hormone_therapy_demo.docx";
writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
console.log("wrote", out);
