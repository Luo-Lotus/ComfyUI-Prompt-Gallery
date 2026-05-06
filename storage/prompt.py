import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import threading


class PromptStorage:
    """Prompt数据存储管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.prompts_file = storage_dir / "prompts.json"
        self._glob_pattern = "*.prompts.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # 有分片文件时不创建主文件
        if not self.prompts_file.exists():
            split_files = [f for f in self.storage_dir.glob(self._glob_pattern)
                           if f.resolve() != self.prompts_file.resolve()]
            if not split_files:
                self._write_data({"prompts": []})

    def _glob_source_files(self) -> list:
        """查找所有源文件：主文件 + glob 匹配的分片文件"""
        sources = []
        if self.prompts_file.exists():
            sources.append(self.prompts_file)
        for f in sorted(self.storage_dir.glob(self._glob_pattern)):
            if f.resolve() != self.prompts_file.resolve():
                sources.append(f)
        return sources

    def _read_data(self) -> dict:
        """读取并合并所有源文件（带缓存）"""
        if self._cache is not None:
            return self._cache
        merged_items = []
        for source_file in self._glob_source_files():
            try:
                with open(source_file, 'r', encoding='utf-8') as f:
                    file_data = json.load(f)
                for item in file_data.get("prompts", []):
                    item["_source_file"] = str(source_file)
                    merged_items.append(item)
            except Exception as e:
                print(f"Error reading {source_file.name}: {e}")
        self._cache = {"prompts": merged_items}
        return self._cache

    def _write_data(self, data: dict):
        """按来源文件分组回写，新数据写入主文件"""
        try:
            groups: Dict[str, list] = {}
            for item in data.get("prompts", []):
                source = item.pop("_source_file", None) or str(self.prompts_file)
                groups.setdefault(source, []).append(item)

            main_key = str(self.prompts_file)
            if main_key not in groups and len(groups) > 0:
                groups[main_key] = []

            for file_path_str, items in groups.items():
                file_path = Path(file_path_str)
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump({"prompts": items}, f, ensure_ascii=False, indent=2)

            self._cache = None
        except Exception as e:
            self._cache = None
            print(f"Error writing prompts files: {e}")
            raise

    def get_all_prompts(self) -> List[dict]:
        """获取所有Prompt"""
        with self._lock:
            data = self._read_data()
            return data.get("prompts", [])

    def get_prompt_by_id(self, prompt_id: str) -> Optional[dict]:
        """根据 ID 获取Prompt（兼容旧版本，建议使用 get_prompt）"""
        prompts = self.get_all_prompts()
        for prompt in prompts:
            if prompt.get("id") == prompt_id:
                return prompt
        return None

    def get_prompt(self, category_id: str, value: str) -> Optional[dict]:
        """
        根据分类ID和值获取Prompt（组合键）
        :param category_id: 分类 ID
        :param value: Prompt值
        :return: Prompt对象或 None
        """
        prompts = self.get_all_prompts()
        for prompt in prompts:
            if prompt.get("categoryId") == category_id and prompt.get("value") == value:
                return prompt
        return None

    def get_prompt_by_name(self, name: str) -> Optional[dict]:
        """
        根据值获取Prompt（返回第一个匹配的Prompt）
        注意：如果存在多个同值Prompt（不同分类），只返回第一个
        建议使用 get_prompt(category_id, value) 精确查询
        """
        prompts = self.get_all_prompts()
        for prompt in prompts:
            if prompt.get("value") == name:
                return prompt
        return None

    def get_prompt_by_value(self, value: str) -> Optional[dict]:
        """根据值获取Prompt（返回第一个匹配）"""
        return self.get_prompt_by_name(value)

    def add_prompt(self, value: str, name: Optional[str] = None, alias: str = "",
                   category_id: str = "root", target_file: Optional[str] = None) -> dict:
        """
        添加Prompt
        :param value: Prompt值（同一分类下唯一）
        :param name: 显示名称（可选，默认等于value）
        :param alias: 别名（逗号分隔）
        :param category_id: 所属分类ID（默认为root）
        :return: 新创建的Prompt对象
        :raises ValueError: 如果同一分类下 value 已存在
        """
        # 先检查同一分类下 value 是否已存在（不持有锁）
        data = self._read_data()
        existing_values_in_category = {
            a.get("value") for a in data.get("prompts", [])
            if a.get("categoryId") == category_id
        }
        if value in existing_values_in_category:
            raise ValueError(f"分类 '{category_id}' 下Prompt值 '{value}' 已存在")

        # 如果未提供 name，使用 value
        if not name:
            name = value

        new_prompt = {
            "value": value,
            "name": name,
            "alias": alias,
            "categoryId": category_id,
            "coverImageId": None,
            "createdAt": int(__import__('time').time() * 1000),
            "imageCount": 0,
            "metadata": {
                "description": "",
                "tags": [],
                "customFields": {}
            }
        }
        if target_file:
            new_prompt["_source_file"] = target_file

        # 获取锁并写入
        with self._lock:
            data = self._read_data()
            data["prompts"].append(new_prompt)
            self._write_data(data)

            return new_prompt

    def add_prompts_batch(self, prompts_data: List[dict], category_id: str = "root",
                          target_file: Optional[str] = None) -> Tuple[List[dict], List[str]]:
        """
        批量添加Prompt
        :param prompts_data: Prompt数据列表，每个元素包含 {"value": str, "name": str(可选), "alias": str(可选)}
        :param category_id: 所属分类ID，默认为root
        :return: (成功添加的Prompt列表, 失败的值列表)
        """
        with self._lock:
            success_prompts = []
            failed_values = []

            data = self._read_data()
            existing_values = {a.get("value") for a in data["prompts"]}

            for prompt_data in prompts_data:
                value = prompt_data.get("value", "").strip()
                if not value:
                    failed_values.append(f"空值")
                    continue

                if value in existing_values:
                    failed_values.append(value)
                    continue

                name = prompt_data.get("name") or value
                alias = prompt_data.get("alias", "")

                new_prompt = {
                    "value": value,
                    "name": name,
                    "alias": alias,
                    "categoryId": category_id,
                    "coverImageId": None,
                    "createdAt": int(__import__('time').time() * 1000),
                    "imageCount": 0
                }
                if target_file:
                    new_prompt["_source_file"] = target_file

                data["prompts"].append(new_prompt)
                success_prompts.append(new_prompt)
                existing_values.add(value)

            self._write_data(data)
            return success_prompts, failed_values

    def add_prompts_import(self, items: List[dict], target_file: Optional[str] = None) -> Tuple[List[dict], List[str]]:
        """
        导入批量添加Prompt（一次读写，支持不同categoryId）
        :param items: [{"value": str, "name": str, "alias": str, "categoryId": str}, ...]
        :param target_file: 分离存储目标文件
        :return: (成功列表, 失败值列表)
        """
        import time as _time
        with self._lock:
            data = self._read_data()
            existing = {(a.get("value"), a.get("categoryId")) for a in data["prompts"]}
            success, failed = [], []
            for item in items:
                value = (item.get("value") or "").strip()
                cat_id = item.get("categoryId", "root")
                if not value:
                    failed.append("(空值)")
                    continue
                if (value, cat_id) in existing:
                    failed.append(value)
                    continue
                new_prompt = {
                    "value": value,
                    "name": item.get("name") or value,
                    "alias": item.get("alias", ""),
                    "categoryId": cat_id,
                    "coverImageId": None,
                    "createdAt": int(_time.time() * 1000),
                    "imageCount": 0,
                }
                if target_file:
                    new_prompt["_source_file"] = target_file
                data["prompts"].append(new_prompt)
                success.append(new_prompt)
                existing.add((value, cat_id))
            self._write_data(data)
            return success, failed

    def update_prompt(self, category_id: str, old_value: str, **kwargs) -> bool:
        """
        更新Prompt信息（使用组合键）
        :param category_id: 分类 ID
        :param old_value: Prompt值（旧值）
        :param kwargs: 要更新的字段（value, name, alias, imageCount, categoryId, coverImageId 等）
        :return: 是否更新成功
        :raises ValueError: 如果新值与同分类下其他Prompt重复
        """
        with self._lock:
            data = self._read_data()

            # 查找目标Prompt
            target_prompt = None
            target_index = -1
            for i, prompt in enumerate(data["prompts"]):
                if prompt.get("categoryId") == category_id and prompt.get("value") == old_value:
                    target_prompt = prompt
                    target_index = i
                    break

            if not target_prompt:
                return False

            # 如果要更新 value，需要检查同分类下重复
            if "value" in kwargs:
                new_value = kwargs["value"]
                for i, prompt in enumerate(data["prompts"]):
                    if (i != target_index and
                        prompt.get("categoryId") == category_id and
                        prompt.get("value") == new_value):
                        raise ValueError(f"分类 '{category_id}' 下Prompt值 '{new_value}' 已存在")

            # 更新字段
            for key, val in kwargs.items():
                if key in ["value", "name", "alias", "imageCount", "categoryId", "coverImageId"]:
                    target_prompt[key] = val

            self._write_data(data)
            return True

    def update_prompt_by_id(self, prompt_id: str, **kwargs) -> bool:
        """
        更新Prompt信息（使用 ID，兼容旧版本）
        :param prompt_id: Prompt ID
        :param kwargs: 要更新的字段
        :return: 是否更新成功
        """
        with self._lock:
            data = self._read_data()

            # 如果要更新 value，需要检查重复
            if "value" in kwargs:
                new_value = kwargs["value"]
                for prompt in data["prompts"]:
                    if prompt.get("id") != prompt_id and prompt.get("value") == new_value:
                        raise ValueError(f"Prompt值 '{new_value}' 已存在")

            for prompt in data["prompts"]:
                if prompt.get("id") == prompt_id:
                    for key, value in kwargs.items():
                        if key in ["value", "name", "alias", "imageCount", "categoryId", "coverImageId"]:
                            prompt[key] = value
                    self._write_data(data)
                    return True
            return False

    def delete_prompt(self, category_id: str, value: str) -> bool:
        """
        删除Prompt（使用组合键）
        :param category_id: 分类 ID
        :param value: Prompt值
        :return: 是否删除成功
        """
        with self._lock:
            data = self._read_data()
            original_count = len(data["prompts"])
            data["prompts"] = [
                a for a in data["prompts"]
                if not (a.get("categoryId") == category_id and a.get("value") == value)
            ]

            if len(data["prompts"]) < original_count:
                self._write_data(data)
                return True
            return False

    def delete_prompt_by_id(self, prompt_id: str) -> bool:
        """
        删除Prompt（使用 ID，兼容旧版本）
        :param prompt_id: Prompt ID
        :return: 是否删除成功
        """
        with self._lock:
            data = self._read_data()
            original_count = len(data["prompts"])
            data["prompts"] = [a for a in data["prompts"] if a.get("id") != prompt_id]

            if len(data["prompts"]) < original_count:
                self._write_data(data)
                return True
            return False

    def update_image_count(self, category_id: str, value: str, delta: int = 1):
        """
        更新Prompt的图片数量（使用组合键）
        :param category_id: 分类 ID
        :param value: Prompt值
        :param delta: 增量（正数增加，负数减少）
        """
        with self._lock:
            data = self._read_data()
            for prompt in data["prompts"]:
                if prompt.get("categoryId") == category_id and prompt.get("value") == value:
                    current_count = prompt.get("imageCount", 0)
                    prompt["imageCount"] = max(0, current_count + delta)
                    self._write_data(data)
                    return

    def update_image_count_by_id(self, prompt_id: str, delta: int = 1):
        """
        更新Prompt的图片数量（使用 ID，兼容旧版本）
        :param prompt_id: Prompt ID
        :param delta: 增量（正数增加，负数减少）
        """
        with self._lock:
            data = self._read_data()
            for prompt in data["prompts"]:
                if prompt.get("id") == prompt_id:
                    current_count = prompt.get("imageCount", 0)
                    prompt["imageCount"] = max(0, current_count + delta)
                    self._write_data(data)
                    return
