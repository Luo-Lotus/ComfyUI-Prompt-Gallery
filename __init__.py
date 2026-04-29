"""
Artist Gallery - ComfyUI Custom Node
在 ComfyUI 中展示Prompt图库管理界面
"""

from .nodes import ArtistGallery, ArtistSelector, SaveToGallery

NODE_CLASS_MAPPINGS = {
    "ArtistGallery": ArtistGallery,
    "ArtistSelector": ArtistSelector,
    "SaveToGallery": SaveToGallery,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ArtistGallery": "🎨 Prompt图库",
    "ArtistSelector": "🎨 Prompt选择",
    "SaveToGallery": "🎨 保存到画廊"
}

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
