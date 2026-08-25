'use strict';
const E = window.SudokuEngine;
const LESSONS = window.SUDOKU_LESSONS || [];
const resolveRoot = (root=document) => {
  if (!root) return document;
  if (typeof root === 'string') return document.querySelector(root) || document;
  if (typeof root.querySelector === 'function' && typeof root.querySelectorAll === 'function') return root;
  return document;
};
const $ = (s, root=document) => resolveRoot(root).querySelector(s);
const $$ = (s, root=document) => [...resolveRoot(root).querySelectorAll(s)];
const LEVEL_NAMES = {beginner:'入门',easy:'简单',medium:'中等',hard:'困难',expert:'专家',master:'大师'};
const PERM_NAMES = {play:'正常做题',learn:'互动教学',custom:'自定义数独',generator:'题目生成器',analysis:'自定义题详细分析',candidate_mode:'手工候选模式',auto_notes:'自动候选',undo_redo:'撤销 / 重做',hints:'三层提示',hint_history:'提示历史回看',cell_analysis:'游戏当前分析',replay:'全过程回放',leaderboard:'排行榜'};
const VIEW_META = {
  home:['欢迎首页','数独小游戏 · 在线学习与挑战平台'],
  dashboard:['学习仪表盘','成绩、教学进度和训练表现一站查看'],
  game:['数独小游戏','自动保存、三层提示、过程回放'],
  learn:['互动教学','动画演示 + 专项练习'],
  custom:['自定义分析','九宫格输入、文本输入、导入分析'],
  leaderboard:['排行榜','按积分综合排序'],
  admin:['管理后台','用户权限 + 题库管理']
};
let me = null;
let game = null;
let selected = -1;
let noteMode = false;
let timerId = null;
let replayTimer = null;
let replayIndex = -1;
let lessonIndex = 0;
let lessonFrame = 0;
let lessonTimer = null;
let lessonDone = new Set();
let editingUser = null;
let customSelected = -1;
let customBoard = Array(81).fill(0);

function toast(text){ const el=$('#toast'); el.textContent=text; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2200); }
async function api(url,opt={}){
  opt.credentials='same-origin';
  if(opt.body && typeof opt.body !== 'string'){
    opt.headers={...(opt.headers||{}),'Content-Type':'application/json'};
    opt.body=JSON.stringify(opt.body);
  }
  const r=await fetch(url,opt);
  let d={};
  try{ d=await r.json(); }catch{}
  if(r.status===401){ location.replace('/'); throw new Error('登录已失效'); }
  if(r.status===428){ location.replace('/change-password.html'); throw new Error('需要修改密码'); }
  if(!r.ok) throw new Error(d.error || `请求失败 ${r.status}`);
  return d;
}
function clientAudit(category,action,module='frontend',detail={},status='ok'){
  try{ fetch('/api/log',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({category,action,module,detail,status})}).catch(()=>{}); }catch{}
}
window.addEventListener('error',e=>clientAudit('error','javascript_error','frontend',{message:e.message,source:e.filename,line:e.lineno,column:e.colno},'error'));
window.addEventListener('unhandledrejection',e=>clientAudit('error','unhandled_rejection','frontend',{message:String(e.reason?.message||e.reason||'unknown')},'error'));
function has(perm){ return me?.role==='admin' || !!me?.permissions?.[perm]; }
function fmt(sec){ sec=Math.max(0,sec|0); return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }
function startTimer(){
  clearInterval(timerId);
  timerId=setInterval(()=>{
    if(!game) return;
    game.seconds=(Number(game.seconds)||0)+1;
    renderStatus();
    if(game.seconds % 5 === 0) saveProgress(false);
  },1000);
}
function stopTimer(){
  if(timerId){ clearInterval(timerId); timerId=null; }
}
function esc(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function puzzleKey(p){ return `${p.source||'builtin'}:${p.id||E.serialize(E.parse(p.puzzle))}`; }
function blankNotes(){ return Array.from({length:81},()=>[]); }
function snapshot(){ return game?{board:game.board.slice(),notes:game.notes.map(x=>x.slice()),mistakes:game.mistakes,hintsUsed:game.hintsUsed,seconds:game.seconds,noteMode,selected}:null; }
function pushUndo(){
  if(!game) return;
  game.undo = Array.isArray(game.undo) ? game.undo : [];
  game.redo = Array.isArray(game.redo) ? game.redo : [];
  const snap=snapshot();
  if(snap) game.undo.push(snap);
  if(game.undo.length>200) game.undo.shift();
  game.redo.length=0;
}
function log(type,detail={}){ if(!game)return; game.log.push({at:game.seconds,type,detail,snapshot:snapshot()}); if(game.log.length>900)game.log.shift(); clientAudit('operation',type,'game',{game_key:game.key,puzzle_id:game.puzzle?.id,...detail}); }

function setViewTitle(view){ const m=VIEW_META[view]||['','']; $('#viewTitle').textContent=m[0]; $('#viewSub').textContent=m[1]; }
function applyPermissions(){
  if(!has('candidate_mode') && noteMode) noteMode=false;
  $$('[data-perm]').forEach(el=>{ el.hidden=!has(el.dataset.perm); });
  $('#adminNav').hidden = me?.role !== 'admin';
  const controls={
    noteBtn:'candidate_mode', autoNotesBtn:'auto_notes', undoBtn:'undo_redo', redoBtn:'undo_redo',
    hintBtn:'hints', analyzeCellBtn:'cell_analysis', replayBtn:'replay'
  };
  Object.entries(controls).forEach(([id,p])=>{ const el=$('#'+id); if(el) el.hidden=!has(p); });
  const hintPanel=$('#hintPanel'); if(hintPanel) hintPanel.hidden=!(has('hints')||has('hint_history'));
  const replayPanel=$('#replayPanel'); if(replayPanel) replayPanel.hidden=!has('replay');
  const analysisPanel=$('#currentAnalysisPanel'); if(analysisPanel) analysisPanel.hidden=!has('cell_analysis');
}
function showView(name){
  const permMap={game:'play',learn:'learn',custom:'custom',leaderboard:'leaderboard'};
  const needPerm=permMap[name];
  if(needPerm && !has(needPerm)) return toast('当前账号没有此模块权限');
  if(name==='admin' && me?.role!=='admin') return toast('需要管理员权限');
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
  $$('.nav button,[data-view].mobile-nav').forEach(()=>{});
  $$('[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===name));
  setViewTitle(name);
  if(name==='dashboard') loadDashboard();
  if(name==='leaderboard') loadLeaderboard();
  if(name==='admin' && me?.role==='admin'){ loadUsers(); loadAdminPuzzles(); loadAuditLogs(); }
  if(name==='learn') renderLessonList();
}

function metricCard(label,value,sub=''){ return `<div class="metric"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-sub">${esc(sub)}</div></div>`; }
async function loadDashboard(){
  const d=await api('/api/stats/overview'); const o=d.overview||{};
  $('#dashMetrics').innerHTML = [
    metricCard('已完成题目', o.total_completed||0, '累计完成'),
    metricCard('最佳积分', o.best_score||0, '个人最高分'),
    metricCard('平均耗时', fmt(Math.round(o.avg_seconds||0)), '平均完成时长'),
    metricCard('完成课程', o.lessons_done||0, `共 ${LESSONS.length} 节`),
  ].join('');
  $('#homeMetrics').innerHTML = [
    metricCard('继续挑战', o.unfinished_games||0, '未完成题目'),
    metricCard('已完成题目', o.total_completed||0, '自动保存进度'),
    metricCard('最佳积分', o.best_score||0, '排行榜计分'),
    metricCard('课程进度', `${o.lessons_done||0}/${LESSONS.length}`, '教学专项训练')
  ].join('');
  $('#profileStats').innerHTML=`已完成 <b>${o.total_completed||0}</b> 题，完成教学 <b>${o.lessons_done||0}</b> 节，平均耗时 <b>${fmt(Math.round(o.avg_seconds||0))}</b>。`;
  const levels = Object.fromEntries((o.levels||[]).map(x=>[x.level,x]));
  const max = Math.max(1,...Object.values(levels).map(x=>x.n||0),1);
  $('#levelChart').innerHTML = Object.keys(LEVEL_NAMES).map(k=>{const item=levels[k]||{}; const w=((item.n||0)/max)*100; return `<div class="bar-item"><div>${LEVEL_NAMES[k]}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><div class="tiny">${item.n||0} 题</div></div>`}).join('');
  $('#recentResults').innerHTML = (o.recent||[]).length ? o.recent.map(r=>`<div class="result-item"><b>${esc(LEVEL_NAMES[r.level]||r.level)}</b> · ${esc(r.puzzle_id)}<div class="tiny">${fmt(r.seconds)} · 错误 ${r.mistakes} · 提示 ${r.hints}</div><div class="result-score">积分 ${r.score} · ${esc((r.completed_at||'').replace('T',' ').slice(0,16))}</div></div>`).join('') : '<div class="muted">还没有完成记录。</div>';
  if(o.admin){ $('#adminStatsWrap').hidden=false; $('#adminStats').innerHTML=[metricCard('总用户',o.admin.users||0,'全部账号'),metricCard('启用用户',o.admin.active_users||0,'当前可用'),metricCard('完成记录',o.admin.results||0,'累计成绩'),metricCard('全部题目',o.admin.puzzles_total||0,'内置+后台'),metricCard('后台题库',o.admin.puzzles_admin||0,'管理员新增')].join(''); }
  else $('#adminStatsWrap').hidden=true;
}

function renderGrid(container, board, notes, opts={}){
  container.innerHTML='';
  for(let i=0;i<81;i++){
    const cell=document.createElement('button');
    cell.type='button'; cell.className='cell'; cell.dataset.i=i;
    if(opts.given?.[i]) cell.classList.add('given');
    if(i===opts.selected) cell.classList.add('selected');
    if(opts.focus?.includes(i)) cell.classList.add('focus');
    if(opts.eliminate?.includes(i)) cell.classList.add('eliminate');
    if(opts.place===i) cell.classList.add('place-target');
    if(opts.related && opts.selected>=0){
      const [sr,sc]=E.rc(opts.selected), [r,c]=E.rc(i);
      if(i!==opts.selected && (r===sr||c===sc||(Math.floor(r/3)===Math.floor(sr/3)&&Math.floor(c/3)===Math.floor(sc/3)))) cell.classList.add('related');
      if(board[opts.selected] && board[i]===board[opts.selected]) cell.classList.add('same');
    }
    if(opts.bad?.includes(i)) cell.classList.add('bad');
    if(board[i]) cell.textContent=board[i];
    else if(notes?.[i]?.length){
      const n=document.createElement('div'); n.className='notes';
      for(let d=1; d<=9; d++){
        const sp=document.createElement('span'); sp.textContent=notes[i].includes(d)?d:''; if(opts.markCandidate===d && opts.eliminate?.includes(i)) sp.classList.add('mark'); n.appendChild(sp);
      }
      cell.appendChild(n);
    }
    if(opts.click) cell.onclick=()=>opts.click(i);
    container.appendChild(cell);
  }
}
function hintLimit(){ return me.role==='admin' ? 999 : Number(me.permissions.max_hints ?? 3); }
function renderStatus(){
  if(!game)return;
  const lim=hintLimit();
  $('#timer').textContent=fmt(game.seconds); $('#mistakes').textContent=`错误 ${game.mistakes}`; $('#hintCount').textContent=`提示 ${game.hintsUsed}/${lim>=999?'∞':lim}`; $('#remainingHint').textContent=`剩余 ${lim>=999?'∞':Math.max(0,lim-game.hintsUsed)}`; $('#noteBtn').textContent=`候选：${noteMode?'开':'关'}`;
  $('#gameTitle').textContent=`${LEVEL_NAMES[game.puzzle.level]||game.puzzle.level} · ${game.puzzle.id||'自定义题'}${game.puzzle.title?` · ${game.puzzle.title}`:''}`;
}
function renderBoard(){
  if(!game) return;
  const given=E.parse(game.puzzle.puzzle); const bad=[];
  if(game.puzzle.solution) for(let i=0;i<81;i++) if(game.board[i] && !given[i] && Number(game.puzzle.solution[i])!==game.board[i]) bad.push(i);
  renderGrid($('#board'), game.board, game.notes, {given, selected, related:true, bad, click:(i)=>{selected=i; renderBoard(); if(has('cell_analysis')) analyzeSelectedCell(false); }});
}
function renderAll(){
  if(!game) return;
  renderBoard();
  renderStatus();
}
function renderHintList(){
  const box=$('#hintList');
  if(!game?.hints?.length){ box.innerHTML='<div class="muted">还没有使用提示。点击“获取提示”先只看第1层观察方向。</div>'; return; }
  box.innerHTML = game.hints.map((h,idx)=>{
    const p=h.payload||{}, layers=p.layers||{}, revealed=Math.max(1,Math.min(3,Number(p.revealedLevel||1))), active=Math.max(1,Math.min(revealed,Number(h.activeLayer||revealed)));
    const next = revealed<3 ? `<button class="mini-btn reveal-next" data-next="${revealed+1}">继续第${revealed+1}层</button>` : '<span class="tiny">三层已全部解锁</span>';
    return `<div class="hint-item" data-hidx="${idx}"><div class="hint-head"><b>#${h.seq} ${esc(p.type||'提示')}</b><span class="tiny">已解锁 ${revealed}/3 层</span></div><div class="hint-layers"><button class="mini-btn ${active===1?'active':''}" data-layer="1">第1层</button><button class="mini-btn ${active===2?'active':''}" data-layer="2" ${revealed<2?'disabled':''}>第2层</button><button class="mini-btn ${active===3?'active':''}" data-layer="3" ${revealed<3?'disabled':''}>第3层</button>${next}</div><div class="hint-body">${esc(layers[`layer${active}`]||'')}</div></div>`;
  }).join('');
  $$('.hint-item').forEach(item=>{ const idx=+item.dataset.hidx, h=game.hints[idx], revealed=Number(h.payload?.revealedLevel||1); $$('.mini-btn[data-layer]',item).forEach(btn=>btn.onclick=()=>{const layer=+btn.dataset.layer;if(layer<=revealed){h.activeLayer=layer;renderHintList();}}); const next=$('.reveal-next',item); if(next) next.onclick=()=>revealHintLayer(idx,+next.dataset.next); });
}
async function revealHintLayer(idx,level){
  const h=game?.hints?.[idx]; if(!h) return; level=Math.max(2,Math.min(3,level));
  try{ await api('/api/hints/reveal',{method:'POST',body:{game_key:game.key,seq:h.seq,level}}); h.payload.revealedLevel=level; h.activeLayer=level; renderHintList(); if(level===3) highlightHint(h.payload); saveProgress(false); toast(level===2?'已解锁第2层：技巧方向':'已解锁第3层：完整结论'); }catch(e){toast(e.message);}
}
function restoreSnap(s){ if(!s || !game) return; game.board=s.board.slice(); game.notes=s.notes.map(x=>x.slice()); game.mistakes=s.mistakes; game.hintsUsed=s.hintsUsed; game.seconds=s.seconds; noteMode=!!s.noteMode; selected=Number.isInteger(s.selected)?s.selected:selected; renderAll(); }
async function saveProgress(completed=false){ if(!game)return; $('#saveState').textContent='保存中…'; const state={puzzle:game.puzzle,board:game.board,notes:game.notes,mistakes:game.mistakes,hintsUsed:game.hintsUsed,seconds:game.seconds,log:game.log,undo:game.undo,redo:game.redo}; try{ await api('/api/progress/save',{method:'POST',body:{game_key:game.key,state,completed}}); $('#saveState').textContent='已同步'; }catch(e){ $('#saveState').textContent='保存失败'; console.error(e); } }
async function loadHints(){ if(!has('hint_history')){ game.hints=game.hints||[]; renderHintList(); renderStatus(); return; } const d=await api(`/api/hints?game_key=${encodeURIComponent(game.key)}`); game.hints=(d.hints||[]).map(h=>({...h,activeLayer:Number(h.payload?.revealedLevel||1)})); game.hintsUsed=game.hints.length; renderHintList(); renderStatus(); }
async function startPuzzle(puzzle, state=null){
  selected=-1; noteMode=false; stopTimer();
  const initial=E.parse(puzzle.puzzle);
  game={key:puzzleKey(puzzle),puzzle,board:initial.slice(),notes:blankNotes(),mistakes:0,hintsUsed:0,seconds:0,log:[],undo:[],redo:[],hints:[]};
  if(state){ game.board=state.board||game.board; game.notes=state.notes||game.notes; game.mistakes=state.mistakes||0; game.hintsUsed=state.hintsUsed||0; game.seconds=state.seconds||0; game.log=state.log||[]; game.undo=state.undo||[]; game.redo=state.redo||[]; }
  else log('start',{puzzle_id:puzzle.id});
  $('#gameLevel').value=puzzle.level||'medium'; showView('game'); renderAll(); startTimer(); await loadHints(); if(!state) saveProgress(false);
}
async function resumeCurrent(){ try{ const d=await api('/api/progress/current'); if(!d.progress){ toast('没有未完成题目'); return; } const st=d.progress.state||{}; await startPuzzle(st.puzzle || {}, st); }catch(e){ toast(e.message); } }
async function newRandom(level){ const d=await api(`/api/puzzles/random?level=${encodeURIComponent(level)}`); await startPuzzle(d.puzzle); }
async function daily(){ const d=await api('/api/daily'); await startPuzzle(d.puzzle); game.key=`daily:${d.date}:${d.puzzle.id}`; await saveProgress(false); }
function checkComplete(){
  if(!game || game.board.includes(0) || !game.puzzle.solution) return;
  if(game.board.join('')===game.puzzle.solution){
    stopTimer(); log('complete',{}); saveProgress(true); api('/api/results',{method:'POST',body:{puzzle_id:game.puzzle.id, level:game.puzzle.level, seconds:game.seconds, mistakes:game.mistakes, hints:game.hintsUsed}}).then(d=>{ toast(`完成！积分 ${d.score}`); loadDashboard().catch(()=>{}); });
  }
}
function inputNum(n){
  if(!game || selected<0) return; const given=E.parse(game.puzzle.puzzle); if(given[selected]) return;
  pushUndo();
  if(noteMode && has('candidate_mode')){
    const cur=game.notes[selected]||[]; game.notes[selected]=cur.includes(n) ? cur.filter(x=>x!==n) : [...cur,n].sort(); log('note',{cell:E.cell(selected),n});
  }else{
    game.board[selected]=n; game.notes[selected]=[]; if(game.puzzle.solution && Number(game.puzzle.solution[selected])!==n) game.mistakes++; else for(const p of E.peers(selected)) game.notes[p]=(game.notes[p]||[]).filter(x=>x!==n); log('place',{cell:E.cell(selected),n});
  }
  renderAll(); saveProgress(false); checkComplete();
}
function clearCell(){ if(!game || selected<0) return; const given=E.parse(game.puzzle.puzzle); if(given[selected]) return; pushUndo(); game.board[selected]=0; game.notes[selected]=[]; log('clear',{cell:E.cell(selected)}); renderAll(); saveProgress(false); }
function autoNotes(){ if(!has('auto_notes')) return toast('当前账号没有自动候选权限'); if(!game) return; game.notes = E.cmap(game.board); log('auto_notes',{}); renderAll(); saveProgress(false); }
function buildHintLayers(step){
  const focusText = step.focus?.length ? `请重点观察 ${step.focus.map(E.cell).join('、')} 附近。` : '请先观察相关行、列、宫。';
  const actionText = step.category==='place' ? `本步将确定一个数字填入。` : '本步将删除一部分候选数。';
  return {
    layer1: focusText,
    layer2: `可以尝试使用「${step.type||'逻辑提示'}」技巧。${actionText}`,
    layer3: step.reason || '系统已给出完整结论。'
  };
}
async function useHint(){ if(!has('hints')) return toast('当前账号没有三层提示权限');
  if(!game) return;
  const last=game.hints?.[game.hints.length-1];
  if(last && Number(last.payload?.revealedLevel||1)<3){ return revealHintLayer(game.hints.length-1, Number(last.payload?.revealedLevel||1)+1); }
  let notes = game.notes.some(x=>x.length) ? game.notes.map(x=>x.slice()) : E.cmap(game.board);
  let step = E.techniqueStep(game.board, notes);
  if(!step){
    const r=E.solve(game.board,2); if(!r.solution) return toast('当前盘面无可用提示'); const i=game.board.findIndex(v=>!v); step={type:'Search / 假设搜索',category:'place',i,n:r.solution[i],focus:[i],eliminate:[],reason:`高级逻辑暂时不能继续，搜索建议 ${E.cell(i)} = ${r.solution[i]}。`};
  }
  step.layers=buildHintLayers(step); step.revealedLevel=1;
  try{ const d=await api('/api/hints',{method:'POST',body:{game_key:game.key,payload:step}}); game.hints.push({seq:d.seq,payload:step,activeLayer:1}); game.hintsUsed=game.hints.length; log('hint',{seq:d.seq,type:step.type}); renderHintList(); renderStatus(); saveProgress(false); toast('第1层提示已给出：先观察方向；再次点击“获取提示”可继续展开'); }catch(e){ toast(e.message); }
}
function highlightHint(step){ renderGrid($('#board'),game.board,game.notes,{given:E.parse(game.puzzle.puzzle),selected,focus:step.focus||[],eliminate:step.eliminate||[],place:step.category==='place'?step.i:-1,markCandidate:step.n,click:(i)=>{selected=i; renderBoard();}}); setTimeout(renderBoard,3500); }
function analyzeSelectedCell(showToast=true){ if(!has('cell_analysis')){ const box=$('#cellAnalysis'); if(box) box.innerHTML='<div class="muted">当前账号未开放“游戏当前分析”权限。</div>'; return; }
  if(!game || selected<0){ if(showToast) toast('请先选中一个格子'); return; }
  if(game.board[selected]){ $('#cellAnalysis').innerHTML=`<div><b>${E.cell(selected)}</b> 当前已填入 <b>${game.board[selected]}</b>。建议观察其所在行、列、宫是否还存在冲突。</div>`; return; }
  const cand=E.candidates(game.board, selected), [r,c]=E.rc(selected); const rowNums=E.ROWS[r].map(i=>game.board[i]).filter(Boolean); const colNums=E.COLS[c].map(i=>game.board[i]).filter(Boolean); const box=E.BOXES[Math.floor(r/3)*3+Math.floor(c/3)]; const boxNums=box.map(i=>game.board[i]).filter(Boolean);
  $('#cellAnalysis').innerHTML=`<div><b>${E.cell(selected)}</b> 候选：<b>${cand.join('、')||'无'}</b></div><div class="tiny">同行已有：${rowNums.join('、')||'无'}；同列已有：${colNums.join('、')||'无'}；同宫已有：${boxNums.join('、')||'无'}。</div>`;
}
function renderReplay(){ if(!has('replay')) return;
  if(!game || !game.log?.length){ $('#replayBox').hidden=false; $('#replayBox').innerHTML='<div class="muted">暂无回放数据。</div>'; $('#replayControls').hidden=true; return; }
  $('#replayControls').hidden=false; $('#replayBox').hidden=false;
  $('#replayBox').innerHTML=game.log.map((item,idx)=>`<button class="replay-item ${idx===replayIndex?'active':''}" data-idx="${idx}">${esc(fmt(item.at))} · ${esc(item.type)} ${item.detail?.cell?`· ${esc(item.detail.cell)}`:''} ${item.detail?.n?`= ${item.detail.n}`:''}</button>`).join('');
  $$('.replay-item').forEach(el=>el.onclick=()=>{ replayIndex=+el.dataset.idx; jumpReplay(); });
  $('#replayPos').textContent=`${Math.max(0,replayIndex+1)} / ${game.log.length}`;
}
function jumpReplay(){ if(replayIndex<0||!game?.log?.[replayIndex]) return; restoreSnap(game.log[replayIndex].snapshot); renderReplay(); }
function nextReplay(delta){ if(!game?.log?.length) return; replayIndex=Math.max(0,Math.min(game.log.length-1,replayIndex+delta)); jumpReplay(); }
function playReplay(){ if(!has('replay')) return toast('当前账号没有全过程回放权限'); if(!game?.log?.length) return; if(replayTimer){ clearInterval(replayTimer); replayTimer=null; $('#replayPlay').textContent='播放'; return; } if(replayIndex<0) replayIndex=0; $('#replayPlay').textContent='暂停'; jumpReplay(); replayTimer=setInterval(()=>{ if(replayIndex>=game.log.length-1){ clearInterval(replayTimer); replayTimer=null; $('#replayPlay').textContent='播放'; return; } replayIndex++; jumpReplay(); },1000); }
function generatePuzzle(){ if(!has('generator')) return toast('当前账号未开放题目生成器'); const level=$('#homeLevel').value, clues={beginner:44,easy:40,medium:36,hard:32,expert:29,master:26}[level]||36; toast('正在生成唯一解题目…'); setTimeout(async()=>{ const g=E.generator(clues); const p={id:`GEN-${Date.now()}`, title:'生成题', level, puzzle:E.serialize(g.puzzle), solution:E.serialize(g.solution), source:'generator'}; await startPuzzle(p); },20); }

async function loadLeaderboard(){ const d=await api(`/api/leaderboard?level=${encodeURIComponent($('#rankLevel').value)}`); $('#rankBody').innerHTML=(d.rows||[]).map((r,idx)=>`<tr><td>${idx+1}</td><td>${esc(r.display_name)}</td><td>${esc(LEVEL_NAMES[r.level]||r.level)}</td><td>${fmt(r.seconds)}</td><td>${r.mistakes}</td><td>${r.hints}</td><td>${r.score}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">暂无成绩。</td></tr>'; }

async function loadLessonProgress(){ if(!has('learn')) return; const d=await api('/api/lessons/progress'); lessonDone=new Set((d.completed||[]).map(x=>x.lesson_id)); $('#lessonProgressBadge').textContent=`${lessonDone.size} / ${LESSONS.length}`; }
function practicePuzzleFromLesson(ls){ if(ls.practice?.puzzle) return {id:`LESSON-${lessonIndex+1}`,title:ls.practice.title||ls.title,level:'medium',puzzle:ls.practice.puzzle,source:'lesson'}; if(ls.demo?.board) return {id:`LESSON-${lessonIndex+1}`,title:ls.title,level:'medium',puzzle:ls.demo.board,source:'lesson'}; return null; }
function lessonFrames(ls){
  if(ls.demo?.frames) return {board:E.parse(ls.demo.board), frames:ls.demo.frames};
  const base = ls.practice?.puzzle || ls.demo?.board;
  if(base){
    const parsed=E.parse(base), explain=E.explainSolve(parsed), target=(ls.demo?.generatedTechnique||ls.demo?.autoTechnique||ls.title);
    let step=explain.steps.find(s=>String(s.type).includes(target)) || explain.steps[0];
    if(step){
      const frames=[{text:`观察示例题盘，寻找「${step.type}」的使用机会。`,focus:step.focus||[]},{text:step.layers?.layer2 || `这一阶段通常使用 ${step.type}。`,focus:step.focus||[],eliminate:step.eliminate||[]},{text:step.reason,focus:step.focus||[],eliminate:step.eliminate||[],place:step.category==='place'?step.i:-1}];
      return {board:parsed, frames};
    }
    return {board:parsed, frames:[{text:'请观察示例棋盘。',focus:[]}]};
  }
  return {board:Array(81).fill(0), frames:[{text:'当前课程以文字讲解为主。',focus:[]}]};
}
function renderLessonList(){
  const groups={}; LESSONS.forEach((ls,idx)=>(groups[ls.chapter]??=[]).push({ls,idx}));
  $('#lessonList').innerHTML=Object.entries(groups).map(([chapter,items])=>`<div class="lesson-group"><div class="lesson-group-title">${esc(chapter)}</div>${items.map(({ls,idx})=>`<button class="lesson-item ${idx===lessonIndex?'active':''} ${lessonDone.has(idx+1)?'done':''}" data-lesson="${idx}"><b>${esc(ls.title)}</b><div class="tiny">${esc(ls.desc||'')}</div></button>`).join('')}</div>`).join('');
  $$('.lesson-item').forEach(btn=>btn.onclick=()=>{ lessonIndex=+btn.dataset.lesson; lessonFrame=0; clearInterval(lessonTimer); renderLesson(); renderLessonList(); });
  renderLesson();
}
function renderLesson(){
  const ls=LESSONS[lessonIndex]; if(!ls) return;
  const demo=lessonFrames(ls); const board=demo.board; const frames=demo.frames || []; const frame=frames[Math.max(0,Math.min(lessonFrame,frames.length-1))] || {text:'请选择一节课程。',focus:[]};
  $('#lessonChapter').textContent=ls.chapter||''; $('#lessonTitle').textContent=ls.title||''; $('#lessonDesc').textContent=ls.desc||''; $('#lessonBody').textContent=ls.body||''; $('#lessonStepBadge').textContent=`步骤 ${frames.length?lessonFrame+1:0}/${frames.length||0}`; $('#lessonStepText').textContent=frame.text||'';
  const notes=frame.showCandidates?E.cmap(board):blankNotes(); renderGrid($('#lessonBoard'), board, notes, {focus:frame.focus||[], eliminate:frame.eliminate||[], place:frame.place??-1});
  $('#lessonPracticeBtn').disabled=!practicePuzzleFromLesson(ls);
}
async function completeLesson(){ const lesson_id=lessonIndex+1; await api('/api/lessons/complete',{method:'POST',body:{lesson_id}}); lessonDone.add(lesson_id); toast('已标记完成'); renderLessonList(); $('#lessonProgressBadge').textContent=`${lessonDone.size} / ${LESSONS.length}`; loadDashboard().catch(()=>{}); }
function playLesson(){ const demo=lessonFrames(LESSONS[lessonIndex]); const frames=demo.frames||[]; if(lessonTimer){ clearInterval(lessonTimer); lessonTimer=null; $('#lessonPlay').textContent='播放'; return; } if(!frames.length) return; $('#lessonPlay').textContent='暂停'; lessonTimer=setInterval(()=>{ lessonFrame++; if(lessonFrame>=frames.length){ clearInterval(lessonTimer); lessonTimer=null; $('#lessonPlay').textContent='播放'; lessonFrame=frames.length-1; } renderLesson(); },1400); }
async function startLessonPractice(){ const ls=LESSONS[lessonIndex]; const p=practicePuzzleFromLesson(ls); if(!p) return toast('当前课程暂无专项练习题'); await startPuzzle(p); }

function renderCustomBoard(){
  const boardEl=$('#customBoard'); boardEl.innerHTML='';
  for(let i=0;i<81;i++){
    const btn=document.createElement('button'); btn.type='button'; btn.className='cell'; if(i===customSelected) btn.classList.add('selected');
    const input=document.createElement('input'); input.maxLength=1; input.inputMode='numeric'; input.value=customBoard[i]||''; input.onfocus=()=>{customSelected=i; renderCustomBoard();}; input.oninput=e=>{ const ch=e.target.value.replace(/[^1-9]/g,''); customBoard[i]=ch?+ch:0; e.target.value=ch; syncCustomText(); renderCustomBoard(); }; btn.appendChild(input); btn.onclick=()=>{ customSelected=i; renderCustomBoard(); const inp=$('input',btn); inp&&inp.focus();}; boardEl.appendChild(btn);
  }
}
function syncCustomText(){ $('#customInput').value=customBoard.map(v=>v||0).join(''); }
function loadCustomFromText(){ const text=$('#customInput').value.trim(); const board=E.parse(text); customBoard=board.slice(); renderCustomBoard(); }
function parseImportText(text){
  text=String(text||'').trim();
  if(!text) throw new Error('导入内容为空');
  try{ const obj=JSON.parse(text); if(typeof obj==='string') return obj; if(Array.isArray(obj)) return obj[0]?.puzzle || obj[0]?.grid || ''; return obj.puzzle || obj.grid || ''; }catch{}
  return text.replace(/[^0-9.]/g,'');
}
function analyzeCustom(){
  const board=E.parse($('#customInput').value.trim()); customBoard=board.slice(); renderCustomBoard();
  const conflicts=E.conflicts(board), solved=E.solve(board,2), explain=E.explainSolve(board), level=E.rate(board);
  const counts={}; explain.steps.forEach(s=>counts[s.type]=(counts[s.type]||0)+1);
  const statsHtml=Object.entries(counts).length ? `<div class="tech-stats">${Object.entries(counts).map(([k,v])=>`<div class="tech-stat"><b>${esc(k)}</b><br>${v} 次</div>`).join('')}</div>` : '<div class="muted">暂无逻辑步骤统计。</div>';
  $('#analysisResult').innerHTML=`
    <div><b>基础检查</b></div>
    <div class="tiny">冲突格：${conflicts.length?conflicts.map(E.cell).join('、'):'无'}；解数量：${solved.count===0?'无解':solved.count===1?'唯一解':'多解/至少2解'}。</div>
    <div style="margin-top:10px"><b>难度评估</b></div>
    <div class="tiny">预计难度：${LEVEL_NAMES[level]||level}；最难技巧：${esc(explain.hardest||'未识别')}；逻辑步骤：${explain.steps.length}</div>
    <div style="margin-top:10px"><b>技巧统计</b></div>
    ${statsHtml}
    <div style="margin-top:12px"><b>逐步解题分析</b></div>
    <div class="analysis-steps">${explain.steps.slice(0,120).map((s,i)=>`<div class="hint-item"><b>第 ${i+1} 步 · ${esc(s.type)}</b><div class="tiny">${esc(s.reason)}</div></div>`).join('') || '<div class="muted">没有可展示步骤。</div>'}</div>`;
}

async function loadUsers(){ const d=await api('/api/users'); $('#userBody').innerHTML=(d.users||[]).map(u=>`<tr><td><b>${esc(u.display_name)}</b><div class="tiny">${esc(u.username)}</div></td><td>${u.role==='admin'?'管理员':'普通用户'}</td><td>${u.active?'启用':'停用'}</td><td>${u.role==='admin'?'∞':u.permissions.max_hints}</td><td class="tiny">${Object.entries(u.permissions||{}).filter(([k,v])=>k!=='max_hints'&&v).map(([k])=>PERM_NAMES[k]).join(' / ')||'无'}</td><td><div class="toolbar compact"><button class="btn soft user-edit" data-id="${u.id}">编辑</button></div></td></tr>`).join(''); const users=d.users||[]; $$('.user-edit').forEach(btn=>btn.onclick=()=>openPermModal(users.find(u=>u.id===+btn.dataset.id))); }
function openPermModal(u){ editingUser=u; $('#permModal').hidden=false; $('#permUserTitle').textContent=`${u.display_name} (${u.username})`; $('#permGrid').innerHTML=Object.entries(PERM_NAMES).map(([k,label])=>`<label class="perm-check"><input type="checkbox" data-permkey="${k}" ${u.permissions?.[k]?'checked':''}><span><b>${label}</b><br><span class="tiny">${k}</span></span></label>`).join(''); $('#permHints').value=u.role==='admin'?99:(u.permissions?.max_hints??3); $('#permDisplay').value=u.display_name||''; $('#permRole').value=u.role; $('#permActive').value=u.active?'1':'0'; }
async function savePermModal(){ if(!editingUser)return; const perms={}; $$('[data-permkey]', $('#permGrid')).forEach(ch=>perms[ch.dataset.permkey]=ch.checked); perms.max_hints=Number($('#permHints').value||0); await api(`/api/users/${editingUser.id}`,{method:'PUT',body:{display_name:$('#permDisplay').value.trim(),role:$('#permRole').value,active:$('#permActive').value==='1',permissions:perms}}); $('#permModal').hidden=true; toast('权限已保存'); loadUsers(); }
async function resetUserPassword(){ if(!editingUser)return; const pw=prompt('请输入新的临时密码（至少8位）'); if(!pw)return; if(pw.length<8)return toast('密码至少8位'); await api(`/api/users/${editingUser.id}`,{method:'PUT',body:{password:pw}}); toast('密码已重置，下次登录需修改密码'); }
async function createUser(){ const username=$('#newUsername').value.trim(), display_name=$('#newDisplay').value.trim()||username, password=$('#newPassword').value, role=$('#newRole').value; await api('/api/users',{method:'POST',body:{username,display_name,password,role}}); toast('用户已创建'); ['#newUsername','#newDisplay','#newPassword'].forEach(s=>$(s).value=''); loadUsers(); }

async function loadAdminPuzzles(){ const level=$('#adminPuzzleLevelFilter').value, q=$('#adminPuzzleQ').value.trim(); const d=await api(`/api/puzzles?level=${encodeURIComponent(level)}&q=${encodeURIComponent(q)}`); $('#puzzleCounts').textContent=`后台 ${d.items.length} / 全部 ${d.all_count}`; $('#puzzleBody').innerHTML=(d.items||[]).map(p=>`<tr><td><b>${esc(p.code)}</b></td><td>${esc(p.title)}</td><td>${esc(LEVEL_NAMES[p.level]||p.level)}</td><td>${esc(p.source||'admin')}</td><td>${p.clues||0}</td><td class="tiny">${esc((p.tags||[]).join(', '))}</td><td>${p.active?'启用':'停用'}</td><td><div class="toolbar compact"><button class="btn soft admin-puzzle-toggle" data-code="${encodeURIComponent(p.code)}" data-active="${p.active?1:0}">${p.active?'停用':'启用'}</button><button class="btn ghost admin-puzzle-del" data-code="${encodeURIComponent(p.code)}">删除</button></div></td></tr>`).join('') || '<tr><td colspan="8" class="muted">暂无后台题目。</td></tr>';
  $$('.admin-puzzle-toggle').forEach(btn=>btn.onclick=async()=>{ await api(`/api/puzzles/${btn.dataset.code}`,{method:'PUT',body:{active:btn.dataset.active!=='1'}}); loadAdminPuzzles(); toast('题目状态已更新');});
  $$('.admin-puzzle-del').forEach(btn=>btn.onclick=async()=>{ if(!confirm('确认删除该题目？')) return; await api(`/api/puzzles/${btn.dataset.code}`,{method:'DELETE'}); loadAdminPuzzles(); toast('题目已删除');});
}
async function saveAdminPuzzle(){
  const body={id:$('#puzzleCode').value.trim(),title:$('#puzzleTitle').value.trim(),level:$('#puzzleLevel').value,puzzle:$('#puzzlePuzzle').value.trim(),solution:$('#puzzleSolution').value.trim(),tags:$('#puzzleTags').value.split(',').map(x=>x.trim()).filter(Boolean)};
  await api('/api/puzzles',{method:'POST',body}); toast('题目已保存到后台题库'); ['#puzzleCode','#puzzleTitle','#puzzlePuzzle','#puzzleSolution','#puzzleTags'].forEach(s=>$(s).value=''); loadAdminPuzzles(); loadDashboard().catch(()=>{});
}
async function importAdminPuzzles(file){ const text=await file.text(); const obj=JSON.parse(text); const items=Array.isArray(obj)?obj:(obj.puzzles||obj.items||[]); const d=await api('/api/puzzles/import',{method:'POST',body:{items}}); toast(`导入完成：新增 ${d.added}，跳过 ${d.skipped}`); loadAdminPuzzles(); loadDashboard().catch(()=>{}); }

async function loadAuditLogs(){
  if(me?.role!=='admin') return;
  const category=$('#logCategory')?.value||'';
  const module=$('#logModule')?.value||'';
  const q=$('#logQ')?.value?.trim()||'';
  const d=await api(`/api/logs?category=${encodeURIComponent(category)}&module=${encodeURIComponent(module)}&q=${encodeURIComponent(q)}&limit=300`);
  $('#logCount').textContent=`${d.items?.length||0} 条`;
  $('#logBody').innerHTML=(d.items||[]).map(x=>`<tr><td class="tiny">${esc((x.created_at||'').replace('T',' ').slice(0,19))}</td><td>${esc(x.username||'-')}</td><td>${esc(x.category)}</td><td>${esc(x.module)}</td><td>${esc(x.action)}</td><td>${x.status==='error'?'<span class="badge danger-badge">错误</span>':esc(x.status)}</td><td class="tiny log-detail">${esc(x.detail||'')}</td><td class="tiny">${esc(x.ip||'')}</td></tr>`).join('')||'<tr><td colspan="8" class="muted">暂无日志。</td></tr>';
}
function initNumPad(){
  $('#numPad').innerHTML='';
  for(let d=1; d<=9; d++){ const b=document.createElement('button'); b.type='button'; b.textContent=d; b.onclick=()=>inputNum(d); $('#numPad').appendChild(b); }
  const del=document.createElement('button'); del.type='button'; del.textContent='清除'; del.onclick=clearCell; $('#numPad').appendChild(del);
}
function bindEvents(){
  $$('[data-view]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
  $('#logoutBtn').onclick=async()=>{ await api('/api/auth/logout',{method:'POST'}); location.replace('/'); };
  $('#continueBtn').onclick=resumeCurrent; $('#heroStartBtn').onclick=()=>newRandom($('#homeLevel').value).catch(e=>toast(e.message)); $('#newGameBtn').onclick=()=>newRandom($('#homeLevel').value).catch(e=>toast(e.message)); $('#gameNewBtn').onclick=()=>newRandom($('#gameLevel').value).catch(e=>toast(e.message)); $('#dailyBtn').onclick=()=>daily().catch(e=>toast(e.message)); $('#generateBtn').onclick=generatePuzzle; $('#gotoDashboardBtn').onclick=()=>showView('dashboard'); $('#refreshDashboardBtn').onclick=()=>loadDashboard().catch(e=>toast(e.message));
  $('#noteBtn').onclick=()=>{ if(!has('candidate_mode')) return toast('当前账号没有手工候选权限'); noteMode=!noteMode; renderStatus();}; $('#autoNotesBtn').onclick=autoNotes; $('#undoBtn').onclick=()=>{ if(!has('undo_redo')) return toast('当前账号没有撤销/重做权限'); if(!game?.undo?.length) return; game.redo.push(snapshot()); restoreSnap(game.undo.pop()); saveProgress(false); }; $('#redoBtn').onclick=()=>{ if(!has('undo_redo')) return toast('当前账号没有撤销/重做权限'); if(!game?.redo?.length) return; game.undo.push(snapshot()); restoreSnap(game.redo.pop()); saveProgress(false); }; $('#hintBtn').onclick=useHint; $('#analyzeCellBtn').onclick=()=>analyzeSelectedCell(true); $('#replayBtn').onclick=()=>{ if(!has('replay')) return; replayIndex=0; renderReplay(); jumpReplay(); }; $('#replayPrev').onclick=()=>nextReplay(-1); $('#replayNext').onclick=()=>nextReplay(1); $('#replayPlay').onclick=playReplay;
  $('#rankLevel').onchange=()=>loadLeaderboard().catch(e=>toast(e.message));
  $('#lessonPrev').onclick=()=>{ lessonFrame=Math.max(0,lessonFrame-1); renderLesson(); }; $('#lessonNext').onclick=()=>{ const frames=(lessonFrames(LESSONS[lessonIndex]).frames||[]); lessonFrame=Math.min(Math.max(0,frames.length-1),lessonFrame+1); renderLesson(); }; $('#lessonPlay').onclick=playLesson; $('#lessonRestart').onclick=()=>{ lessonFrame=0; clearInterval(lessonTimer); lessonTimer=null; $('#lessonPlay').textContent='播放'; renderLesson(); }; $('#lessonCompleteBtn').onclick=()=>completeLesson().catch(e=>toast(e.message)); $('#lessonPracticeBtn').onclick=()=>startLessonPractice().catch(e=>toast(e.message));
  $('#customSyncBtn').onclick=syncCustomText; $('#customLoadTextBtn').onclick=loadCustomFromText; $('#customClearBtn').onclick=()=>{ customBoard=Array(81).fill(0); renderCustomBoard(); syncCustomText(); }; $('#analyzeBtn').onclick=analyzeCustom; $('#customFile').onchange=async e=>{ const file=e.target.files?.[0]; if(!file)return; try{ const raw=await file.text(); $('#customInput').value=parseImportText(raw); loadCustomFromText(); toast('已导入到九宫格'); }catch(err){ toast(err.message); } e.target.value=''; };
  $('#createUserBtn').onclick=()=>createUser().catch(e=>toast(e.message)); $('#permClose').onclick=()=>$('#permModal').hidden=true; $('#permSave').onclick=()=>savePermModal().catch(e=>toast(e.message)); $('#permResetPassword').onclick=()=>resetUserPassword().catch(e=>toast(e.message));
  $('#savePuzzleBtn').onclick=()=>saveAdminPuzzle().catch(e=>toast(e.message)); $('#adminPuzzleSearchBtn').onclick=()=>loadAdminPuzzles().catch(e=>toast(e.message)); $('#showPuzzleMgrBtn').onclick=()=>loadAdminPuzzles().catch(e=>toast(e.message)); $('#logSearchBtn').onclick=()=>loadAuditLogs().catch(e=>toast(e.message)); $('#logRefreshBtn').onclick=()=>loadAuditLogs().catch(e=>toast(e.message)); $('#puzzleImportFile').onchange=async e=>{ const file=e.target.files?.[0]; if(!file)return; try{ await importAdminPuzzles(file); }catch(err){ toast(err.message); } e.target.value=''; };
  window.addEventListener('beforeunload',()=>{ if(game) navigator.sendBeacon && navigator.sendBeacon('/api/progress/save', new Blob([JSON.stringify({game_key:game.key,state:{puzzle:game.puzzle,board:game.board,notes:game.notes,mistakes:game.mistakes,hintsUsed:game.hintsUsed,seconds:game.seconds,log:game.log,undo:game.undo,redo:game.redo},completed:false})],{type:'application/json'})); });
  document.addEventListener('visibilitychange',()=>{ if(document.hidden && game) saveProgress(false); });
  document.addEventListener('keydown',e=>{ if(!game)return; if(e.key>='1'&&e.key<='9'){ inputNum(+e.key); } else if(e.key==='Backspace'||e.key==='Delete'){ clearCell(); } else if(e.key.toLowerCase()==='n'){ if(has('candidate_mode')){ noteMode=!noteMode; renderStatus(); } } else if(selected>=0 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){ const [r,c]=E.rc(selected); let nr=r,nc=c; if(e.key==='ArrowLeft')nc=Math.max(0,c-1); if(e.key==='ArrowRight')nc=Math.min(8,c+1); if(e.key==='ArrowUp')nr=Math.max(0,r-1); if(e.key==='ArrowDown')nr=Math.min(8,r+1); selected=nr*9+nc; renderBoard(); if(has('cell_analysis')) analyzeSelectedCell(false); } });
}

async function refreshPermissions(){
  try{
    const r=await api('/api/auth/me');
    if(!r?.user) return;
    const before=JSON.stringify(me?.permissions||{});
    me=r.user;
    applyPermissions();
    if(before!==JSON.stringify(me.permissions||{})){ renderStatus(); toast('账号权限已由管理员更新'); }
  }catch(e){ /* session failures are handled by api() */ }
}

async function init(){
  const meRes=await api('/api/auth/me'); me=meRes.user; $('#userLabel').textContent=me.display_name; $('#userRoleLabel').textContent=me.role==='admin'?'管理员':'普通用户'; $('#userAvatar').textContent=(me.display_name||me.username||'S').slice(0,1); $('#welcome').textContent=`欢迎回来，${me.display_name}`;
  applyPermissions(); bindEvents(); initNumPad(); renderCustomBoard(); loadCustomFromText(); await loadLessonProgress(); await loadDashboard();
  if(me.role==='admin') $('#adminNav').hidden=false;
  setInterval(refreshPermissions,30000);
}

init().catch(err=>{ console.error(err); toast(err.message||'初始化失败'); });
