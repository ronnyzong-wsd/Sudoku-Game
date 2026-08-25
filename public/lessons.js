window.SUDOKU_LESSONS = [
  {
    chapter:'第一章 · 认识数独',
    title:'9×9 棋盘',
    en:'The 9×9 Grid',
    desc:'认识81个格子、9行、9列和9个宫。',
    body:'标准数独由81格组成。每一行、每一列、每个3×3宫都必须恰好包含1～9。掌握行、列、宫是后续所有推理的基础。',
    demo:{board:'530070000600195000098000060800060003400803001700020006060000280000419005000080079',frames:[{text:'先观察整个9×9棋盘。',focus:[0,1,2,3,4,5,6,7,8]},{text:'蓝色区域是一整行，共9格。',focus:[27,28,29,30,31,32,33,34,35]},{text:'现在观察中间的3×3宫。',focus:[30,31,32,39,40,41,48,49,50]}]}
  },
  {
    chapter:'第一章 · 认识数独',
    title:'行、列与宫',
    en:'Rows, Columns & Boxes',
    desc:'每个格子同时受三类区域约束。',
    body:'判断一个数字能否填写，要同时检查同行、同列、同宫。任何一个区域出现重复，都说明当前填法非法。',
    demo:{board:'530070000600195000098000060800060003400803001700020006060000280000419005000080079',frames:[{text:'选中中央格 R5C5。',focus:[40]},{text:'它同时属于第5行。',focus:[36,37,38,39,40,41,42,43,44]},{text:'也属于第5列。',focus:[4,13,22,31,40,49,58,67,76]},{text:'还属于第5宫。',focus:[30,31,32,39,40,41,48,49,50]}]}
  },
  {
    chapter:'第二章 · 基础技巧',
    title:'候选数',
    en:'Candidates',
    desc:'用排除法建立每格可能数字。',
    body:'候选数是1～9中没有出现在同行、同列、同宫里的数字。候选数越准确，越有利于发现唯一数和高级结构。',
    demo:{board:'530070000600195000098000060800060003400803001700020006060000280000419005000080079',frames:[{text:'观察 R1C3。',focus:[2]},{text:'同行已有5、3、7；同列和同宫继续排除。',focus:[0,1,4,11,20]},{text:'剩下的数字就是该格候选。',focus:[2],showCandidates:true}]},
    practice:{title:'候选数专项',puzzle:'530070000600195000098000060800060003400803001700020006060000280000419005000080079'}
  },
  {chapter:'第二章 · 基础技巧',title:'显性唯一数',en:'Naked Single',desc:'一个格子只剩一个候选。',body:'如果一个空格只剩一个合法候选，就可以直接填写。这通常是最先应该扫描的技巧。',demo:{board:'530070000600195000098000060800060003400803001700020006060000280000419005000080079',autoTechnique:'Naked Single'},practice:{title:'显性唯一数专项',puzzle:'530070000600195000098000060800060003400803001700020006060000280000419005000080079'}},
  {chapter:'第二章 · 基础技巧',title:'隐性唯一数',en:'Hidden Single',desc:'某数字在一个区域只剩一个位置。',body:'即使目标格有多个候选，只要一个数字在行、列或宫中只有这一处可放，也能确定。',demo:{board:'530070000600195000098000060800060003400803001700020006060000280000419005000080079',autoTechnique:'Hidden Single'},practice:{title:'隐性唯一数专项',puzzle:'200080300060070084030500209000105408000000000402706000301007040720040060004010003'}},
  {chapter:'第三章 · 进阶技巧',title:'区块锁定',en:'Locked Candidates',desc:'宫与行列之间的候选锁定。',body:'宫内某数字所有候选都落在同一行或同一列时，可删除该行/列的宫外候选。',demo:{generatedTechnique:'Locked Candidates'},practice:{title:'区块锁定专项',puzzle:'005300000800000020070010500400005300010070006003200080060500009004000030000009700'}},
  {chapter:'第三章 · 进阶技巧',title:'显性数对',en:'Naked Pair',desc:'两个格子锁定两个数字。',body:'一个区域内两个格子共同只含相同两个候选时，这两个数字可从其它格删除。',demo:{generatedTechnique:'Naked Pair'},practice:{title:'显性数对专项',puzzle:'000260701680070090190004500820100040004602900050003028009300074040050036703018000'}},
  {chapter:'第三章 · 进阶技巧',title:'隐性数对',en:'Hidden Pair',desc:'两个数字只落在两个位置。',body:'若两个数字在某区域只能出现在同两个格子，可删除这两格的其它候选。',demo:{generatedTechnique:'Hidden Pair'},practice:{title:'隐性数对专项',puzzle:'050000190903000026700006840000008070000003918080400300001080209200000000005701000'}},
  {chapter:'第三章 · 进阶技巧',title:'显性三数组',en:'Naked Triple',desc:'三个格子锁定三个候选。',body:'三个格子的候选并集恰好是三个数字时，这些数字可从区域其它格删除。',demo:{generatedTechnique:'Naked Triple'},practice:{title:'显性三数组专项',puzzle:'000000907000420180000705026100904000050000040000507009920108000034059000507000000'}},
  {chapter:'第四章 · 高级技巧',title:'X-Wing',en:'X-Wing',desc:'两行两列形成矩形强结构。',body:'某数字在两行中都只出现于相同两列时，可从这两列的其它行删除该候选。',demo:{generatedTechnique:'X-Wing'},practice:{title:'X-Wing专项',puzzle:'300000000005009000200504000020000700160000058704310600000890100000067080000005437'}},
  {chapter:'第四章 · 高级技巧',title:'Skyscraper',en:'Skyscraper',desc:'两条强链形成“摩天楼”。',body:'同一数字在两行各有两个候选，且一端共列，另一端形成两个屋顶，可删除两个屋顶共同可见位置的候选。',demo:{generatedTechnique:'Skyscraper'},practice:{title:'Skyscraper专项',puzzle:'090250030003004950000396007000400000000005240910000600000007090208600000700130000'}},
  {chapter:'第四章 · 高级技巧',title:'XY-Wing',en:'XY-Wing',desc:'三格双候选构成枢轴与两翼。',body:'枢轴为XY，两翼分别XZ与YZ，则两翼共同可见位置中的Z可以删除。',demo:{generatedTechnique:'XY-Wing'},practice:{title:'XY-Wing专项',puzzle:'780029000900000000005180600030070140400000009020400300800040260200706000054200003'}},
  {chapter:'第四章 · 高级技巧',title:'Swordfish',en:'Swordfish',desc:'三行三列的鱼形结构。',body:'某数字在三行中的候选只分布于同三列，可从这些列其它行删除该候选。',demo:{generatedTechnique:'Swordfish'}},
  {chapter:'第四章 · 高级技巧',title:'Two-String Kite',en:'Two-String Kite',desc:'一条行强链和一条列强链通过同宫连接。',body:'同一数字在某行和某列各只有两个候选，其中一端位于同一宫时，可在另外两端交汇影响的位置删除该数字。',demo:{generatedTechnique:'Two-String Kite'},practice:{title:'Two-String Kite专项',puzzle:'000000003501620008879304600000010039017003200320596800000000000000007502050000106'}},
  {chapter:'第四章 · 高级技巧',title:'XYZ-Wing',en:'XYZ-Wing',desc:'三候选枢轴与两个双候选翼。',body:'枢轴含 XYZ，两翼分别是其中两个候选组合；若三格共同约束某个候选，可从三者共同可见位置删除该候选。',demo:{generatedTechnique:'XYZ-Wing'},practice:{title:'XYZ-Wing专项',puzzle:'600349000000570000000100004030000009009007510080064300002005800050090002001680070'}},
  {chapter:'第四章 · 高级技巧',title:'W-Wing',en:'W-Wing',desc:'两个相同双候选通过强链连接。',body:'两个不直接相连的双候选格具有相同候选对，其中一个候选通过共轭强链连接时，可从两端共同可见格删除另一个候选。',demo:{generatedTechnique:'W-Wing'},practice:{title:'W-Wing专项',puzzle:'600075000200040085000002700506000807010000009000064010070090000020100600300700001'}},
  {chapter:'第四章 · 高级技巧',title:'Simple Coloring',en:'Simple Coloring',desc:'对共轭链进行双色标记。',body:'针对同一个候选数字，把共轭强链交替着色。如果同色发生冲突，整种颜色可以排除；如果某格同时看见两种颜色，该格对应候选可以排除。',demo:{generatedTechnique:'Simple Coloring'},practice:{title:'Simple Coloring专项',puzzle:'590200600260000700008010052409000000000000001035089400000070080006300107007800003'}},
  {chapter:'第四章 · 高级技巧',title:'Jellyfish',en:'Jellyfish',desc:'四行四列的鱼形结构。',body:'Jellyfish 是 X-Wing、Swordfish 的四阶扩展：某数字在四行中的候选只分布在同四列时，可从这些列的其它行删除该候选。',demo:{generatedTechnique:'Jellyfish'}},
  {chapter:'第五章 · 高级扩展',title:'Unique Rectangle Type 1',en:'Unique Rectangle',desc:'利用唯一解避免形成致命矩形。',body:'四个格子跨两行两列、两宫形成矩形，其中三格只有同一候选对、第四格还含额外候选时，为保持题目唯一解，可从第四格删除那一候选对。',demo:{generatedTechnique:'Unique Rectangle Type 1'}},
  {chapter:'第五章 · 高级扩展',title:'Hidden Triple',en:'Hidden Triple',desc:'三个数字只落在三个格。',body:'三个数字在一个区域中只可能出现于三个格，即使这些格还有其它候选，也可删除其它候选。',practice:{title:'Hidden Triple专项',puzzle:'048500902900403007000090508080940000100002300000070100000030200006000000001004070'}},
  {chapter:'第五章 · 高级扩展',title:'Naked Quad',en:'Naked Quad',desc:'四格共同锁定四个候选。',body:'四个格子候选并集恰好为四个数字，可从区域其它格删除这些数字。'},
  {chapter:'第五章 · 高级扩展',title:'分层提示',en:'Layered Hints',desc:'先看方向，再看逻辑，最后看结论。',body:'真正的三层提示是：第一层只给观察方向，第二层说明技巧与区域，第三层给出具体落子/删候选结论。这样既能学习，又不会一次性剧透。'},
  {chapter:'第五章 · 高级扩展',title:'卡住时的扫描顺序',en:'When Stuck',desc:'避免无序猜测。',body:'推荐顺序：唯一数 → Locked Candidates → Pair/Triple → X-Wing/Skyscraper → XY-Wing/Swordfish → 更高级技巧 → 最后才考虑搜索。'},
  {chapter:'第六章 · 复盘与练习',title:'完整复盘',en:'Replay',desc:'从自己的真实操作中学习。',body:'完成后回放填数、候选、撤销和提示，找到最常停顿的阶段，再回到专项练习继续强化。'}
];
