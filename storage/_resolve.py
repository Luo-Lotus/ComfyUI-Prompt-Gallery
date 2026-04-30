import shutil
from pathlib import Path
from typing import Tuple

from .prompt import PromptStorage
from .image_mapping import ImageMappingStorage
from .category import CategoryStorage
from .combination import CombinationStorage
from .migration import migrate_prompt_data, migrate_to_prompt_schema


def _resolve_storage_dir() -> Path:
    """
    解析数据存储目录。
    优先使用 user/default/prompt_gallery/，不可用时回退到插件目录。
    如果旧位置有数据但新位置没有，自动复制迁移。
    """
    plugin_dir = Path(__file__).parent.parent
    new_storage_dir = None

    # 尝试获取 ComfyUI 用户目录
    try:
        import folder_paths
        user_dir = folder_paths.get_user_directory()
        if user_dir:
            new_storage_dir = Path(user_dir) / "default" / "prompt_gallery"
    except Exception:
        pass

    # folder_paths 不可用，回退到插件目录
    if not new_storage_dir:
        return plugin_dir

    # 新目录已有数据，直接使用（含旧格式兼容）
    new_has_data = (
        (new_storage_dir / "prompts.json").exists()
        or (new_storage_dir / "image_prompts.json").exists()
        or (new_storage_dir / "categories.json").exists()
        or (new_storage_dir / "artists.json").exists()
        or (new_storage_dir / "image_artists.json").exists()
    )
    if new_has_data:
        return new_storage_dir

    # 检查旧位置是否有数据文件（含旧格式兼容）
    old_files = [
        plugin_dir / "prompts.json",
        plugin_dir / "image_prompts.json",
        plugin_dir / "categories.json",
        plugin_dir / "combinations.json",
        plugin_dir / "artists.json",
        plugin_dir / "image_artists.json",
    ]
    old_has_data = any(f.exists() for f in old_files)

    if not old_has_data:
        # 两边都没有数据，使用新目录（全新安装）
        return new_storage_dir

    # 旧位置有数据，新位置没有 → 自动迁移
    try:
        new_storage_dir.mkdir(parents=True, exist_ok=True)
        for old_file in old_files:
            if old_file.exists():
                shutil.copy2(old_file, new_storage_dir / old_file.name)
        print(f"[prompt_gallery] 数据已迁移: {plugin_dir} -> {new_storage_dir}")
    except Exception as e:
        print(f"[prompt_gallery] 迁移失败，回退到插件目录: {e}")
        return plugin_dir

    return new_storage_dir


def get_storage() -> Tuple[PromptStorage, ImageMappingStorage, CategoryStorage, CombinationStorage]:
    """获取存储实例"""
    storage_dir = _resolve_storage_dir()

    # 先执行迁移，再创建存储实例（避免实例缓存空数据）
    try:
        migrate_to_prompt_schema(storage_dir)
    except Exception as e:
        print(f"Warning: Failed to migrate to prompt schema: {e}")

    prompt_storage = PromptStorage(storage_dir)
    mapping_storage = ImageMappingStorage(storage_dir)
    category_storage = CategoryStorage(storage_dir)
    combination_storage = CombinationStorage(storage_dir)

    # 自动迁移现有Prompt数据（旧版本兼容）
    try:
        migrate_prompt_data(prompt_storage)
    except Exception as e:
        print(f"Warning: Failed to migrate prompt data: {e}")

    return prompt_storage, mapping_storage, category_storage, combination_storage
