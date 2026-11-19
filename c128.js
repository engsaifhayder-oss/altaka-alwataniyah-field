/* قارئ باركود Code 128 بلغة JavaScript (للآيفون والويندوز – بدون مكتبات) */
const C128D=(()=>{
const P='212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 233111'.split(' ').map(s=>[...s].map(Number));
// أقرب رمز لستة أطوال متتالية (خط/فراغ) بعد تطبيعها إلى 11 وحدة
function best(r,i){if(i+6>r.length)return [-1,99];let t=0;for(let k=0;k<6;k++)t+=r[i+k];if(!t)return [-1,99];const u=t/11;let bi=-1,be=99;
  const n=[0,0,0,0,0,0];for(let k=0;k<6;k++)n[k]=r[i+k]/u;
  for(let c=0;c<107;c++){const p=P[c];let e=0;for(let k=0;k<6;k++)e+=Math.abs(n[k]-p[k])*0.4;for(let k=0;k<5;k++)e+=Math.abs(n[k]+n[k+1]-p[k]-p[k+1])*0.6;if(e<be){be=e;bi=c}}return [bi,be]}
function text(vals){let set=vals[0]===103?'A':vals[0]===104?'B':'C',out='';
  for(let k=1;k<vals.length;k++){const v=vals[k];
    if(set==='C'){if(v<100)out+=String(v).padStart(2,'0');else if(v===100)set='B';else if(v===101)set='A'}
    else if(set==='B'){if(v<96)out+=String.fromCharCode(v+32);else if(v===99)set='C';else if(v===101)set='A'}
    else{if(v<64)out+=String.fromCharCode(v+32);else if(v<96)out+=String.fromCharCode(v-64);else if(v===99)set='C';else if(v===100)set='B'}}
  return out}
// r = [فراغ, خط, فراغ, خط, ...]
function decodeRuns(r){
  for(let s=1;s+6<r.length;s+=2){const [c,e]=best(r,s);if(c<103||c>105||e>1.5)continue;
    let t=0;for(let k=0;k<6;k++)t+=r[s+k];if(r[s-1]<t/11*4)continue; // منطقة هادئة
    const vals=[c];let i=s+6,ok=false;
    while(i+6<=r.length){const [v,err]=best(r,i);if(v<0||err>1.7)break;if(v===106){ok=true;break}vals.push(v);i+=6}
    if(!ok||vals.length<3)continue;
    const chk=vals.pop();let sum=vals[0];for(let k=1;k<vals.length;k++)sum+=vals[k]*k;if(sum%103!==chk)continue;
    return text(vals)}
  return null}
function scanLine(g,w){let mn=255,mx=0;for(let x=0;x<w;x++){if(g[x]<mn)mn=g[x];if(g[x]>mx)mx=g[x]}if(mx-mn<35)return null;
  const win=Math.max(9,Math.round(w/20))|1,h=win>>1,pre=new Float64Array(w+1);for(let x=0;x<w;x++)pre[x+1]=pre[x]+g[x];
  const mid=(mn+mx)/2,f=new Float32Array(w);
  for(let x=0;x<w;x++){const a=Math.max(0,x-h),b=Math.min(w,x+h+1),m=(pre[b]-pre[a])/(b-a);f[x]=g[x]-(m*0.6+mid*0.4)} // سالب = خط
  // حدود الخطوط بدقة أقل من البكسل
  const r=[];let last=0,dark=f[0]<0;if(dark)r.push(0);
  for(let x=0;x<w-1;x++){const d1=f[x]<0,d2=f[x+1]<0;if(d1!==d2){const pos=x+f[x]/(f[x]-f[x+1]);r.push(pos-last);last=pos}}
  r.push(w-last);if(r.length%2===0)r.push(0);
  return decodeRuns(r)||decodeRuns(r.slice().reverse())}
const cv=document.createElement('canvas');const cx=cv.getContext('2d',{willReadFrequently:true});
/** يقرأ الباركود من فيديو/صورة/لوحة. يرجع النص أو null */
function decode(src){const sw=src.videoWidth||src.naturalWidth||src.width,sh=src.videoHeight||src.naturalHeight||src.height;if(!sw||!sh)return null;
  const W=Math.min(1280,sw),H=Math.max(1,Math.round(sh*W/sw));cv.width=W;cv.height=H;cx.drawImage(src,0,0,W,H);
  const g=new Float32Array(W),seen={};
  for(let k=0;k<=30;k++){const y=Math.round(H*(0.5+(k%2?1:-1)*Math.ceil(k/2)*0.012));if(y<0||y>=H)continue;
    const y0=Math.max(0,y-2),n=Math.min(5,H-y0);const d=cx.getImageData(0,y0,W,n).data;g.fill(0);for(let j=0;j<n;j++){const o=j*W*4;for(let x=0;x<W;x++)g[x]+=(d[o+x*4]*.299+d[o+x*4+1]*.587+d[o+x*4+2]*.114)/n}
    const t=scanLine(g,W);if(t){seen[t]=(seen[t]||0)+1;if(seen[t]>=2)return t}}
  return null}
return {decode,decodeRuns,scanLine};
})();
