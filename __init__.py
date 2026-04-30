"""
Prompt Gallery - ComfyUI Custom Node
在 ComfyUI 中展示Prompt图库管理界面
"""

from .nodes import PromptGallery, PromptSelector, SaveToGallery

NODE_CLASS_MAPPINGS = {
    "PromptGallery": PromptGallery,
    "PromptsSelector": PromptSelector,
    "SaveToGallery": SaveToGallery,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptGallery": "🎨 Prompt图库",
    "PromptsSelector": "🎨 Prompt选择",
    "SaveToGallery": "🎨 保存到画廊"
}

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
