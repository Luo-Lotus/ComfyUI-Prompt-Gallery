"""
初始化数据接口
一次性返回分类树 + 所有Prompt + 所有组合，减少前端请求数量
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ._utils import is_remote_path




@server.PromptServer.instance.routes.get("/prompt_gallery/init")
async def get_init_data(request):
    """初始化数据接口：返回分类树、所有Prompt、所有组合（含封面图路径）"""
    try:
        import folder_paths
        output_dir = folder_paths.get_output_directory()

        prompt_storage, mapping_storage, category_storage, combination_storage = get_storage()

        # 1. 分类（扁平列表，前端无需再拍平）
        categories = category_storage.get_all_categories()

        # 2. 所有Prompt（计算 coverImagePath，复用索引消除 N+1）
        prompts_raw = prompt_storage.get_all_prompts()
        prompt_mapping_index = mapping_storage.build_prompt_index()

        prompts = []
        for prompt in prompts_raw:
            p = dict(prompt)
            cover_path = p.get("coverImageId")
            if not cover_path:
                mappings = prompt_mapping_index.get(p.get("value"), [])
                for m in mappings:
                    image_path = m.get("imagePath")
                    if is_remote_path(image_path, m.get("type", "")) or (Path(output_dir) / image_path).exists():
                        cover_path = image_path
                        break
            p["coverImagePath"] = cover_path
            prompts.append(p)

        # 3. 所有组合（计算 coverImagePath，复用同一个索引）

        raw_combinations = combination_storage.get_all_combinations()
        combinations = []
        for comb in raw_combinations:
            comb_data = dict(comb)
            cover_path = comb.get("coverImageId")
            if not cover_path:
                for prompt_name in comb.get("prompts", []):
                    for m in prompt_mapping_index.get(prompt_name, []):
                        image_path = m.get("imagePath")
                        if is_remote_path(image_path, m.get("type", "")) or (Path(output_dir) / image_path).exists():
                            cover_path = image_path
                            break
                    if cover_path:
                        break
            comb_data["coverImagePath"] = cover_path
            combinations.append(comb_data)

        return web.json_response({
            "categories": categories,
            "prompts": prompts,
            "combinations": combinations,
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
