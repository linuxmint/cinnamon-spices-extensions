#!/usr/bin/python3
"""设置说明页「打开 README 文档」部件（settings-schema.json 的 open-readme，type: custom）。

点击时把 README.md 与 README.en.md **现场**渲染成 HTML 写到扩展目录，再用默认网页
浏览器打开——README 改动即时生效，不存在预渲染产物过期的问题。两页互链改写为指向
渲染版，浏览器里切换中英文打开的都是排版后的页面。

浏览器不走 text/html mime 关联（可能被指到编辑器而非浏览器），而是解析 xdg-settings
的 default-web-browser 用 GIO 启动，拿不到才逐级兜底 xdg-open / gio open。

优先用 python3-markdown 渲染；未安装时退回内置简易转换器（标题/表格/列表/代码块/
粗体/行内代码/链接/图片）。图片内嵌 base64：产物可能落到缓存目录，相对路径会断；
扩展目录只读（系统级安装）时，两个页面一起回退 ~/.cache/<UUID>/（互链同目录才有效）。
"""
import base64
import gettext
import os
import re
import subprocess
import sys

import gi
gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gio, Gtk

# xlet-settings 用 spec_from_file_location 按路径加载本文件，不会把任何目录加进
# sys.path。要补三层：本目录、cinnamon-settings（KeybindingWidgets 的
# `from bin import util` 需要 bin 包的父目录）、cinnamon-settings/bin
# （JsonSettingsWidgets 所在）。多插不碍事，真实运行时环境里本来就有。
_applet_dir = os.path.dirname(os.path.abspath(__file__))
for _p in (_applet_dir, '/usr/share/cinnamon/cinnamon-settings',
           '/usr/share/cinnamon/cinnamon-settings/bin'):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from JsonSettingsWidgets import SettingsWidget

UUID = 'nebula-theme-studio@yoo'


def _bind_gettext():
    """显式绑定扩展自己的翻译域：cinnamon-settings 的其他模块会
    gettext.install('cinnamon') 覆盖 builtins._，依赖隐式绑定会让按钮文案
    退回系统域。翻译依次找扩展自带 locale（Cinnamon 会把 po/ 编译进扩展目录）、
    用户与系统 locale，都没有就退回 msgid 原文。"""
    for ld in (os.path.join(_applet_dir, 'locale'),
               os.path.join(GLib.get_user_data_dir(), 'locale'),
               '/usr/share/locale'):
        try:
            return gettext.translation(UUID, ld).gettext
        except OSError:
            continue
    return gettext.translation(UUID, fallback=True).gettext


_ = _bind_gettext()

# (源 markdown, 渲染产物)：中文主文档 + 英文版，两页互链均指向渲染产物
_DOCS = [('README.md', 'README.html'), ('README.en.md', 'README.en.html')]


def _relink(html):
    """页面互链改指向渲染版：README.en.md → README.en.html、README.md → README.html。

    "README.md" 不是 "README.en.md" 的子串，两条替换互不影响。
    """
    html = html.replace('href="README.en.md"', 'href="README.en.html"')
    html = html.replace('href="README.md"', 'href="README.html"')
    return html


# 目录锚点用 @@NTSANCHOR:id@@ 占位、原生 <img> 用 @@NTSIMG:n@@ 占位
# （无尖括号，转义与转换都动不到它们）
_ANCHOR_RE = re.compile(r'<a id="([^"]+)"></a>')
_IMG_RE = re.compile(r'<img\b[^>]*>')


def _escape_placeholders(text):
    """把正文里 `<Variant>` 这类尖括号占位符转义成实体——markdown 会把它们当原生
    HTML 标签吞掉，浏览器里整段文字消失。三个豁免：围栏代码块与行内代码不动
    （markdown 自己会转义，预转义会变 &amp;lt; 双重转义乱码）；原生 <img> 标签
    先摘成占位符（转义会让 base64 以纯文本糊满页面）；显式锚点同样先摘除。"""
    text = _ANCHOR_RE.sub(r'@@NTSANCHOR:\1@@', text)
    imgs = []

    def _stash_img(m):
        imgs.append(m.group(0))
        return '@@NTSIMG:%d@@' % (len(imgs) - 1)
    text = _IMG_RE.sub(_stash_img, text)
    out, in_fence = [], False
    for ln in text.split('\n'):
        if ln.lstrip().startswith('```'):
            in_fence = not in_fence
            out.append(ln)
            continue
        if in_fence:
            out.append(ln)
            continue
        # 按反引号分段：奇数段是行内代码不转义，偶数段是正文转义
        segs = ln.split('`')
        for i in range(0, len(segs), 2):
            segs[i] = segs[i].replace('<', '&lt;')
        out.append('`'.join(segs))
    return '\n'.join(out), imgs


def _restore_anchors(html, imgs):
    # 锚点行与标题行之间补空行：python-markdown 不认紧贴段落的 ATX 标题
    html = re.sub(r'(@@NTSANCHOR:[^@]+@@)\n(#{1,3} )', r'\1\n\n\2', html)
    html = _ANCHOR_RE_POST.sub(r'<a id="\1"></a>', html)
    return _IMG_RE_POST.sub(lambda m: imgs[int(m.group(1))], html)


_ANCHOR_RE_POST = re.compile(r'@@NTSANCHOR:([^@]+)@@')
_IMG_RE_POST = re.compile(r'@@NTSIMG:(\d+)@@')


def _render_docs(target_dir):
    """渲染全部文档写进 target_dir，返回 (中文版路径, 失败原因 or None)。"""
    pages = []
    for src_name, out_name in _DOCS:
        src = os.path.join(_applet_dir, src_name)
        try:
            with open(src, encoding='utf-8') as f:
                text = f.read()
        except OSError as e:
            return None, '无法读取 %s: %s' % (src, e)
        text, imgs = _escape_placeholders(text)
        title = re.search(r'^#\s+(.+)$', text, re.M)
        html = _TEMPLATE % (title.group(1).strip() if title else src_name,
                            _CSS, _render(text))
        # 先恢复锚点/img 占位符再内嵌图片：img 恢复成标签后 src 才匹配得到
        html = _inline_images(_restore_anchors(_relink(html), imgs))
        pages.append((out_name, html))
    for out_name, html in pages:
        try:
            with open(os.path.join(target_dir, out_name), 'w',
                      encoding='utf-8') as f:
                f.write(html)
        except OSError as e:
            return None, '写入 %s 失败: %s' % (out_name, e)
    return os.path.join(target_dir, 'README.html'), None


def _inline_images(html):
    """图片转 base64 data URI：产物可能写进缓存目录，相对路径会跟着断。"""
    def to_data_uri(m):
        path = os.path.join(_applet_dir, m.group(1))
        try:
            with open(path, 'rb') as f:
                data = base64.b64encode(f.read()).decode('ascii')
        except OSError:
            return m.group(0)   # 图片不在就保留相对路径（产物在扩展目录时仍可用）
        mime = 'image/svg+xml' if path.endswith('.svg') else 'image/png'
        return 'src="data:%s;base64,%s"' % (mime, data)
    return re.sub(r'src="((?:docs/)?[^"]+?\.(?:png|svg))"', to_data_uri, html)


_CSS = """\
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans CJK SC',sans-serif;
max-width:860px;margin:0 auto;padding:24px 20px 64px;line-height:1.65;color:#1f2328}
h1,h2{border-bottom:1px solid #d8dee4;padding-bottom:.3em}
h2{margin-top:2em}h3{margin-top:1.5em}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #d8dee4;padding:6px 10px;text-align:left;vertical-align:top}
th{background:#f6f8fa}
code{background:#f0f1f2;border-radius:4px;padding:1px 5px;
font-family:'JetBrains Mono','Noto Sans Mono',monospace;font-size:.92em}
pre{background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;
padding:12px 14px;overflow-x:auto}
pre code{background:none;padding:0}
blockquote{border-left:4px solid #d0d7de;margin:0;padding:2px 14px;color:#59636e}
img{max-width:100%}
a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}
hr{border:0;border-top:1px solid #d8dee4;margin:2em 0}
@media (prefers-color-scheme:dark){body{color:#e6e8eb;background:#0d1117}
h1,h2{border-color:#30363d}th{background:#161b22}th,td{border-color:#30363d}
code{background:#21262d}pre{background:#161b22;border-color:#30363d}
blockquote{border-color:#30363d;color:#9ea7b3}hr{border-color:#30363d}
a{color:#58a6ff}}
"""

_TEMPLATE = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">\
<meta name="viewport" content="width=device-width, initial-scale=1">\
<title>%s</title><style>%s</style></head><body>%s</body></html>'


def _inline(s):
    """行内元素：图片链接、链接、粗体、行内代码。行内代码内容必须 HTML 转义，
    否则 <变体> 这类占位符会被浏览器当标签吞掉。"""
    s = re.sub(r'\[!\[([^\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)',
               r'<a href="\3"><img src="\2" alt="\1"></a>', s)
    s = re.sub(r'`([^`]+)`',
               lambda m: '<code>%s</code>' % m.group(1)
               .replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'), s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', r'<a href="\2">\1</a>', s)
    return s


def _render_fallback(text):
    """无 python3-markdown 时的简易转换器：覆盖 README 用到的全部语法。"""
    out, i, lines = [], 0, text.splitlines()
    while i < len(lines):
        ln = lines[i]
        if ln.startswith('```'):                      # 围栏代码块
            lang = ln[3:].strip()
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i]); i += 1
            i += 1
            cls = ' class="language-%s"' % lang if lang else ''
            out.append('<pre><code%s>%s</code></pre>' % (
                cls, '\n'.join(code).replace('&', '&amp;')
                     .replace('<', '&lt;').replace('>', '&gt;')))
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', ln)        # 标题
        if m:
            lv = len(m.group(1))
            out.append('<h%d>%s</h%d>' % (lv, _inline(m.group(2)), lv))
            i += 1; continue
        if re.match(r'^\s*[-*_]{3,}\s*$', ln):        # 分隔线
            out.append('<hr>'); i += 1; continue
        if ln.lstrip().startswith('|') and i + 1 < len(lines) and \
                re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]):  # 表格
            head = [c.strip() for c in ln.strip().strip('|').split('|')]
            i += 2
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                rows.append([c.strip() for c in
                             lines[i].strip().strip('|').split('|')])
                i += 1
            th = ''.join('<th>%s</th>' % _inline(c) for c in head)
            trs = ''.join('<tr>%s</tr>' % ''.join(
                '<td>%s</td>' % _inline(c) for c in r) for r in rows)
            out.append('<table><thead><tr>%s</thead><tbody>%s</tbody>'
                       '</table>' % (th, trs))
            continue
        if re.match(r'^\s*[-*]\s+', ln):              # 无序列表
            items = []
            while i < len(lines) and re.match(r'^\s*[-*]\s+', lines[i]):
                items.append(re.sub(r'^\s*[-*]\s+', '', lines[i])); i += 1
            out.append('<ul>%s</ul>' % ''.join(
                '<li>%s</li>' % _inline(x) for x in items))
            continue
        if re.match(r'^\s*\d+\.\s+', ln):             # 有序列表
            items = []
            while i < len(lines) and re.match(r'^\s*\d+\.\s+', lines[i]):
                items.append(re.sub(r'^\s*\d+\.\s+', '', lines[i])); i += 1
            out.append('<ol>%s</ol>' % ''.join(
                '<li>%s</li>' % _inline(x) for x in items))
            continue
        if ln.strip().startswith('>'):                # 引用
            quote = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                quote.append(lines[i].lstrip()[1:].strip()); i += 1
            out.append('<blockquote>%s</blockquote>' %
                       _inline(' '.join(quote)))
            continue
        if not ln.strip():                            # 空行
            i += 1; continue
        para = []                                     # 普通段落（连续行）
        while i < len(lines) and lines[i].strip() and \
                not re.match(r'^(#|```|\||\s*[-*]\s|\s*\d+\.\s|>)', lines[i]) \
                and not re.match(r'^\s*[-*_]{3,}\s*$', lines[i]):
            para.append(lines[i].strip()); i += 1
        out.append('<p>%s</p>' % _inline(' '.join(para)))
    return '\n'.join(out)


def _render(text):
    try:
        import markdown
        return markdown.markdown(text, extensions=['tables', 'fenced_code'])
    except Exception:
        return _render_fallback(text)


def _open_in_browser(path):
    """用"默认网页浏览器"打开，而不是 xdg-open。

    xdg-open 走 file 的 mime 关联（text/html），用户把它指给编辑器/音乐
    播放器时 README 就不会出现在浏览器里；这里直接解析 xdg-settings 的
    default-web-browser 用 GIO 启动，拿不到才逐级兜底。返回是否已启动。
    """
    uri = GLib.filename_to_uri(path, None)
    browser = ''
    try:
        r = subprocess.run(['xdg-settings', 'get', 'default-web-browser'],
                           capture_output=True, text=True, timeout=5)
        browser = (r.stdout or '').strip()
    except Exception:
        pass
    if browser.endswith('.desktop'):
        try:
            app = Gio.DesktopAppInfo.new(browser)
            if app is not None and app.launch_uris([uri], None):
                return True
        except Exception:
            pass
    for cmd in (['xdg-open', uri], ['gio', 'open', uri]):
        try:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL,
                             start_new_session=True)
            return True
        except Exception:
            continue
    return False


class ReadmeButton(SettingsWidget):
    def __init__(self, info, key, settings):
        super().__init__()
        self.key = key
        self.settings = settings

        self.set_orientation(Gtk.Orientation.HORIZONTAL)
        self.set_spacing(8)

        btn = Gtk.Button(label=_('打开 README 文档'))
        btn.connect('clicked', self._on_clicked)
        self.pack_start(btn, False, False, 0)

    def _on_clicked(self, btn):
        # 两个文档都渲染、写同一目录（互链才有效）；扩展目录只读（系统级
        # 安装）时整体回退缓存目录
        target, err = _render_docs(_applet_dir)
        if target is None:
            cache = os.path.join(GLib.get_user_cache_dir(), UUID)
            os.makedirs(cache, exist_ok=True)
            target, err = _render_docs(cache)
        if target is None:
            print('NTS readme_button: %s' % err, file=sys.stderr)
            return
        if not _open_in_browser(target):
            print('NTS readme_button: 浏览器启动失败，文件在 ' + target,
                  file=sys.stderr)
