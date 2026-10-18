/* ===== 无界音乐 · 前端逻辑 =====
 * 数据源：GitHub Issues（公开 API，无需服务器）
 *  - GET  https://api.github.com/repos/{owner}/{repo}/issues      → 帖子
 *  - GET  https://api.github.com/repos/{owner}/{repo}/issues/{n}/comments → 评论
 * 标题约定：【圈子：xx】【分类：yy】【公告】【官方】
 */
(function () {
  'use strict';

  const API = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`;
  const REPO_URL = `https://github.com/${CONFIG.owner}/${CONFIG.repo}`;
  const TOKEN_KEY = 'wujie_token';
  const CACHE_TTL = 120 * 1000; // 2 分钟缓存，缓解匿名 60 次/小时限流

  const $app = document.getElementById('app');
  document.getElementById('repoLink').href = `${REPO_URL}/issues`;

  /* ---------- 工具 ---------- */
  const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (iso) => {
    const d = new Date(iso), now = Date.now(), diff = (now - d) / 1000;
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function md(text) {
    const raw = String(text || '');
    if (window.marked && window.DOMPurify) {
      return DOMPurify.sanitize(marked.parse(raw, { breaks: true, gfm: true }));
    }
    return esc(raw).replace(/\n/g, '<br>');
  }

  async function api(path, options = {}) {
    const headers = { 'Accept': 'application/vnd.github+json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...options, headers });
    if (!res.ok) {
      const msg = res.status === 403
        ? 'GitHub API 访问频率超限（匿名 60 次/小时），可点右上角 ⚙️ 设置 Token 提升额度。'
        : `GitHub API 错误：${res.status}`;
      throw new Error(msg);
    }
    return res.json();
  }

  async function apiCached(path) {
    const key = 'cache:' + path;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (hit && Date.now() - hit.t < CACHE_TTL) return hit.d;
    } catch (_) {}
    const data = await api(path);
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (_) {}
    return data;
  }

  /* ---------- 帖子解析 ---------- */
  // 从标题提取 【key：value】 与 【公告】【官方】 标记
  function parsePost(issue) {
    let title = issue.title || '';
    const tags = {};
    const flags = [];
    title = title.replace(/【([^：】]+)：([^】]+)】/g, (_, k, v) => { tags[k.trim()] = v.trim(); return ''; });
    title = title.replace(/【(公告|官方|置顶|精华)】/g, (_, f) => { flags.push(f); return ''; });
    return {
      number: issue.number,
      title: title.trim() || issue.title,
      body: issue.body || '',
      circle: tags['圈子'] || '',
      category: tags['分类'] || '',
      flags,
      isAnnouncement: flags.includes('公告'),
      isOfficial: flags.includes('官方'),
      isPinned: flags.includes('置顶'),
      user: issue.user?.login || '匿名',
      avatar: issue.user?.avatar_url || '',
      comments: issue.comments || 0,
      reactions: issue.reactions?.total_count || 0,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      url: issue.html_url
    };
  }

  async function fetchPosts() {
    const items = await apiCached('/issues?state=open&sort=updated&direction=desc&per_page=100');
    return items.filter((i) => !i.pull_request).map(parsePost);
  }

  /* ---------- 渲染片段 ---------- */
  const tagHtml = (p) => [
    p.isPinned ? '<span class="tag tag-hot">📌 置顶</span>' : '',
    p.isAnnouncement ? '<span class="tag tag-ann">📢 公告</span>' : '',
    p.isOfficial ? '<span class="tag tag-official">✅ 官方</span>' : '',
    p.circle ? `<span class="tag tag-circle">🎤 ${esc(p.circle)}圈</span>` : '',
    p.category ? `<span class="tag tag-cat">${esc(p.category)}</span>` : ''
  ].join('');

  const postItemHtml = (p) => `
    <a class="post-item" href="#/post/${p.number}">
      ${p.avatar ? `<img class="post-avatar" src="${esc(p.avatar)}" alt="" loading="lazy">` : ''}
      <div class="post-main">
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-meta">
          ${tagHtml(p)}
          <span>👤 ${esc(p.user)}</span>
          <span>🕒 更新于 ${fmtTime(p.updatedAt)}</span>
        </div>
      </div>
      <div class="post-comments"><b>${p.comments}</b>评论</div>
    </a>`;

  const circleColor = (name) => {
    const palette = ['#8b5cf6', '#22d3ee', '#f472b6', '#f59e0b', '#34d399', '#60a5fa', '#fb7185', '#a3e635'];
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  };

  const circleCardHtml = (c, stat) => `
    <a class="card circle-card" href="#/circle/${encodeURIComponent(c.name)}">
      <div class="circle-avatar" style="background:${circleColor(c.name)}">${esc(c.name[0])}</div>
      <h3>${esc(c.name)}</h3>
      <div class="en">${esc(c.en)}</div>
      <div class="desc">${esc(c.desc)}</div>
      <div class="count"><b>${stat.posts}</b> 帖子 · <b>${stat.comments}</b> 讨论</div>
    </a>`;

  const emptyHtml = (text) => `<div class="empty">${text}</div>`;
  const errorHtml = (e) => `<div class="error-box">⚠️ ${esc(e.message || e)}</div>`;
  const loadingHtml = '<div class="loading"><span class="spinner"></span>加载中…</div>';

  function setActiveNav(route) {
    document.querySelectorAll('.main-nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === route);
    });
    document.getElementById('mainNav').classList.remove('open');
  }

  /* ---------- 页面 ---------- */
  async function viewHome() {
    setActiveNav('home');
    $app.innerHTML = `
      <section class="hero">
        <h1>无界音乐</h1>
        <p>${esc(CONFIG.slogan)} · 找到你的圈子，畅聊你爱的声音</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#/circles">🎤 进入艺人圈子</a>
          <a class="btn btn-ghost btn-lg" href="#/new">✏️ 发布新帖</a>
        </div>
      </section>
      <div class="section-head"><h2><span class="bar"></span>热门圈子</h2><a href="#/circles">全部圈子 →</a></div>
      <div class="grid grid-4" id="hotCircles">${loadingHtml}</div>
      <div class="section-head"><h2><span class="bar"></span>最近更新的帖子</h2><a href="${REPO_URL}/issues" target="_blank" rel="noopener">在 GitHub 查看 →</a></div>
      <div id="recentPosts">${loadingHtml}</div>`;
    try {
      const posts = await fetchPosts();
      const stats = circleStats(posts);
      const hot = [...CONFIG.circles].sort((a, b) => (stats[b.name].score || 0) - (stats[a.name].score || 0)).slice(0, 4);
      document.getElementById('hotCircles').innerHTML = hot.map((c) => circleCardHtml(c, stats[c.name])).join('');
      const pinned = posts.filter((p) => p.isPinned || p.isAnnouncement);
      const recent = posts.filter((p) => !pinned.includes(p));
      const list = [...pinned, ...recent].slice(0, 12);
      document.getElementById('recentPosts').innerHTML = list.length
        ? list.map(postItemHtml).join('')
        : emptyHtml('还没有帖子，快来发第一帖吧！');
    } catch (e) {
      document.getElementById('hotCircles').innerHTML = '';
      document.getElementById('recentPosts').innerHTML = errorHtml(e);
    }
  }

  function circleStats(posts) {
    const stats = {};
    for (const c of CONFIG.circles) stats[c.name] = { posts: 0, comments: 0, score: 0 };
    for (const p of posts) {
      if (p.circle && stats[p.circle]) {
        stats[p.circle].posts++;
        stats[p.circle].comments += p.comments;
      }
    }
    for (const k in stats) stats[k].score = stats[k].posts * 1 + stats[k].comments * 2;
    return stats;
  }

  async function viewCircles() {
    setActiveNav('circles');
    $app.innerHTML = `<div class="page-head"><h1>🎤 艺人圈子</h1><p>找到你喜欢的艺人，加入他们的圈子一起聊</p></div>
      <div class="grid grid-4" id="circleGrid">${loadingHtml}</div>`;
    try {
      const posts = await fetchPosts();
      const stats = circleStats(posts);
      document.getElementById('circleGrid').innerHTML =
        CONFIG.circles.map((c) => circleCardHtml(c, stats[c.name])).join('');
    } catch (e) {
      document.getElementById('circleGrid').innerHTML = errorHtml(e);
    }
  }

  async function viewCircle(name) {
    setActiveNav('circles');
    const c = CONFIG.circles.find((x) => x.name === name) || { name, en: '', desc: '' };
    $app.innerHTML = `
      <div class="page-head"><h1><span style="color:${circleColor(name)}">●</span> ${esc(name)}圈</h1><p>${esc(c.en)} ${esc(c.desc)}</p></div>
      <p><a class="btn btn-primary" href="#/new?circle=${encodeURIComponent(name)}">✏️ 在${esc(name)}圈发帖</a></p>
      <div class="section-head"><h2><span class="bar"></span>圈子帖子</h2></div>
      <div id="circlePosts">${loadingHtml}</div>`;
    try {
      const posts = await fetchPosts();
      const list = posts.filter((p) => p.circle === name);
      document.getElementById('circlePosts').innerHTML = list.length
        ? list.map(postItemHtml).join('')
        : emptyHtml(`「${esc(name)}圈」还没有帖子，来发第一帖吧！`);
    } catch (e) {
      document.getElementById('circlePosts').innerHTML = errorHtml(e);
    }
  }

  async function viewCategories() {
    setActiveNav('categories');
    $app.innerHTML = `<div class="page-head"><h1>🎼 音乐分类</h1><p>按风格逛逛大家正在讨论什么</p></div>
      <div class="grid grid-4">${CONFIG.categories.map((c) => `
        <a class="card cat-card" href="#/category/${encodeURIComponent(c.name)}">
          <span class="icon">${c.icon}</span>${esc(c.name)}
        </a>`).join('')}
      </div>`;
  }

  async function viewCategory(name) {
    setActiveNav('categories');
    const c = CONFIG.categories.find((x) => x.name === name) || { name, icon: '🎵' };
    $app.innerHTML = `
      <div class="page-head"><h1>${c.icon} ${esc(name)}</h1></div>
      <p><a class="btn btn-primary" href="#/new?category=${encodeURIComponent(name)}">✏️ 发布${esc(name)}帖</a></p>
      <div class="section-head"><h2><span class="bar"></span>相关帖子</h2></div>
      <div id="catPosts">${loadingHtml}</div>`;
    try {
      const posts = await fetchPosts();
      const list = posts.filter((p) => p.category === name);
      document.getElementById('catPosts').innerHTML = list.length
        ? list.map(postItemHtml).join('')
        : emptyHtml(`「${esc(name)}」分类下还没有帖子。`);
    } catch (e) {
      document.getElementById('catPosts').innerHTML = errorHtml(e);
    }
  }

  async function viewList({ route, title, icon, filter, emptyText }) {
    setActiveNav(route);
    $app.innerHTML = `<div class="page-head"><h1>${icon} ${esc(title)}</h1></div><div id="listBox">${loadingHtml}</div>`;
    try {
      const posts = await fetchPosts();
      const list = posts.filter(filter);
      document.getElementById('listBox').innerHTML = list.length ? list.map(postItemHtml).join('') : emptyHtml(emptyText);
    } catch (e) {
      document.getElementById('listBox').innerHTML = errorHtml(e);
    }
  }

  const viewAnnouncements = () => viewList({
    route: 'announcements', title: '公告', icon: '📢',
    filter: (p) => p.isAnnouncement, emptyText: '暂无公告。'
  });

  async function viewOfficial() {
    setActiveNav('official');
    $app.innerHTML = `
      <div class="page-head"><h1>✅ 官方</h1><p>无界音乐官方信息发布区</p></div>
      <div class="notice-box">
        🎵 <b>关于无界音乐</b>：这是一个完全运行在 GitHub 上的无服务器音乐社区。<br>
        · 帖子与评论 = <a href="${REPO_URL}/issues" target="_blank" rel="noopener">GitHub Issues</a>，公开透明、永久可访问<br>
        · 网页托管 = GitHub Pages，全球 CDN 加速<br>
        · 想参与？点右上角「发帖」，或直接在 GitHub 仓库里提 Issue 即可。
      </div>
      <div class="section-head"><h2><span class="bar"></span>官方发布</h2></div>
      <div id="officialPosts">${loadingHtml}</div>`;
    try {
      const posts = await fetchPosts();
      const list = posts.filter((p) => p.isOfficial);
      document.getElementById('officialPosts').innerHTML = list.length
        ? list.map(postItemHtml).join('') : emptyHtml('暂无官方发布。');
    } catch (e) {
      document.getElementById('officialPosts').innerHTML = errorHtml(e);
    }
  }

  async function viewPost(num) {
    setActiveNav('');
    $app.innerHTML = loadingHtml;
    try {
      const issue = await api(`/issues/${num}`);
      if (issue.pull_request) throw new Error('该编号不是帖子');
      const p = parsePost(issue);
      const comments = p.comments > 0 ? await api(`/issues/${num}/comments?per_page=100`) : [];
      const token = getToken();
      $app.innerHTML = `
        <div class="post-detail">
          <h1>${esc(p.title)}</h1>
          <div class="post-meta">
            ${tagHtml(p)}
            <span>👤 <a href="https://github.com/${esc(p.user)}" target="_blank" rel="noopener">${esc(p.user)}</a></span>
            <span>发布于 ${fmtTime(p.createdAt)}</span>
            <span>· 更新于 ${fmtTime(p.updatedAt)}</span>
          </div>
          <div class="post-body">${md(p.body) || '<span class="muted">（无内容）</span>'}</div>
        </div>

        <div class="section-head"><h2><span class="bar"></span>评论（${p.comments}）</h2>
          <a href="${p.url}" target="_blank" rel="noopener">在 GitHub 中打开 →</a></div>
        <div class="post-detail" style="padding-top:10px">
          ${comments.length ? comments.map((c) => `
            <div class="comment">
              <img class="comment-avatar" src="${esc(c.user?.avatar_url || '')}" alt="" loading="lazy">
              <div class="comment-body">
                <div class="comment-head"><b>${esc(c.user?.login || '匿名')}</b>${fmtTime(c.created_at)}</div>
                <div class="comment-text post-body">${md(c.body)}</div>
              </div>
            </div>`).join('') : '<div class="empty" style="padding:24px 0">还没有评论，来抢沙发～</div>'}
        </div>

        <div class="comment-form">
          <h3 style="margin-bottom:12px">✍️ 发表评论</h3>
          ${token ? `
            <textarea id="cmtInput" placeholder="友善交流，理性讨论…"></textarea>
            <div class="row">
              <span class="muted small" id="cmtStatus"></span>
              <button class="btn btn-primary" id="cmtSubmit">发布评论</button>
            </div>` : `
            <p class="muted" style="margin-bottom:14px">评论功能基于 GitHub：你可以</p>
            <div class="row" style="justify-content:flex-start">
              <a class="btn btn-primary" href="${p.url}" target="_blank" rel="noopener">🔑 登录 GitHub 后评论</a>
              <button class="btn btn-ghost" id="gotoToken">⚙️ 设置 Token 站内评论</button>
            </div>`}
        </div>`;

      const gotoBtn = document.getElementById('gotoToken');
      if (gotoBtn) gotoBtn.onclick = openTokenModal;

      const submit = document.getElementById('cmtSubmit');
      if (submit) {
        submit.onclick = async () => {
          const input = document.getElementById('cmtInput');
          const status = document.getElementById('cmtStatus');
          const body = input.value.trim();
          if (!body) { status.textContent = '先写点内容吧'; return; }
          submit.disabled = true; status.textContent = '发布中…';
          try {
            await api(`/issues/${num}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body })
            });
            sessionStorage.clear();
            status.textContent = '发布成功！正在刷新…';
            setTimeout(() => viewPost(num), 600);
          } catch (e) {
            status.textContent = e.message;
            submit.disabled = false;
          }
        };
      }
    } catch (e) {
      $app.innerHTML = errorHtml(e) + '<p><a class="btn btn-ghost" href="#/">← 返回首页</a></p>';
    }
  }

  function viewNew(params) {
    setActiveNav('');
    const token = getToken();
    const preCircle = params.get('circle') || '';
    const preCat = params.get('category') || '';
    $app.innerHTML = `
      <div class="page-head"><h1>✏️ 发布新帖</h1><p>帖子将以 Issue 形式公开保存在 GitHub 仓库中</p></div>
      <div class="form">
        <label>标题</label>
        <input id="npTitle" maxlength="120" placeholder="一句话说明你的主题…">
        <label>所属圈子（可选）</label>
        <select id="npCircle">
          <option value="">— 不选择圈子 —</option>
          ${CONFIG.circles.map((c) => `<option ${c.name === preCircle ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <label>音乐分类（可选）</label>
        <select id="npCategory">
          <option value="">— 不选择分类 —</option>
          ${CONFIG.categories.map((c) => `<option ${c.name === preCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <label>正文（支持 Markdown）</label>
        <textarea id="npBody" placeholder="分享你的想法、歌单、演唱会见闻…"></textarea>
        <div class="row">
          <span class="muted small" id="npStatus"></span>
          <span style="flex:1"></span>
          ${token
            ? '<button class="btn btn-primary" id="npSubmit">🚀 直接发布</button>'
            : '<a class="btn btn-primary" id="npGithub" href="#" target="_blank" rel="noopener">🔑 跳转到 GitHub 发布</a>'}
        </div>
        <div class="hint">
          ${token
            ? '已设置 Token，帖子将以你的 GitHub 账号直接发布。'
            : '未设置 Token：点击按钮会打开 GitHub 新建 Issue 页面（已自动填好内容），登录后点 Submit 即完成发布。也可点右上角 ⚙️ 设置 Token 实现站内直发。'}
        </div>
      </div>`;

    const buildTitle = () => {
      const circle = document.getElementById('npCircle').value;
      const cat = document.getElementById('npCategory').value;
      const t = document.getElementById('npTitle').value.trim();
      return `${circle ? `【圈子：${circle}】` : ''}${cat ? `【分类：${cat}】` : ''}${t}`;
    };

    const ghBtn = document.getElementById('npGithub');
    if (ghBtn) {
      const sync = () => {
        const body = document.getElementById('npBody').value;
        ghBtn.href = `${REPO_URL}/issues/new?title=${encodeURIComponent(buildTitle())}&body=${encodeURIComponent(body)}`;
      };
      ['npTitle', 'npCircle', 'npCategory', 'npBody'].forEach((id) => {
        document.getElementById(id).addEventListener('input', sync);
        document.getElementById(id).addEventListener('change', sync);
      });
      sync();
      ghBtn.addEventListener('click', (e) => {
        if (!document.getElementById('npTitle').value.trim()) {
          e.preventDefault();
          document.getElementById('npStatus').textContent = '先填写标题';
        }
      });
    }

    const submit = document.getElementById('npSubmit');
    if (submit) {
      submit.onclick = async () => {
        const status = document.getElementById('npStatus');
        const title = buildTitle();
        const body = document.getElementById('npBody').value;
        if (!document.getElementById('npTitle').value.trim()) { status.textContent = '先填写标题'; return; }
        submit.disabled = true; status.textContent = '发布中…';
        try {
          const issue = await api('/issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body })
          });
          sessionStorage.clear();
          location.hash = `#/post/${issue.number}`;
        } catch (e) {
          status.textContent = e.message;
          submit.disabled = false;
        }
      };
    }
  }

  /* ---------- Token 弹窗 ---------- */
  const modal = document.getElementById('tokenModal');
  const tokenInput = document.getElementById('tokenInput');
  function openTokenModal() { tokenInput.value = getToken(); modal.hidden = false; tokenInput.focus(); }
  document.getElementById('tokenBtn').onclick = openTokenModal;
  document.getElementById('tokenCancel').onclick = () => { modal.hidden = true; };
  document.getElementById('tokenClear').onclick = () => { localStorage.removeItem(TOKEN_KEY); modal.hidden = true; route(); };
  document.getElementById('tokenSave').onclick = () => {
    const v = tokenInput.value.trim();
    if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY);
    modal.hidden = true; route();
  };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  /* ---------- 路由 ---------- */
  function route() {
    const hash = location.hash.slice(2) || '';
    const [pathPart, queryPart] = hash.split('?');
    const params = new URLSearchParams(queryPart || '');
    const seg = pathPart.split('/').filter(Boolean);
    window.scrollTo(0, 0);
    if (seg.length === 0) return viewHome();
    switch (seg[0]) {
      case 'circles': return viewCircles();
      case 'circle': return viewCircle(decodeURIComponent(seg[1] || ''));
      case 'categories': return viewCategories();
      case 'category': return viewCategory(decodeURIComponent(seg[1] || ''));
      case 'announcements': return viewAnnouncements();
      case 'official': return viewOfficial();
      case 'post': return viewPost(seg[1]);
      case 'new': return viewNew(params);
      default: return viewHome();
    }
  }

  document.getElementById('navToggle').onclick = () => document.getElementById('mainNav').classList.toggle('open');
  window.addEventListener('hashchange', route);
  route();
})();
