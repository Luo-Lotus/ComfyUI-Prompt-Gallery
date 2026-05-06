"""路由共用工具函数"""


def is_remote_path(image_path: str, mapping_type: str = "") -> bool:
    """判断图片路径是否为远程URL"""
    return mapping_type == "remote" or image_path.startswith("http://") or image_path.startswith("https://")
