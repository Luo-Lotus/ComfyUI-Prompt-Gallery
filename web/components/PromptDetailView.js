/**
 * Prompt详情视图组件
 * 显示Prompt的图片网格，支持搜索过滤、右键菜单、多选
 */
import { h } from '../lib/preact.mjs';
import { useMemo } from '../lib/hooks.mjs';
import { useContextMenu } from './ContextMenu.js';
import { LazyList } from './LazyList.js';
import { buildImageUrl, setPromptCover } from '../utils.js';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';
import { computeSizeVars } from './SizePresets.js';

export function PromptDetailView() {
  const ctx = useGallery();
  const { showContextMenu } = useContextMenu();

  const gridStyle = useMemo(() => computeSizeVars(ctx.cardSize), [ctx.cardSize]);

  const prompt = ctx.currentPrompt;
  const images = ctx.filteredPromptImages;

  const handleImageContextMenu = (e, image) => {
    e.preventDefault();
    e.stopPropagation();

    const menuItems = [
      {
        icon: 'search',
        label: '查看大图',
        action: () => ctx.openLightbox({ ...prompt, images }, images.indexOf(image)),
      },
      {
        icon: 'image',
        label: '设为封面',
        action: async () => {
          try {
            await setPromptCover(prompt.categoryId, prompt.value, image.path);
            showToast('已设为封面', 'success');
            ctx.handlePromptSetCoverSuccess(image.path);
          } catch (err) {
            showToast('设置封面失败: ' + err.message, 'error');
          }
        },
      },
      {
        icon: 'move',
        label: '移动图片',
        action: () => ctx.openMoveDialog(image, 'image'),
      },
      {
        icon: 'copy',
        label: '复制图片',
        action: () => ctx.openCopyDialog(image, 'image'),
      },
      {
        icon: 'trash-2',
        label: '删除图片',
        action: async () => {
          if (!confirm('确定要删除这张图片吗？')) return;
          try {
            const response = await fetch('/prompt_gallery/image', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imagePath: image.path,
                promptId: prompt.id,
              }),
            });
            if (response.ok) {
              await ctx.handlePromptDeleteImageSuccess();
            } else {
              const error = await response.json();
              alert(`删除失败: ${error.error || '未知错误'}`);
            }
          } catch (error) {
            alert(`删除失败: ${error.message}`);
          }
        },
      },
    ];

    showContextMenu(e, menuItems);
  };

  return h('div', { class: 'prompt-detail-view' }, [
    images.length > 0
      ? h(LazyList, {
          items: images,
          renderItem: (img, index) => {
            const imgKey = `image:${img.path}`;
            const isSelected = ctx.selectedItems.has(imgKey);
            return h(
              'div',
              {
                key: img.path,
                class: `prompt-detail-image-item ${ctx.selectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`,
                onClick: (e) => {
                  if (ctx.selectionMode) {
                    ctx.handlePromptSelect(imgKey, e.shiftKey);
                  } else {
                    ctx.openLightbox({ ...prompt, images }, index);
                  }
                },
                onContextMenu: (e) => handleImageContextMenu(e, img),
              },
              [
                h('img', {
                  src: buildImageUrl(img.path),
                  alt: `${prompt.name || prompt.value} - ${index + 1}`,
                  loading: 'lazy',
                }),
              ],
            );
          },
          layout: 'grid',
          className: 'prompt-detail-grid',
          style: gridStyle,
        })
      : h('div', { class: 'prompt-detail-empty' }, '暂无图片'),
  ]);
}
