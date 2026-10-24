window.__ModuleLoader__.load({
  id: '@local/dsh-study-tutor',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React

    // ---------------------------------------------------------------------
    // Copy
    // ---------------------------------------------------------------------

    const DICT = {
      zh: {
        'view.label': '学习',
        'app.title': '学习教练',
        'app.subtitle': '资料 · 边界 · 图谱 · 知识库 · 课程',
        'tabs.overview': '概览',
        'tabs.material': '资料与媒体',
        'tabs.boundary': '边界',
        'tabs.graph': '图谱',
        'tabs.kb': '知识库',
        'tabs.lesson': '课程',
        'tabs.sources': '来源与导出',
        'empty.title': '还没有开始学习',
        'empty.body': '把学习资料拖进对话，或在这里点一下把开场白填进输入框，然后发送。插件会先读资料，再和你确认知识边界。',
        'empty.start': '填入开场白',
        'empty.copy': '复制开场白',
        'empty.copied': '已复制',
        'empty.prompt': '我要学习这份资料，请先读它：',
        'action.refresh': '刷新',
        'action.export': '导出笔记',
        'action.exporting': '导出中…',
        'action.search': '检索',
        'action.retry': '重试',
        'action.copyPath': '复制路径',
        'state.loading': '正在读取学习状态…',
        'state.error': '读取失败',
        'stat.materials': '资料',
        'stat.confirmed': '已确认',
        'stat.gap': '缺口',
        'stat.lessons': '课程',
        'stat.chunks': '知识片段',
        'progress.title': '学习进度',
        'progress.boundary': '知识边界',
        'progress.graph': '图谱掌握',
        'next.title': '下一步建议',
        'next.empty': '先读一份资料。',
        'caps.title': '环境能力',
        'caps.ffmpeg': '视频抽帧',
        'caps.pandoc': '文档转换',
        'caps.python': 'Python 解析',
        'caps.libreoffice': 'Office 渲染',
        'caps.speech': '语音识别',
        'caps.ready': '就绪',
        'caps.missing': '缺失',
        'material.empty': '还没有资料。',
        'material.shots': '分镜',
        'material.transcript': '转写',
        'material.frames': '关键帧',
        'material.kind': '类型',
        'material.difficulty': '难度',
        'material.topics': '关键主题',
        'material.gaps': '跳步与缺失',
        'material.patterns': '教学法提炼',
        'boundary.empty': '还没有记录知识边界。',
        'boundary.locked': '已锁定',
        'boundary.open': '未锁定',
        'boundary.unknown': '未确认',
        'boundary.level0': '没听过',
        'boundary.level1': '能复述',
        'boundary.level2': '指导下会用',
        'boundary.level3': '能独立讲解',
        'boundary.evidence': '证据',
        'boundary.filter.all': '全部',
        'boundary.filter.low': '不确定',
        'boundary.filter.missing': '未确认',
        'graph.empty': '还没有知识图谱。',
        'graph.view.dag': '依赖图谱',
        'graph.view.tree': '思维导图',
        'graph.onlyGap': '只看缺口',
        'graph.onlyMaterial': '只看资料内',
        'graph.cycle': '检测到循环依赖',
        'graph.prereq': '前置',
        'graph.unlocks': '解锁',
        'graph.status.ready': '已掌握',
        'graph.status.partial': '半懂',
        'graph.status.gap': '缺失',
        'graph.source.material': '资料内',
        'graph.source.prerequisite': '推测前置',
        'graph.selected': '选中',
        'graph.none': '点一个节点看详情。',
        'kb.empty': '知识边界锁定后即可建立向量知识库。',
        'kb.build': '建立知识库',
        'kb.searching': '检索中…',
        'kb.placeholder': '问一个问题，或输入关键词',
        'kb.embedder': '嵌入器',
        'kb.buildAt': '构建时间',
        'kb.noResult': '没有命中。',
        'kb.hint': '检索结果带来源与页码/时间戳，可直接据此讲解。',
        'lesson.empty': '还没有课程。边界锁定并建立知识库后，会让模型按图谱顺序补课。',
        'lesson.goal': '目标',
        'lesson.prereq': '前置',
        'lesson.checkAnswer': '查看答案',
        'lesson.play': '播放',
        'lesson.pause': '暂停',
        'lesson.prev': '上一步',
        'lesson.next': '下一步',
        'lesson.reset': '重置',
        'lesson.replay': '重播',
        'sources.empty': '还没有登记来源。',
        'sources.title': '参考来源',
        'sources.trust': '可信度',
        'sources.export': '导出',
        'sources.exportHint': '导出 Markdown、单文件 HTML 与 JSON 到本机目录。',
        'sources.done': '已导出',
        'sources.directory': '目录',
        'sources.warnings': '构建警告',
        'formula.read': '读法',
        'time.page': '第 {n} 页',
        'time.at': '{n}s',
        'error.offline': '无法连接插件后端',
      },
      en: {
        'view.label': 'Study',
        'app.title': 'Study Tutor',
        'app.subtitle': 'Material · Boundary · Graph · Knowledge base · Lessons',
        'tabs.overview': 'Overview',
        'tabs.material': 'Material',
        'tabs.boundary': 'Boundary',
        'tabs.graph': 'Graph',
        'tabs.kb': 'Knowledge base',
        'tabs.lesson': 'Lessons',
        'tabs.sources': 'Sources & export',
        'empty.title': 'Nothing to study yet',
        'empty.body': 'Drop learning material into the chat, or fill the opening prompt into the composer here and send it.',
        'empty.start': 'Fill the composer',
        'empty.copy': 'Copy the prompt',
        'empty.copied': 'Copied',
        'empty.prompt': 'I want to learn this material. Read it first: ',
        'action.refresh': 'Refresh',
        'action.export': 'Export notes',
        'action.exporting': 'Exporting…',
        'action.search': 'Search',
        'action.retry': 'Retry',
        'action.copyPath': 'Copy path',
        'state.loading': 'Reading the study state…',
        'state.error': 'Could not read the state',
        'stat.materials': 'Material',
        'stat.confirmed': 'Confirmed',
        'stat.gap': 'Gaps',
        'stat.lessons': 'Lessons',
        'stat.chunks': 'Chunks',
        'progress.title': 'Progress',
        'progress.boundary': 'Boundary',
        'progress.graph': 'Graph mastery',
        'next.title': 'Suggested next step',
        'next.empty': 'Read one piece of material first.',
        'caps.title': 'Capabilities',
        'caps.ffmpeg': 'Video frames',
        'caps.pandoc': 'Document conversion',
        'caps.python': 'Python parsing',
        'caps.libreoffice': 'Office rendering',
        'caps.speech': 'Speech recognition',
        'caps.ready': 'ready',
        'caps.missing': 'missing',
        'material.empty': 'No material yet.',
        'material.shots': 'Shots',
        'material.transcript': 'Transcript',
        'material.frames': 'Key frames',
        'material.kind': 'Kind',
        'material.difficulty': 'Difficulty',
        'material.topics': 'Key topics',
        'material.gaps': 'Skipped steps',
        'material.patterns': 'Teaching patterns',
        'boundary.empty': 'No boundary evidence yet.',
        'boundary.locked': 'locked',
        'boundary.open': 'open',
        'boundary.unknown': 'unconfirmed',
        'boundary.level0': 'never heard',
        'boundary.level1': 'can repeat',
        'boundary.level2': 'applies with hints',
        'boundary.level3': 'explains alone',
        'boundary.evidence': 'Evidence',
        'boundary.filter.all': 'All',
        'boundary.filter.low': 'Uncertain',
        'boundary.filter.missing': 'Unconfirmed',
        'graph.empty': 'No knowledge graph yet.',
        'graph.view.dag': 'Dependency graph',
        'graph.view.tree': 'Mind map',
        'graph.onlyGap': 'Gaps only',
        'graph.onlyMaterial': 'From material only',
        'graph.cycle': 'Cycle detected',
        'graph.prereq': 'Prerequisites',
        'graph.unlocks': 'Unlocks',
        'graph.status.ready': 'ready',
        'graph.status.partial': 'partial',
        'graph.status.gap': 'gap',
        'graph.source.material': 'in material',
        'graph.source.prerequisite': 'inferred',
        'graph.selected': 'Selected',
        'graph.none': 'Pick a node to see details.',
        'kb.empty': 'Lock the knowledge boundary to build the vector knowledge base.',
        'kb.build': 'Build the index',
        'kb.searching': 'Searching…',
        'kb.placeholder': 'Ask a question, or type keywords',
        'kb.embedder': 'Embedder',
        'kb.buildAt': 'Built',
        'kb.noResult': 'No hit.',
        'kb.hint': 'Results carry source and page/timestamp coordinates you can cite.',
        'lesson.empty': 'No lessons yet. Once the boundary is locked and the index built, lessons follow the graph order.',
        'lesson.goal': 'Goal',
        'lesson.prereq': 'Prerequisites',
        'lesson.checkAnswer': 'Show answer',
        'lesson.play': 'Play',
        'lesson.pause': 'Pause',
        'lesson.prev': 'Previous',
        'lesson.next': 'Next',
        'lesson.reset': 'Reset',
        'lesson.replay': 'Replay',
        'sources.empty': 'No sources recorded yet.',
        'sources.title': 'Sources',
        'sources.trust': 'Trust',
        'sources.export': 'Export',
        'sources.exportHint': 'Write Markdown, a self-contained HTML file and JSON to a host directory.',
        'sources.done': 'Exported',
        'sources.directory': 'Directory',
        'sources.warnings': 'Build warnings',
        'formula.read': 'Reads as',
        'time.page': 'p.{n}',
        'time.at': '{n}s',
        'error.offline': 'Cannot reach the plugin host',
      },
    }

    // ---------------------------------------------------------------------
    // Styles (theme tokens only)
    // ---------------------------------------------------------------------

    const CSS = `
.dsh-study{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px}
.dsh-study *{box-sizing:border-box}
.dsh-study-head{display:flex;align-items:flex-end;gap:12px;padding:16px 20px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.dsh-study-title{font-size:17px;font-weight:600;letter-spacing:.01em}
.dsh-study-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-study-head-actions{margin-left:auto;display:flex;gap:8px;align-items:center}
.dsh-study-tabs{display:flex;gap:2px;padding:6px 14px 0;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto;overflow-x:auto}
.dsh-study-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;padding:7px 12px;border-radius:8px 8px 0 0;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent}
.dsh-study-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
.dsh-study-tab[data-active=true]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
.dsh-study-body{flex:1 1 auto;min-height:0;overflow:auto;padding:16px 20px 32px}
.dsh-study-btn{appearance:none;font:inherit;font-size:12.5px;border-radius:8px;padding:5px 10px;cursor:pointer;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsh-study-btn:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover-accent, var(--dsw-alias-bg-layer-1))}
/* Primary buttons. The --dsw-alias-brand-primary token is NOT a saturated
   accent in this design system: it resolves to a plain neutral (near-white in
   dark mode, near-black in light mode), which is why painting a button with it
   and writing white text on top produced a completely blank control.

   The reliable pattern is the inverse pair the theme guarantees to contrast
   with each other: fill with label-primary, write in label-primary-inverted.
   In dark mode that is a light button with dark text; in light mode a dark
   button with white text. Never hard-code #fff here. */
.dsh-study-btn[data-kind=primary]{
  background:var(--dsw-alias-label-primary);
  border-color:var(--dsw-alias-label-primary);
  color:var(--dsw-alias-label-primary-inverted, #111);
  font-weight:500;
}
.dsh-study-btn[data-kind=primary]:hover{
  background:var(--dsw-alias-label-primary-dimmed, var(--dsw-alias-label-primary));
  border-color:var(--dsw-alias-label-primary-dimmed, var(--dsw-alias-label-primary));
  color:var(--dsw-alias-label-primary-inverted, #111);
}
.dsh-study-btn[data-kind=primary]:disabled{opacity:.45}
.dsh-study-btn:disabled{opacity:.55;cursor:default}
.dsh-study-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px 14px;margin-bottom:12px}
.dsh-study-card h3{margin:0 0 8px;font-size:14.5px;font-weight:600}
.dsh-study-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dsh-study-tag{display:inline-block;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:19px}
.dsh-study-tag[data-tone=ok]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.dsh-study-tag[data-tone=warn]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.dsh-study-tag[data-tone=err]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dsh-study-muted{color:var(--dsw-alias-label-secondary)}
.dsh-study-small{font-size:12px}
.dsh-study-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.dsh-study-stat{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-1)}
.dsh-study-stat b{display:block;font-size:20px;line-height:1.2}
.dsh-study-stat span{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dsh-study-bar{height:7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin:6px 0 2px}
.dsh-study-bar>i{display:block;height:100%;background:var(--dsw-alias-brand-primary);border-radius:999px}
.dsh-study-list{margin:8px 0 0;padding-left:18px}
.dsh-study-list li{margin:3px 0}
.dsh-study-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:26px 20px;text-align:center;color:var(--dsw-alias-label-secondary)}
.dsh-study-empty b{display:block;color:var(--dsw-alias-label-primary);font-size:15px;margin-bottom:6px}
.dsh-study-error{border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13px}
.dsh-study-input{width:100%;font:inherit;font-size:13px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:8px 11px}
.dsh-study-split{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:14px;align-items:start}
@media (max-width: 860px){.dsh-study-split{grid-template-columns:minmax(0,1fr)}}
.dsh-study-svg{display:block;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
/* Wide graphs scroll sideways instead of shrinking labels into illegibility. */
.dsh-study-graph-scroll{overflow-x:auto;overflow-y:hidden;padding-bottom:6px}
.dsh-study-node{cursor:pointer}
.dsh-study-node:hover rect{stroke-width:2.2}
.dsh-study-level{display:inline-flex;gap:3px;align-items:center}
.dsh-study-level i{width:16px;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-2)}
.dsh-study-level i[data-on=true]{background:var(--dsw-alias-brand-primary)}
.dsh-study-formula{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:9px 12px;margin:9px 0;overflow-x:auto}
.dsh-study-formula .dsh-study-read{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:5px}
.dsh-study-formula img{max-width:100%;height:auto;background:#fff;border-radius:6px;padding:3px}
.dsh-study-table{border-collapse:collapse;width:100%;margin:9px 0;font-size:12.5px}
.dsh-study-table th,.dsh-study-table td{border:1px solid var(--dsw-alias-border-l1);padding:5px 8px;text-align:left}
.dsh-study-table th{background:var(--dsw-alias-bg-layer-2)}
.dsh-study-player{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px;background:var(--dsw-alias-bg-layer-1);margin:10px 0}
.dsh-study-stage{width:100%;display:block;border-radius:9px;background:var(--dsw-alias-bg-layer-2)}
.dsh-study-player-bar{display:flex;gap:7px;align-items:center;margin-top:9px;flex-wrap:wrap}
.dsh-study-dots{display:flex;gap:5px;margin-left:auto}
.dsh-study-dot{width:9px;height:9px;padding:0;border:0;border-radius:50%;background:var(--dsw-alias-bg-layer-2);cursor:pointer;border:1px solid var(--dsw-alias-border-l1)}
.dsh-study-dot[data-on=true]{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dsh-study-caption{margin-top:8px;font-size:12.5px;color:var(--dsw-alias-label-secondary);min-height:1.4em}
.dsh-study-hit{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:9px 11px;margin-top:8px;background:var(--dsw-alias-bg-layer-1)}
.dsh-study-hit .meta{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-bottom:4px}
.dsh-study-lesson{display:grid;grid-template-columns:230px minmax(0,1fr);gap:14px;align-items:start}
@media (max-width: 900px){.dsh-study-lesson{grid-template-columns:minmax(0,1fr)}}
.dsh-study-lesson-list{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:6px;max-height:70vh;overflow:auto}
.dsh-study-lesson-item{display:block;width:100%;text-align:left;border:0;background:transparent;font:inherit;font-size:12.5px;padding:7px 9px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-primary)}
.dsh-study-lesson-item:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-study-lesson-item[data-active=true]{background:var(--dsw-alias-bg-layer-2);font-weight:600}
.dsh-study-code{font-family:ui-monospace,Consolas,monospace;font-size:12px;background:var(--dsw-alias-bg-layer-2);border-radius:6px;padding:1px 5px}
.dsh-study-callout{border-left:3px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-2);border-radius:0 8px 8px 0;padding:8px 12px;margin:9px 0;font-size:13px}
.dsh-study-checkpoint{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:9px 12px;margin:9px 0;font-size:13px}
.dsh-study-checkpoint summary{cursor:pointer;color:var(--dsw-alias-brand-primary)}
.dsh-study-frames{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}
.dsh-study-frames img{height:84px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1)}
.dsh-study-codeblock{white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:12px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:9px 11px;margin:9px 0;overflow-x:auto}
.dsh-study-pill-group{display:inline-flex;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;overflow:hidden}
.dsh-study-pill-group button{appearance:none;border:0;background:transparent;font:inherit;font-size:12px;padding:5px 10px;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.dsh-study-pill-group button[data-active=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-study-loading{padding:28px;text-align:center;color:var(--dsw-alias-label-secondary)}
`

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function clock(seconds) {
      const total = Math.max(0, Math.round(Number(seconds) || 0))
      const minutes = Math.floor(total / 60)
      const secs = total % 60
      const hours = Math.floor(minutes / 60)
      const pad = (value) => String(value).padStart(2, '0')
      return hours > 0 ? `${hours}:${pad(minutes % 60)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`
    }

    async function getJson(url, options) {
      const response = await fetch(url, { credentials: 'same-origin', ...(options || {}) })
      const text = await response.text()
      let payload
      try {
        payload = text ? JSON.parse(text) : {}
      } catch {
        payload = { ok: false, code: 'BAD_RESPONSE', message: text.slice(0, 200) }
      }
      if (!response.ok && payload.ok !== false) payload.ok = false
      return payload
    }

    function postJson(url, body) {
      return getJson(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
    }

    // ── Colour contract ───────────────────────────────────────────────────
    // `--dsw-alias-brand-primary` is NOT a saturated accent in this design
    // system: it resolves to a neutral tone (near-white in dark mode, near-black
    // in light mode). Anything that needs to *fill* a shape and stay legible
    // against the background must therefore use a semantic state/link colour
    // instead. These aliases wrap that decision in one place.
    const SELECT_COLOR = 'var(--dsw-alias-link, var(--dsw-alias-state-success-primary))'
    const CHAIN_COLOR = 'var(--dsw-alias-state-success-primary)'
    const MUTED_FILL = 'var(--dsw-alias-bg-layer-1)'

    function nodeTone(status) {
      if (status === 'ready') return 'var(--dsw-alias-state-success-primary)'
      if (status === 'partial') return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-state-error-primary)'
    }

    function statusTag(t, status) {
      const tone = status === 'ready' ? 'ok' : status === 'partial' ? 'warn' : 'err'
      return h('span', { className: 'dsh-study-tag', 'data-tone': tone }, t(`graph.status.${status || 'gap'}`))
    }

    function levelLabel(t, level) {
      if (level === 0) return t('boundary.level0')
      if (level === 1) return t('boundary.level1')
      if (level === 2) return t('boundary.level2')
      if (level === 3) return t('boundary.level3')
      return t('boundary.unknown')
    }

    function Button(props) {
      return h('button', {
        className: 'dsh-study-btn',
        type: 'button',
        'data-kind': props.kind,
        disabled: props.disabled,
        onClick: props.onClick,
        title: props.title,
      }, props.children)
    }

    function Stat(props) {
      return h('div', { className: 'dsh-study-stat' },
        h('b', null, String(props.value ?? 0)),
        h('span', null, props.label))
    }

    function Progress(props) {
      const ratio = Math.max(0, Math.min(1, Number(props.ratio) || 0))
      return h('div', null,
        h('div', { className: 'dsh-study-row' },
          h('span', { className: 'dsh-study-small' }, props.label),
          h('span', { className: 'dsh-study-small dsh-study-muted', style: { marginLeft: 'auto' } }, `${Math.round(ratio * 100)}%`)),
        h('div', { className: 'dsh-study-bar' }, h('i', { style: { width: `${ratio * 100}%` } })))
    }

    // ---------------------------------------------------------------------
    // Data
    // ---------------------------------------------------------------------

    function useStudyState(sessionId) {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [loading, setLoading] = useState(true)
      const inFlight = useRef(false)
      // Bumped on every session change and unmount, so a response that arrives
      // after the component is gone (or after the session switched) cannot
      // write state. `inFlight` alone let an in-flight request land post-unmount.
      const generation = useRef(0)

      const load = useCallback(async () => {
        if (!sessionId || inFlight.current) return
        const token = generation.current
        inFlight.current = true
        try {
          const payload = await getJson(`/plugins/ds-study/state?sessionId=${encodeURIComponent(sessionId)}`)
          if (token !== generation.current) return
          if (payload.ok) {
            setData(payload)
            setError(null)
          } else {
            setError(payload)
          }
        } catch (failure) {
          if (token !== generation.current) return
          setError({ code: 'NETWORK', message: String(failure && failure.message ? failure.message : failure) })
        } finally {
          if (token === generation.current) {
            inFlight.current = false
            setLoading(false)
          }
        }
      }, [sessionId])

      useEffect(() => {
        let disposed = false
        generation.current += 1
        inFlight.current = false
        setLoading(true)
        load()
        const timer = setInterval(() => {
          if (disposed) return
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          load()
        }, 2000)
        const onVisible = () => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') load()
        }
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
        if (typeof window !== 'undefined') window.addEventListener('focus', onVisible)
        return () => {
          disposed = true
          generation.current += 1
          inFlight.current = false
          clearInterval(timer)
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
          if (typeof window !== 'undefined') window.removeEventListener('focus', onVisible)
        }
      }, [load])

      return { data, error, loading, reload: load }
    }

    /** Convert LaTeX to MathML through the host, caching per formula. */
    function useMathml(items) {
      const [map, setMap] = useState({})
      const pending = useRef(new Set())
      const unresolved = useRef([])
      // A stable content key: `items` is a fresh array on every render, so
      // depending on its identity re-ran this effect (and cancelled the
      // in-flight request) on each 2s state poll, and MathML never landed.
      // The key changes only when the set of still-unconverted formulas does.
      const wanted = []
      for (const item of items || []) {
        const latex = item && item.latex
        if (!latex || item.mathml) continue
        if (map[latex] || pending.current.has(latex)) continue
        wanted.push(latex)
      }
      unresolved.current = wanted
      const key = wanted.join('\u0000')
      useEffect(() => {
        const missing = unresolved.current
        if (missing.length === 0) return undefined
        let cancelled = false
        for (const latex of missing) pending.current.add(latex)
        postJson('/plugins/dsh-study/formulas', { items: missing.map((latex, index) => ({ id: `c${index}`, latex })) })
          .then((payload) => {
            if (cancelled || !payload.ok || !Array.isArray(payload.items)) return
            const next = {}
            for (const item of payload.items) if (item.mathml) next[item.latex] = item.mathml
            if (Object.keys(next).length > 0) setMap((previous) => ({ ...previous, ...next }))
          })
          .catch(() => {})
          .finally(() => {
            for (const latex of missing) pending.current.delete(latex)
          })
        // Cancel only when this batch is superseded by unmount; a re-render
        // with the same outstanding set reuses the same key and keeps it.
        return () => {
          cancelled = true
          for (const latex of missing) pending.current.delete(latex)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [key])
      return map
    }

    // ---------------------------------------------------------------------
    // Formula
    // ---------------------------------------------------------------------

    function Formula(props) {
      const { item, mathml, t } = props
      const markup = item.mathml || mathml
      return h('div', { className: 'dsh-study-formula' },
        markup
          ? h('div', { dangerouslySetInnerHTML: { __html: markup } })
          : h('div', { className: 'dsh-study-code' }, item.latex || ''),
        item.read ? h('div', { className: 'dsh-study-read' }, `${t('formula.read')}: ${item.read}`) : null)
    }

    // ---------------------------------------------------------------------
    // Animation player
    // ---------------------------------------------------------------------

    function FrameStage(props) {
      const { frame, width, height } = props
      const scale = 10
      const viewW = 100
      const viewH = 60
      // Two animation players (or a lesson page and a preview) render on the
      // same document; a fixed marker id made every `url(#…)` resolve to
      // whichever `<defs>` mounted first.
      const markerId = useMemo(() => `dsh-study-arrow-${Math.random().toString(36).slice(2, 9)}`, [])
      const elements = (frame && frame.elements) || []
      const children = elements.map((element, index) => {
        const tone = element.tone === 'ok'
          ? 'var(--dsw-alias-state-success-primary)'
          : element.tone === 'warn'
            ? 'var(--dsw-alias-state-warn-primary)'
            : element.tone === 'error'
              ? 'var(--dsw-alias-state-error-primary)'
              : element.tone === 'idle'
                ? 'var(--dsw-alias-state-idle-primary)'
                : 'var(--dsw-alias-label-primary)'
        const key = `e${index}`
        if (element.kind === 'box' || element.kind === 'badge') {
          const w = Number(element.w || 18)
          const ht = Number(element.h || 9)
          return h('g', { key },
            h('rect', {
              x: element.x, y: element.y, width: w, height: ht,
              rx: element.kind === 'badge' ? 5 : 2,
              fill: 'none', stroke: tone, strokeWidth: 0.5,
            }),
            element.label
              ? h('text', {
                x: Number(element.x) + w / 2, y: Number(element.y) + ht / 2 + 1.1,
                textAnchor: 'middle', fontSize: 2.9, fill: tone,
              }, element.label)
              : null)
        }
        if (element.kind === 'circle') {
          return h('g', { key },
            h('circle', { cx: element.x, cy: element.y, r: Number(element.r || 4), fill: 'none', stroke: tone, strokeWidth: 0.5 }),
            element.label
              ? h('text', { x: element.x, y: Number(element.y) + 1, textAnchor: 'middle', fontSize: 2.6, fill: tone }, element.label)
              : null)
        }
        if (element.kind === 'text') {
          return h('text', {
            key, x: element.x, y: element.y, fontSize: Number(element.size || 3), fill: tone,
          }, element.label || '')
        }
        if (element.kind === 'arrow' || element.kind === 'line') {
          const x2 = element.x2 != null ? element.x2 : Number(element.x) + 12
          const y2 = element.y2 != null ? element.y2 : element.y
          return h('line', {
            key,
            x1: element.x, y1: element.y, x2, y2,
            stroke: tone, strokeWidth: 0.55,
            markerEnd: element.kind === 'arrow' ? `url(#${markerId})` : undefined,
          })
        }
        return null
      })
      return h('svg', {
        className: 'dsh-study-stage',
        viewBox: `0 0 ${viewW} ${viewH}`,
        role: 'img',
        'aria-label': (frame && (frame.title || frame.caption)) || 'animation frame',
        style: { aspectRatio: '100 / 60' },
      },
      h('defs', null,
        h('marker', {
          id: markerId, markerWidth: 6, markerHeight: 6, refX: 5, refY: 3, orient: 'auto',
        }, h('path', { d: 'M0,0 L6,3 L0,6 z', fill: 'var(--dsw-alias-label-secondary)' }))),
      children)
    }


    // ---------------------------------------------------------------------
    // Lesson blocks
    // ---------------------------------------------------------------------

    function LessonBlocks(props) {
      const { blocks, mathmlMap, t } = props
      const nodes = []
      let listBuffer = []
      const flushList = () => {
        if (listBuffer.length === 0) return
        nodes.push(h('ul', { className: 'dsh-study-list', key: `list-${nodes.length}` },
          listBuffer.map((item, index) => h('li', { key: index }, item))))
        listBuffer = []
      }
      for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index] || {}
        if (block.kind !== 'list') flushList()
        if (block.kind === 'heading') {
          nodes.push(h('h3', { key: index }, block.text || ''))
        } else if (block.kind === 'formula') {
          nodes.push(h(Formula, { key: index, item: { ...block, mathml: block.mathml || mathmlMap[block.latex] }, t }))
        } else if (block.kind === 'image') {
          const source = block.src || block.data
          if (source) nodes.push(h('p', { key: index }, h('img', { src: source, alt: block.alt || '', style: { maxWidth: '100%', borderRadius: 8 } })))
        } else if (block.kind === 'table') {
          const rows = block.rows || []
          nodes.push(h('table', { className: 'dsh-study-table', key: index },
            rows.length > 0 ? h('thead', null, h('tr', null, (rows[0] || []).map((cell, cellIndex) => h('th', { key: cellIndex }, cell)))) : null,
            h('tbody', null, rows.slice(1).map((row, rowIndex) => h('tr', { key: rowIndex }, (row || []).map((cell, cellIndex) => h('td', { key: cellIndex }, cell)))))))
        } else if (block.kind === 'list') {
          for (const item of block.items || String(block.text || '').split('\n')) listBuffer.push(item)
        } else if (block.kind === 'checkpoint') {
          nodes.push(h('details', { className: 'dsh-study-checkpoint', key: index },
            h('summary', null, block.text || block.question || ''),
            block.answer ? h('p', null, block.answer) : null))
        } else if (block.kind === 'callout') {
          nodes.push(h('div', { className: 'dsh-study-callout', key: index }, block.text || ''))
        } else if (block.kind === 'code') {
          nodes.push(h('pre', { className: 'dsh-study-codeblock', key: index }, block.text || ''))
        } else {
          nodes.push(h('p', { key: index, style: { margin: '8px 0', lineHeight: 1.75 } }, block.text || ''))
        }
      }
      flushList()
      return h('div', null, nodes)
    }

    /** Normalise a lesson section into blocks, including the legacy body form. */
    function sectionBlocks(section) {
      if (!section) return []
      if (Array.isArray(section.blocks) && section.blocks.length > 0) return section.blocks
      const body = typeof section.body === 'string' ? section.body : ''
      if (!body.trim()) {
        return section.kind === 'checkpoint'
          ? [{ kind: 'checkpoint', text: section.question || '', answer: section.answer }]
          : []
      }
      const blocks = []
      const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
      let cursor = 0
      let match
      while ((match = pattern.exec(body)) !== null) {
        const before = body.slice(cursor, match.index).trim()
        if (before) blocks.push({ kind: 'para', text: before })
        const latex = (match[1] || match[2] || '').trim()
        if (latex) blocks.push({ kind: 'formula', latex, display: Boolean(match[1]) })
        cursor = match.index + match[0].length
      }
      const rest = body.slice(cursor).trim()
      if (rest) blocks.push({ kind: 'para', text: rest })
      return blocks
    }

    function allLessonFormulas(lessons) {
      const items = []
      for (const lesson of lessons || []) {
        for (const section of lesson.sections || []) {
          for (const block of sectionBlocks(section)) {
            if (block.kind === 'formula' && block.latex) items.push({ latex: block.latex, mathml: block.mathml })
          }
        }
      }
      return items
    }

    // ---------------------------------------------------------------------
    // Graph
    // ---------------------------------------------------------------------

    function layering(nodes, edges) {
      const incoming = new Map(nodes.map((node) => [node.id, 0]))
      const outgoing = new Map(nodes.map((node) => [node.id, []]))
      for (const edge of edges || []) {
        if (!incoming.has(edge.to) || !outgoing.has(edge.from)) continue
        incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1)
        outgoing.get(edge.from).push(edge.to)
      }
      // Kahn's algorithm. The queue must drain: a node is dequeued at most
      // once, and the count is decremented before it can be re-queued. Without
      // that, a cycle reachable from a root re-enqueued its members forever
      // (bounded only by the guard), inflating the layer index each round.
      const depth = new Map()
      const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id)
      for (const id of queue) depth.set(id, 0)
      let head = 0
      while (head < queue.length) {
        const id = queue[head]
        head += 1
        for (const next of outgoing.get(id) || []) {
          const candidate = (depth.get(id) || 0) + 1
          if (candidate > (depth.get(next) ?? 0)) depth.set(next, candidate)
          const remaining = (incoming.get(next) || 0) - 1
          incoming.set(next, remaining)
          // Enqueue only when every prerequisite has been placed, so each
          // node enters the queue exactly once.
          if (remaining === 0) queue.push(next)
        }
      }
      // Nodes left over sit on or behind a cycle: place them one layer below
      // their deepest placed prerequisite rather than dropping them.
      const fallback = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
      for (const node of nodes) {
        if (depth.has(node.id)) continue
        let level = fallback
        for (const edge of edges || []) {
          if (edge.to !== node.id || !depth.has(edge.from)) continue
          level = Math.max(level, (depth.get(edge.from) || 0) + 1)
        }
        depth.set(node.id, level)
      }
      const layers = []
      for (const node of nodes) {
        const level = depth.get(node.id) ?? fallback
        layers[level] = layers[level] || []
        layers[level].push(node)
      }
      return layers.filter(Boolean)
    }

    function GraphView(props) {
      const { state, t, selected, onSelect } = props
      const nodes = (state.graph && state.graph.nodes) || []
      const edges = (state.graph && state.graph.edges) || []
      const [onlyGap, setOnlyGap] = useState(false)
      const [onlyMaterial, setOnlyMaterial] = useState(false)
      const [mode, setMode] = useState('dag')
      // Unique per mounted graph, so a second graph on the page cannot steal
      // the edge-marker definition through a duplicated element id.
      const edgeMarkerId = useMemo(() => `dsh-study-graph-arrow-${Math.random().toString(36).slice(2, 9)}`, [])
      // A second marker for edges on the selected concept's critical path: the
      // arrowhead must match the line colour or the path looks broken.
      const edgeMarkerStrongId = useMemo(() => `dsh-study-graph-arrow-strong-${Math.random().toString(36).slice(2, 9)}`, [])

      const filtered = useMemo(() => {
        let list = nodes
        if (onlyGap) list = list.filter((node) => node.status !== 'ready')
        if (onlyMaterial) list = list.filter((node) => node.source !== 'prerequisite')
        // Large graphs default to the gaps, but only while the user has not
        // asked for something themselves: silently overriding an explicit
        // filter made the toggle look broken.
        if (list.length > 120 && !onlyGap && !onlyMaterial) list = list.filter((node) => node.status !== 'ready')
        return list
      }, [nodes, onlyGap, onlyMaterial])

      const visible = useMemo(() => new Set(filtered.map((node) => node.id)), [filtered])
      const visibleEdges = useMemo(() => (edges || []).filter((edge) => visible.has(edge.from) && visible.has(edge.to)), [edges, visible])
      const layers = useMemo(() => layering(filtered, visibleEdges), [filtered, visibleEdges])
      const cycles = useMemo(() => findCycles(nodes, edges), [nodes, edges])

      // ── Layout ────────────────────────────────────────────────────────────
      // Every size below is derived from the labels, not guessed. The previous
      // version used fixed 164x34 boxes on a 960-wide canvas with labels cut to
      // 20 characters: Chinese labels are ~13px per glyph, so a 20-character
      // label needed ~260px and spilled straight out of its box, and layers with
      // many nodes on the first/last column were clipped by the viewBox.
      const NODE_FONT = 12
      const NODE_PAD_X = 12
      const NODE_H = 34
      const COL_GAP = 26
      const ROW_GAP = 58
      const MARGIN = 16

      // Approximate rendered width: CJK/fullwidth glyphs are ~1em, Latin ~0.55em.
      const textWidth = (value) => {
        let units = 0
        for (const ch of String(value)) {
          const cp = ch.codePointAt(0)
          const wide =
            (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) ||
            (cp >= 0x3041 && cp <= 0x33ff) || (cp >= 0x3400 && cp <= 0x4dbf) ||
            (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
            (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
            (cp >= 0xffe0 && cp <= 0xffe6)
          units += wide ? 1 : 0.55
        }
        return Math.ceil(units * NODE_FONT)
      }

      // Wrap a label into at most `maxLines` lines of at most `maxWidth` px.
      // Prefer breaking at a natural boundary (space, punctuation, or before an
      // ASCII word) so a label never splits mid-token like "T / X 接 RX".
      const WRAP_BREAK = /[\s、，。：；（）()·—→]/
      const wrapLabel = (value, maxWidth, maxLines) => {
        const chars = Array.from(String(value || ''))
        const lines = []
        let start = 0
        for (let line = 0; line < maxLines; line += 1) {
          let end = start
          while (end < chars.length && textWidth(chars.slice(start, end + 1).join('')) <= maxWidth) end += 1
          if (end >= chars.length) {
            lines.push(chars.slice(start).join(''))
            start = chars.length
            break
          }
          if (line === maxLines - 1) {
            // Last allowed line: hard-truncate and ellipsise.
            let cut = end
            while (cut > start + 1 && textWidth(chars.slice(start, cut).join('') + '…') > maxWidth) cut -= 1
            lines.push(chars.slice(start, cut).join('') + '…')
            start = chars.length
            break
          }
          // Back off to the best natural break point that still fits.
          let best = -1
          for (let probe = end; probe > start + 1; probe -= 1) {
            if (WRAP_BREAK.test(chars[probe - 1])) { best = probe; break }
          }
          if (best > start + 1 && /[A-Za-z0-9]/.test(chars[best])) {
            let wordStart = best
            while (wordStart > start && /[A-Za-z0-9]/.test(chars[wordStart - 1])) wordStart -= 1
            if (wordStart > start + 1) best = wordStart
          }
          const cut = best > start + 1 ? best : end
          lines.push(chars.slice(start, cut).join(''))
          start = cut
          if (chars[start] === ' ') start += 1
        }
        if (lines.length === 0) lines.push('')
        return lines
      }

      // Each node is sized to its own wrapped label instead of a fixed label
      // column: most concept names are short, so a uniform width wasted
      // horizontal space and blew the canvas out past 2000px on a 21-node graph.
      const LABEL_MAX_W = 190
      const LABEL_LINES = 2
      const LINE_H = 15
      const NODE_H_TALL = NODE_H + (LABEL_LINES - 1) * LINE_H

      const measured = new Map()
      for (const node of filtered) {
        const lines = wrapLabel(node.label || node.id, LABEL_MAX_W, LABEL_LINES)
        const labelW = Math.max(...lines.map(textWidth), 24)
        measured.set(node.id, {
          lines,
          w: labelW + NODE_PAD_X * 2,
          h: lines.length > 1 ? NODE_H_TALL : NODE_H,
        })
      }
      const nodeWidth = (node) => measured.get(node.id)?.w || (NODE_PAD_X * 2 + 60)
      const nodeHeight = (node) => measured.get(node.id)?.h || NODE_H

      // Usable content width. The margin is excluded here because canvasWidth
      // adds it back; counting it twice let a full-width row poke past the edge.
      const MAX_ROW_W = 980 - MARGIN * 2
      // Plan the visual rows up-front: a many-root layer (this graph has six)
      // wraps into sub-rows. Both the canvas size AND the placement below must
      // use this same plan, otherwise rows run past the viewBox.
      const rowPlan = layers.map((layer) => {
        const rows = []
        let row = []
        let rowW = 0
        for (const node of layer) {
          const w = nodeWidth(node)
          const extra = row.length === 0 ? w : COL_GAP + w
          if (row.length > 0 && rowW + extra > MAX_ROW_W) {
            rows.push({ nodes: row, width: rowW })
            row = [node]
            rowW = w
          } else {
            row.push(node)
            rowW += extra
          }
        }
        if (row.length > 0) rows.push({ nodes: row, width: rowW })
        return rows
      })

      // A row's width must be EXACTLY the span the placement loop walks:
      // sum(node widths) + gap*(n-1). Recomputing it here (instead of trusting
      // the running total above) keeps wrapping and centring in lockstep.
      for (const rows of rowPlan) {
        for (const item of rows) {
          item.width = item.nodes.reduce((sum, node, index) => sum + nodeWidth(node) + (index === 0 ? 0 : COL_GAP), 0)
        }
      }

      // The wrap budget and the canvas width MUST agree. Deriving canvasWidth
      // from the widest *actual* row while wrapping against MAX_ROW_W let a row
      // exceed the canvas it was centred in, pushing its last nodes past the
      // viewBox — that was the clipped top-right row.
      const allRows = rowPlan.reduce((all, rows) => all.concat(rows), [])
      const widestRow = Math.max(1, ...allRows.map((r) => r.width))
      const canvasWidth = Math.max(420, Math.max(widestRow, Math.min(MAX_ROW_W, widestRow))) + MARGIN * 2

      // Sum the real height of every visual row (multi-line nodes are taller).
      let contentHeight = 0
      let rowCount = 0
      for (const rows of rowPlan) {
        for (const item of rows) {
          const tallest = Math.max(NODE_H, ...item.nodes.map(nodeHeight))
          contentHeight += tallest
          rowCount += 1
        }
      }
      const height = Math.max(
        220,
        contentHeight + (ROW_GAP / 2) * Math.max(0, rowCount - 1) + MARGIN * 2,
      )

      const positions = new Map()
      // A layer with many roots (this graph has six) makes one extremely wide
      // row that forces the whole canvas wide. Wrap such a layer into visual
      // sub-rows so the drawing stays compact and the text stays readable.
      // Reuses `rowPlan`, so placement and sizing can never disagree.
      let cursorY = MARGIN
      for (const rows of rowPlan) {
        for (const item of rows) {
          // Each sub-row is centred and sized by its own tallest node.
          const tallest = Math.max(NODE_H, ...item.nodes.map(nodeHeight))
          let cursorX = (canvasWidth - item.width) / 2
          for (const node of item.nodes) {
            const w = nodeWidth(node)
            const h = nodeHeight(node)
            positions.set(node.id, { x: cursorX + w / 2, y: cursorY + tallest / 2, w, h })
            cursorX += w + COL_GAP
          }
          cursorY += tallest + ROW_GAP / 2
        }
      }

      const selectedNode = nodes.find((node) => node.id === selected)
      const prereq = selected ? visibleEdges.filter((edge) => edge.to === selected).map((edge) => edge.from) : []
      const unlocks = selected ? visibleEdges.filter((edge) => edge.from === selected).map((edge) => edge.to) : []
      const chain = useMemo(() => {
        if (!selected) return new Set()
        const set = new Set([selected])
        let changed = true
        while (changed) {
          changed = false
          for (const edge of visibleEdges) {
            if (set.has(edge.to) && !set.has(edge.from)) {
              set.add(edge.from)
              changed = true
            }
          }
        }
        return set
      }, [selected, visibleEdges])

      const renderTree = () => {
        const childrenOf = (id) => visibleEdges.filter((edge) => edge.from === id).map((edge) => edge.to)
        const roots = filtered.filter((node) => visibleEdges.filter((edge) => edge.to === node.id).length === 0)
        const seen = new Set()
        const rows = []
        const walk = (id, depth) => {
          if (seen.has(id)) return
          seen.add(id)
          const node = filtered.find((item) => item.id === id)
          if (!node) return
          rows.push(h('div', {
            key: `${id}-${depth}`,
            style: { paddingLeft: depth * 16, margin: '3px 0', cursor: 'pointer' },
            onClick: () => onSelect(id),
          },
          h('span', { className: 'dsh-study-tag', 'data-tone': node.status === 'ready' ? 'ok' : node.status === 'partial' ? 'warn' : 'err' }, t(`graph.status.${node.status || 'gap'}`)),
          ' ',
          h('span', { style: { marginLeft: 6, fontWeight: selected === id ? 600 : 400 } }, node.label || node.id)))
          for (const next of childrenOf(id)) walk(next, depth + 1)
        }
        for (const root of roots) walk(root.id, 0)
        for (const node of filtered) walk(node.id, 0)
        return h('div', null, rows)
      }

      return h('div', { className: 'dsh-study-split' },
        h('div', null,
          h('div', { className: 'dsh-study-row', style: { marginBottom: 10 } },
            h('span', { className: 'dsh-study-pill-group' },
              h('button', { type: 'button', 'data-active': mode === 'dag', onClick: () => setMode('dag') }, t('graph.view.dag')),
              h('button', { type: 'button', 'data-active': mode === 'tree', onClick: () => setMode('tree') }, t('graph.view.tree'))),
            h(Button, { onClick: () => setOnlyGap((value) => !value) }, `${t('graph.onlyGap')}${onlyGap ? ' ✓' : ''}`),
            h(Button, { onClick: () => setOnlyMaterial((value) => !value) }, `${t('graph.onlyMaterial')}${onlyMaterial ? ' ✓' : ''}`),
            cycles.length > 0 ? h('span', { className: 'dsh-study-tag', 'data-tone': 'err' }, t('graph.cycle')) : null),
          filtered.length === 0
            ? h('div', { className: 'dsh-study-empty' }, t('graph.empty'))
            : mode === 'tree'
              ? h('div', { className: 'dsh-study-card' }, renderTree())
              : h('div', { className: 'dsh-study-graph-scroll' }, h('svg', {
                className: 'dsh-study-svg',
                viewBox: `0 0 ${canvasWidth} ${height}`,
                // Fill the column while keeping the aspect ratio: the drawing
                // must never be wider than its container (that clipped the top
                // row) and must never crop vertically either.
                preserveAspectRatio: 'xMidYMid meet',
                style: { width: '100%', height: 'auto', display: 'block' },
                role: 'img',
                'aria-label': 'knowledge graph',
              },
                h('defs', null,
                  h('marker', {
                    id: edgeMarkerId, markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto',
                  }, h('path', { d: 'M0,0 L6,3 L0,6 z', fill: 'var(--dsw-alias-border-l2)' })),
                  h('marker', {
                    id: edgeMarkerStrongId, markerWidth: 9, markerHeight: 9, refX: 7, refY: 3.2, orient: 'auto',
                  }, h('path', { d: 'M0,0 L6,3 L0,6 z', fill: 'var(--dsw-alias-state-success-primary)' }))),
                visibleEdges.map((edge, index) => {
                  const from = positions.get(edge.from)
                  const to = positions.get(edge.to)
                  if (!from || !to) return null
                  // Light every edge on the selected concept's prerequisite
                  // CHAIN, not just the edges touching it. The old rule lit only
                  // direct neighbours, so clicking a deep concept lit a handful
                  // of boxes with the connecting lines still grey — the path you
                  // actually have to learn was invisible.
                  const onChain = Boolean(selected) && chain.has(edge.from) && chain.has(edge.to)
                  const isDirect = Boolean(selected) && (edge.from === selected || edge.to === selected)
                  const active = onChain || isDirect
                  const fromY = from.y + from.h / 2
                  const toY = to.y - to.h / 2
                  const midY = (fromY + toY) / 2
                  return h('path', {
                    key: `edge-${index}`,
                    d: `M${from.x},${fromY} C${from.x},${midY} ${to.x},${midY} ${to.x},${toY}`,
                    fill: 'none',
                    stroke: active
                      ? (isDirect ? SELECT_COLOR : CHAIN_COLOR)
                      : 'var(--dsw-alias-border-l2)',
                    strokeWidth: active ? (isDirect ? 2.4 : 1.8) : 1.2,
                    opacity: selected ? (active ? 1 : 0.25) : 1,
                    strokeDasharray: active && !isDirect ? '5 3' : undefined,
                    markerEnd: `url(#${isDirect ? edgeMarkerStrongId : edgeMarkerId})`,
                  })
                }),
                filtered.map((node) => {
                  const position = positions.get(node.id)
                  if (!position) return null
                  const isSelected = selected === node.id
                  // Only fade what the selection is *not* related to. Ancestors
                  // (the prerequisite chain), direct neighbours and the node
                  // itself all stay legible — the old rule dimmed everything
                  // outside the ancestor chain, so downstream concepts looked
                  // disabled the moment you clicked anything.
                  const onChain = chain.has(node.id)
                  const related = isSelected || onChain || prereq.includes(node.id) || unlocks.includes(node.id)
                  const dim = Boolean(selected) && !related
                  // A lit ancestor gets its own treatment: it is what the
                  // student must actually learn first, so it must not look like
                  // an ordinary node next to the highlighted path.
                  const isChainNode = Boolean(selected) && !isSelected && onChain
                  const lines = measured.get(node.id)?.lines || [String(node.label || node.id)]
                  const lineH = 15
                  const firstLineY = position.y - ((lines.length - 1) * lineH) / 2 + 4
                  return h('g', {
                    key: node.id,
                    className: 'dsh-study-node',
                    opacity: dim ? 0.32 : 1,
                    onClick: () => onSelect(node.id),
                  },
                  // A selected node carries a halo so the click target is
                  // unmistakable, regardless of its status colour.
                  isSelected
                    ? h('rect', {
                      x: position.x - position.w / 2 - 4,
                      y: position.y - position.h / 2 - 4,
                      width: position.w + 8,
                      height: position.h + 8,
                      rx: 12,
                      fill: 'none',
                      stroke: SELECT_COLOR,
                      strokeWidth: 2,
                      opacity: 0.6,
                    })
                    : null,
                  h('rect', {
                    x: position.x - position.w / 2,
                    y: position.y - position.h / 2,
                    width: position.w,
                    height: position.h,
                    rx: 9,
                    fill: isSelected ? SELECT_COLOR : 'var(--dsw-alias-bg-layer-1)',
                    fillOpacity: isSelected ? 0.18 : (isChainNode ? 0.10 : 1),
                    stroke: isSelected ? SELECT_COLOR : (isChainNode ? CHAIN_COLOR : nodeTone(node.status)),
                    strokeWidth: isSelected ? 2.4 : (isChainNode ? 2 : 1.5),
                  }),
                  h('text', {
                    x: position.x,
                    y: firstLineY,
                    textAnchor: 'middle',
                    fontSize: NODE_FONT,
                    fontWeight: isSelected || isChainNode ? 600 : 400,
                    fill: 'var(--dsw-alias-label-primary)',
                  }, lines.map((line, lineIndex) => h('tspan', {
                    key: lineIndex,
                    x: position.x,
                    dy: lineIndex === 0 ? 0 : lineH,
                  }, line))))
                }))),
          h('div', { className: 'dsh-study-row dsh-study-small dsh-study-muted', style: { marginTop: 8 } },
            h('span', null, `${filtered.length}/${nodes.length}`),
            h('span', null, `${visibleEdges.length} →`))),
        h('div', { className: 'dsh-study-card' },
          selectedNode
            ? h('div', null,
              h('h3', null, selectedNode.label || selectedNode.id),
              h('div', { className: 'dsh-study-row', style: { marginBottom: 6 } },
                statusTag(t, selectedNode.status),
                h('span', { className: 'dsh-study-tag' }, t(`graph.source.${selectedNode.source || 'material'}`))),
              selectedNode.summary ? h('p', { className: 'dsh-study-small' }, selectedNode.summary) : null,
              prereq.length > 0
                ? h('div', { className: 'dsh-study-small' }, h('b', null, `${t('graph.prereq')}: `), prereq.map((id) => nodeLabel(nodes, id)).join('、'))
                : null,
              unlocks.length > 0
                ? h('div', { className: 'dsh-study-small', style: { marginTop: 4 } }, h('b', null, `${t('graph.unlocks')}: `), unlocks.map((id) => nodeLabel(nodes, id)).join('、'))
                : null)
            : h('div', { className: 'dsh-study-muted dsh-study-small' }, t('graph.none'))))
    }

    function nodeLabel(nodes, id) {
      const found = (nodes || []).find((node) => node.id === id)
      return found ? found.label || found.id : id
    }

    function findCycles(nodes, edges) {
      const adjacency = new Map((nodes || []).map((node) => [node.id, []]))
      for (const edge of edges || []) {
        if (adjacency.has(edge.from)) adjacency.get(edge.from).push(edge.to)
      }
      const status = new Map()
      const cycles = []
      const visit = (id, stack) => {
        if (status.get(id) === 'done') return
        if (status.get(id) === 'open') {
          cycles.push(stack.slice(stack.indexOf(id)).join('→'))
          return
        }
        status.set(id, 'open')
        for (const next of adjacency.get(id) || []) visit(next, [...stack, next])
        status.set(id, 'done')
      }
      for (const node of nodes || []) visit(node.id, [node.id])
      return cycles
    }

    // ---------------------------------------------------------------------
    // Tabs
    // ---------------------------------------------------------------------

    function OverviewTab(props) {
      const { state, capabilities, speech, t, onTab } = props
      const coverage = state.coverage || { total: 0, confirmed: 0, ratio: 0 }
      const stats = state.graphStats || { total: 0, ready: 0, partial: 0, gap: 0 }
      const mastery = stats.total > 0 ? (stats.ready + stats.partial * 0.5) / stats.total : 0
      const focus = ((state.graph && state.graph.focus) || []).slice(0, 5)
      const lessons = (state.lessons || []).length
      const chunks = state.index && state.index.chunks ? state.index.chunks : 0
      const next = focus.length > 0
        ? focus.map((id) => nodeLabel((state.graph && state.graph.nodes) || [], id)).join(' → ')
        : t('next.empty')
      return h('div', null,
        h('div', { className: 'dsh-study-grid', style: { marginBottom: 14 } },
          h(Stat, { label: t('stat.materials'), value: (state.materials || []).length }),
          h(Stat, { label: t('stat.confirmed'), value: `${coverage.confirmed}/${coverage.total}` }),
          h(Stat, { label: t('stat.gap'), value: stats.gap }),
          h(Stat, { label: t('stat.lessons'), value: lessons }),
          h(Stat, { label: t('stat.chunks'), value: chunks })),
        h('div', { className: 'dsh-study-card' },
          h('h3', null, t('progress.title')),
          h(Progress, { label: t('progress.boundary'), ratio: coverage.ratio || 0 }),
          h(Progress, { label: t('progress.graph'), ratio: mastery })),
        h('div', { className: 'dsh-study-card' },
          h('h3', null, t('next.title')),
          h('div', { className: 'dsh-study-small' }, next),
          focus.length > 0 ? h('div', { className: 'dsh-study-row', style: { marginTop: 8 } }, focus.map((id) => h('span', { key: id, className: 'dsh-study-tag' }, nodeLabel((state.graph && state.graph.nodes) || [], id)))) : null),
        h('div', { className: 'dsh-study-card' },
          h('h3', null, t('caps.title')),
          h('div', { className: 'dsh-study-row' },
            capabilityTag(t, t('caps.ffmpeg'), capabilities && capabilities.ffmpeg),
            capabilityTag(t, t('caps.pandoc'), capabilities && capabilities.pandoc),
            capabilityTag(t, t('caps.python'), capabilities && capabilities.python),
            capabilityTag(t, t('caps.libreoffice'), capabilities && capabilities.libreoffice),
            capabilityTag(t, t('caps.speech'), Boolean(speech && speech.available)))),
        (state.materials || []).length === 0
          ? h('div', { className: 'dsh-study-empty' }, h('b', null, t('material.empty')))
          : null,
        h('div', { className: 'dsh-study-row', style: { marginTop: 6 } },
          h(Button, { onClick: () => onTab('material') }, t('tabs.material')),
          h(Button, { onClick: () => onTab('boundary') }, t('tabs.boundary')),
          h(Button, { onClick: () => onTab('graph') }, t('tabs.graph')),
          h(Button, { onClick: () => onTab('lesson') }, t('tabs.lesson'))))
    }

    function capabilityTag(t, label, ok) {
      return h('span', { className: 'dsh-study-tag', 'data-tone': ok ? 'ok' : 'err' }, `${label}: ${ok ? t('caps.ready') : t('caps.missing')}`)
    }

    function MaterialTab(props) {
      const { state, t, sessionId } = props
      const materials = state.materials || []
      const patterns = state.teachingPatterns || []
      const [openId, setOpenId] = useState(null)
      if (materials.length === 0) return h('div', { className: 'dsh-study-empty' }, h('b', null, t('material.empty')))
      return h('div', null,
        materials.map((material) => {
          const open = openId === (material.id || material.title)
          return h('div', { className: 'dsh-study-card', key: material.id || material.title },
            h('div', { className: 'dsh-study-row' },
              h('h3', { style: { margin: 0 } }, material.title || material.id),
              material.kind ? h('span', { className: 'dsh-study-tag' }, `${t('material.kind')}: ${material.kind}`) : null,
              material.difficulty ? h('span', { className: 'dsh-study-tag' }, `${t('material.difficulty')}: ${material.difficulty}`) : null,
              h('span', { style: { marginLeft: 'auto' } },
                h(Button, { onClick: () => setOpenId(open ? null : (material.id || material.title)) }, open ? '▾' : '▸'))),
            material.summary ? h('p', { className: 'dsh-study-small', style: { margin: '8px 0' } }, material.summary) : null,
            Array.isArray(material.keyTopics) && material.keyTopics.length > 0
              ? h('div', { className: 'dsh-study-row' }, material.keyTopics.map((topic, index) => h('span', { key: index, className: 'dsh-study-tag' }, topic)))
              : null,
            Array.isArray(material.gaps) && material.gaps.length > 0
              ? h('div', { style: { marginTop: 8 } },
                h('b', { className: 'dsh-study-small' }, `${t('material.gaps')}:`),
                h('ul', { className: 'dsh-study-list' }, material.gaps.map((gap, index) => h('li', { key: index, className: 'dsh-study-small' }, gap))))
              : null,
            open ? h('div', { style: { marginTop: 8 } },
              material.source ? h('div', { className: 'dsh-study-small dsh-study-muted' }, material.source) : null,
              material.artifacts ? h('div', { className: 'dsh-study-small dsh-study-muted' }, material.artifacts) : null,
              h(ArtifactsPanel, { material, t, sessionId })) : null)
        }),
        patterns.length > 0
          ? h('div', { className: 'dsh-study-card' },
            h('h3', null, t('material.patterns')),
            patterns.map((pattern, index) => h('div', { key: index, className: 'dsh-study-small', style: { margin: '4px 0' } },
              h('b', null, pattern.name || pattern.id),
              pattern.description ? `：${pattern.description}` : '',
              pattern.evidence ? h('span', { className: 'dsh-study-muted' }, `（${pattern.evidence}）`) : null)))
          : null)
    }

    function ArtifactsPanel(props) {
      const { material, t, sessionId } = props
      const [transcript, setTranscript] = useState(null)
      const [loading, setLoading] = useState(false)
      const mediaId = material.artifactId
      if (!mediaId) return null
      const loadTranscript = async () => {
        setLoading(true)
        // The artefact route is session-scoped: without sessionId the host
        // rejects the read outright. `transcript.json` is the name ingest.js
        // writes into the media directory.
        const query = [
          'kind=media',
          `sessionId=${encodeURIComponent(sessionId || '')}`,
          `mediaId=${encodeURIComponent(mediaId)}`,
          'name=transcript.json',
        ].join('&')
        const payload = await getJson(`/plugins/ds-study/artifact?${query}`)
        setTranscript(payload.ok === false ? { error: payload.message || 'unavailable' } : payload)
        setLoading(false)
      }
      return h('div', null,
        h('div', { className: 'dsh-study-row' },
          h(Button, { onClick: loadTranscript, disabled: loading }, `${t('material.transcript')}${loading ? '…' : ''}`)),
        transcript
          ? h('pre', { className: 'dsh-study-codeblock' },
            transcript.error
              ? transcript.error
              : (Array.isArray(transcript.segments)
                ? transcript.segments.slice(0, 60).map((segment) => `[${clock(segment.startSec)}] ${segment.text}`).join('\n')
                : JSON.stringify(transcript).slice(0, 4000)))
          : null)
    }

    function BoundaryTab(props) {
      const { state, t } = props
      const concepts = state.boundary || []
      const [filter, setFilter] = useState('all')
      if (concepts.length === 0) return h('div', { className: 'dsh-study-empty' }, h('b', null, t('boundary.empty')))
      const visible = concepts.filter((concept) => {
        if (filter === 'low') return typeof concept.level === 'number' && concept.level <= 1
        if (filter === 'missing') return concept.level === undefined || concept.level === null
        return true
      })
      return h('div', null,
        h('div', { className: 'dsh-study-row', style: { marginBottom: 10 } },
          h('span', { className: 'dsh-study-tag', 'data-tone': state.boundaryLocked ? 'ok' : 'warn' }, state.boundaryLocked ? t('boundary.locked') : t('boundary.open')),
          h('span', { className: 'dsh-study-pill-group' },
            h('button', { type: 'button', 'data-active': filter === 'all', onClick: () => setFilter('all') }, t('boundary.filter.all')),
            h('button', { type: 'button', 'data-active': filter === 'low', onClick: () => setFilter('low') }, t('boundary.filter.low')),
            h('button', { type: 'button', 'data-active': filter === 'missing', onClick: () => setFilter('missing') }, t('boundary.filter.missing')))),
        visible.map((concept) => h('div', { className: 'dsh-study-card', key: concept.id },
          h('div', { className: 'dsh-study-row' },
            h('b', null, concept.label || concept.id),
            h('span', { className: 'dsh-study-level' }, [0, 1, 2, 3].map((level) => h('i', { key: level, 'data-on': typeof concept.level === 'number' && level <= concept.level }))),
            h('span', { className: 'dsh-study-small dsh-study-muted' }, levelLabel(t, concept.level)),
            typeof concept.confidence === 'number'
              ? h('span', { className: 'dsh-study-tag' }, `${Math.round(concept.confidence * 100)}%`)
              : null),
          concept.evidence ? h('div', { className: 'dsh-study-small dsh-study-muted', style: { marginTop: 6 } }, `${t('boundary.evidence')}: ${concept.evidence}`) : null)))
    }

    function KnowledgeTab(props) {
      const { state, t, sessionId } = props
      const [query, setQuery] = useState('')
      const [results, setResults] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const index = state.index
      const gaps = (state.boundary || []).filter((concept) => typeof concept.level !== 'number' || concept.level < 2).map((concept) => concept.id)

      const search = async () => {
        if (!query.trim()) return
        setBusy(true)
        setError(null)
        const payload = await postJson('/plugins/ds-study/search', { sessionId, query, topK: 8, gapConcepts: gaps })
        if (payload.ok) setResults(payload.results || [])
        else setError(payload)
        setBusy(false)
      }

      return h('div', null,
        h('div', { className: 'dsh-study-card' },
          h('div', { className: 'dsh-study-row' },
            h('b', null, t('tabs.kb')),
            index
              ? h('span', { className: 'dsh-study-tag', 'data-tone': 'ok' }, `${index.chunks || 0} · ${index.embedder || '?'}`)
              : h('span', { className: 'dsh-study-tag' }, state.boundaryLocked ? t('kb.build') : t('boundary.open'))),
          index
            ? h('div', { className: 'dsh-study-small dsh-study-muted', style: { marginTop: 6 } },
              `${t('kb.embedder')}: ${index.embedder || '?'} · ${t('kb.buildAt')}: ${index.builtAt ? new Date(index.builtAt * 1000).toLocaleString() : '-'}`)
            : h('div', { className: 'dsh-study-small dsh-study-muted', style: { marginTop: 6 } }, t('kb.empty'))),
        h('div', { className: 'dsh-study-row' },
          h('input', {
            className: 'dsh-study-input',
            style: { flex: 1 },
            type: 'search',
            placeholder: t('kb.placeholder'),
            value: query,
            onChange: (event) => setQuery(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') search()
            },
          }),
          h(Button, { kind: 'primary', onClick: search, disabled: busy || !index }, busy ? t('kb.searching') : t('action.search'))),
        h('div', { className: 'dsh-study-small dsh-study-muted', style: { margin: '8px 0' } }, t('kb.hint')),
        error ? h('div', { className: 'dsh-study-error' }, `${error.code}: ${error.message}`) : null,
        results
          ? (results.length === 0
            ? h('div', { className: 'dsh-study-empty' }, t('kb.noResult'))
            : results.map((hit) => h('div', { className: 'dsh-study-hit', key: hit.chunkId },
              h('div', { className: 'meta' },
                `${hit.sourceTitle || hit.sourceId}${hit.meta && hit.meta.page ? ` · ${t('time.page').replace('{n}', hit.meta.page)}` : ''}${hit.tsStart != null ? ` · ${clock(hit.tsStart)}` : ''} · ${hit.score}`),
              h('div', { className: 'dsh-study-small' }, hit.text))))
          : null)
    }

    function LessonTab(props) {
      const { state, t } = props
      const lessons = state.lessons || []
      const [activeId, setActiveId] = useState(null)
      const mathmlMap = useMathml(allLessonFormulas(lessons))
      if (lessons.length === 0) return h('div', { className: 'dsh-study-empty' }, h('b', null, t('lesson.empty')))
      const active = lessons.find((lesson) => lesson.id === activeId) || lessons[0]
      return h('div', { className: 'dsh-study-lesson' },
        h('div', { className: 'dsh-study-lesson-list' },
          lessons.map((lesson, index) => h('button', {
            key: lesson.id,
            type: 'button',
            className: 'dsh-study-lesson-item',
            'data-active': active && lesson.id === active.id,
            onClick: () => setActiveId(lesson.id),
          }, `${index + 1}. ${lesson.title || lesson.id}`))),
        h('div', null,
          h('div', { className: 'dsh-study-card' },
            h('h3', null, active.title || active.id),
            active.goal ? h('div', { className: 'dsh-study-small', style: { marginBottom: 4 } }, h('b', null, `${t('lesson.goal')}：`), active.goal) : null,
            Array.isArray(active.prerequisites) && active.prerequisites.length > 0
              ? h('div', { className: 'dsh-study-small dsh-study-muted' }, `${t('lesson.prereq')}：${active.prerequisites.map((id) => nodeLabel((state.graph && state.graph.nodes) || [], id)).join('、')}`)
              : null),
          // The SVG frame player is disabled: box-and-arrow frames rendered
          // cramped and unreadable at real widths, and plain monospace diagrams
          // (`kind: "code"` blocks) communicate the same thing with no layout
          // risk. Lesson text is authored with ASCII diagrams instead; any
          // `animation` still present in old state is simply not rendered.
          null,
          (active.sections || []).map((section, index) => h('div', { className: 'dsh-study-card', key: index },
            section.heading ? h('h3', null, section.heading) : null,
            h(LessonBlocks, { blocks: sectionBlocks(section), mathmlMap, t })))))
    }

    function SourcesTab(props) {
      const { state, t, sessionId, onTab } = props
      const sources = state.sources || []
      const warnings = state.warnings || []
      const [busy, setBusy] = useState(false)
      const [result, setResult] = useState(null)
      const [error, setError] = useState(null)

      const runExport = async () => {
        setBusy(true)
        setError(null)
        const payload = await postJson('/plugins/ds-study/export', { sessionId })
        if (payload.ok) setResult(payload)
        else setError(payload)
        setBusy(false)
      }

      return h('div', null,
        h('div', { className: 'dsh-study-card' },
          h('h3', null, t('sources.export')),
          h('div', { className: 'dsh-study-small dsh-study-muted', style: { marginBottom: 8 } }, t('sources.exportHint')),
          h('div', { className: 'dsh-study-row' },
            h(Button, { kind: 'primary', onClick: runExport, disabled: busy }, busy ? t('action.exporting') : t('action.export'))),
          result
            ? h('div', { style: { marginTop: 10 } },
              h('div', { className: 'dsh-study-small' }, `${t('sources.done')} · ${t('sources.directory')}: ${result.directory}`),
              h('ul', { className: 'dsh-study-list' }, (result.files || []).map((file, index) => h('li', { key: index, className: 'dsh-study-small' }, file))))
            : null,
          error ? h('div', { className: 'dsh-study-error', style: { marginTop: 10 } }, `${error.code}: ${error.message}`) : null),
        sources.length === 0
          ? h('div', { className: 'dsh-study-empty' }, h('b', null, t('sources.empty')))
          : h('div', { className: 'dsh-study-card' },
            h('h3', null, t('sources.title')),
            sources.map((source, index) => h('div', { key: index, className: 'dsh-study-small', style: { margin: '5px 0' } },
              h('span', { className: 'dsh-study-tag' }, source.kind || 'other'),
              ' ',
              source.url
                ? h('a', { href: source.url, target: '_blank', rel: 'noreferrer', style: { color: 'var(--dsw-alias-brand-primary)' } }, source.title || source.url)
                : h('span', null, source.title || source.id),
              typeof source.trust === 'number' ? h('span', { className: 'dsh-study-muted' }, ` · ${t('sources.trust')} ${source.trust}/3`) : null,
              source.notes ? h('div', { className: 'dsh-study-muted' }, source.notes) : null))),
        warnings.length > 0
          ? h('div', { className: 'dsh-study-card' },
            h('h3', null, t('sources.warnings')),
            h('ul', { className: 'dsh-study-list' }, warnings.slice(-10).map((warning, index) => h('li', { key: index, className: 'dsh-study-small' }, warning.message))))
          : null)
    }

    // ---------------------------------------------------------------------
    // View
    // ---------------------------------------------------------------------

    function StudyView(props) {
      const { t, locale } = props
      const sessionId = props.sessionId
      const { data, error, loading, reload } = useStudyState(sessionId)
      const [tab, setTab] = useState('overview')
      const [capabilities, setCapabilities] = useState(null)
      const [speech, setSpeech] = useState(null)
      const [selectedNode, setSelectedNode] = useState(null)
      const [notice, setNotice] = useState(null)
      const noticeTimer = useRef(null)

      // The notice auto-hides; clear its timer on unmount so a late callback
      // cannot set state on a disposed component.
      useEffect(() => () => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
      }, [])

      const flashNotice = useCallback((text) => {
        setNotice(text)
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(null), 1800)
      }, [])

      useEffect(() => {
        let cancelled = false
        getJson('/plugins/ds-study/capabilities').then((payload) => {
          if (cancelled || !payload.ok) return
          setCapabilities(payload.capabilities)
          setSpeech(payload.speech)
        }).catch(() => {})
        return () => {
          cancelled = true
        }
      }, [])

      const state = data && data.state ? data.state : null
      const tabs = [
        ['overview', t('tabs.overview')],
        ['material', t('tabs.material')],
        ['boundary', t('tabs.boundary')],
        ['graph', t('tabs.graph')],
        ['kb', t('tabs.kb')],
        ['lesson', t('tabs.lesson')],
        ['sources', t('tabs.sources')],
      ]

      const startPrompt = async () => {
        const text = `${t('empty.prompt')}\n`
        try {
          const actions = props.inputActions
          if (actions && typeof actions.captureInsertion === 'function' && typeof actions.insertText === 'function') {
            const span = actions.captureInsertion()
            if (span && span.ok !== false) {
              actions.insertText(text, span.span || span)
              return
            }
          }
        } catch {
          /* fall through to the clipboard */
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text)
            flashNotice(t('empty.copied'))
          }
        } catch {
          flashNotice(t('empty.copied'))
        }
      }

      if (!sessionId) {
        return h('div', { className: 'dsh-study' },
          h('div', { className: 'dsh-study-body' }, h('div', { className: 'dsh-study-loading' }, t('state.loading'))))
      }

      if (loading && !state) {
        return h('div', { className: 'dsh-study' },
          h('div', { className: 'dsh-study-body' }, h('div', { className: 'dsh-study-loading' }, t('state.loading'))))
      }

      if (error) {
        return h('div', { className: 'dsh-study' },
          h('div', { className: 'dsh-study-body' },
            h('div', { className: 'dsh-study-error' }, `${error.code || 'ERROR'}: ${error.message || t('error.offline')}`),
            h(Button, { kind: 'primary', onClick: reload }, t('action.retry'))))
      }

      const materials = (state && state.materials) || []
      // Every section counts, not just materials/boundary/lessons: a session
      // that has only registered sources (or only a graph) is still content,
      // and gating the tabs on three sections hid the others entirely.
      const hasContent = materials.length > 0
        || (state && (state.boundary || []).length > 0)
        || (state && (state.lessons || []).length > 0)
        || (state && (state.sources || []).length > 0)
        || (state && ((state.graph && state.graph.nodes) || []).length > 0)
        || Boolean(state && state.index)

      return h('div', { className: 'dsh-study', 'data-locale': locale },
        h('div', { className: 'dsh-study-head' },
          h('div', null,
            h('div', { className: 'dsh-study-title' }, t('app.title')),
            h('div', { className: 'dsh-study-sub' }, t('app.subtitle'))),
          h('div', { className: 'dsh-study-head-actions' },
            notice ? h('span', { className: 'dsh-study-tag', 'data-tone': 'ok' }, notice) : null,
            state && state.boundaryLocked ? h('span', { className: 'dsh-study-tag', 'data-tone': 'ok' }, t('boundary.locked')) : null,
            h(Button, { onClick: reload }, t('action.refresh')))),
        h('div', { className: 'dsh-study-tabs' },
          tabs.map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            className: 'dsh-study-tab',
            'data-active': tab === id,
            onClick: () => setTab(id),
          }, label))),
        h('div', { className: 'dsh-study-body' },
          !hasContent
            ? h('div', { className: 'dsh-study-empty' },
              h('b', null, t('empty.title')),
              h('div', { className: 'dsh-study-small', style: { marginBottom: 12 } }, t('empty.body')),
              h(Button, { kind: 'primary', onClick: startPrompt }, t('empty.start')))
            : null,
          hasContent && tab === 'overview' ? h(OverviewTab, { state, capabilities, speech, t, onTab: setTab }) : null,
          hasContent && tab === 'material' ? h(MaterialTab, { state, t, sessionId }) : null,
          hasContent && tab === 'boundary' ? h(BoundaryTab, { state, t }) : null,
          hasContent && tab === 'graph' ? h(GraphView, { state, t, selected: selectedNode, onSelect: setSelectedNode }) : null,
          hasContent && tab === 'kb' ? h(KnowledgeTab, { state, t, sessionId }) : null,
          hasContent && tab === 'lesson' ? h(LessonTab, { state, t }) : null,
          hasContent && tab === 'sources' ? h(SourcesTab, { state, t, sessionId, onTab: setTab }) : null))
    }

    // ---------------------------------------------------------------------
    // Plugin
    // ---------------------------------------------------------------------

    const LOCALE_ZH = DICT.zh
    const LOCALE_EN = DICT.en

    function translate(locale, key) {
      const dict = locale === 'zh' ? LOCALE_ZH : LOCALE_EN
      return dict[key] ?? (LOCALE_EN[key] ?? key)
    }

    function makeTranslate(locale) {
      return (key) => translate(locale, key)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const disposers = []
        // Styles are owned by a tagged <style> element, not by a `styles`
        // service: on the real cordis Context, reading an un-injected property
        // THROWS, and `styles` exists only as a parameter of the dynamic
        // cordis-client-runner evaluator. A static bundle like this one must
        // insert and remove its own sheet.
        disposers.push(ctx.effect(() => {
          if (typeof document === 'undefined' || !document.head) return () => {}
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-study-tutor'
          tag.dataset.pluginCss = 'study-tutor'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => {
            try {
              tag.remove()
            } catch {
              /* already detached */
            }
          }
        }, 'study-tutor: styles'))

        disposers.push(ctx.effect(() => {
          if (!ctx.locale) return () => {}
          const disposeZh = ctx.locale.register('study-tutor', 'zh', LOCALE_ZH)
          const disposeEn = ctx.locale.register('study-tutor', 'en', LOCALE_EN)
          return () => {
            try {
              disposeZh()
            } catch {
              /* already gone */
            }
            try {
              disposeEn()
            } catch {
              /* already gone */
            }
          }
        }, 'study-tutor: dictionaries'))

        // The real locale snapshot is `{ active, locales, revision }`; the
        // active language id is `active`, not `locale`. Reading the wrong field
        // silently pins every label to Chinese.
        const localeOf = () => {
          try {
            const snapshot = ctx.locale?.getSnapshot?.()
            return snapshot?.active || 'en'
          } catch {
            return 'en'
          }
        }

        const subscribe = (onChange) => {
          try {
            return ctx.locale?.subscribe?.(onChange) || (() => {})
          } catch {
            return () => {}
          }
        }

        function Wrapped(props) {
          const locale = useSyncExternalStore(subscribe, localeOf, localeOf)
          const t = useMemo(() => makeTranslate(locale), [locale])
          const sessionId = props.sessionId
          return h(StudyView, { ...props, sessionId, t, locale })
        }
        Wrapped.displayName = 'StudyView'

        disposers.push(ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'study',
          order: 20,
          label: () => translate(localeOf(), 'view.label'),
        }, Wrapped)), 'study-tutor: view'))

        return () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              /* already gone */
            }
          }
        }
      },
    }
  },
})
