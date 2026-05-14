/**
 * Prompt卡片组件
 * 显示单个Prompt的信息和图片
 */
import { h } from '../lib/preact.mjs';
import { Icon } from '../lib/icons.mjs';
import { useState } from '../lib/hooks.mjs';
import { buildImageUrl } from '../utils.js';
import { BaseCard } from './BaseCard.js';
import { useContextMenu } from './ContextMenu.js';

export function GalleryCard({
  prompt,
  promptIndex,
  favorites,
  onFavoriteToggle,
  onImageClick,
  onDelete,
  onEdit,
  onSetCover,
  onMove,
  onCopy,
  onExport,
  // 多选相关props
  selectionMode = false,
  selected = false,
  onSelect,
}) {
  const [copied, setCopied] = useState(false);
  const isFav = favorites.has(prompt.value);
  const hasImages = prompt.imageCount > 0;
  const { showContextMenu } = useContextMenu();

  // 生成选择键（用于多选）
  const selectionKey = `prompt:${prompt.categoryId}:${prompt.value}`;

  // 封面图路径
  const coverPath = prompt.coverImagePath;
  const coverImage = coverPath ? { path: coverPath } : null;

  // ============ 事件处理 ============

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt.value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleContextMenu = (e) => {
    // 多选模式下不显示右键菜单
    if (selectionMode) return;

    const menuItems = [
      { icon: 'clipboard-list', label: '复制名称', action: handleCopy },
      {
        icon: 'star',
        label: '收藏',
        action: () => onFavoriteToggle(prompt.value),
      },
      {
        icon: 'edit',
        label: '编辑',
        action: () => onEdit && onEdit(prompt),
      },
      {
        icon: 'move',
        label: '移动',
        action: () => onMove && onMove(prompt),
      },
      {
        icon: 'copy',
        label: '复制到',
        action: () => onCopy && onCopy(prompt),
      },
      {
        icon: 'upload',
        label: '导出',
        action: () => onExport && onExport(prompt),
      },
      {
        icon: 'trash-2',
        label: '删除',
        action: () => onDelete && onDelete(prompt),
      },
    ];

    showContextMenu(e, menuItems);
  };

  // ============ 渲染函数 ============

  /**
   * 渲染覆盖信息层（名称+value左上角，数量右上角）
   */
  const renderOverlay = () => {
    const name = prompt.name || prompt.value;
    const value = prompt.value;
    const showValue = value && value !== name;

    return h('div', { class: 'gallery-card-overlay' }, [
      // 左上角：名称 + value
      h('div', { class: 'gallery-card-info-left' }, [
        h(
          'span',
          { class: 'gallery-card-name-tag', title: name },
          name,
        ),
        showValue &&
          h(
            'span',
            { class: 'gallery-card-value-tag', title: value },
            value,
          ),
      ]),
      // 右上角：数量
      h(
        'span',
        { class: 'gallery-card-count-tag' },
        `${prompt.imageCount}张`,
      ),
    ]);
  };

  /**
   * 渲染封面图片（含覆盖信息层）
   */
  const renderCoverImage = () => {
    if (!coverImage) return renderEmptyState();

    return h(
      'div',
      {
        class: 'gallery-image-cover',
        onClick: (e) => {
          if (!selectionMode) {
            onImageClick && onImageClick(promptIndex);
          }
        },
      },
      [
        h('img', {
          src: buildImageUrl(coverImage.path),
          alt: prompt.name || prompt.value,
          loading: 'lazy',
        }),
        renderOverlay(),
      ],
    );
  };

  /**
   * 渲染空状态（无图片，仍显示覆盖信息）
   */
  const renderEmptyState = () => {
    return h('div', { class: 'gallery-card-empty' }, [
      h('div', { class: 'gallery-card-empty-icon' }, h(Icon, { name: 'palette', size: 32 })),
      h('div', { class: 'gallery-card-empty-text' }, '暂无图片'),
      renderOverlay(),
    ]);
  };

  /**
   * 渲染图片区域
   */
  const renderImages = () => {
    return hasImages ? renderCoverImage() : renderEmptyState();
  };

  // ============ 主渲染 ============

  return h(
    BaseCard,
    {
      cardType: 'gallery',
      selectionMode,
      selected,
      selectionKey,
      onSelect,
      onContextMenu: handleContextMenu,
    },
    [renderImages()],
  );
}
