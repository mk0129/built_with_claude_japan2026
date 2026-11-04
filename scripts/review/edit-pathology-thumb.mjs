import sharp from "sharp";
const [src,out]=process.argv.slice(2);
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W=info.width,H=info.height;
// 消去範囲: クリップボード内側（内枠から内側へ約 14px）。医師の右手（ボード右側に重なる）は残す
const poly=[[726,574],[1010,572],[940,1036],[620,1032]];
const inside=(x,y)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
const hand=(x,y)=>x>=895&&y>=815&&y<=918;
let n=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(inside(x,y)&&!hand(x,y)){data[(y*W+x)*4+3]=0;n++;}
const C="#315E68";
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<g transform="translate(775,815) skewX(-12) scale(0.9) translate(-150,-180)" fill="none" stroke="${C}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
  <rect x="104" y="14" width="38" height="62" rx="7" transform="rotate(-18 123 76)"/>
  <rect x="108" y="74" width="46" height="100" rx="9"/>
  <path d="M120 174 h22 v30 h-22 z"/>
  <path d="M154 96 C 250 102 262 250 214 312"/>
  <path d="M154 142 C 202 150 210 240 182 312"/>
  <rect x="58" y="212" width="150" height="20" rx="7"/>
  <path d="M96 204 h66"/>
  <circle cx="206" cy="228" r="19"/>
  <circle cx="206" cy="228" r="5"/>
  <ellipse cx="132" cy="272" rx="24" ry="9"/>
  <rect x="50" y="312" width="200" height="36" rx="15"/>
</g></svg>`;
const erased=await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
const comp=await sharp(erased).composite([{input:Buffer.from(svg)}]).raw().toBuffer();
// 線色を #315E68 の 1 色にそろえる（合成時の端の色ずれを除く。透明度はそのまま）
for(let i=0;i<comp.length;i+=4){comp[i]=49;comp[i+1]=94;comp[i+2]=104;}
await sharp(comp,{raw:{width:W,height:H,channels:4}}).webp({lossless:true}).toFile(out);
console.log("erased px",n);
