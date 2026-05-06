/**
 * Prompt详情模态框
 * 显示Prompt的所有图片（平铺）
 */
import { h } from '../lib/preact.mjs';
import { useState } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';
import { Lightbox } from './Lightbox.js';
import { MoveDialog } from './MoveDialog.js';
import { useContextMenu } from './ContextMenu.js';
import { Icon } from '../lib/icons.mjs';

export function PromptDetailModal({ isOpen, prompt, onClose, onImageDelete, categories, allPrompts }) {
  const [lightbox, setLightbox] = useState({
    open: false,
    prompt: null,
    imageIndex: 0,
  });
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const { showContextMenu } = useContextMenu();

  const handleImageClick = (imageIndex) => {
    setLightbox({
      open: true,
      prompt: prompt,
      imageIndex,
    });
  };

  const handleDeleteImage = async (imagePath, index) => {
    if (!confirm(`确定要删除这张图片吗？`)) return;

    try {
      // 调用删除图片的 API
      const response = await fetch(`/prompt_gallery/image`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath, promptId: prompt.id }),
      });

      if (response.ok) {
        // 通知父组件刷新数据
        if (onImageDelete) {
          onImageDelete();
        }
      } else {
        const error = await response.json();
        alert(`删除失败: ${error.error || '未知错误'}`);
      }
    } catch (error) {
      alert(`删除失败: ${error.message}`);
    }
  };

  const handleImageContextMenu = (e, image) => {
    const menuItems = [
      {
        icon: 'search',
        label: '查看大图',
        action: () => handleImageClick(prompt.images.indexOf(image)),
      },
      {
        icon: 'move',
        label: '移动图片',
        action: () => handleMoveImage(image),
      },
      {
        icon: 'trash-2',
        label: '删除图片',
        action: () => handleDeleteImage(image.path, prompt.images.indexOf(image)),
      },
    ];

    showContextMenu(e, menuItems);
  };

  const handleMoveImage = (image) => {
    setSelectedImage(image);
    setShowMoveDialog(true);
  };

  const handleMove = async (item, target) => {
    try {
      const response = await fetch('/prompt_gallery/image/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePath: selectedImage.path,
          fromPromptId: prompt.id,
          toPromptId: target.id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowMoveDialog(false);
        setSelectedImage(null);
        if (onImageDelete) {
          onImageDelete();
        }
      } else {
        throw new Error(data.error || '移动失败');
      }
    } catch (error) {
      throw error;
    }
  };

  const handleLightboxNavigate = (direction) => {
    let newIndex = lightbox.imageIndex + direction;
    if (newIndex < 0) newIndex = prompt.images.length - 1;
    if (newIndex >= prompt.images.length) newIndex = 0;
    setLightbox((prev) => ({ ...prev, imageIndex: newIndex }));
  };

  if (!isOpen || !prompt) return null;

  const hasImages = prompt.images && prompt.images.length > 0;

  const handleOverlayClick = (e) => {
    // 如果 lightbox 没有打开，点击遮罩才关闭
    if (!lightbox.open && e.target.classList.contains('prompt-detail-overlay')) {
      onClose();
    }
  };

  return h('div', { class: 'prompt-detail-overlay', onClick: handleOverlayClick }, [
    !lightbox.open &&
      h(
        'div',
        {
          class: 'prompt-detail-content',
          onClick: (e) => e.stopPropagation(),
        },
        [
          // 头部
          h('div', { class: 'prompt-detail-header' }, [
            h('h2', {}, prompt.name || prompt.value),
            h(
              'button',
              {
                class: 'close-btn',
                onClick: onClose,
                title: '关闭',
              },
              h(Icon, { name: 'x', size: 16 }),
            ),
          ]),

          // 图片网格
          hasImages
            ? h(
                'div',
                { class: 'prompt-detail-grid' },
                prompt.images.map((img, index) =>
                  h(
                    'div',
                    {
                      key: img.path,
                      class: 'prompt-detail-image-item',
                      onClick: () => handleImageClick(index),
                      onContextMenu: (e) => handleImageContextMenu(e, img),
                    },
                    [
                      h('img', {
                        src: buildImageUrl(img.path, img.type),
                        alt: `${prompt.name || prompt.value} - ${index + 1}`,
                        loading: 'lazy',
                      }),
                    ],
                  ),
                ),
              )
            : h('div', { class: 'prompt-detail-empty' }, '暂无图片'),
        ],
      ),

    // Lightbox
    lightbox.open &&
      h(Lightbox, {
        isOpen: lightbox.open,
        prompt: lightbox.prompt || { images: [] },
        imageIndex: lightbox.imageIndex,
        onClose: () =>
          setLightbox({
            open: false,
            prompt: null,
            imageIndex: 0,
          }),
        onNavigate: handleLightboxNavigate,
      }),

    // Move Dialog
    showMoveDialog &&
      h(MoveDialog, {
        isOpen: showMoveDialog,
        itemType: 'image',
        item: selectedImage,
        categories: categories || [],
        prompts: allPrompts || [],
        onClose: () => {
          setShowMoveDialog(false);
          setSelectedImage(null);
        },
        onMove: handleMove,
      }),
  ]);
}
