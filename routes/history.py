"""
历史图片与分组图片 API
"""
import json
from datetime import datetime, timezone
from collections import OrderedDict
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ._utils import is_remote_path


@server.PromptServer.instance.routes.get("/prompt_gallery/images_grouped")
async def get_images_grouped(request):
    """
    获取图片列表，按日期分组。
    支持 prompt 过滤和 prompt 内容搜索。

    Query params:
      prompt (可选): 按单个 prompt value 过滤
      prompts (可选): 逗号分隔的多个 prompt value，取交集（组合视图用）
      search (可选): 按 prompts[] 字段内容搜索
    """
    try:
        import folder_paths

        output_dir = Path(folder_paths.get_output_directory())

        prompt_filter = request.query.get("prompt", "").strip()
        prompts_param = request.query.get("prompts", "").strip()
        search_query = request.query.get("search", "").strip().lower()

        # 组合模式：多个 prompt 取交集
        combination_prompts = None
        if prompts_param:
            combination_prompts = [p.strip() for p in prompts_param.split(",") if p.strip()]

        _, mapping_storage, _, _ = get_storage()
        mappings = mapping_storage.get_all_mappings()

        # 收集有效图片
        valid_items = []
        for mapping in mappings:
            image_path = mapping.get("imagePath")
            if not image_path:
                continue

            remote = is_remote_path(image_path, mapping.get("type", ""))

            if not remote:
                full_path = output_dir / image_path
                if not full_path.exists():
                    continue

            prompts_list = mapping.get("prompts", [])

            # 单个 prompt 过滤
            if prompt_filter and prompt_filter not in prompts_list:
                continue

            # 组合模式：交集过滤（图片必须包含所有指定 prompt）
            if combination_prompts:
                if not all(p in prompts_list for p in combination_prompts):
                    continue

            # search 过滤：检查 prompts 列表或 prompt_string 中是否有匹配项
            if search_query:
                matched = any(
                    search_query in p.lower()
                    for p in prompts_list
                )
                if not matched:
                    ps = mapping.get("promptString", "").lower()
                    if search_query not in ps:
                        continue

            saved_at = mapping.get("fileInfo", {}).get("createdAt", 0)
            if not saved_at and not remote:
                try:
                    saved_at = int(full_path.stat().st_mtime * 1000)
                except Exception:
                    continue

            valid_items.append({
                "path": image_path,
                "type": mapping.get("type", "local"),
                "savedAt": saved_at,
                "prompts": prompts_list,
                "promptString": mapping.get("promptString", ""),
            })

        # 按日期分组
        groups_dict = OrderedDict()
        for item in valid_items:
            dt = datetime.fromtimestamp(item["savedAt"] / 1000, tz=timezone.utc)
            date_key = dt.strftime("%Y-%m-%d")
            if date_key not in groups_dict:
                groups_dict[date_key] = {
                    "date": date_key,
                    "timestamp": int(dt.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000),
                    "images": [],
                }
            groups_dict[date_key]["images"].append(item)

        # 组内按时间降序
        for group in groups_dict.values():
            group["images"].sort(key=lambda x: x["savedAt"], reverse=True)
            group["count"] = len(group["images"])

        # 组按日期降序
        groups = sorted(groups_dict.values(), key=lambda g: g["timestamp"], reverse=True)
        date_list = [g["date"] for g in groups]

        return web.json_response({
            "success": True,
            "groups": json.loads(json.dumps(groups)),  # 确保可序列化
            "totalImages": len(valid_items),
            "dateList": date_list,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"success": False, "error": str(e)}, status=500)
