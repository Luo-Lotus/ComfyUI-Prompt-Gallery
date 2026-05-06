/**
 * 画廊模态框组件
 * 薄壳层：Provider 包裹 + 视图路由 + Dialog 渲染
 */
import { h } from '../lib/preact.mjs';
import { GalleryProvider, useGallery } from './GalleryContext.js';
import { GalleryGrid } from './GalleryGrid.js';
import { Lightbox } from './Lightbox.js';
import { AddPromptDialog } from './AddPromptDialog.js';
import { DeleteConfirmDialog } from './DeleteConfirmDialog.js';
import { CategoryDialog } from './CategoryDialog.js';
import { MoveDialog } from './MoveDialog.js';
import { CopyDialog } from './CopyDialog.js';
import { ImportImagesDialog } from './ImportImagesDialog.js';
import { ImportZipDialog } from './ImportZipDialog.js';
import { ExportDialog } from './ExportDialog.js';
import { CombinationDialog } from './CombinationDialog.js';
import { BatchActionBar } from './BatchActionBar.js';
import { BatchConfirmDialog } from './BatchConfirmDialog.js';
import { GalleryHeader } from './GalleryHeader.js';
import { GalleryFilterBar } from './GalleryFilterBar.js';
import { PromptDetailView } from './PromptDetailView.js';
import { CombinationDetailView } from './CombinationDetailView.js';
import { HistoryView } from './HistoryView.js';

import { Icon } from '../lib/icons.mjs';

export function GalleryModal({ isOpen, onClose, initialNavigation }) {
  return h(GalleryProvider, { isOpen, onClose, initialNavigation }, h(GalleryModalContent));
}

function GalleryModalContent() {
  const ctx = useGallery();

  return h(
    'div',
    {
      class: 'gallery-modal-overlay' + (ctx.isOpen ? ' open' : ''),
      onClick: (e) => {
        if (e.target.classList.contains('gallery-modal-overlay')) ctx.onClose();
      },
    },
    [
      h('div', { class: 'gallery-modal-content' }, [
        h(GalleryHeader),
        h('div', { class: 'gallery-modal-body' }, h(GalleryBody)),
        ctx.viewMode !== 'history' &&
          h('button', {
            class: 'history-floating-btn',
            onClick: () => ctx.navigateToHistory(),
            title: '查看历史图片',
          }, [
            h(Icon, { name: 'image', size: 14 }),
            ' 查看历史图片',
          ]),
      ]),

      // Dialog 层
      h(DialogLayer),
    ],
  );
}

function GalleryBody() {
  const ctx = useGallery();

  if (ctx.loading) {
    return h('div', { class: 'gallery-container' }, [
      h(GalleryFilterBar),
      h('div', { class: 'gallery-loading' }, [
        h('div', { class: 'gallery-loading-spinner' }),
        h('div', {}, '正在加载图库...'),
      ]),
    ]);
  }

  if (ctx.error) {
    return h('div', { class: 'gallery-container' }, [
      h(GalleryFilterBar),
      h('div', { class: 'gallery-error' }, [
        h('div', { class: 'gallery-error-icon' }, h(Icon, { name: 'alert-triangle', size: 32 })),
        h('div', {}, '加载图库失败'),
        h('div', { class: 'gallery-error-message' }, ctx.error),
      ]),
    ]);
  }

  return h('div', { class: 'gallery-container' }, [
    h(GalleryFilterBar),
    ctx.selectionMode && h(BatchActionBar),

    // 画廊视图
    h(
      'div',
      {
        key: 'gallery-view',
        class: 'view-stack-page',
        style: { display: ctx.viewMode === 'gallery' ? '' : 'none' },
      },
      [h(GalleryGrid)],
    ),

    // Prompt详情
    ctx.currentPrompt &&
      h(
        'div',
        {
          key: `prompt-${ctx.currentPrompt.name}`,
          class: 'view-stack-page',
          style: { display: ctx.viewMode === 'prompt' ? '' : 'none', overflow: 'hidden', padding: 0 },
        },
        [h(PromptDetailView)],
      ),

    // 组合详情
    ctx.viewModeCombination &&
      h(
        'div',
        {
          key: `combination-${ctx.viewModeCombination.id}`,
          class: 'view-stack-page',
          style: {
            display: ctx.viewMode === 'combination' ? '' : 'none',
            overflow: 'hidden',
            padding: 0,
          },
        },
        [h(CombinationDetailView)],
      ),

    // 历史视图
    ctx.viewMode === 'history' &&
      h(
        'div',
        {
          key: 'history-view',
          class: 'view-stack-page',
          style: { display: ctx.viewMode === 'history' ? '' : 'none', overflow: 'hidden', padding: 0 },
        },
        [h(HistoryView)],
      ),
  ]);
}

function DialogLayer() {
  const ctx = useGallery();
  const batchDetails = ctx.getSelectedDetails();

  return [
    h(Lightbox, {
      isOpen: ctx.lightbox.open,
      prompt: ctx.lightbox.prompt,
      imageIndex: ctx.lightbox.imageIndex,
      onClose: ctx.closeLightbox,
      onNavigate: ctx.handleLightboxNavigate,
    }),

    h(AddPromptDialog, {
      isOpen: ctx.showAddPromptDialog,
      mode: ctx.editModePrompt ? 'edit' : 'add',
      editModePrompt: ctx.editModePrompt,
      currentCategoryId: ctx.currentCategory,
      onClose: () => {
        ctx.setShowAddPromptDialog(false);
        ctx.setEditModePrompt(null);
        ctx.loadData();
      },
      onSave: () => {
        ctx.setShowAddPromptDialog(false);
        ctx.setEditModePrompt(null);
        ctx.loadData();
      },
    }),

    h(DeleteConfirmDialog, {
      isOpen: ctx.showDeleteConfirm,
      prompt: ctx.promptToDelete,
      onConfirm: () => {
        ctx.setShowDeleteConfirm(false);
        ctx.setPromptToDelete(null);
        ctx.loadData();
      },
      onCancel: () => {
        ctx.setShowDeleteConfirm(false);
        ctx.setPromptToDelete(null);
      },
    }),

    h(CategoryDialog, {
      isOpen: ctx.showCategoryDialog,
      mode: ctx.categoryDialogMode,
      category: ctx.editingCategory,
      categories: ctx.categories,
      currentCategoryId: ctx.currentCategory,
      onClose: () => ctx.setShowCategoryDialog(false),
      onSave: async (data) => {
        await ctx.handleCategoryDialogSave(data);
        ctx.loadData();
      },
    }),

    h(MoveDialog, {
      isOpen: ctx.showMoveDialog,
      itemType: ctx.moveItemType,
      item: ctx.moveItem,
      categories: ctx.categories,
      prompts: ctx.allPrompts,
      onClose: ctx.closeMoveDialog,
      onMove: ctx.handleMove,
    }),

    h(CopyDialog, {
      isOpen: ctx.showCopyDialog,
      itemType: ctx.copyItemType,
      item: ctx.copyItem,
      categories: ctx.categories,
      prompts: ctx.allPrompts,
      onClose: ctx.closeCopyDialog,
      onCopy: ctx.handleCopy,
    }),

    h(BatchConfirmDialog, {
      isOpen: ctx.showBatchConfirm,
      onClose: () => ctx.setShowBatchConfirm(false),
      operation: ctx.batchOperation,
      items: batchDetails,
      onConfirm: ctx.handleBatchConfirm,
    }),

    h(ImportImagesDialog, {
      isOpen: ctx.showImportDialog,
      viewMode: ctx.viewMode,
      currentCategory: ctx.currentCategory,
      currentPrompt: ctx.currentPrompt,
      categories: ctx.categories,
      onClose: () => ctx.setShowImportDialog(false),
      onSuccess: async () => {
        await ctx.loadData();
        ctx.setShowImportDialog(false);
      },
    }),

    h(ImportZipDialog, {
      isOpen: ctx.showImportZipDialog,
      currentCategory: ctx.currentCategory,
      onClose: () => ctx.setShowImportZipDialog(false),
      onSuccess: async () => {
        await ctx.refreshCategories();
        await ctx.loadData();
        ctx.setShowImportZipDialog(false);
      },
    }),

    h(ExportDialog, {
      isOpen: ctx.showExportDialog,
      title:
        ctx.exportPayload?.type === 'category'
          ? `导出分类: ${ctx.exportPayload.category.name}`
          : ctx.exportPayload?.type === 'batch'
            ? '批量导出Prompt'
            : ctx.exportPayload?.type === 'prompt'
              ? `导出Prompt: ${ctx.exportPayload.prompt.name || ctx.exportPayload.prompt.value}`
              : '导出',
      onClose: () => {
        ctx.setShowExportDialog(false);
        ctx.setExportPayload(null);
      },
      onConfirm: ctx.handleExportConfirm,
    }),

    h(CombinationDialog, {
      isOpen: ctx.showCombinationDialog,
      mode: ctx.combinationDialogMode,
      combination: ctx.editingCombination,
      currentCategoryId: ctx.currentCategory,
      prompts: ctx.allPrompts,
      onClose: () => {
        ctx.setShowCombinationDialog(false);
        ctx.setEditingCombination(null);
      },
      onSave: async () => {
        ctx.setShowCombinationDialog(false);
        ctx.setEditingCombination(null);
        await ctx.loadData();
      },
    }),
  ];
}
