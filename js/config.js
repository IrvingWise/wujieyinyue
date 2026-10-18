/* 无界音乐 · 站点配置
 * 数据全部存储在本仓库的 GitHub Issues 中：
 *  - 帖子 = Issue，标题前缀【圈子：xx】【分类：yy】标记归属
 *  - 评论 = Issue 评论
 *  - 公告 = 标题含【公告】的 Issue
 *  - 官方 = 标题含【官方】的 Issue
 */
const CONFIG = {
  owner: 'IrvingWise',
  repo: 'wujieyinyue',
  siteName: '无界音乐',
  slogan: '音乐无界，同好相聚',

  // 艺人圈子（可自行增删）
  circles: [
    { name: '周杰伦', en: 'Jay Chou', desc: '华语流行天王，Jay 式浪漫' },
    { name: '林俊杰', en: 'JJ Lin', desc: '行走的 CD，金曲制造机' },
    { name: '邓紫棋', en: 'G.E.M.', desc: '铁肺小天后，创作全才' },
    { name: '薛之谦', en: 'Joker Xue', desc: '深情段子手，苦情歌代表' },
    { name: '陈奕迅', en: 'Eason Chan', desc: '歌神 Eason，唱尽人生百态' },
    { name: '华晨宇', en: 'Hua Chenyu', desc: '火星唱作人，舞台鬼才' },
    { name: '周深', en: 'Zhou Shen', desc: '天籁之声，国风 OST 之王' },
    { name: '毛不易', en: 'Mao Buyi', desc: '平凡歌者，唱尽人间烟火' }
  ],

  // 音乐分类
  categories: [
    { name: '流行', icon: '🎤' },
    { name: '摇滚', icon: '🎸' },
    { name: '说唱', icon: '🎧' },
    { name: '电子', icon: '🎹' },
    { name: '民谣', icon: '🪕' },
    { name: '国风', icon: '🏮' },
    { name: '古典', icon: '🎻' },
    { name: '影视原声', icon: '🎬' }
  ]
};
