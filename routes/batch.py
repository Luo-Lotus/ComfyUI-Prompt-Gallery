"""
Batch 操作端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ._utils import is_remote_path




# ============ Batch Operations API ============

@server.PromptServer.instance.routes.delete("/prompt_gallery/batch/delete")
async def batch_delete(request):
    """
    批量删除分类和Prompt

    删除逻辑：
    1. 删除分类：只删除Prompt记录，不修改图片映射（避免影响其他分类的同名Prompt）
    2. 删除独立Prompt：移除图片映射，删除孤儿图片文件

    请求体: {
      "categories": ["cat1", "cat2"],
      "prompts": [{"categoryId": "xxx", "value": "yyy"}]
    }
    """
    try:
        data = await request.json()
        category_ids = data.get("categories", [])
        prompts = data.get("prompts", [])

        prompt_storage, mapping_storage, category_storage, _ = get_storage()
        import folder_paths
        output_dir = Path(folder_paths.get_output_directory())

        deleted_categories = []
        deleted_prompts = []
        deleted_images = []
        errors = []

        # ============ 第一部分：删除分类 ============
        # 只删除Prompt记录，不修改图片映射
        for cat_id in category_ids:
            try:
                category = category_storage.get_category_by_id(cat_id)
                if not category:
                    errors.append(f"分类 {cat_id} 不存在")
                    continue

                # 递归获取所有子分类
                def get_all_child_categories(parent_id):
                    children = category_storage.get_children(parent_id)
                    result = [parent_id]
                    for child in children:
                        result.extend(get_all_child_categories(child['id']))
                    return result

                all_cat_ids = get_all_child_categories(cat_id)

                # 获取这些分类下的所有Prompt
                all_prompts = []
                for cid in all_cat_ids:
                    all_prompts.extend([
                        a for a in prompt_storage.get_all_prompts()
                        if a.get("categoryId") == cid
                    ])

                # 只删除Prompt记录，不修改图片映射
                for prompt in all_prompts:
                    prompt_value = prompt.get("value")
                    prompt_cat_id = prompt.get("categoryId")

                    # 删除Prompt记录（不影响图片映射）
                    prompt_storage.delete_prompt(prompt_cat_id, prompt_value)
                    deleted_prompts.append(prompt.get("name", prompt_value))

                # 删除分类记录（从叶子节点开始）
                for cid in reversed(all_cat_ids):
                    category_storage.delete_category(cid)
                    deleted_categories.append(category.get("name"))

            except Exception as e:
                errors.append(f"删除分类 {cat_id} 失败: {str(e)}")

        # ============ 第二部分：删除独立Prompt ============
        # 移除图片映射，删除孤儿图片文件
        for prompt_data in prompts:
            try:
                category_id = prompt_data.get("categoryId")
                value = prompt_data.get("value")

                # 获取Prompt
                prompt = prompt_storage.get_prompt(category_id, value)
                if not prompt:
                    errors.append(f"Prompt {value} 不存在")
                    continue

                # 移除图片映射，获取孤儿图片
                orphan_images = mapping_storage.remove_prompt_from_mappings(value)

                # 删除孤儿图片文件（跳过远程图片）
                for image_path in orphan_images:
                    if is_remote_path(image_path):
                        deleted_images.append(image_path)
                        continue
                    full_path = Path(output_dir) / image_path
                    try:
                        if full_path.exists():
                            full_path.unlink()
                            deleted_images.append(image_path)
                    except Exception as e:
                        errors.append(f"删除文件 {image_path} 失败: {e}")

                # 删除Prompt记录
                prompt_storage.delete_prompt(category_id, value)
                deleted_prompts.append(prompt.get("name", value))

            except Exception as e:
                errors.append(f"删除Prompt {prompt_data.get('value')} 失败: {str(e)}")

        had_errors = len(errors) > 0
        had_deletions = len(deleted_categories) > 0 or len(deleted_prompts) > 0 or len(deleted_images) > 0

        return web.json_response({
            "success": had_deletions or not had_errors,
            "deletedCategories": deleted_categories,
            "deletedPrompts": deleted_prompts,
            "deletedImages": deleted_images,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/batch/move")
async def batch_move(request):
    """
    批量移动分类和Prompt
    请求体: {
      "categories": [{"id": "xxx", "newParentId": "yyy"}],
      "prompts": [{"categoryId": "xxx", "value": "yyy", "newCategoryId": "zzz"}]
    }
    """
    try:
        data = await request.json()
        categories = data.get("categories", [])
        prompts = data.get("prompts", [])

        prompt_storage, _, category_storage, _ = get_storage()

        moved_categories = []
        moved_prompts = []
        errors = []

        # 移动分类
        for cat_data in categories:
            try:
                cat_id = cat_data.get("id")
                new_parent_id = cat_data.get("newParentId", "root")

                # 验证目标分类存在
                if new_parent_id != "root":
                    target_cat = category_storage.get_category_by_id(new_parent_id)
                    if not target_cat:
                        errors.append(f"目标分类 {new_parent_id} 不存在")
                        continue

                # 检查是否会形成循环
                def check_cycle(parent_id, target_id):
                    if parent_id == target_id:
                        return True
                    cat = category_storage.get_category_by_id(parent_id)
                    if not cat or not cat.get("parentId"):
                        return False
                    return check_cycle(cat["parentId"], target_id)

                if new_parent_id != "root" and check_cycle(new_parent_id, cat_id):
                    errors.append(f"不能将分类 {cat_id} 移动到自己的子分类下")
                    continue

                # 更新分类的父分类
                success = category_storage.update_category(cat_id, parentId=new_parent_id)
                if success:
                    cat = category_storage.get_category_by_id(cat_id)
                    moved_categories.append(cat.get("name", cat_id))
                else:
                    errors.append(f"分类 {cat_id} 不存在")

            except Exception as e:
                errors.append(f"移动分类 {cat_data.get('id')} 失败: {str(e)}")

        # 移动Prompt
        for prompt_data in prompts:
            try:
                category_id = prompt_data.get("categoryId")
                value = prompt_data.get("value")
                new_category_id = prompt_data.get("newCategoryId", "root")

                # 验证目标分类存在
                target_cat = category_storage.get_category_by_id(new_category_id)
                if not target_cat:
                    errors.append(f"目标分类 {new_category_id} 不存在")
                    continue

                # 更新Prompt的分类
                success = prompt_storage.update_prompt(category_id, value, categoryId=new_category_id)
                if success:
                    prompt = prompt_storage.get_prompt(new_category_id, value)
                    moved_prompts.append(prompt.get("name", value))
                else:
                    errors.append(f"Prompt {value} 不存在")

            except Exception as e:
                errors.append(f"移动Prompt {prompt_data.get('value')} 失败: {str(e)}")

        return web.json_response({
            "success": True,
            "movedCategories": moved_categories,
            "movedPrompts": moved_prompts,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/batch/copy")
async def batch_copy(request):
    """
    批量复制Prompt到目标分类
    请求体: {
      "prompts": [{"categoryId": "xxx", "value": "yyy", "targetCategoryId": "zzz"}]
    }
    """
    try:
        data = await request.json()
        prompts = data.get("prompts", [])

        prompt_storage, _, category_storage, _ = get_storage()

        copied_prompts = []
        errors = []

        for prompt_data in prompts:
            try:
                category_id = prompt_data.get("categoryId")
                value = prompt_data.get("value")
                target_category_id = prompt_data.get("targetCategoryId")
                new_name = prompt_data.get("newName", value)

                # 验证源Prompt存在
                source_prompt = prompt_storage.get_prompt(category_id, value)
                if not source_prompt:
                    errors.append(f"源Prompt {value} 不存在")
                    continue

                # 验证目标分类存在
                target_cat = category_storage.get_category_by_id(target_category_id)
                if not target_cat:
                    errors.append(f"目标分类 {target_category_id} 不存在")
                    continue

                # 创建新Prompt（使用相同或新名称）
                try:
                    new_prompt = prompt_storage.add_prompt(
                        value=new_name,
                        name=source_prompt.get("name"),
                        category_id=target_category_id
                    )
                    copied_prompts.append(new_prompt.get("name", new_name))
                except ValueError as e:
                    errors.append(f"复制Prompt {value} 失败: {str(e)}")

            except Exception as e:
                errors.append(f"复制Prompt {prompt_data.get('value')} 失败: {str(e)}")

        return web.json_response({
            "success": True,
            "copiedPrompts": copied_prompts,
            "errors": errors
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)
