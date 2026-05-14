"""
Prompt CRUD 端点
"""
from pathlib import Path
from aiohttp import web
import server
from ..storage import get_storage
from ..storage.backup import BackupManager
from ._utils import is_remote_path
from ._delete_utils import delete_prompt_cascade


# ============ Prompt CRUD API ============

@server.PromptServer.instance.routes.get("/prompt_gallery/prompts")
async def get_prompts(request):
    """获取所有Prompt列表"""
    try:
        prompt_storage, _, _, _ = get_storage()
        prompts = prompt_storage.get_all_prompts()
        return web.json_response({"prompts": prompts, "totalCount": len(prompts)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/prompts")
async def add_prompt(request):
    """添加Prompt（单个）"""
    try:
        data = await request.json()
        value = data.get("value", "").strip()
        name = data.get("name", "").strip() or None
        alias = data.get("alias", "").strip()
        category_id = data.get("categoryId", "root")

        if not value:
            return web.json_response({"error": "Prompt值不能为空"}, status=400)

        prompt_storage, _, category_storage, _ = get_storage()

        # 验证分类存在
        category = category_storage.get_category_by_id(category_id)
        if not category:
            return web.json_response({"error": "分类不存在"}, status=400)

        prompt = prompt_storage.add_prompt(value=value, name=name, alias=alias, category_id=category_id)

        return web.json_response({"prompt": prompt, "success": True})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/prompts/batch")
async def add_prompts_batch(request):
    """批量添加Prompt"""
    try:
        data = await request.json()
        prompts_data = data.get("prompts", [])
        category_id = data.get("categoryId", "root")

        if not prompts_data:
            return web.json_response({"error": "Prompt列表不能为空"}, status=400)

        prompt_storage, _, _, _ = get_storage()
        success_prompts, failed_names = prompt_storage.add_prompts_batch(prompts_data, category_id)

        return web.json_response({
            "success": True,
            "addedCount": len(success_prompts),
            "failedCount": len(failed_names),
            "prompts": success_prompts,
            "failedNames": failed_names
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get(r"/prompt_gallery/prompts/{category_id}/{value:[\s\S]+}")
async def get_prompt_composite(request):
    """获取单个Prompt详情（使用组合键）"""
    try:
        category_id = request.match_info['category_id']
        value = request.match_info['value']

        prompt_storage, _, _, _ = get_storage()
        prompt = prompt_storage.get_prompt(category_id, value)

        if not prompt:
            return web.json_response({"error": "Prompt不存在"}, status=404)

        return web.json_response({"prompt": prompt})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put(r"/prompt_gallery/prompts/{category_id}/{value:[\s\S]+}")
async def update_prompt_composite(request):
    """更新Prompt信息（使用组合键）"""
    try:
        category_id = request.match_info['category_id']
        old_value = request.match_info['value']
        data = await request.json()

        prompt_storage, mapping_storage, category_storage, _ = get_storage()

        # 检查是否要修改值
        new_value = data.get("value", old_value)
        value_changed = (old_value != new_value)

        # 如果修改了值，需要先检查新值是否在任意分类下已存在
        if value_changed:
            # 获取所有Prompt，检查新值是否已存在
            all_prompts = prompt_storage.get_all_prompts()
            for prompt in all_prompts:
                if prompt.get("value") == new_value:
                    return web.json_response({"error": f"Prompt值 '{new_value}' 已存在（在分类 '{prompt.get('categoryId', 'root')}' 中）"}, status=400)

        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"]
        if "alias" in data:
            kwargs["alias"] = data["alias"]
        if "categoryId" in data:
            # 验证分类存在
            category = category_storage.get_category_by_id(data["categoryId"])
            if not category:
                return web.json_response({"error": "分类不存在"}, status=400)
            kwargs["categoryId"] = data["categoryId"]
        if "coverImageId" in data:
            kwargs["coverImageId"] = data["coverImageId"]
        if "value" in data:
            kwargs["value"] = new_value

        # 如果修改了值，需要找到所有分类下同值的Prompt并批量更新
        updated_prompts = []
        success = True  # 默认成功，用于非值变更的情况

        if value_changed:
            # 获取所有Prompt
            all_prompts = prompt_storage.get_all_prompts()

            # 找出所有与旧值同值的Prompt
            same_value_prompts = [a for a in all_prompts if a.get("value") == old_value]

            # 批量更新所有同值Prompt
            for same_value_prompt in same_value_prompts:
                cat_id = same_value_prompt.get("categoryId", "root")
                # 更新Prompt值（只传入需要更新的字段）
                update_kwargs = {}
                if "name" in kwargs:
                    update_kwargs["name"] = kwargs["name"]
                if "alias" in kwargs:
                    update_kwargs["alias"] = kwargs["alias"]
                if "categoryId" in kwargs and cat_id == category_id:
                    update_kwargs["categoryId"] = kwargs["categoryId"]
                if "coverImageId" in kwargs:
                    update_kwargs["coverImageId"] = kwargs["coverImageId"]
                update_kwargs["value"] = new_value

                success = prompt_storage.update_prompt(cat_id, old_value, **update_kwargs)
                if success:
                    updated_prompts.append({
                        "categoryId": cat_id,
                        "oldValue": old_value,
                        "newValue": new_value
                    })
        else:
            # 只更新当前Prompt（不修改值）
            success = prompt_storage.update_prompt(category_id, old_value, **kwargs)

        if success:
            # 如果修改了值，更新所有相关映射
            updated_mappings = 0
            if value_changed:
                updated_mappings = mapping_storage.rename_prompt_in_mappings(old_value, new_value)

            # 重新查询更新后的Prompt信息
            new_category_id = kwargs.get("categoryId", category_id)
            prompt = prompt_storage.get_prompt(new_category_id, new_value)

            result = {
                "prompt": prompt,
                "success": True
            }

            # 如果更新了映射，添加更新数量
            if value_changed:
                result["updatedMappings"] = updated_mappings
                result["updatedPrompts"] = updated_prompts

            return web.json_response(result)
        else:
            return web.json_response({"error": "Prompt不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.delete(r"/prompt_gallery/prompts/{category_id}/{value:[\s\S]+}")
async def delete_prompt_composite(request):
    """删除Prompt（级联清理图片和组合）"""
    try:
        category_id = request.match_info['category_id']
        value = request.match_info['value']

        prompt_storage, mapping_storage, _, combination_storage = get_storage()

        prompt = prompt_storage.get_prompt(category_id, value)
        if not prompt:
            return web.json_response({"error": "Prompt不存在"}, status=404)

        # 备份
        storage_dir = Path(prompt_storage.storage_dir)
        BackupManager(storage_dir).create_backup()

        result = delete_prompt_cascade(
            category_id, value,
            prompt_storage, mapping_storage, combination_storage,
        )

        return web.json_response({
            "success": True,
            "message": f"已删除Prompt '{prompt.get('name')}'",
            "deletedFiles": result["deleted_files"],
            "disassociatedImages": result["disassociated_images"],
            "affectedCombinations": result["affected_combinations"],
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.put("/prompt_gallery/prompts/{prompt_id}")
async def update_prompt(request):
    """更新Prompt信息"""
    try:
        prompt_id = request.match_info['prompt_id']
        data = await request.json()

        prompt_storage, _, category_storage, _ = get_storage()

        kwargs = {}
        if "value" in data:
            kwargs["value"] = data["value"]
        if "name" in data:
            kwargs["name"] = data["name"]
        if "alias" in data:
            kwargs["alias"] = data["alias"]
        if "categoryId" in data:
            # 验证分类存在
            category = category_storage.get_category_by_id(data["categoryId"])
            if not category:
                return web.json_response({"error": "分类不存在"}, status=400)
            kwargs["categoryId"] = data["categoryId"]
        if "coverImageId" in data:
            kwargs["coverImageId"] = data["coverImageId"]

        success = prompt_storage.update_prompt_by_id(prompt_id, **kwargs)

        if success:
            prompt = prompt_storage.get_prompt_by_id(prompt_id)
            return web.json_response({"prompt": prompt, "success": True})
        else:
            return web.json_response({"error": "Prompt不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/prompt_gallery/prompts/{prompt_id}/move")
async def move_prompt(request):
    """移动Prompt到其他分类下"""
    try:
        prompt_id = request.match_info['prompt_id']
        data = await request.json()
        new_category_id = data.get("newCategoryId", "root")

        prompt_storage, _, category_storage, _ = get_storage()

        # 验证新分类存在
        category = category_storage.get_category_by_id(new_category_id)
        if not category:
            return web.json_response({"error": "目标分类不存在"}, status=400)

        # 更新Prompt的分类
        success = prompt_storage.update_prompt_by_id(prompt_id, categoryId=new_category_id)

        if success:
            prompt = prompt_storage.get_prompt_by_id(prompt_id)
            return web.json_response({"prompt": prompt, "success": True})
        else:
            return web.json_response({"error": "Prompt不存在"}, status=404)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/prompt_gallery/prompt/{prompt_id}/images")
async def get_prompt_images(request):
    """获取Prompt关联的图片（通过映射查询）"""
    try:
        prompt_id = request.match_info['prompt_id']

        prompt_storage, mapping_storage, _, _ = get_storage()
        prompt = prompt_storage.get_prompt_by_id(prompt_id)
        if not prompt:
            return web.json_response({"error": "Prompt不存在"}, status=404)

        mappings = mapping_storage.get_mappings_by_prompt(prompt.get("value"))

        # 构建图片信息
        images = []
        for mapping in mappings:
            images.append({
                "path": mapping.get("imagePath"),
                "type": mapping.get("type", "local"),
                "savedAt": mapping.get("fileInfo", {}).get("createdAt"),
                "fileInfo": mapping.get("fileInfo", {}),
                "promptString": mapping.get("promptString", ""),
            })

        # 按时间倒序排序
        images.sort(key=lambda x: x.get("savedAt", 0), reverse=True)

        return web.json_response({"images": images, "totalCount": len(images)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post(r"/prompt_gallery/prompts/{category_id}/{value:[\s\S]+}/copy")
async def copy_prompt(request):
    """
    复制Prompt到其他分类
    创建一个新的Prompt实例，共享所有图片（因为图片映射使用Prompt值）
    """
    try:
        category_id = request.match_info['category_id']
        value = request.match_info['value']
        data = await request.json()
        target_category_id = data.get("targetCategoryId")
        new_value = data.get("newValue", value)

        if not target_category_id:
            return web.json_response({"error": "缺少目标分类ID"}, status=400)

        prompt_storage, _, category_storage, _ = get_storage()

        # 验证源Prompt存在
        source_prompt = prompt_storage.get_prompt(category_id, value)
        if not source_prompt:
            return web.json_response({"error": "源Prompt不存在"}, status=404)

        # 验证目标分类存在
        target_category = category_storage.get_category_by_id(target_category_id)
        if not target_category:
            return web.json_response({"error": "目标分类不存在"}, status=400)

        # 创建新Prompt（使用相同或新值）
        try:
            new_prompt = prompt_storage.add_prompt(
                value=new_value,
                name=source_prompt.get("name"),
                alias=source_prompt.get("alias", ""),
                category_id=target_category_id
            )
        except ValueError as e:
            return web.json_response({"error": str(e)}, status=400)

        # 图片会自动共享，因为映射使用Prompt值

        return web.json_response({
            "success": True,
            "prompt": new_prompt,
            "message": f"已复制Prompt到分类 '{target_category.get('name')}'"
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# ============ Prompt Images API (detail view) ============

@server.PromptServer.instance.routes.get("/prompt_gallery/prompt_images")
async def get_prompt_images_by_composite(request):
    """获取Prompt的全部图片（详情视图用，使用 query 参数避免路由冲突）"""
    try:
        import folder_paths

        output_dir = Path(folder_paths.get_output_directory())
        value = request.query.get("value", "")

        if not value:
            return web.json_response({"error": "缺少Prompt值"}, status=400)

        _, mapping_storage, _, _ = get_storage()
        mappings = mapping_storage.get_mappings_by_prompt(value)

        images = []
        for mapping in mappings:
            image_path = mapping.get("imagePath")
            if is_remote_path(image_path, mapping.get("type", "")):
                images.append({
                    "path": image_path,
                    "type": "remote",
                    "size": 0,
                    "mtime": mapping.get("fileInfo", {}).get("createdAt", 0),
                    "prompts": mapping.get("prompts", []),
                })
                continue
            full_path = output_dir / image_path
            if full_path.exists():
                try:
                    stat = full_path.stat()
                    images.append({
                        "path": image_path,
                        "size": stat.st_size,
                        "mtime": stat.st_mtime * 1000,
                        "prompts": mapping.get("prompts", []),
                    })
                except Exception:
                    pass

        images.sort(key=lambda x: x["path"].lower())

        return web.json_response({
            "success": True,
            "images": images,
            "totalCount": len(images),
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
