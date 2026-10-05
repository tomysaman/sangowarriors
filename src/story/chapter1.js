// Chapter I — The Lone Rider of Changban (Romance of the Three Kingdoms, ch. 41).
// Data-driven: beats reference ids that the game resolves. Lines: [portraitId, name, cn, text].

export const CHAPTER1 = {
  id: 'changban',
  title: 'The Lone Rider of Changban',
  intro: [
    `<span class="date">208 AD · JING PROVINCE</span>Cao Cao's armoured cavalry has overtaken Liu Bei's retreating column at Changban. Soldiers and refugees scatter beneath the blue banners of Wei.`,
    `In the chaos, Liu Bei's household is lost: <b>Lady Mi</b> and the infant heir, <b>A Dou</b>.`,
    `One general turns back alone into a sea of enemies.<br><br><span style="font-family:'Ma Shan Zheng',serif;font-size:1.6em;color:#f3dc94">趙雲 子龍</span><br>Zhao Yun of Changshan.`,
  ],
  beats: {
    start: {
      lines: [
        ['shu', 'Shu Soldier', '蜀兵', 'General Zhao! Lady Mi and the young master were last seen near the burning village to the south!'],
        ['zhaoyun', 'Zhao Yun', '趙雲', 'Our lord entrusted his family to me. I will not return without them.'],
      ],
      objective: 'Break through the Wei vanguard and reach the burning village',
    },
    xiahouen: {
      lines: [
        ['xiahouen', 'Xiahou En', '夏侯恩', 'Zhao Yun! I am Xiahou En, bearer of Lord Cao\'s Qinggang Sword. Your road ends here!'],
        ['zhaoyun', 'Zhao Yun', '趙雲', 'Then that blade deserves a worthier master.'],
      ],
      objective: 'Defeat Xiahou En',
    },
    sword: {
      toast: ['Obtained the Qinggang Sword', 'Attack power increased'],
      lines: [['zhaoyun', 'Zhao Yun', '趙雲', 'Cao Cao\'s Qinggang Sword... it cuts through iron like mud. Now, where is my lady?']],
      objective: 'Find Lady Mi by the village well',
    },
    well: {
      lines: [
        ['ladymi', 'Lady Mi', '糜夫人', 'General Zhao... Heaven has sent you. This child is my lord\'s only son. Take him, I beg you.'],
        ['zhaoyun', 'Zhao Yun', '趙雲', 'My lady, I will carry you both. Lean on me, we leave at once.'],
        ['ladymi', 'Lady Mi', '糜夫人', 'I am wounded and cannot ride. If I come with you, all three of us will fall. Protect A Dou. Do not let me be your burden.'],
      ],
      card: `Lady Mi laid the child down and threw herself into the well.<br><br>Zhao Yun pushed down the crumbling wall to cover her, so that the enemy could not take her body.`,
      after: [['zhaoyun', 'Zhao Yun', '趙雲', 'Young master... hold fast. I will carry you to your father through any army.']],
      objective: 'Carry A Dou to Changban Bridge',
    },
    zhanghe: {
      lines: [
        ['zhanghe', 'Zhang He', '張郃', 'A general fleeing with an infant tied to his chest? Zhang He of Wei will take you both!'],
        ['zhaoyun', 'Zhao Yun', '趙雲', 'Stand aside, or fall where you stand!'],
      ],
      objective: 'Defeat Zhang He',
    },
    zhangheDown: {
      lines: [['zhanghe', 'Zhang He', '張郃', 'Such strength... a dragon in the guise of a man! All units, fall back!']],
      objective: 'Reach Changban Bridge',
    },
    bridge: {
      lines: [
        ['zhangfei', 'Zhang Fei', '張飛', 'Zilong! You made it! Get across, I will hold this bridge myself!'],
        ['zhaoyun', 'Zhao Yun', '趙雲', 'Yide, the young master is safe. The enemy is right behind me!'],
        ['zhangfei', 'Zhang Fei', '張飛', 'Let them come!'],
      ],
      roar: ['zhangfei', 'Zhang Fei', '張飛', 'I AM ZHANG YIDE OF YAN! WHO DARES FIGHT ME TO THE DEATH?!'],
      card: `Zhang Fei's roar shook Changban Bridge. Fearing an ambush, Cao Cao's vanguard turned and fled.<br><br>Zhao Yun brought A Dou safely to Liu Bei, having cut his way through the enemy host, the Qinggang Sword at his side.`,
    },
  },
};
