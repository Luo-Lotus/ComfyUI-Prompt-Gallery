/**
 * 画廊全局 Context
 * 管理画廊的所有共享状态、数据和操作函数
 */
import { h, createContext } from '../lib/preact.mjs';
import { useState, useEffect, useMemo, useRef, useCallback, useContext } from '../lib/hooks.mjs';
import {
  Storage,
  importPrompts,
  createCombination as createCombinationApi,
  updateCombination as updateCombinationApi,
  deleteCombination as deleteCombinationApi,
  moveCombination as moveCombinationApi,
  fetchCombinationImages,
  fetchGalleryData,
  exportPrompts,
  exportCategory,
} from '../utils.js';
import { useCategoryManager } from './hooks/useCategoryManager.js';
import { useGalleryData } from './hooks/useGalleryData.js';
import { useFilteredPrompts } from './hooks/useFilteredPrompts.js';
import { useSelection } from './hooks/useSelection.js';
import { useItemOperations } from './hooks/useItemOperations.js';
import { showToast } from './Toast.js';

const GalleryContext = createContext(null);

export function useGallery() {
  const ctx = useContext(GalleryContext);
  return ctx;
}

export function GalleryProvider({ children, isOpen, onClose, initialNavigation }) {
  // ============ 基础 UI 状态 ============
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(Storage.getFavorites());
  const [cardSize, setCardSize] = useState(() => Storage.getCardSize());
  const [viewMode, setViewMode] = useState('gallery');
  const [currentPrompt, setCurrentPrompt] = useState(null);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageSortBy, setImageSortBy] = useState('name');
  const [imageSortOrder, setImageSortOrder] = useState('asc');
  const [lightbox, setLightbox] = useState({
    open: false,
    prompt: null,
    imageIndex: 0,
  });

  // ============ 对话框状态 ============
  const [showAddPromptDialog, setShowAddPromptDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState(null);
  const [editModePrompt, setEditModePrompt] = useState(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // ============ 组合相关状态 ============
  const [showCombinationDialog, setShowCombinationDialog] = useState(false);
  const [combinationDialogMode, setCombinationDialogMode] = useState('add');
  const [editingCombination, setEditingCombination] = useState(null);
  const [viewModeCombination, setViewModeCombination] = useState(null);

  // ============ 导出对话框状态 ============
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportPayload, setExportPayload] = useState(null);

  // ============ Hooks ============

  // 返回画廊视图
  const navigateToGallery = useCallback(() => {
    setViewMode('gallery');
    setCurrentPrompt(null);
    setViewModeCombination(null);
    setImageSearchQuery('');
  }, []);

  // 分类管理
  const categoryMgr = useCategoryManager({
    viewMode,
    currentPrompt,
    viewModeCombination,
    onNavigateToGallery: navigateToGallery,
  });

  const currentCategory = categoryMgr.currentCategory;

  // 数据获取
  const { data, loading, error, loadData, setData } = useGalleryData(currentCategory);

  // 自动加载数据（仅在打开时）
  useEffect(() => {
    if (isOpen) loadData();
  }, [currentCategory, isOpen]);

  // 过滤排序
  const filteredPrompts = useFilteredPrompts(data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites);

  // 打开批量导出对话框
  const handleOpenBatchExportDialog = useCallback(() => {
    setExportPayload({ type: 'batch' });
    setShowExportDialog(true);
  }, []);

  // 多选管理
  const selection = useSelection({
    categories: categoryMgr.categories,
    filteredPrompts,
    currentPrompt,
    currentCategory,
    loadData,
    setCurrentPrompt,
    refreshCategories: categoryMgr.refreshCategories,
    openBatchExportDialog: handleOpenBatchExportDialog,
  });

  // 移动/复制操作
  const itemOps = useItemOperations({
    currentPrompt,
    currentCategory,
    viewMode,
    loadData,
    refreshCategories: categoryMgr.refreshCategories,
    setCurrentPrompt,
    setViewMode,
    getSelectedDetails: selection.getSelectedDetails,
    batchOperation: selection.batchOperation,
    resetSelection: selection.resetSelection,
  });

  // ============ 计算值 ============

  const currentCombinations = useMemo(() => {
    return data?.combinations || [];
  }, [data]);

  const filteredPromptImages = useMemo(() => {
    let images = [...(currentPrompt?.images || [])];
    if (imageSearchQuery) {
      const q = imageSearchQuery.toLowerCase();
      images = images.filter((img) => {
        const filename = (img.path || '').split(/[/\\]/).pop().toLowerCase();
        return filename.includes(q);
      });
    }
    images.sort((a, b) => {
      let cmp = 0;
      if (imageSortBy === 'time') {
        cmp = (a.mtime || 0) - (b.mtime || 0);
      } else {
        cmp = (a.path || '').localeCompare(b.path || '');
      }
      return imageSortOrder === 'asc' ? cmp : -cmp;
    });
    return images;
  }, [currentPrompt?.images, imageSearchQuery, imageSortBy, imageSortOrder]);

  const filteredCombinationImages = useMemo(() => {
    let images = [...(viewModeCombination?.images || [])];
    if (imageSearchQuery) {
      const q = imageSearchQuery.toLowerCase();
      images = images.filter((img) => {
        const filename = (img.path || '').split(/[/\\]/).pop().toLowerCase();
        return filename.includes(q);
      });
    }
    images.sort((a, b) => {
      let cmp = 0;
      if (imageSortBy === 'time') {
        cmp = (a.mtime || 0) - (b.mtime || 0);
      } else {
        cmp = (a.path || '').localeCompare(b.path || '');
      }
      return imageSortOrder === 'asc' ? cmp : -cmp;
    });
    return images;
  }, [viewModeCombination?.images, imageSearchQuery, imageSortBy, imageSortOrder]);

  const galleryOrderedKeys = useMemo(() => {
    const keys = [];
    categoryMgr.currentCategoryChildren.forEach((cat) => {
      keys.push(`category:${cat.id}`);
    });
    currentCombinations.forEach((comb) => {
      keys.push(`combination:${comb.id}`);
    });
    filteredPrompts.forEach((prompt) => {
      keys.push(`prompt:${prompt.categoryId}:${prompt.value}`);
    });
    return keys;
  }, [categoryMgr.currentCategoryChildren, currentCombinations, filteredPrompts]);

  const promptOrderedKeys = useMemo(() => {
    return filteredPromptImages.map((img) => `image:${img.path}`);
  }, [filteredPromptImages]);

  const combinationOrderedKeys = useMemo(() => {
    return filteredCombinationImages.map((img) => `image:${img.path}`);
  }, [filteredCombinationImages]);

  // ============ 事件处理 ============

  const handleFavoriteToggle = useCallback(
    (promptName) => {
      const updated = Storage.toggleFavorite(promptName, favorites);
      setFavorites(new Set(updated));
    },
    [favorites],
  );

  const handleCardClick = useCallback(
    async (promptIndex) => {
      const prompt = filteredPrompts[promptIndex];
      setCurrentPrompt(prompt);
      setViewMode('prompt');
      if (!prompt.images || prompt.images.length === 0) {
        try {
          const res = await fetch(`/prompt_gallery/prompt_images?value=${encodeURIComponent(prompt.value)}`);
          const result = await res.json();
          if (result.success && result.images) {
            setCurrentPrompt((prev) => (prev === prompt ? { ...prev, images: result.images } : prev));
          }
        } catch (err) {
          console.error('Failed to load prompt images:', err);
        }
      }
    },
    [filteredPrompts],
  );

  const handleLightboxNavigate = useCallback((direction) => {
    setLightbox((prev) => {
      if (!prev.prompt?.images) return prev;
      let newIndex = prev.imageIndex + direction;
      if (newIndex < 0) newIndex = prev.prompt.images.length - 1;
      if (newIndex >= prev.prompt.images.length) newIndex = 0;
      return { ...prev, imageIndex: newIndex };
    });
  }, []);

  const openLightbox = useCallback((prompt, imageIndex) => {
    setLightbox({ open: true, prompt, imageIndex });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox({ open: false, prompt: null, imageIndex: 0 });
  }, []);

  // 对话框打开
  const openAddDialog = useCallback(() => {
    setEditModePrompt(null);
    setShowAddPromptDialog(true);
  }, []);

  const openEditDialog = useCallback((prompt) => {
    setEditModePrompt(prompt);
    setShowAddPromptDialog(true);
  }, []);

  const openDeleteConfirm = useCallback((prompt) => {
    setPromptToDelete(prompt);
    setShowDeleteConfirm(true);
  }, []);

  // 组合事件
  const handleCombinationClick = useCallback(async (combination) => {
    try {
      const result = await fetchCombinationImages(combination.id);
      if (result.success) {
        setViewModeCombination({
          ...combination,
          images: result.images,
        });
        setViewMode('combination');
      }
    } catch (err) {
      showToast('加载组合图片失败: ' + err.message, 'error');
    }
  }, []);

  const handleCombinationEdit = useCallback((combination) => {
    setEditingCombination(combination);
    setCombinationDialogMode('edit');
    setShowCombinationDialog(true);
  }, []);

  const handleCombinationDuplicate = useCallback(
    (combination) => {
      itemOps.openCopyDialog(combination, 'combination');
    },
    [itemOps],
  );

  const handleCombinationDelete = useCallback(
    async (combination) => {
      if (!confirm(`确定要删除组合"${combination.name}"吗？`)) return;
      try {
        await deleteCombinationApi(combination.id);
        showToast('已删除组合', 'success');
        await loadData();
      } catch (err) {
        showToast('删除组合失败: ' + err.message, 'error');
      }
    },
    [loadData],
  );

  const handleCombinationDialogSave = useCallback(
    async (data) => {
      try {
        if (combinationDialogMode === 'add') {
          await createCombinationApi({
            ...data,
            categoryId: currentCategory,
          });
          showToast('组合创建成功', 'success');
        } else {
          await updateCombinationApi(editingCombination.id, data);
          showToast('组合更新成功', 'success');
        }
        setShowCombinationDialog(false);
        setEditingCombination(null);
        await loadData();
      } catch (err) {
        showToast('操作失败: ' + err.message, 'error');
      }
    },
    [combinationDialogMode, currentCategory, editingCombination, loadData],
  );

  const openCombinationDialog = useCallback((mode, combination = null) => {
    setCombinationDialogMode(mode);
    setEditingCombination(combination);
    setShowCombinationDialog(true);
  }, []);

  // 导出
  const handleExportPrompt = useCallback((prompt) => {
    setExportPayload({ type: 'prompt', prompt });
    setShowExportDialog(true);
  }, []);

  // 打开分类导出对话框
  const handleOpenExportDialog = useCallback((category) => {
    setExportPayload({ type: 'category', category });
    setShowExportDialog(true);
  }, []);

  // 统一导出确认
  const handleExportConfirm = useCallback(
    async (includeImages, maxImages) => {
      if (!exportPayload) return;
      const opts = { includeImages, maxImagesPerPrompt: maxImages };

      try {
        if (exportPayload.type === 'category') {
          await exportCategory(exportPayload.category.id, opts);
          showToast(`已导出分类: ${exportPayload.category.name}${includeImages ? '' : ' (仅结构)'}`, 'success');
        } else if (exportPayload.type === 'prompt') {
          await exportPrompts(
            [
              {
                categoryId: exportPayload.prompt.categoryId,
                value: exportPayload.prompt.value,
              },
            ],
            opts,
          );
          showToast(`已导出Prompt: ${exportPayload.prompt.name || exportPayload.prompt.value}`, 'success');
        } else if (exportPayload.type === 'batch') {
          const details = selection.getSelectedDetails();
          const promptKeys = details.prompts.map((a) => ({
            categoryId: a.categoryId,
            value: a.value,
          }));
          if (promptKeys.length === 0) {
            showToast('请选择Prompt后导出', 'warning');
            return;
          }
          await exportPrompts(promptKeys, opts);
          showToast(`已导出 ${promptKeys.length} 个Prompt`, 'success');
        }
      } catch (error) {
        showToast('导出失败: ' + error.message, 'error');
      }
    },
    [exportPayload, selection],
  );

  // 导入Prompt
  const handleImportPrompts = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const result = await importPrompts(file, currentCategory);
        if (result.success) {
          const parts = [];
          if (result.addedCategories > 0) parts.push(`${result.addedCategories} 个分类`);
          if (result.addedPrompts > 0) parts.push(`${result.addedPrompts} 个Prompt`);
          if (result.addedCombinations > 0) parts.push(`${result.addedCombinations} 个组合`);
          if (result.addedImages > 0) parts.push(`${result.addedImages} 张图片`);
          showToast(`导入成功: ${parts.join(', ') || '无新增内容'}`, 'success');
          await categoryMgr.refreshCategories();
          await loadData();
        } else {
          showToast(result.error || '导入失败', 'error');
        }
      } catch (error) {
        showToast('导入失败: ' + error.message, 'error');
      }
      e.target.value = '';
    },
    [currentCategory, loadData, categoryMgr],
  );

  // Prompt详情回调
  const handlePromptDeleteImageSuccess = useCallback(async () => {
    await loadData();
    const updatedData = await fetch(`/prompt_gallery/data?category=${currentCategory}`);
    const result = await updatedData.json();
    const updatedPrompt = result.prompts?.find(
      (a) => a.categoryId === currentPrompt?.categoryId && a.value === currentPrompt?.value,
    );
    if (updatedPrompt) {
      setCurrentPrompt(updatedPrompt);
    }
  }, [currentCategory, currentPrompt, loadData]);

  const handlePromptSetCoverSuccess = useCallback((imagePath) => {
    setCurrentPrompt((prev) => ({
      ...prev,
      coverImagePath: imagePath,
    }));
  }, []);

  // 组合详情回调
  const handleCombinationDeleteImageSuccess = useCallback(async () => {
    if (!viewModeCombination) return;
    const result = await fetchCombinationImages(viewModeCombination.id);
    if (result.success) {
      setViewModeCombination({
        ...viewModeCombination,
        images: result.images,
      });
    }
  }, [viewModeCombination]);

  const handleCombinationSetCoverSuccess = useCallback((imagePath) => {
    setViewModeCombination((prev) => ({
      ...prev,
      coverImageId: imagePath,
      coverImagePath: imagePath,
    }));
  }, []);

  // 封装选择处理
  const handleGallerySelect = useCallback(
    (key, shiftKey) => {
      selection.handleSelectItem(key, shiftKey, galleryOrderedKeys);
    },
    [selection, galleryOrderedKeys],
  );

  const handlePromptSelect = useCallback(
    (key, shiftKey) => {
      selection.handleSelectItem(key, shiftKey, promptOrderedKeys);
    },
    [selection, promptOrderedKeys],
  );

  const handleCombinationSelect = useCallback(
    (key, shiftKey) => {
      selection.handleSelectItem(key, shiftKey, combinationOrderedKeys);
    },
    [selection, combinationOrderedKeys],
  );

  // 全选（按当前视图）
  const handleSelectAllInView = useCallback(() => {
    if (viewMode === 'prompt' && currentPrompt?.images) {
      const newSet = new Set();
      filteredPromptImages.forEach((img) => newSet.add(`image:${img.path}`));
      selection.setSelectedItems(newSet);
    } else if (viewMode === 'combination' && viewModeCombination?.images) {
      const newSet = new Set();
      filteredCombinationImages.forEach((img) => newSet.add(`image:${img.path}`));
      selection.setSelectedItems(newSet);
    } else {
      selection.handleSelectAll();
    }
  }, [viewMode, currentPrompt, viewModeCombination, filteredPromptImages, filteredCombinationImages, selection]);

  // 批量移动/复制（封装 itemOps setter 注入）
  const handleBatchMoveAction = useCallback(() => {
    selection.handleBatchMove({
      setMoveItem: itemOps.setMoveItem,
      setMoveItemType: itemOps.setMoveItemType,
      setShowMoveDialog: itemOps.setShowMoveDialog,
    });
  }, [selection, itemOps]);

  const handleBatchCopyAction = useCallback(() => {
    selection.handleBatchCopy({
      setCopyItem: itemOps.setCopyItem,
      setCopyItemType: itemOps.setCopyItemType,
      setShowCopyDialog: itemOps.setShowCopyDialog,
    });
  }, [selection, itemOps]);

  // 分类删除（封装 loadData 回调）
  const handleCategoryDelete = useCallback(
    async (cat) => {
      await categoryMgr.handleDeleteCategory(cat);
      loadData();
    },
    [categoryMgr, loadData],
  );

  // 组合移动
  const handleCombinationMove = useCallback(
    (combination) => {
      itemOps.openMoveDialog(combination, 'combination');
    },
    [itemOps],
  );

  // ============ 外部导航处理 ============
  const navRef = useRef(null);

  useEffect(() => {
    if (!initialNavigation) return;
    if (navRef.current === initialNavigation) return;

    const nav = initialNavigation;
    const targetCategoryId = nav.categoryId || 'root';

    categoryMgr.setCurrentCategory(targetCategoryId);
    setViewMode('gallery');
    setCurrentPrompt(null);
    setViewModeCombination(null);
    setImageSearchQuery('');

    const loadDataAndNavigate = async () => {
      const result = await fetchGalleryData(targetCategoryId);
      result.prompts = result.prompts.map((prompt) => ({
        ...prompt,
        maxTime:
          prompt.images && prompt.images.length > 0
            ? Math.max(...prompt.images.map((img) => img.mtime))
            : prompt.createdAt || 0,
      }));

      navRef.current = initialNavigation;
      setData(result);

      if (nav.type === 'prompt' && nav.promptName) {
        const prompt = result.prompts?.find((a) => a.value === nav.promptName && a.categoryId === targetCategoryId);
        if (prompt) {
          setCurrentPrompt(prompt);
          setViewMode('prompt');
          if (!prompt.images || prompt.images.length === 0) {
            fetch(`/prompt_gallery/prompt_images?value=${encodeURIComponent(prompt.value)}`)
              .then((res) => res.json())
              .then((imgResult) => {
                if (imgResult.success && imgResult.images) {
                  setCurrentPrompt((prev) =>
                    prev?.value === prompt.value
                      ? {
                          ...prev,
                          images: imgResult.images,
                        }
                      : prev,
                  );
                }
              })
              .catch((err) => console.error('Failed to load prompt images:', err));
          }
        }
      } else if (nav.type === 'combination' && nav.combinationId) {
        const combination = result.combinations?.find((c) => c.id === nav.combinationId);
        if (combination) {
          handleCombinationClick(combination);
        }
      }
    };

    loadDataAndNavigate();
  }, [initialNavigation]);

  // ============ Context Value ============
  const contextValue = useMemo(
    () => ({
      // Navigation
      viewMode,
      setViewMode,
      currentPrompt,
      setCurrentPrompt,
      viewModeCombination,
      setViewModeCombination,
      currentCategory,
      navigateToGallery,

      // Data
      data,
      loading,
      error,
      loadData,

      // Categories
      categories: categoryMgr.categories,
      allPrompts: categoryMgr.allPrompts,
      categoryPath: categoryMgr.categoryPath,
      currentCategoryChildren: categoryMgr.currentCategoryChildren,
      refreshCategories: categoryMgr.refreshCategories,
      handleCategorySelect: categoryMgr.handleCategorySelect,
      handleBreadcrumbNavigate: categoryMgr.handleBreadcrumbNavigate,
      handleAddCategory: categoryMgr.handleAddCategory,
      handleEditCategory: categoryMgr.handleEditCategory,
      handleDeleteCategory: handleCategoryDelete,
      handleCategoryDialogSave: categoryMgr.handleCategoryDialogSave,
      showCategoryDialog: categoryMgr.showCategoryDialog,
      categoryDialogMode: categoryMgr.categoryDialogMode,
      editingCategory: categoryMgr.editingCategory,
      setShowCategoryDialog: categoryMgr.setShowCategoryDialog,

      // Filtering
      filteredPrompts,
      searchQuery,
      setSearchQuery,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      showFavoritesOnly,
      setShowFavoritesOnly,
      favorites,
      handleFavoriteToggle,
      cardSize,
      setCardSize,
      imageSearchQuery,
      setImageSearchQuery,
      imageSortBy,
      setImageSortBy,
      imageSortOrder,
      setImageSortOrder,
      filteredPromptImages,
      filteredCombinationImages,
      currentCombinations,

      // Selection
      selectionMode: selection.selectionMode,
      selectedItems: selection.selectedItems,
      getSelectionType: selection.getSelectionType,
      handleToggleSelectionMode: selection.handleToggleSelectionMode,
      handleGallerySelect,
      handlePromptSelect,
      handleCombinationSelect,
      handleSelectAllInView,
      handleDeselectAll: selection.handleDeselectAll,
      getSelectedDetails: selection.getSelectedDetails,
      resetSelection: selection.resetSelection,
      setSelectedItems: selection.setSelectedItems,

      // Batch
      showBatchConfirm: selection.showBatchConfirm,
      batchOperation: selection.batchOperation,
      handleBatchDelete: selection.handleBatchDelete,
      handleBatchMoveAction,
      handleBatchCopyAction,
      handleBatchExport: selection.handleBatchExport,
      handleBatchConfirm: selection.handleBatchConfirm,
      setShowBatchConfirm: selection.setShowBatchConfirm,

      // Item operations
      showMoveDialog: itemOps.showMoveDialog,
      moveItem: itemOps.moveItem,
      moveItemType: itemOps.moveItemType,
      showCopyDialog: itemOps.showCopyDialog,
      copyItem: itemOps.copyItem,
      copyItemType: itemOps.copyItemType,
      openMoveDialog: itemOps.openMoveDialog,
      openCopyDialog: itemOps.openCopyDialog,
      closeMoveDialog: itemOps.closeMoveDialog,
      closeCopyDialog: itemOps.closeCopyDialog,
      handleMove: itemOps.handleMove,
      handleCopy: itemOps.handleCopy,

      // Dialog state
      showAddPromptDialog,
      setShowAddPromptDialog,
      editModePrompt,
      setEditModePrompt,
      openAddDialog,
      openEditDialog,
      showDeleteConfirm,
      setShowDeleteConfirm,
      promptToDelete,
      setPromptToDelete,
      openDeleteConfirm,
      showImportDialog,
      setShowImportDialog,
      showExportDialog,
      setShowExportDialog,
      exportPayload,
      setExportPayload,
      showCombinationDialog,
      setShowCombinationDialog,
      combinationDialogMode,
      setCombinationDialogMode,
      editingCombination,
      setEditingCombination,
      openCombinationDialog,

      // Lightbox
      lightbox,
      openLightbox,
      closeLightbox,
      handleLightboxNavigate,

      // Business callbacks
      handleCardClick,
      handleCombinationClick,
      handleCombinationEdit,
      handleCombinationDuplicate,
      handleCombinationDelete,
      handleCombinationMove,
      handleCombinationDialogSave,
      handleExportPrompt,
      handleOpenExportDialog,
      handleOpenBatchExportDialog,
      handleExportConfirm,
      handleImportPrompts,
      handlePromptDeleteImageSuccess,
      handlePromptSetCoverSuccess,
      handleCombinationDeleteImageSuccess,
      handleCombinationSetCoverSuccess,

      // Props from parent
      isOpen,
      onClose,
    }),
    [
      viewMode,
      currentPrompt,
      viewModeCombination,
      currentCategory,
      data,
      loading,
      error,
      categoryMgr.categories,
      categoryMgr.allPrompts,
      categoryMgr.categoryPath,
      categoryMgr.currentCategoryChildren,
      categoryMgr.refreshCategories,
      categoryMgr.showCategoryDialog,
      categoryMgr.categoryDialogMode,
      categoryMgr.editingCategory,
      filteredPrompts,
      searchQuery,
      sortBy,
      sortOrder,
      showFavoritesOnly,
      favorites,
      cardSize,
      imageSearchQuery,
      imageSortBy,
      imageSortOrder,
      filteredPromptImages,
      filteredCombinationImages,
      currentCombinations,
      selection.selectionMode,
      selection.selectedItems,
      selection.showBatchConfirm,
      selection.batchOperation,
      itemOps.showMoveDialog,
      itemOps.moveItem,
      itemOps.moveItemType,
      itemOps.showCopyDialog,
      itemOps.copyItem,
      itemOps.copyItemType,
      showAddPromptDialog,
      editModePrompt,
      showDeleteConfirm,
      promptToDelete,
      showImportDialog,
      showExportDialog,
      exportPayload,
      showCombinationDialog,
      combinationDialogMode,
      editingCombination,
      lightbox,
      isOpen,
      onClose,
    ],
  );

  return h(GalleryContext.Provider, { value: contextValue }, children);
}
