/**
 * 组合详情视图组件
 * 薄壳层：传入组合的 promptFilters 给 ImageGroupView
 */
import { h } from '../lib/preact.mjs';
import { useCallback } from '../lib/hooks.mjs';
import { useContextMenu } from './ContextMenu.js';
import { ImageGroupView } from './ImageGroupView.js';
import { updateCombination as updateCombinationApi } from '../utils.js';
import { showToast } from './Toast.js';
import { useGallery } from './GalleryContext.js';

export function CombinationDetailView() {
  const ctx = useGallery();
  const { showContextMenu } = useContextMenu();
  const comb = ctx.viewModeCombination;

  const getContextMenuItems = useCallback(
    (img, { flatIndex, allVisibleImages, onDeleteSuccess }) => {
      const items = [
        {
          icon: 'search',
          label: '查看大图',
          action: () => ctx.openLightbox({ ...comb, name: comb.name, images: allVisibleImages }, flatIndex),
        },
        {
          icon: 'image',
          label: '设为封面',
          action: async () => {
            try {
              await updateCombinationApi(comb.id, { coverImageId: img.path });
              showToast('已设为封面', 'success');
              ctx.handleCombinationSetCoverSuccess(img.path);
              await ctx.loadData();
            } catch (err) {
              showToast('设置封面失败: ' + err.message, 'error');
            }
          },
        },
        {
          icon: 'trash-2',
          label: '删除图片',
          action: async () => {
            if (!confirm('确定要删除这张图片吗？删除将从组合中所有成员Prompt移除。')) return;
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
    [comb, ctx],
  );

  const handleDeleteSuccess = useCallback(async () => {
    await ctx.handleCombinationDeleteImageSuccess();
    await ctx.loadData();
  }, [ctx.handleCombinationDeleteImageSuccess, ctx.loadData]);

  return h('div', { class: 'combination-detail-view' }, [
    h(ImageGroupView, {
      promptFilters: comb?.prompts || [],
      lightboxName: comb?.name || '组合图片',
      searchQuery: ctx.imageSearchQuery,
      onDataLoaded: ctx.setImageTotalCount,
      getContextMenuItems,
      showContextMenu,
      onDeleteSuccess: handleDeleteSuccess,
      cardSize: ctx.cardSize,
      openLightbox: ctx.openLightbox,
    }),
  ]);
}
