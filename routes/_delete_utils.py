"""
删除操作工具函数
所有删除逻辑的统一实现，路由层只做薄封装。
"""
from pathlib import Path
from typing import List

from ._utils import is_remote_path


def _get_output_dir():
    import folder_paths
    return Path(folder_paths.get_output_directory())


def delete_image_file(image_path: str, mapping_type: str = "") -> bool:
    """删除本地图片文件，远程图片跳过。返回是否删除了文件。"""
    if is_remote_path(image_path, mapping_type):
        return False
    full_path = _get_output_dir() / image_path
    try:
        if full_path.exists():
            full_path.unlink()
            return True
    except Exception as e:
        print(f"[DeleteUtils] 删除文件失败 {image_path}: {e}")
    return False


def remove_image_prompt_link(image_path: str, prompt_value: str,
                              mapping_storage) -> dict:
    """
    从图片映射中移除一个 prompt 关联。
    - 若移除后映射的 prompts 为空 → 删文件 + 删映射
    - 若移除后还有其他 prompt → 只更新映射
    """
    result = {"file_deleted": False, "mapping_deleted": False, "orphan": False}

    mapping = mapping_storage.get_mappings_by_image(image_path)
    if not mapping:
        return result

    prompts = list(mapping.get("prompts", []))
    if prompt_value not in prompts:
        return result

    prompts.remove(prompt_value)

    if prompts:
        # 还有其他 prompt，只更新映射
        mapping_storage.update_mapping(image_path, prompts)
    else:
        # 没有其他 prompt 了，删文件 + 删映射
        result["orphan"] = True
        result["file_deleted"] = delete_image_file(image_path, mapping.get("type", ""))
        mapping_storage.delete_mapping_by_image(image_path)
        result["mapping_deleted"] = True

    return result


def delete_image_completely(image_path: str, mapping_storage, prompt_storage) -> dict:
    """
    完全删除一张图片（历史视图场景）。
    删文件 + 删映射 + 更新所有关联 prompt 的 imageCount。
    """
    result = {"file_deleted": False, "affected_prompts": []}

    mapping = mapping_storage.get_mappings_by_image(image_path)
    if not mapping:
        return result

    prompt_values = mapping.get("prompts", [])

    # 删文件
    result["file_deleted"] = delete_image_file(image_path, mapping.get("type", ""))

    # 删映射
    mapping_storage.delete_mapping_by_image(image_path)

    # 更新关联 prompt 的 imageCount
    all_prompts = prompt_storage.get_all_prompts()
    deltas = {}
    for pv in prompt_values:
        for p in all_prompts:
            if p.get("value") == pv:
                key = (p.get("categoryId", "root"), pv)
                deltas[key] = deltas.get(key, 0) - 1
                result["affected_prompts"].append(pv)

    if deltas:
        prompt_storage.update_image_count_batch(deltas)

    return result


def delete_prompt_cascade(category_id: str, value: str,
                           prompt_storage, mapping_storage,
                           combination_storage) -> dict:
    """
    级联删除一个 prompt：
    1. 遍历所有映射，对该 prompt 关联的图片调用 remove_image_prompt_link
    2. 从所有组合中移除该 prompt
    3. 删除 prompt 记录
    """
    result = {
        "deleted_files": [],
        "disassociated_images": [],
        "affected_combinations": 0,
    }

    # 获取该 prompt 关联的所有图片映射
    mappings = mapping_storage.get_mappings_by_prompt(value)

    for mapping in mappings:
        image_path = mapping.get("imagePath", "")
        link_result = remove_image_prompt_link(image_path, value, mapping_storage)
        if link_result["file_deleted"]:
            result["deleted_files"].append(image_path)
        elif not link_result["orphan"]:
            result["disassociated_images"].append(image_path)

    # 从组合中移除
    result["affected_combinations"] = combination_storage.remove_prompt_from_all(value)

    # 删除 prompt 记录
    prompt_storage.delete_prompt(category_id, value)

    return result


def delete_category_cascade(category_id: str,
                             prompt_storage, mapping_storage,
                             category_storage, combination_storage) -> dict:
    """
    级联删除分类：
    1. 递归收集所有子分类 ID
    2. 收集所有分类下的组合，批量删除
    3. 收集所有分类下的 prompt，逐个调用 delete_prompt_cascade
    4. 从叶到根删除分类记录
    """
    result = {
        "deleted_categories": [],
        "deleted_prompts": [],
        "deleted_files": [],
        "disassociated_images": [],
        "deleted_combinations": 0,
    }

    # 1. 递归收集所有子分类
    all_cat_ids = category_storage.get_descendant_ids(category_id)

    # 2. 收集并删除所有分类下的组合
    all_combinations = combination_storage.get_all_combinations()
    combo_ids_to_delete = [
        c["id"] for c in all_combinations
        if c.get("categoryId") in all_cat_ids
    ]
    if combo_ids_to_delete:
        result["deleted_combinations"] = combination_storage.batch_delete(combo_ids_to_delete)

    # 3. 收集所有分类下的 prompt，逐个级联删除
    all_prompts = prompt_storage.get_all_prompts()
    prompts_to_delete = [
        a for a in all_prompts
        if a.get("categoryId") in all_cat_ids
    ]

    for prompt in prompts_to_delete:
        prompt_result = delete_prompt_cascade(
            prompt["categoryId"], prompt["value"],
            prompt_storage, mapping_storage, combination_storage,
        )
        result["deleted_prompts"].append(prompt.get("name", prompt["value"]))
        result["deleted_files"].extend(prompt_result["deleted_files"])
        result["disassociated_images"].extend(prompt_result["disassociated_images"])

    # 4. 从叶到根删除分类记录
    for cid in reversed(all_cat_ids):
        try:
            category_storage.delete_category(cid)
            result["deleted_categories"].append(cid)
        except Exception as e:
            print(f"[DeleteUtils] 删除分类 {cid} 失败: {e}")

    return result
