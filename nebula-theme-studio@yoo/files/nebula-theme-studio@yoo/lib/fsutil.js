/* fsutil.js — Gio 文件操作的薄封装（同步，供扩展 enable/apply 路径使用）
 *
 * imports.gi.* 刻意在函数内惰性取值：GJS 的 imports 在模块求值阶段不一定就绪，
 * 且纯逻辑可在普通 JS 环境直接跑测试。
 */

function gio() {
    return imports.gi.Gio;
}

function glib() {
    return imports.gi.GLib;
}

function file(path) {
    return gio().File.new_for_path(path);
}

function exists(path) {
    try {
        return file(path).query_exists(null);
    } catch (e) {
        return false;
    }
}

function isDirectory(path) {
    try {
        return file(path).query_file_type(gio().FileQueryInfoFlags.NONE, null) === gio().FileType.DIRECTORY;
    } catch (e) {
        return false;
    }
}

function ensureDirectory(path) {
    if (!exists(path)) file(path).make_directory_with_parents(null);
}

function readText(path) {
    const [ok, contents] = glib().file_get_contents(path);
    if (!ok) throw new Error(`读取失败: ${path}`);
    return new TextDecoder('utf-8').decode(contents);
}

function writeText(path, text) {
    ensureDirectory(parentDir(path));
    const bytes = new TextEncoder().encode(text);
    const target = file(path);
    const stream = target.replace(null, false, gio().FileCreateFlags.REPLACE_DESTINATION, null);
    stream.write_all(bytes, null);
    stream.close(null);
}

function parentDir(path) {
    const idx = path.lastIndexOf('/');
    if (idx <= 0) return '/';
    return path.slice(0, idx);
}

/** 递归复制目录（保留目录结构；已存在的文件会被覆盖） */
function copyTree(srcPath, dstPath) {
    const src = file(srcPath);
    if (!src.query_exists(null)) throw new Error(`源目录不存在: ${srcPath}`);
    if (src.query_file_type(gio().FileQueryInfoFlags.NONE, null) !== gio().FileType.DIRECTORY) {
        throw new Error(`源不是目录: ${srcPath}`);
    }

    ensureDirectory(dstPath);
    copyChildren(src, file(dstPath));
}

function copyChildren(srcDir, dstDir) {
    const Gio = gio();
    const enumerator = srcDir.enumerate_children(
        'standard::name,standard::type,standard::is-symlink',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);

    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        const name = info.get_name();
        const child = srcDir.get_child(name);
        const target = dstDir.get_child(name);

        if (info.get_file_type() === Gio.FileType.DIRECTORY) {
            ensureDirectory(target.get_path());
            copyChildren(child, target);
        } else {
            if (target.query_exists(null)) target.delete(null);
            child.copy(target, Gio.FileCopyFlags.OVERWRITE, null, null);
        }
    }
    enumerator.close(null);
}

function removeTree(path) {
    if (!exists(path)) return false;
    const Gio = gio();
    const target = file(path);
    const type = target.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);

    if (type === Gio.FileType.DIRECTORY) {
        const enumerator = target.enumerate_children(
            'standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            removeTree(target.get_child(info.get_name()).get_path());
        }
        enumerator.close(null);
    }

    target.delete(null);
    return true;
}

function listChildren(path) {
    const Gio = gio();
    const out = [];
    if (!isDirectory(path)) return out;

    const enumerator = file(path).enumerate_children(
        'standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        out.push({ name: info.get_name(), type: info.get_file_type() });
    }
    enumerator.close(null);
    return out;
}

/** 列出子目录名（已排序） */
function listDirectories(path) {
    return listChildren(path)
        .filter(e => e.type === gio().FileType.DIRECTORY)
        .map(e => e.name)
        .sort();
}

module.exports = {
    file,
    exists,
    isDirectory,
    ensureDirectory,
    readText,
    writeText,
    parentDir,
    copyTree,
    removeTree,
    listChildren,
    listDirectories
};