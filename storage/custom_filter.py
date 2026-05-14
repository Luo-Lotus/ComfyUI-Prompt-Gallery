"""
自定义筛查项存储
"""
import json
import uuid
import threading
from pathlib import Path
from typing import List, Optional


class CustomFilterStorage:
    """自定义筛查项管理"""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.filters_file = storage_dir / "custom_filters.json"
        self._lock = threading.Lock()
        self._cache = None
        self._ensure_file()

    def _ensure_file(self):
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        if not self.filters_file.exists():
            self._write_data({"filters": []})

    def _read_data(self) -> dict:
        if self._cache is not None:
            return self._cache
        try:
            with open(self.filters_file, 'r', encoding='utf-8') as f:
                self._cache = json.load(f)
        except Exception:
            self._cache = {"filters": []}
        return self._cache

    def _write_data(self, data: dict):
        with open(self.filters_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        self._cache = None

    def get_all(self) -> List[dict]:
        with self._lock:
            data = self._read_data()
            return data.get("filters", [])

    def get_by_id(self, filter_id: str) -> Optional[dict]:
        for f in self.get_all():
            if f["id"] == filter_id:
                return f
        return None

    def create(self, name: str, filter_code: str, extract_code: str = "") -> dict:
        with self._lock:
            data = self._read_data()
            item = {
                "id": uuid.uuid4().hex[:12],
                "name": name,
                "filterCode": filter_code,
                "extractCode": extract_code,
                "options": [],
                "createdAt": __import__('time').time_ns() // 1_000_000,
            }
            data["filters"].append(item)
            self._write_data(data)
            return item

    def update(self, filter_id: str, name: str = None, filter_code: str = None,
               extract_code: str = None, options: list = None) -> Optional[dict]:
        with self._lock:
            data = self._read_data()
            for f in data["filters"]:
                if f["id"] == filter_id:
                    if name is not None:
                        f["name"] = name
                    if filter_code is not None:
                        f["filterCode"] = filter_code
                    if extract_code is not None:
                        f["extractCode"] = extract_code
                    if options is not None:
                        f["options"] = options
                    self._write_data(data)
                    return f
        return None

    def delete(self, filter_id: str) -> bool:
        with self._lock:
            data = self._read_data()
            before = len(data["filters"])
            data["filters"] = [f for f in data["filters"] if f["id"] != filter_id]
            if len(data["filters"]) < before:
                self._write_data(data)
                return True
        return False
