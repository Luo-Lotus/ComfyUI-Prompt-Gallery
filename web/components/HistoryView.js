/**
 * 历史图片视图
 * 薄壳层：无 promptFilter，简化右键菜单
 */
import { h } from '../lib/preact.mjs';
import { useCallback } from '../lib/hooks.mjs';
import { useContextMenu } from './ContextMenu.js';
import { ImageGroupView } from './ImageGroupView.js';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';

export function HistoryView() {
  const ctx = useGallery();
  const { showContextMenu } = useContextMenu();

  const getContextMenuItems = useCallback(
    (img, { flatIndex, allVisibleImages, onDeleteSuccess }) => [
      {
        icon: 'search',
        label: '查看大图',
        action: () => ctx.openLightbox({ name: '历史图片', images: allVisibleImages }, flatIndex),
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
    ],
    [ctx.openLightbox],
  );

  return h(ImageGroupView, {
    lightboxName: '历史图片',
    searchQuery: ctx.imageSearchQuery,
    onDataLoaded: ctx.setImageTotalCount,
    getContextMenuItems,
    showContextMenu,
    cardSize: ctx.cardSize,
    openLightbox: ctx.openLightbox,
  });
}
