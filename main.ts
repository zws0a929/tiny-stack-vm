import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';
import{join}from'node:path';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
const T={0:[0,0,0],1:[1,0,1],2:[4,0,1],3:[0,1,0],4:[0,1,2],5:[0,2,2],6:[0,2,3],7:[0,3,3],16:[0,2,1],17:[0,2,1],18:[0,2,1],19:[0,2,1],20:[0,2,1],21:[0,2,1],22:[0,2,1],23:[0,1,1],24:[0,2,1],25:[0,2,1],26:[0,2,1],27:[0,1,1],28:[0,2,1],29:[0,2,1],30:[0,2,1],32:[0,2,1],33:[0,2,1],34:[0,2,1],48:[2,0,0],49:[2,1,0],50:[2,1,0],51:[2,0,0],52:[0,0,0],64:[0,1,1],65:[0,2,0],80:[0,1,0],81:[0,1,0],82:[0,0,1],83:[0,1,0]};
for(const d of readdirSync(I).sort()){
const p=readFileSync(join(I,d,'program.bin')),q=readFileSync(join(I,d,'input.bin'));
const D=new Int32Array(256),M=new Int32Array(256),C=new Int32Array(64),o=new Uint8Array(65536);
let sp=0,cs=0,pc=0,st=0,ol=0,ip=0,ex=0;
while(1){
if(st===1e6){ex=10;break}
if(pc<0||pc>=p.length){ex=9;break}
const op=p[pc],t=T[op];
if(!t){ex=5;break}
const m=t[0];
if(pc+m>=p.length){ex=9;break}
st++;const x=pc+1+m;
if(sp<t[1]){ex=2;break}
if(sp-t[1]+t[2]>256){ex=3;break}
pc=x;
if(op===0){ex=0;break}
if(op===1){D[sp++]=(p[x-1]<<24)>>24;continue}
if(op===2){D[sp++]=p[x-4]|p[x-3]<<8|p[x-2]<<16|p[x-1]<<24;continue}
if(op===3){sp--;continue}
if(op===4){D[sp]=D[sp-1];sp++;continue}
if(op===5){const a=D[sp-1];D[sp-1]=D[sp-2];D[sp-2]=a;continue}
if(op===6){D[sp]=D[sp-2];sp++;continue}
if(op===7){const a=D[sp-3];D[sp-3]=D[sp-2];D[sp-2]=D[sp-1];D[sp-1]=a;continue}
if(op===23){D[sp-1]=-D[sp-1]|0;continue}
if(op===27){D[sp-1]=~D[sp-1];continue}
if(op===48){pc=x+((p[x-2]|p[x-1]<<8)<<16>>16);continue}
if(op===49||op===50){const v=D[--sp],r=(p[x-2]|p[x-1]<<8)<<16>>16;if(op===49?v===0:v!==0)pc=x+r;continue}
if(op===51){if(cs===64){ex=7;break}C[cs++]=x;pc=p[x-2]|p[x-1]<<8;continue}
if(op===52){if(cs===0){ex=8;break}pc=C[--cs];continue}
if(op===64){const a=D[sp-1];if(a<0||a>=256){ex=6;break}D[sp-1]=M[a];continue}
if(op===65){const a=D[sp-1],v=D[sp-2];if(a<0||a>=256){ex=6;break}sp-=2;M[a]=v;continue}
if(op===80){const w=String(D[sp-1]);if(ol+w.length>65536){ex=11;break}sp--;for(let i=0;i<w.length;i++)o[ol++]=w.charCodeAt(i);continue}
if(op===81){if(ol+1>65536){ex=11;break}o[ol++]=D[--sp]&255;continue}
if(op===82){D[sp++]=ip<q.length?q[ip++]:-1;continue}
if(op===83){ex=D[--sp]&255;break}
const b=D[sp-1],a=D[sp-2];let r=0;
if(op===16)r=(a+b)|0;else if(op===17)r=(a-b)|0;else if(op===18)r=Math.imul(a,b);
else if(op===19){if(!b){ex=4;break}r=a===-2147483648&&b===-1?a:(a/b)|0}
else if(op===20){if(!b){ex=4;break}r=b===-1?0:a%b|0}
else if(op===21){if(!b){ex=4;break}r=Math.floor((a>>>0)/(b>>>0))|0}
else if(op===22){if(!b){ex=4;break}r=(a>>>0)%(b>>>0)|0}
else if(op===24)r=a&b;else if(op===25)r=a|b;else if(op===26)r=a^b;
else if(op===28)r=a<<(b&31);else if(op===29)r=a>>(b&31);else if(op===30)r=(a>>>(b&31))|0;
else if(op===32)r=a===b?1:0;else if(op===33)r=a<b?1:0;else if(op===34)r=(a>>>0)<(b>>>0)?1:0;
else{ex=5;break}
sp-=2;D[sp++]=r;
}
mkdirSync(join(O,d),{recursive:true});
writeFileSync(join(O,d,'stdout.bin'),o.slice(0,ol));
writeFileSync(join(O,d,'exit.txt'),ex+'\n');
}
