/**
 * ImageGroupView - 按日期分组的图片展示组件
 * 共享组件，供 PromptDetailView / HistoryView / CombinationDetailView 使用
 *
 * 搜索栏在 GalleryFilterBar 中，搜索关键词通过 searchQuery prop 传入
 * 组件内部管理：日期侧边栏、分组图片内容、滚动边缘加载
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useMemo, useRef, useCallback } from '../lib/hooks.mjs';
import { LazyList } from './LazyList.js';
import { buildImageUrl, fetchGroupedImages } from '../utils.js';
import { computeSizeVars } from './SizePresets.js';
import { showToast } from './Toast.js';

// 自适应模式下的图片项组件（检测实际宽高比）
function AdaptiveImageItem({ img, className, onClick, onContextMenu }) {
  const [ratio, setRatio] = useState(1);
  const imgRef = useRef(null);
  const handleLoad = useCallback(() => {
    const el = imgRef.current;
    if (el && el.naturalWidth > 0 && el.naturalHeight > 0) {
      setRatio(Math.max(0.5, Math.min(3.0, el.naturalWidth / el.naturalHeight)));
    }
  }, []);
  return h('div', {
    class: className,
    style: { '--card-aspect-ratio': ratio },
    onClick,
    onContextMenu,
  },
    h('img', {
      ref: imgRef,
      src: buildImageUrl(img.path, img.type),
      alt: img.path,
      loading: 'lazy',
      onLoad: handleLoad,
    }),
  );
}

// ============ DateSidebar ============

function DateSidebar({ dateList, dateCountMap, currentDateIndex, onJumpToDate }) {
  if (!dateList || dateList.length === 0) return null;

  return h('div', { class: 'date-sidebar' },
    h('div', { class: 'date-sidebar-list' },
      dateList.map((date, index) => {
        const isCurrent = currentDateIndex === index;
        const count = dateCountMap[date] || 0;
        return h(
          'button',
          {
            key: date,
            class: `date-sidebar-item ${isCurrent ? 'active' : ''}`,
            onClick: () => onJumpToDate(index),
          },
          [
            h('span', { class: 'date-sidebar-date' }, date),
            h('span', { class: 'date-sidebar-count' }, count),
          ],
        );
      }),
    ),
  );
}

// ============ ImageGroupView ============

/**
 * @param {Object} props
 * @param {string} [props.promptFilter] - 按此 prompt value 过滤图片
 * @param {string[]} [props.promptFilters] - 按多个 prompt value 取交集过滤（组合视图用）
 * @param {string} [props.lightboxName] - Lightbox 标题
 * @param {string} [props.searchQuery] - 外部搜索关键词（来自 GalleryFilterBar）
 * @param {Function} props.onDataLoaded - (totalImages) => void 数据加载后回调
 * @param {Function} props.getContextMenuItems - (img, ctx) => menuItem[]
 * @param {Function} props.showContextMenu - 从 useContextMenu() 获取
 * @param {boolean} [props.selectionMode]
 * @param {Set} [props.selectedItems]
 * @param {Function} [props.onSelectItem]
 * @param {Function} [props.onDeleteSuccess] - 删除后的额外回调
 * @param {number} props.cardSize
 * @param {boolean} [props.includeComfyOutput] - 是否包含 comfy_output 导入的图片
 * @param {Function} props.openLightbox
 */
export function ImageGroupView({
  promptFilter,
  promptFilters,
  lightboxName = '图片',
  searchQuery = '',
  customFilters = null,
  includeComfyOutput = false,
  onDataLoaded,
  getContextMenuItems,
  showContextMenu,
  selectionMode = false,
  selectedItems = null,
  onSelectItem = null,
  onDeleteSuccess,
  cardSize,
  cardLayoutMode = 'fixed',
  openLightbox,
}) {
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [currentDateIndex, setCurrentDateIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(null); // 'up' | 'down' | null

  const scrollContainerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const prevScrollHeightRef = useRef(0);

  const gridStyle = useMemo(() => computeSizeVars(cardSize), [cardSize]);

  // ============ 数据加载 ============
  const loadGroupedData = useCallback(
    async (search = '') => {
      setLoading(true);
      try {
        const result = await fetchGroupedImages({
          prompt: promptFilter || undefined,
          prompts: promptFilters || undefined,
          search: search || undefined,
          filters: customFilters || undefined,
          includeComfyOutput: includeComfyOutput || undefined,
        });
        if (result.success) {
          setGroupData(result);
          setVisibleRange({ start: 0, end: 0 });
          setCurrentDateIndex(0);
          if (onDataLoaded) onDataLoaded(result.totalImages);
        }
      } catch (err) {
        showToast('加载图片失败: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [promptFilter, promptFilters, customFilters, includeComfyOutput, onDataLoaded],
  );

  // 首次挂载、filter 变化或 searchQuery 变化时加载（search 增加 300ms debounce）
  useEffect(() => {
    const timer = setTimeout(() => {
      loadGroupedData(searchQuery);
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadGroupedData, searchQuery]);

  // 删除后重新加载
  const reloadData = useCallback(() => {
    loadGroupedData(searchQuery);
  }, [loadGroupedData, searchQuery]);

  const handleDeleteAndReload = useCallback(async () => {
    if (onDeleteSuccess) await onDeleteSuccess();
    reloadData();
  }, [onDeleteSuccess, reloadData]);

  // ============ 可见分组 ============
  const groups = groupData?.groups || [];
  const dateList = groupData?.dateList || [];

  const visibleGroups = useMemo(() => {
    const { start, end } = visibleRange;
    return groups.slice(start, end + 1);
  }, [groups, visibleRange]);

  const dateCountMap = useMemo(() => {
    const map = {};
    for (const g of groups) map[g.date] = g.count;
    return map;
  }, [groups]);

  // ============ 滚动边缘检测 + debounce ============
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || groups.length === 0) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const threshold = 100;

      if (scrollTop <= threshold && visibleRange.start > 0) {
        setLoadingMore('up');
        prevScrollHeightRef.current = scrollHeight;
        setVisibleRange((prev) => ({ start: prev.start - 1, end: prev.end }));
      } else if (scrollHeight - scrollTop - clientHeight <= threshold && visibleRange.end < groups.length - 1) {
        setLoadingMore('down');
        setVisibleRange((prev) => ({ start: prev.start, end: prev.end + 1 }));
      }
    }, 400);
  }, [groups.length, visibleRange]);

  useEffect(() => {
    if (prevScrollHeightRef.current > 0 && scrollContainerRef.current) {
      const diff = scrollContainerRef.current.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0) scrollContainerRef.current.scrollTop += diff;
      prevScrollHeightRef.current = 0;
    }
    // 延迟清除 loadingMore，让动画有时间显示
    if (loadingMore) {
      const timer = setTimeout(() => setLoadingMore(null), 300);
      return () => clearTimeout(timer);
    }
  }, [visibleRange]);

  // 内容高度不足时自动加载更多组
  useEffect(() => {
    if (loading || groups.length === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const checkAndLoad = () => {
      const { scrollHeight, clientHeight } = container;
      if (scrollHeight <= clientHeight && visibleRange.end < groups.length - 1) {
        setLoadingMore('down');
        setVisibleRange((prev) => ({ start: prev.start, end: prev.end + 1 }));
      }
    };
    requestAnimationFrame(checkAndLoad);
  }, [visibleRange, groups.length, loading]);

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  const handleJumpToDate = useCallback((dateIndex) => {
    setCurrentDateIndex(dateIndex);
    setVisibleRange({ start: dateIndex, end: dateIndex });
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    });
  }, []);

  // ============ 图片渲染 ============
  const renderImageItem = useCallback(
    (img, imgIndex, groupIndex) => {
      let flatIndex = 0;
      for (let i = 0; i < groupIndex; i++) flatIndex += visibleGroups[i].images.length;
      flatIndex += imgIndex;

      const allVisibleImages = visibleGroups.flatMap((g) => g.images);
      const imgKey = `image:${img.path}`;
      const isSelected = selectedItems && selectedItems.has(imgKey);

      const handleContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!getContextMenuItems || !showContextMenu) return;
        showContextMenu(e, getContextMenuItems(img, {
          flatIndex,
          allVisibleImages,
          lightboxName,
          onDeleteSuccess: handleDeleteAndReload,
        }));
      };

      const itemClass = `prompt-detail-image-item ${selectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`;
      const handleClick = (e) => {
        if (selectionMode && onSelectItem) {
          onSelectItem(imgKey, e.shiftKey);
        } else if (openLightbox) {
          openLightbox({ name: lightboxName, images: allVisibleImages }, flatIndex);
        }
      };

      if (cardLayoutMode === 'adaptive') {
        return h(AdaptiveImageItem, {
          key: img.path,
          img,
          className: itemClass,
          onClick: handleClick,
          onContextMenu: handleContextMenu,
        });
      }

      return h(
        'div',
        {
          key: img.path,
          class: itemClass,
          onClick: handleClick,
          onContextMenu: handleContextMenu,
        },
        h('img', {
          src: buildImageUrl(img.path, img.type),
          alt: `${lightboxName} - ${imgIndex + 1}`,
          loading: 'lazy',
        }),
      );
    },
    [visibleGroups, selectionMode, selectedItems, onSelectItem, openLightbox, lightboxName, getContextMenuItems, showContextMenu, handleDeleteAndReload, cardLayoutMode],
  );

  // ============ Loading / Empty ============
  if (loading) {
    return h('div', { class: 'image-group-view-loading' }, [
      h('div', { class: 'gallery-loading-spinner' }),
      h('div', {}, '正在加载图片...'),
    ]);
  }

  if (groups.length === 0) {
    return h('div', { class: 'image-group-view-empty' }, '暂无图片');
  }

  // ============ 渲染 ============
  return h('div', { class: 'image-group-view' }, [
    h('div', { class: 'image-group-body' }, [
      h(DateSidebar, {
        dateList,
        dateCountMap,
        currentDateIndex,
        onJumpToDate: handleJumpToDate,
      }),

      h(
        'div',
        {
          class: 'image-group-content',
          ref: scrollContainerRef,
          onScroll: handleScroll,
        },
        [
          // 顶部加载状态
          loadingMore === 'up' && h('div', { class: 'image-group-loading-indicator' }, [
            h('div', { class: 'gallery-loading-spinner small' }),
            h('span', {}, '加载更多...'),
          ]),

          visibleRange.start > 0 && !loadingMore &&
            h('div', { class: 'image-group-load-hint' }, '↑ 继续上滑加载更多'),

          ...visibleGroups.map((group, groupIndex) =>
            h(
              'div',
              { key: group.date, class: 'date-group', 'data-date': group.date },
              [
                h('div', { class: 'date-group-header' }, [
                  h('span', { class: 'date-group-label' }, group.date),
                  h('span', { class: 'date-group-count' }, `${group.count} 张`),
                ]),

                group.images.length > 0
                  ? h(LazyList, {
                      items: group.images,
                      renderItem: (img, imgIndex) => renderImageItem(img, imgIndex, groupIndex),
                      layout: cardLayoutMode === 'adaptive' ? 'flex' : 'grid',
                      className: 'prompt-detail-grid' + (cardLayoutMode === 'adaptive' ? ' adaptive' : ''),
                      style: gridStyle,
                      scrollContainer: 'parent',
                    })
                  : h('div', { class: 'date-group-empty' }, '无图片'),
              ],
            ),
          ),

          // 底部加载状态
          loadingMore === 'down' && h('div', { class: 'image-group-loading-indicator' }, [
            h('div', { class: 'gallery-loading-spinner small' }),
            h('span', {}, '加载更多...'),
          ]),

          visibleRange.end < groups.length - 1 && !loadingMore &&
            h('div', { class: 'image-group-load-hint' }, '↓ 继续下滑加载更多'),
        ],
      ),
    ]),
  ]);
}
