(function(global){
'use strict';
const DIGITS=[1,2,3,4,5,6,7,8,9];
const ROWS=[...Array(9)].map((_,r)=>[...Array(9)].map((__,c)=>r*9+c));
const COLS=[...Array(9)].map((_,c)=>[...Array(9)].map((__,r)=>r*9+c));
const BOXES=[...Array(9)].map((_,b)=>{const br=Math.floor(b/3)*3,bc=(b%3)*3,a=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)a.push((br+r)*9+bc+c);return a});
const UNITS=[...ROWS,...COLS,...BOXES];
const PEERS=[...Array(81)].map((_,i)=>[...new Set(UNITS.filter(u=>u.includes(i)).flat())].filter(x=>x!==i));
const RANK={'Naked Single':1,'Hidden Single':2,'Locked Candidates · Pointing':3,'Locked Candidates · Claiming':3,'Naked Pair':4,'Hidden Pair':4,'Naked Triple':5,'Hidden Triple':5,'X-Wing':6,'Skyscraper':7,'Two-String Kite':7,'XY-Wing':8,'XYZ-Wing':8,'W-Wing':9,'Simple Coloring':9,'Swordfish':10,'Jellyfish':11,'Unique Rectangle Type 1':11,'Naked Quad':11,'Hidden Quad':11,'Search / 假设搜索':13};
function clone(a){return a.slice()}
function rc(i){return [Math.floor(i/9), i%9]}
function cell(i){const [r,c]=rc(i);return `R${r+1}C${c+1}`}
function peers(i){return PEERS[i]}
function parse(str){str=String(str||'').replace(/[^0-9.]/g,'').replace(/\./g,'0').padEnd(81,'0').slice(0,81);return [...str].map(ch=>+ch||0)}
function serialize(board){return board.map(v=>v||0).join('')}
function validPlacement(board,i,n){return !PEERS[i].some(p=>board[p]===n)}
function conflicts(board){const out=new Set();for(const u of UNITS){for(const n of DIGITS){const xs=u.filter(i=>board[i]===n);if(xs.length>1)xs.forEach(i=>out.add(i));}}return [...out]}
function candidates(board,i){if(board[i])return [];const used=new Set(PEERS[i].map(p=>board[p]).filter(Boolean));return DIGITS.filter(n=>!used.has(n))}
function candidateMap(board){return board.map((v,i)=>v?[]:candidates(board,i))}
function solve(board,limit=2){const b=clone(board);let count=0, first=null;
 function search(){if(count>=limit)return;const empty=[];for(let i=0;i<81;i++)if(!b[i])empty.push(i);if(!empty.length){count++; if(!first) first=clone(b); return;}
 let best=empty[0], cand=candidates(b,best); for(const i of empty){const c=candidates(b,i); if(c.length<cand.length){best=i; cand=c; if(c.length===1) break;}}
 if(!cand.length)return; for(const n of cand){b[best]=n; search(); b[best]=0; if(count>=limit)return;}}
 search();return {count, solution:first};}
function unitName(u){if(ROWS.includes(u))return `第${ROWS.indexOf(u)+1}行`; if(COLS.includes(u))return `第${COLS.indexOf(u)+1}列`; return `第${BOXES.indexOf(u)+1}宫`;}
function st(type,category,reason,extra={}){return {type,category,reason,...extra}}
function combine(arr,k,start=0,prefix=[],out=[]){if(prefix.length===k){out.push(prefix.slice());return out;}for(let i=start;i<=arr.length-(k-prefix.length);i++){prefix.push(arr[i]);combine(arr,k,i+1,prefix,out);prefix.pop();}return out}

function nakedSingle(board,cmap){for(let i=0;i<81;i++)if(!board[i]&&cmap[i].length===1)return st('Naked Single','place',`${cell(i)} 只剩一个候选 ${cmap[i][0]}，可直接填写。`,{i,n:cmap[i][0],focus:[i]});return null}
function hiddenSingle(board,cmap){for(const u of UNITS)for(const n of DIGITS){const xs=u.filter(i=>!board[i]&&cmap[i].includes(n));if(xs.length===1)return st('Hidden Single','place',`${unitName(u)} 中数字 ${n} 只剩 ${cell(xs[0])} 一个位置。`,{i:xs[0],n,focus:xs});}return null}
function lockedCandidates(board,cmap){for(const box of BOXES)for(const n of DIGITS){const xs=box.filter(i=>!board[i]&&cmap[i].includes(n)); if(xs.length<2)continue; const rows=[...new Set(xs.map(i=>rc(i)[0]))], cols=[...new Set(xs.map(i=>rc(i)[1]))];
 if(rows.length===1){const r=rows[0], elim=ROWS[r].filter(i=>!box.includes(i)&&!board[i]&&cmap[i].includes(n)); if(elim.length)return st('Locked Candidates · Pointing','eliminate',`第${BOXES.indexOf(box)+1}宫中的数字 ${n} 候选全部落在第${r+1}行，可从该行宫外删除 ${n}。`,{n,focus:xs,eliminate:elim});}
 if(cols.length===1){const c=cols[0], elim=COLS[c].filter(i=>!box.includes(i)&&!board[i]&&cmap[i].includes(n)); if(elim.length)return st('Locked Candidates · Claiming','eliminate',`第${BOXES.indexOf(box)+1}宫中的数字 ${n} 候选全部落在第${c+1}列，可从该列宫外删除 ${n}。`,{n,focus:xs,eliminate:elim});}}
 return null}
function nakedSet(board,cmap,size){for(const u of UNITS){const cells=u.filter(i=>!board[i]&&cmap[i].length>=2&&cmap[i].length<=size);for(const grp of combine(cells,size)){const union=[...new Set(grp.flatMap(i=>cmap[i]))].sort(); if(union.length!==size)continue; const others=u.filter(i=>!grp.includes(i)&&!board[i]&&cmap[i].some(n=>union.includes(n))); if(others.length)return st(`Naked ${size===2?'Pair':size===3?'Triple':'Quad'}`,'eliminate',`${grp.map(cell).join('、')} 共同锁定候选 ${union.join('/')}，可从同一区域其它格删除这些候选。`,{nums:union,focus:grp,eliminate:others});}}return null}
function hiddenSet(board,cmap,size){for(const u of UNITS){for(const nums of combine(DIGITS,size)){const occur=nums.map(n=>u.filter(i=>!board[i]&&cmap[i].includes(n))); if(occur.some(x=>x.length===0))continue; const cells=[...new Set(occur.flat())]; if(cells.length!==size)continue; const changed=cells.filter(i=>cmap[i].some(n=>!nums.includes(n))); if(changed.length)return st(`Hidden ${size===2?'Pair':size===3?'Triple':'Quad'}`,'restrict',`${unitName(u)} 中 ${nums.join('/')} 只分布在 ${cells.map(cell).join('、')}，这些格可删除其它候选。`,{nums,focus:cells,eliminate:changed});}}return null}
function fish(board,cmap,size,name){for(const n of DIGITS){const axisRows=[...Array(9).keys()];for(const rows of combine(axisRows,size)){const spots=rows.map(r=>ROWS[r].filter(i=>!board[i]&&cmap[i].includes(n)));if(spots.some(x=>x.length<2||x.length>size))continue;const cols=[...new Set(spots.flat().map(i=>rc(i)[1]))];if(cols.length===size){const elim=cols.flatMap(co=>COLS[co].filter(i=>!rows.includes(rc(i)[0])&&!board[i]&&cmap[i].includes(n)));if(elim.length)return st(name,'eliminate',`数字 ${n} 在 ${size} 行与 ${size} 列形成 ${name}，可从这些列的其它行删除 ${n}。`,{n,focus:spots.flat(),eliminate:elim});}}
 const axisCols=[...Array(9).keys()];for(const cols of combine(axisCols,size)){const spots=cols.map(co=>COLS[co].filter(i=>!board[i]&&cmap[i].includes(n)));if(spots.some(x=>x.length<2||x.length>size))continue;const rows=[...new Set(spots.flat().map(i=>rc(i)[0]))];if(rows.length===size){const elim=rows.flatMap(r=>ROWS[r].filter(i=>!cols.includes(rc(i)[1])&&!board[i]&&cmap[i].includes(n)));if(elim.length)return st(name,'eliminate',`数字 ${n} 在 ${size} 列与 ${size} 行形成 ${name}，可从这些行的其它列删除 ${n}。`,{n,focus:spots.flat(),eliminate:elim});}}}
 return null}
function xWing(board,cmap){return fish(board,cmap,2,'X-Wing')}
function swordfish(board,cmap){return fish(board,cmap,3,'Swordfish')}
function jellyfish(board,cmap){return fish(board,cmap,4,'Jellyfish')}
function xyWing(board,cmap){const biv=[...Array(81).keys()].filter(i=>!board[i]&&cmap[i].length===2);for(const p of biv){const [x,y]=cmap[p]; const wings=biv.filter(w=>PEERS[p].includes(w)); for(const a of wings){const shareA=cmap[a].filter(n=>n===x||n===y); if(shareA.length!==1)continue; const zA=cmap[a].find(n=>n!==shareA[0]); for(const d of wings){if(d===a)continue; const shareD=cmap[d].filter(n=>n===x||n===y); if(shareD.length!==1||shareD[0]===shareA[0])continue; const zD=cmap[d].find(n=>n!==shareD[0]); if(zA!==zD)continue; const z=zA; const elim=PEERS[a].filter(i=>PEERS[d].includes(i)&&!board[i]&&cmap[i].includes(z)&&i!==p); if(elim.length)return st('XY-Wing','eliminate',`${cell(p)} 为枢轴，${cell(a)} 与 ${cell(d)} 为两翼，可从共同可见格删除 ${z}。`,{n:z,focus:[p,a,d],eliminate:elim});}}}
 return null}
function xyzWing(board,cmap){const pivots=[...Array(81).keys()].filter(i=>!board[i]&&cmap[i].length===3);const biv=[...Array(81).keys()].filter(i=>!board[i]&&cmap[i].length===2);
 for(const p of pivots){const pset=cmap[p];const wings=biv.filter(w=>PEERS[p].includes(w)&&cmap[w].every(n=>pset.includes(n))); for(const a of wings)for(const d of wings){if(a>=d)continue; const union=[...new Set([...cmap[a],...cmap[d]])].sort(); if(union.length!==3)continue; if(!pset.every(n=>union.includes(n)))continue; const common=cmap[a].filter(n=>cmap[d].includes(n)); if(common.length!==1)continue; const z=common[0]; const elim=PEERS[a].filter(i=>PEERS[d].includes(i)&&PEERS[p].includes(i)&&!board[i]&&cmap[i].includes(z)); if(elim.length)return st('XYZ-Wing','eliminate',`${cell(p)} 为 XYZ 枢轴，${cell(a)} 与 ${cell(d)} 为两翼，可从共同可见格删除 ${z}。`,{n:z,focus:[p,a,d],eliminate:elim});}}
 return null}
function skyscraper(board,cmap){for(const n of DIGITS){for(let r1=0;r1<8;r1++){const a=ROWS[r1].filter(i=>!board[i]&&cmap[i].includes(n)); if(a.length!==2)continue; for(let r2=r1+1;r2<9;r2++){const d=ROWS[r2].filter(i=>!board[i]&&cmap[i].includes(n)); if(d.length!==2)continue; for(const x of a)for(const y of d){ if(rc(x)[1]!==rc(y)[1])continue; const ax=a.find(i=>i!==x), dy=d.find(i=>i!==y); if(rc(ax)[1]===rc(dy)[1])continue; const elim=PEERS[ax].filter(i=>PEERS[dy].includes(i)&&!board[i]&&cmap[i].includes(n)); if(elim.length)return st('Skyscraper','eliminate',`数字 ${n} 构成 Skyscraper：两条强链共享一列，可从两个屋顶共同可见格删除 ${n}。`,{n,focus:[x,ax,y,dy],eliminate:elim}); }}}}
 return null}

function twoStringKite(board,cmap){
 for(const n of DIGITS){
  for(let r=0;r<9;r++){
   const rp=ROWS[r].filter(i=>!board[i]&&cmap[i].includes(n)); if(rp.length!==2) continue;
   for(let c=0;c<9;c++){
    const cp=COLS[c].filter(i=>!board[i]&&cmap[i].includes(n)); if(cp.length!==2) continue;
    for(const a of rp) for(const b of cp){
     const [ar,ac]=rc(a),[br,bc]=rc(b); const boxA=Math.floor(ar/3)*3+Math.floor(ac/3), boxB=Math.floor(br/3)*3+Math.floor(bc/3);
     if(boxA!==boxB) continue;
     const a2=rp.find(i=>i!==a), b2=cp.find(i=>i!==b); const [r2]=rc(a2),[,c2]=rc(b2), target=r2*9+c2;
     if(target!==a2&&target!==b2&&!board[target]&&cmap[target].includes(n)) return st('Two-String Kite','eliminate',`数字 ${n} 在第${r+1}行与第${c+1}列各形成强链，且一端同宫，可从 ${cell(target)} 删除 ${n}。`,{n,focus:[a,a2,b,b2],eliminate:[target]});
    }
   }
  }
 }
 return null;
}
function wWing(board,cmap){
 const biv=[...Array(81).keys()].filter(i=>!board[i]&&cmap[i].length===2);
 for(let ai=0;ai<biv.length;ai++) for(let bi=ai+1;bi<biv.length;bi++){
  const a=biv[ai], b=biv[bi]; if(cmap[a][0]!==cmap[b][0]||cmap[a][1]!==cmap[b][1]) continue;
  const pair=cmap[a];
  for(const linkNum of pair){
   const elimNum=pair.find(x=>x!==linkNum);
   for(const u of UNITS){ const link=u.filter(i=>!board[i]&&cmap[i].includes(linkNum)); if(link.length!==2) continue;
    const [x,y]=link; const direct=(PEERS[a].includes(x)&&PEERS[b].includes(y))||(PEERS[a].includes(y)&&PEERS[b].includes(x)); if(!direct) continue;
    const elim=PEERS[a].filter(i=>PEERS[b].includes(i)&&!board[i]&&cmap[i].includes(elimNum)&&i!==x&&i!==y);
    if(elim.length) return st('W-Wing','eliminate',`${cell(a)} 与 ${cell(b)} 具有相同双候选 ${pair.join('/')}，数字 ${linkNum} 通过强链连接，可从两端共同可见格删除 ${elimNum}。`,{n:elimNum,focus:[a,b,x,y],eliminate:elim});
   }
  }
 }
 return null;
}
function simpleColoring(board,cmap){
 for(const n of DIGITS){
  const adj=new Map(); const add=(a,b)=>{if(!adj.has(a))adj.set(a,new Set());if(!adj.has(b))adj.set(b,new Set());adj.get(a).add(b);adj.get(b).add(a)};
  for(const u of UNITS){const xs=u.filter(i=>!board[i]&&cmap[i].includes(n));if(xs.length===2)add(xs[0],xs[1]);}
  const seen=new Set();
  for(const start of adj.keys()) if(!seen.has(start)){
   const color=new Map([[start,0]]), q=[start]; seen.add(start);
   while(q.length){const a=q.shift();for(const b of adj.get(a)||[]){if(!color.has(b)){color.set(b,1-color.get(a));seen.add(b);q.push(b);}}}
   const nodes=[...color.keys()]; if(nodes.length<4) continue;
   for(const col of [0,1]){const same=nodes.filter(i=>color.get(i)===col); let clash=false;for(let i=0;i<same.length&&!clash;i++)for(let j=i+1;j<same.length;j++)if(PEERS[same[i]].includes(same[j])){clash=true;break;}
    if(clash) return st('Simple Coloring','eliminate',`数字 ${n} 的共轭链着色后，同一颜色出现冲突，因此该颜色对应的候选可全部删除。`,{n,focus:nodes,eliminate:same});
   }
   const outside=[...Array(81).keys()].filter(i=>!board[i]&&cmap[i].includes(n)&&!color.has(i));
   for(const t of outside){let s0=false,s1=false;for(const p of PEERS[t])if(color.has(p)){if(color.get(p)===0)s0=true;else s1=true;}if(s0&&s1)return st('Simple Coloring','eliminate',`${cell(t)} 同时看见数字 ${n} 着色链的两种颜色，因此无论哪种颜色成立，该候选都可删除。`,{n,focus:nodes,eliminate:[t]});}
  }
 }
 return null;
}
function uniqueRectangle(board,cmap){
 for(let r1=0;r1<8;r1++)for(let r2=r1+1;r2<9;r2++)for(let c1=0;c1<8;c1++)for(let c2=c1+1;c2<9;c2++){
  const cells=[r1*9+c1,r1*9+c2,r2*9+c1,r2*9+c2]; if(cells.some(i=>board[i])) continue;
  const boxes=new Set(cells.map(i=>{const [r,c]=rc(i);return Math.floor(r/3)*3+Math.floor(c/3)})); if(boxes.size!==2) continue;
  for(const nums of combine(DIGITS,2)){
   const exact=cells.filter(i=>cmap[i].length===2&&nums.every(n=>cmap[i].includes(n))); if(exact.length!==3) continue;
   const odd=cells.find(i=>!exact.includes(i)); if(!odd||!nums.every(n=>cmap[odd].includes(n))||cmap[odd].length<=2) continue;
   return st('Unique Rectangle Type 1','restrict',`${cells.map(cell).join('、')} 构成唯一矩形 Type 1。为避免形成双解矩形，${cell(odd)} 必须删除候选 ${nums.join('/')}。`,{nums,focus:cells,eliminate:[odd]});
  }
 }
 return null;
}

function stepSafe(board,s){if(!s)return false;const res=solve(board,2);if(res.count!==1||!res.solution)return true;const sol=res.solution;if(s.category==='place')return sol[s.i]===s.n;if(s.category==='eliminate'){if(s.n)return (s.eliminate||[]).every(i=>sol[i]!==s.n);if(s.nums)return (s.eliminate||[]).every(i=>!s.nums.includes(sol[i]));}if(s.category==='restrict'&&s.nums)return (s.focus||[]).every(i=>s.nums.includes(sol[i]));return true}
function techniqueStep(board, notesOverride){const cmap=notesOverride||candidateMap(board);const finders=[()=>nakedSingle(board,cmap),()=>hiddenSingle(board,cmap),()=>lockedCandidates(board,cmap),()=>nakedSet(board,cmap,2),()=>hiddenSet(board,cmap,2),()=>nakedSet(board,cmap,3),()=>hiddenSet(board,cmap,3),()=>xWing(board,cmap),()=>skyscraper(board,cmap),()=>twoStringKite(board,cmap),()=>xyWing(board,cmap),()=>xyzWing(board,cmap),()=>wWing(board,cmap),()=>simpleColoring(board,cmap),()=>swordfish(board,cmap),()=>jellyfish(board,cmap),()=>uniqueRectangle(board,cmap),()=>nakedSet(board,cmap,4),()=>hiddenSet(board,cmap,4)];for(const f of finders){const s=f();if(s&&stepSafe(board,s))return s;}return null}
function applyElimination(notes,s){if(!s)return notes; if(s.category==='eliminate'){for(const i of s.eliminate){if(s.n)notes[i]=notes[i].filter(x=>x!==s.n); else if(s.nums)notes[i]=notes[i].filter(x=>!s.nums.includes(x));}} else if(s.category==='restrict'){for(const i of s.focus)notes[i]=notes[i].filter(x=>s.nums.includes(x));} return notes}
function explainSolve(board,max=600){const b=clone(board), steps=[]; let notes=candidateMap(b), hardest=''; let guard=0; while(b.includes(0)&&guard++<max){let x=techniqueStep(b,notes); if(x){steps.push(x); if((RANK[x.type]||0)>(RANK[hardest]||0)) hardest=x.type; if(x.category==='place'){b[x.i]=x.n; notes=candidateMap(b)} else {const before=JSON.stringify(notes); applyElimination(notes,x); if(before===JSON.stringify(notes)) x=null;}
 if(x) continue;} const res=solve(b,1); if(!res.solution) return {solved:false, board:b, steps, hardest}; const i=b.findIndex(v=>!v), n=res.solution[i]; const q=st('Search / 假设搜索','place','现有逻辑技巧无法继续，使用假设搜索确定下一步。',{i,n,focus:[i]}); steps.push(q); b[i]=n; notes=candidateMap(b); hardest=q.type;}
 return {solved:!b.includes(0), board:b, steps, hardest};}
function rate(board){const h=explainSolve(board).hardest;return !h?'beginner':RANK[h]<=2?'easy':RANK[h]<=4?'medium':RANK[h]<=6?'hard':RANK[h]<=10?'expert':'master'}
function generator(clues=36,seed=Math.random){const sh=a=>{for(let i=a.length-1;i;i--){const j=Math.floor(seed()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};const b=Array(81).fill(0);function fill(i=0){if(i===81)return true;for(const n of sh(DIGITS.slice()))if(validPlacement(b,i,n)){b[i]=n;if(fill(i+1))return true;b[i]=0}return false}fill(); const sol=b.slice(), puzzle=sol.slice(); for(const i of sh([...Array(81).keys()])){if(puzzle.filter(Boolean).length<=clues)break; const old=puzzle[i]; puzzle[i]=0; if(solve(puzzle,2).count!==1)puzzle[i]=old;} return {puzzle, solution:sol};}

global.SudokuEngine={DIGITS,ROWS,COLS,BOXES,UNITS,RANK,clone,rc,cell,peers,candidates,validPlacement,conflicts,parse,serialize,solve,cmap:candidateMap,techniqueStep,applyElimination,explainSolve,rate,generator};
})(window);
