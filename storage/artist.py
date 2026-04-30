import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import threading


class ArtistStorage:
    """Prompt数据存储管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.artists_file = storage_dir / "prompts.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        """确保存储目录存在"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # 初始化 prompts.json
        if not self.artists_file.exists():
            self._write_data({"artists": []})

    def _read_data(self) -> dict:
        """读取数据文件（带缓存）"""
        if self._cache is not None:
            return self._cache
        try:
            with open(self.artists_file, 'r', encoding='utf-8') as f:
                self._cache = json.load(f)
            return self._cache
        except Exception as e:
            print(f"Error reading prompts file: {e}")
            self._cache = {"artists": []}
            return self._cache

    def _write_data(self, data: dict):
        """写入数据文件（同时更新缓存）"""
        try:
            with open(self.artists_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._cache = data
        except Exception as e:
            self._cache = None  # 写入失败，清除缓存
            print(f"Error writing prompts file: {e}")
            raise

    def get_all_artists(self) -> List[dict]:
        """获取所有Prompt"""
        with self._lock:
            data = self._read_data()
            return data.get("artists", [])

    def get_artist_by_id(self, artist_id: str) -> Optional[dict]:
        """根据 ID 获取Prompt（兼容旧版本，建议使用 get_artist）"""
        artists = self.get_all_artists()
        for artist in artists:
            if artist.get("id") == artist_id:
                return artist
        return None

    def get_artist(self, category_id: str, value: str) -> Optional[dict]:
        """
        根据分类ID和值获取Prompt（组合键）
        :param category_id: 分类 ID
        :param value: Prompt值
        :return: Prompt对象或 None
        """
        artists = self.get_all_artists()
        for artist in artists:
            if artist.get("categoryId") == category_id and artist.get("value") == value:
                return artist
        return None

    def get_artist_by_name(self, name: str) -> Optional[dict]:
        """
        根据值获取Prompt（返回第一个匹配的Prompt）
        注意：如果存在多个同值Prompt（不同分类），只返回第一个
        建议使用 get_artist(category_id, value) 精确查询
        """
        artists = self.get_all_artists()
        for artist in artists:
            if artist.get("value") == name:
                return artist
        return None

    def get_artist_by_value(self, value: str) -> Optional[dict]:
        """根据值获取Prompt（返回第一个匹配）"""
        return self.get_artist_by_name(value)

    def add_artist(self, value: str, name: Optional[str] = None, alias: str = "",
                   category_id: str = "root") -> dict:
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
            a.get("value") for a in data.get("artists", [])
            if a.get("categoryId") == category_id
        }
        if value in existing_values_in_category:
            raise ValueError(f"分类 '{category_id}' 下Prompt值 '{value}' 已存在")

        # 如果未提供 name，使用 value
        if not name:
            name = value

        new_artist = {
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

        # 获取锁并写入
        with self._lock:
            data = self._read_data()
            data["artists"].append(new_artist)
            self._write_data(data)

            return new_artist

    def add_artists_batch(self, artists_data: List[dict], category_id: str = "root") -> Tuple[List[dict], List[str]]:
        """
        批量添加Prompt
        :param artists_data: Prompt数据列表，每个元素包含 {"value": str, "name": str(可选), "alias": str(可选)}
        :param category_id: 所属分类ID，默认为root
        :return: (成功添加的Prompt列表, 失败的值列表)
        """
        with self._lock:
            success_artists = []
            failed_values = []

            data = self._read_data()
            existing_values = {a.get("value") for a in data["artists"]}

            for artist_data in artists_data:
                value = artist_data.get("value", "").strip()
                if not value:
                    failed_values.append(f"空值")
                    continue

                if value in existing_values:
                    failed_values.append(value)
                    continue

                name = artist_data.get("name") or value
                alias = artist_data.get("alias", "")

                new_artist = {
                    "value": value,
                    "name": name,
                    "alias": alias,
                    "categoryId": category_id,
                    "coverImageId": None,
                    "createdAt": int(__import__('time').time() * 1000),
                    "imageCount": 0
                }

                data["artists"].append(new_artist)
                success_artists.append(new_artist)
                existing_values.add(value)

            self._write_data(data)
            return success_artists, failed_values

    def update_artist(self, category_id: str, old_value: str, **kwargs) -> bool:
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
            target_artist = None
            target_index = -1
            for i, artist in enumerate(data["artists"]):
                if artist.get("categoryId") == category_id and artist.get("value") == old_value:
                    target_artist = artist
                    target_index = i
                    break

            if not target_artist:
                return False

            # 如果要更新 value，需要检查同分类下重复
            if "value" in kwargs:
                new_value = kwargs["value"]
                for i, artist in enumerate(data["artists"]):
                    if (i != target_index and
                        artist.get("categoryId") == category_id and
                        artist.get("value") == new_value):
                        raise ValueError(f"分类 '{category_id}' 下Prompt值 '{new_value}' 已存在")

            # 更新字段
            for key, val in kwargs.items():
                if key in ["value", "name", "alias", "imageCount", "categoryId", "coverImageId"]:
                    target_artist[key] = val

            self._write_data(data)
            return True

    def update_artist_by_id(self, artist_id: str, **kwargs) -> bool:
        """
        更新Prompt信息（使用 ID，兼容旧版本）
        :param artist_id: Prompt ID
        :param kwargs: 要更新的字段
        :return: 是否更新成功
        """
        with self._lock:
            data = self._read_data()

            # 如果要更新 value，需要检查重复
            if "value" in kwargs:
                new_value = kwargs["value"]
                for artist in data["artists"]:
                    if artist.get("id") != artist_id and artist.get("value") == new_value:
                        raise ValueError(f"Prompt值 '{new_value}' 已存在")

            for artist in data["artists"]:
                if artist.get("id") == artist_id:
                    for key, value in kwargs.items():
                        if key in ["value", "name", "alias", "imageCount", "categoryId", "coverImageId"]:
                            artist[key] = value
                    self._write_data(data)
                    return True
            return False

    def delete_artist(self, category_id: str, value: str) -> bool:
        """
        删除Prompt（使用组合键）
        :param category_id: 分类 ID
        :param value: Prompt值
        :return: 是否删除成功
        """
        with self._lock:
            data = self._read_data()
            original_count = len(data["artists"])
            data["artists"] = [
                a for a in data["artists"]
                if not (a.get("categoryId") == category_id and a.get("value") == value)
            ]

            if len(data["artists"]) < original_count:
                self._write_data(data)
                return True
            return False

    def delete_artist_by_id(self, artist_id: str) -> bool:
        """
        删除Prompt（使用 ID，兼容旧版本）
        :param artist_id: Prompt ID
        :return: 是否删除成功
        """
        with self._lock:
            data = self._read_data()
            original_count = len(data["artists"])
            data["artists"] = [a for a in data["artists"] if a.get("id") != artist_id]

            if len(data["artists"]) < original_count:
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
            for artist in data["artists"]:
                if artist.get("categoryId") == category_id and artist.get("value") == value:
                    current_count = artist.get("imageCount", 0)
                    artist["imageCount"] = max(0, current_count + delta)
                    self._write_data(data)
                    return

    def update_image_count_by_id(self, artist_id: str, delta: int = 1):
        """
        更新Prompt的图片数量（使用 ID，兼容旧版本）
        :param artist_id: Prompt ID
        :param delta: 增量（正数增加，负数减少）
        """
        with self._lock:
            data = self._read_data()
            for artist in data["artists"]:
                if artist.get("id") == artist_id:
                    current_count = artist.get("imageCount", 0)
                    artist["imageCount"] = max(0, current_count + delta)
                    self._write_data(data)
                    return
