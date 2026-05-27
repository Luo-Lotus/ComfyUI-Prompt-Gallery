"""
设置相关 API 接口
- 存储文件管理（查看、禁用/启用分片文件）
- 备份管理（查看、应用备份）
"""
import json
import shutil
from pathlib import Path
from aiohttp import web
import server

from ..storage._config import get_disabled_files, toggle_disabled_file, get_max_backups, set_max_backups
from ..storage._resolve import clear_all_caches, _resolve_storage_dir
from ..storage.backup import BackupManager

MAIN_FILES = {"prompts.json", "categories.json", "combinations.json", "images.json"}

STORAGE_TYPES = [
    {"key": "prompts", "label": "Prompts", "main": "prompts.json", "glob": "*.prompts.json"},
    {"key": "categories", "label": "Categories", "main": "categories.json", "glob": "*.categories.json"},
    {"key": "combinations", "label": "Combinations", "main": "combinations.json", "glob": "*.combinations.json"},
    {"key": "images", "label": "Images", "main": "images.json", "glob": "*.images.json"},
]


def _format_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


@server.PromptServer.instance.routes.get("/prompt_gallery/settings/storage_files")
async def get_storage_files(request):
    try:
        storage_dir = _resolve_storage_dir()
        disabled = get_disabled_files(storage_dir)
        files = []

        for st in STORAGE_TYPES:
            main_path = storage_dir / st["main"]
            if main_path.exists():
                stat = main_path.stat()
                files.append({
                    "name": st["main"],
                    "type": st["key"],
                    "size": stat.st_size,
                    "sizeFormatted": _format_size(stat.st_size),
                    "isMain": True,
                    "disabled": False,
                })

            for f in sorted(storage_dir.glob(st["glob"])):
                if f.name == st["main"]:
                    continue
                stat = f.stat()
                files.append({
                    "name": f.name,
                    "type": st["key"],
                    "size": stat.st_size,
                    "sizeFormatted": _format_size(stat.st_size),
                    "isMain": False,
                    "disabled": f.name in disabled,
                })

        return web.json_response({"success": True, "files": files})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/storage_files/toggle")
async def toggle_storage_file(request):
    try:
        data = await request.json()
        filename = data.get("filename", "").strip()

        if not filename:
            return web.json_response({"error": "文件名不能为空"}, status=400)
        if filename in MAIN_FILES:
            return web.json_response({"error": "不能禁用主文件"}, status=400)

        storage_dir = _resolve_storage_dir()
        is_disabled = toggle_disabled_file(storage_dir, filename)
        clear_all_caches()

        return web.json_response({"success": True, "disabled": is_disabled})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/prompt_gallery/settings/backups")
async def get_backups(request):
    try:
        storage_dir = _resolve_storage_dir()
        max_bk = get_max_backups(storage_dir)
        bm = BackupManager(storage_dir, max_backups=max_bk)
        backups = bm.list_backups()
        for b in backups:
            b["sizeFormatted"] = _format_size(b["total_size"])
        return web.json_response({"success": True, "backups": backups, "maxBackups": max_bk})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/backups/create")
async def create_backup(request):
    try:
        storage_dir = _resolve_storage_dir()
        max_bk = get_max_backups(storage_dir)
        bm = BackupManager(storage_dir, max_backups=max_bk)
        result = bm.create_backup()
        if result:
            return web.json_response({"success": True, "backup": result.name})
        return web.json_response({"success": True, "backup": None, "message": "无文件可备份"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/max_backups")
async def update_max_backups(request):
    try:
        data = await request.json()
        value = int(data.get("value", 3))
        storage_dir = _resolve_storage_dir()
        set_max_backups(storage_dir, value)
        return web.json_response({"success": True, "maxBackups": max(1, min(20, value))})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/settings/backups/{name}/apply")
async def apply_backup(request):
    try:
        name = request.match_info["name"]
        storage_dir = _resolve_storage_dir()
        backup_dir = storage_dir / name

        if not backup_dir.is_dir() or not name.startswith("backup_"):
            return web.json_response({"error": "备份不存在"}, status=404)

        # 先创建安全备份
        max_bk = get_max_backups(storage_dir)
        bm = BackupManager(storage_dir, max_backups=max_bk)
        safety = bm.create_backup()

        # 还原备份文件
        for f in backup_dir.iterdir():
            if f.is_file():
                shutil.copy2(f, storage_dir / f.name)

        # 清除缓存
        clear_all_caches()

        return web.json_response({
            "success": True,
            "safety_backup": safety.name if safety else None,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


_FAQ_PATH = Path(__file__).parent.parent / "web" / "faq.json"


@server.PromptServer.instance.routes.get("/prompt_gallery/faq")
async def get_faq(request):
    try:
        if not _FAQ_PATH.exists():
            return web.json_response({"success": True, "items": []})
        with open(_FAQ_PATH, 'r', encoding='utf-8') as f:
            items = json.load(f)
        return web.json_response({"success": True, "items": items})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
