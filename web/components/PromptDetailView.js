/**
 * Prompt详情视图组件
 * 薄壳层：传入 promptFilter 和右键菜单配置给 ImageGroupView
 */
import { h } from '../lib/preact.mjs';
import { useCallback } from '../lib/hooks.mjs';
import { useContextMenu } from './ContextMenu.js';
import { ImageGroupView } from './ImageGroupView.js';
import { setPromptCover } from '../utils.js';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';

export function PromptDetailView() {
  const ctx = useGallery();
  const { showContextMenu } = useContextMenu();
  const prompt = ctx.currentPrompt;

  const getContextMenuItems = useCallback(
    (img, { flatIndex, allVisibleImages, onDeleteSuccess }) => {
      const items = [
        {
          icon: 'search',
          label: '查看大图',
          action: () => ctx.openLightbox({ ...prompt, images: allVisibleImages }, flatIndex),
        },
        {
          icon: 'image',
          label: '设为封面',
          action: async () => {
            try {
              await setPromptCover(prompt.categoryId, prompt.value, img.path);
              showToast('已设为封面', 'success');
              ctx.handlePromptSetCoverSuccess(img.path);
            } catch (err) {
              showToast('设置封面失败: ' + err.message, 'error');
            }
          },
        },
        {
          icon: 'move',
          label: '移动图片',
          action: () => ctx.openMoveDialog(img, 'image'),
        },
        {
          icon: 'copy',
          label: '复制图片',
          action: () => ctx.openCopyDialog(img, 'image'),
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
                body: JSON.stringify({ imagePath: img.path }),
              });
              if (response.ok) {
                showToast('图片已删除', 'success');
                await onDeleteSuccess();
              } else {
                const error = await response.json();
                showToast('删除失败: ' + (error.error || '未知错误'), 'error');
              }
            } catch (error) {
              showToast('删除失败: ' + error.message, 'error');
            }
          },
        },
      ];
      return items;
    },
    [prompt, ctx],
  );

  const handleDeleteSuccess = useCallback(async () => {
    await ctx.handlePromptDeleteImageSuccess();
  }, [ctx.handlePromptDeleteImageSuccess]);

  return h('div', { class: 'prompt-detail-view' }, [
    h(ImageGroupView, {
      promptFilter: prompt?.value,
      lightboxName: prompt?.name || prompt?.value || '图片',
      searchQuery: ctx.imageSearchQuery,
      onDataLoaded: ctx.setImageTotalCount,
      getContextMenuItems,
      showContextMenu,
      selectionMode: ctx.selectionMode,
      selectedItems: ctx.selectedItems,
      onSelectItem: ctx.handlePromptSelect,
      onDeleteSuccess: handleDeleteSuccess,
      cardSize: ctx.cardSize,
      openLightbox: ctx.openLightbox,
    }),
  ]);
}
