import json
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def migrate_to_prompt_schema(storage_dir: Path) -> dict:
    """
    迁移数据从旧字段命名到新 prompt schema：
    - artists.json → prompts.json: name→value, displayName→name, 新增 alias
    - image_artists.json → image_prompts.json: artistNames→prompts
    - combinations.json: artistKeys→prompts
    """
    from datetime import datetime

    old_artists_file = storage_dir / "artists.json"
    new_artists_file = storage_dir / "prompts.json"
    old_mappings_file = storage_dir / "image_artists.json"
    new_mappings_file = storage_dir / "image_prompts.json"
    combinations_file = storage_dir / "combinations.json"

    # 如果新文件已存在且有数据，说明已经迁移过
    if new_artists_file.exists():
        # 检查是否为空数据（可能是之前实例化时创建的空文件）
        try:
            with open(new_artists_file, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            if existing.get("artists"):  # 有实际数据，已迁移
                return {"success": True, "message": "已是新格式，无需迁移", "migrated": False}
            # 空文件但旧数据存在 → 删除空文件继续迁移
            if old_artists_file.exists():
                new_artists_file.unlink()
            else:
                return {"success": True, "message": "无旧数据", "migrated": False}
        except Exception:
            pass

    # 如果旧文件不存在，也无需迁移
    if not old_artists_file.exists():
        return {"success": True, "message": "无旧数据", "migrated": False}

    backup_dir = None

    try:
        # 1. 创建备份
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = storage_dir / f"backup_prompt_schema_{timestamp}"
        backup_dir.mkdir(exist_ok=True)

        files_to_backup = [old_artists_file, old_mappings_file, combinations_file]
        for f in files_to_backup:
            if f.exists():
                shutil.copy2(f, backup_dir / f.name)

        print(f"[Migration-PromptSchema] 备份已创建: {backup_dir}")

        # 2. 迁移 artists.json → prompts.json
        with open(old_artists_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        migrated_count = 0
        for artist in data.get("artists", []):
            old_name = artist.get("name", "")
            old_display = artist.get("displayName", old_name)
            artist["value"] = old_name
            artist["name"] = old_display
            artist["alias"] = ""
            # 移除旧字段
            if "displayName" in artist:
                del artist["displayName"]
            # name 已经被重设，不需要删除
            migrated_count += 1

        # 写入新文件
        with open(new_artists_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # 删除旧文件
        old_artists_file.unlink()
        print(f"[Migration-PromptSchema] artists.json → prompts.json: {migrated_count} 条记录")

        # 3. 迁移 image_artists.json → image_prompts.json
        # 如果之前创建了空文件，先删除
        if new_mappings_file.exists() and old_mappings_file.exists():
            new_mappings_file.unlink()
        if old_mappings_file.exists():
            with open(old_mappings_file, 'r', encoding='utf-8') as f:
                mapping_data = json.load(f)

            for mapping in mapping_data.get("mappings", []):
                old_names = mapping.get("artistNames", [])
                mapping["prompts"] = old_names
                if "artistNames" in mapping:
                    del mapping["artistNames"]

            with open(new_mappings_file, 'w', encoding='utf-8') as f:
                json.dump(mapping_data, f, ensure_ascii=False, indent=2)

            old_mappings_file.unlink()
            print(f"[Migration-PromptSchema] image_artists.json → image_prompts.json: {len(mapping_data.get('mappings', []))} 条映射")

        # 4. 迁移 combinations.json
        if combinations_file.exists():
            with open(combinations_file, 'r', encoding='utf-8') as f:
                comb_data = json.load(f)

            for comb in comb_data.get("combinations", []):
                old_keys = comb.get("artistKeys", [])
                comb["prompts"] = old_keys
                if "artistKeys" in comb:
                    del comb["artistKeys"]

            with open(combinations_file, 'w', encoding='utf-8') as f:
                json.dump(comb_data, f, ensure_ascii=False, indent=2)

            print(f"[Migration-PromptSchema] combinations.json: {len(comb_data.get('combinations', []))} 条组合")

        return {
            "success": True,
            "message": f"迁移完成: {migrated_count} 条prompt",
            "backup_dir": str(backup_dir),
            "migrated": True,
        }

    except Exception as e:
        print(f"[Migration-PromptSchema] 迁移失败: {e}")
        # 回滚
        if backup_dir and backup_dir.exists():
            try:
                if (backup_dir / "artists.json").exists() and not old_artists_file.exists():
                    shutil.copy2(backup_dir / "artists.json", old_artists_file)
                if (backup_dir / "image_artists.json").exists() and not old_mappings_file.exists():
                    shutil.copy2(backup_dir / "image_artists.json", old_mappings_file)
                # 清理可能创建的新文件
                if new_artists_file.exists():
                    new_artists_file.unlink()
                if new_mappings_file.exists():
                    new_mappings_file.unlink()
                print("[Migration-PromptSchema] 已从备份恢复")
            except Exception as restore_error:
                print(f"[Migration-PromptSchema] 恢复备份失败: {restore_error}")

        return {
            "success": False,
            "message": f"迁移失败: {str(e)}",
            "migrated": False,
        }


def migrate_artist_data(artist_storage) -> bool:
    """
    迁移现有Prompt数据，添加新字段
    :param artist_storage: Prompt存储实例
    :return: 是否进行了迁移
    """
    import time

    artists = artist_storage.get_all_artists()
    migrated = False

    for artist in artists:
        updated = False
        if "categoryId" not in artist:
            artist["categoryId"] = "root"
            updated = True
        if "coverImageId" not in artist:
            artist["coverImageId"] = None
            updated = True

        if updated:
            artist_storage.update_artist(
                artist["id"],
                categoryId=artist["categoryId"],
                coverImageId=artist["coverImageId"]
            )
            migrated = True

    return migrated


def migrate_to_composite_key(storage_dir: Path) -> dict:
    """
    将现有数据从 UUID 架构迁移到组合键架构
    :param storage_dir: 存储目录
    :return: 迁移结果 {success: bool, message: str, backup_dir: str}
    """
    import shutil
    from datetime import datetime

    try:
        # 1. 创建备份目录
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = storage_dir / f"backup_{timestamp}"
        backup_dir.mkdir(exist_ok=True)

        # 备份文件
        artists_file = storage_dir / "artists.json"
        mappings_file = storage_dir / "image_artists.json"

        if artists_file.exists():
            shutil.copy2(artists_file, backup_dir / "artists.json")
        if mappings_file.exists():
            shutil.copy2(mappings_file, backup_dir / "image_artists.json")

        print(f"[Migration] 备份已创建: {backup_dir}")

        # 2. 迁移 artists.json（移除 id 字段，添加 metadata 字段）
        if artists_file.exists():
            with open(artists_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 创建 id 到 name 的映射表
            id_to_name = {}
            for artist in data.get("artists", []):
                artist_id = artist.get("id")
                name = artist.get("name")
                if artist_id and name:
                    id_to_name[artist_id] = name

            # 移除 id 字段，添加 metadata 字段
            for artist in data.get("artists", []):
                # 移除 id
                if "id" in artist:
                    del artist["id"]

                # 添加 metadata 字段（如果不存在）
                if "metadata" not in artist:
                    artist["metadata"] = {
                        "description": "",
                        "tags": [],
                        "customFields": {}
                    }

            # 写回文件
            with open(artists_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"[Migration] artists.json 迁移完成，处理了 {len(data.get('artists', []))} 个Prompt")
        else:
            id_to_name = {}
            print("[Migration] artists.json 不存在，跳过")

        # 3. 迁移 image_artists.json（artistIds → artistNames）
        if mappings_file.exists():
            with open(mappings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 转换 artistIds 到 artistNames
            for mapping in data.get("mappings", []):
                artist_ids = mapping.get("artistIds", [])
                if artist_ids:
                    # 将 UUID 列表转换为名称列表
                    artist_names = []
                    for artist_id in artist_ids:
                        name = id_to_name.get(artist_id)
                        if name:
                            artist_names.append(name)
                        else:
                            print(f"[Migration] 警告: 找不到 ID {artist_id} 对应的Prompt名称")

                    # 移除 artistIds，添加 artistNames
                    del mapping["artistIds"]
                    mapping["artistNames"] = artist_names

            # 写回文件
            with open(mappings_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"[Migration] image_artists.json 迁移完成，处理了 {len(data.get('mappings', []))} 个映射")
        else:
            print("[Migration] image_artists.json 不存在，跳过")

        # 4. 验证迁移结果
        validation_result = validate_migration(storage_dir)
        if not validation_result["valid"]:
            raise ValueError(f"迁移验证失败: {validation_result['errors']}")

        return {
            "success": True,
            "message": "迁移成功完成",
            "backup_dir": str(backup_dir),
            "validation": validation_result
        }

    except Exception as e:
        # 迁移失败，尝试恢复备份
        print(f"[Migration] 迁移失败: {e}")
        if 'backup_dir' in locals() and backup_dir.exists():
            print(f"[Migration] 尝试从备份恢复...")
            try:
                if (backup_dir / "artists.json").exists():
                    shutil.copy2(backup_dir / "artists.json", artists_file)
                if (backup_dir / "image_artists.json").exists():
                    shutil.copy2(backup_dir / "image_artists.json", mappings_file)
                print("[Migration] 已从备份恢复")
            except Exception as restore_error:
                print(f"[Migration] 恢复备份失败: {restore_error}")

        return {
            "success": False,
            "message": f"迁移失败: {str(e)}",
            "backup_dir": str(backup_dir) if 'backup_dir' in locals() else None
        }


def validate_migration(storage_dir: Path) -> dict:
    """
    验证迁移后的数据结构
    :param storage_dir: 存储目录
    :return: {valid: bool, errors: list}
    """
    errors = []

    try:
        # 验证 artists.json
        artists_file = storage_dir / "artists.json"
        if artists_file.exists():
            with open(artists_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 检查是否有Prompt包含 id 字段
            for artist in data.get("artists", []):
                if "id" in artist:
                    errors.append(f"Prompt {artist.get('name')} 仍然包含 id 字段")

                # 检查必需字段
                if "name" not in artist:
                    errors.append("发现缺少 name 字段的Prompt")
                if "categoryId" not in artist:
                    errors.append(f"Prompt {artist.get('name')} 缺少 categoryId 字段")
                if "metadata" not in artist:
                    errors.append(f"Prompt {artist.get('name')} 缺少 metadata 字段")

            # 检查同分类下是否有重名
            category_artists = {}
            for artist in data.get("artists", []):
                cat_id = artist.get("categoryId")
                name = artist.get("name")
                key = f"{cat_id}:{name}"
                if key in category_artists:
                    errors.append(f"分类 {cat_id} 下存在重名Prompt: {name}")
                else:
                    category_artists[key] = True

        # 验证 image_artists.json
        mappings_file = storage_dir / "image_artists.json"
        if mappings_file.exists():
            with open(mappings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 检查是否有映射包含 artistIds 字段
            for mapping in data.get("mappings", []):
                if "artistIds" in mapping:
                    errors.append(f"图片 {mapping.get('imagePath')} 仍然包含 artistIds 字段")

                # 检查必需字段
                if "artistNames" not in mapping:
                    errors.append(f"图片 {mapping.get('imagePath')} 缺少 artistNames 字段")
                if "imagePath" not in mapping:
                    errors.append("发现缺少 imagePath 字段的映射")

        return {
            "valid": len(errors) == 0,
            "errors": errors
        }

    except Exception as e:
        return {
            "valid": False,
            "errors": [f"验证过程出错: {str(e)}"]
        }
