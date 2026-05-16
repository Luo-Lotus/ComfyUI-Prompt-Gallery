/**
 * 分区项组件
 * 显示单个分区及其内容
 */
import { h } from '../../lib/preact.mjs';
import { useState, useEffect, useRef, useMemo } from '../../lib/hooks.mjs';
import { Icon } from '../../lib/icons.mjs';
import { PartitionHeader } from './PartitionHeader.js';
import { useBodyRender } from './hooks/useBodyRender.js';
import { usePartitionPreview } from './hooks/usePartitionPreview.js';

function getWeightColor(weight) {
  const w = Math.max(0, Math.min(2, weight));
  let h, s, l;
  if (w <= 1) {
    const t = w;
    h = 220 - 3 * t;
    s = 25 + 66 * t;
    l = 55 + 5 * t;
  } else {
    const t = w - 1;
    h = 217 + 33 * t;
    s = 91 - 6 * t;
    l = 60 - 35 * t;
  }
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function WeightSliderPopup({ weight, style, onChange, onMouseEnter, onMouseLeave }) {
  const [value, setValue] = useState(weight);

  const handleInput = (e) => {
    const val = Math.round(parseFloat(e.target.value) * 10) / 10;
    setValue(val);
    onChange(val);
  };

  return h(
    'div',
    {
      class: 'weight-slider-popup',
      style,
      onMouseEnter,
      onMouseLeave,
    },
    [
      h('input', {
        type: 'range',
        class: 'weight-slider-input',
        min: 0,
        max: 2,
        step: 0.1,
        value,
        onInput: handleInput,
      }),
      h('span', { class: 'weight-slider-popup-value' }, value.toFixed(1)),
    ],
  );
}

export function PartitionItem({
  partition,
  prompts,
  partitionCategories,
  partitionCombinations,
  promptWeights,
  allPrompts,
  onPartitionAction,
  onPromptMove,
  onCategoryMove,
  onPromptRemove,
  onCategoryRemove,
  onCombinationMove,
  onCombinationRemove,
  onPromptWeightChange,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [hoveredKey, setHoveredKey] = useState(null);
  const hideTimerRef = useRef(null);

  const weightsRef = useRef(promptWeights);
  weightsRef.current = promptWeights;
  const weightChangeRef = useRef(onPromptWeightChange);
  weightChangeRef.current = onPromptWeightChange;

  // body 级渲染（不受节点 transform 影响）
  const { renderToBody, clear: clearSlider } = useBodyRender();

  // 分区预览 hook
  const { onPreviewEnter, onPreviewLeave, buildPreviewItems } = usePartitionPreview();
  const previewItems = useMemo(
    () => buildPreviewItems(partition, prompts, partitionCategories, partitionCombinations, allPrompts),
    [partition, prompts, partitionCategories, partitionCombinations, allPrompts],
  );
  const handlePreviewEnter = (e) => onPreviewEnter(e, previewItems);
  const handlePreviewLeave = () => onPreviewLeave();

  // 当标签被删除时清除悬浮状态
  const allKeys = new Set([
    ...prompts.map((a) => (a._orphaned ? a._orphanedKey : `${a.categoryId}:${a.value}`)),
    ...(partitionCategories || []).map((c) => c.id),
    ...(partitionCombinations || []).map((c) => `combination:${c.id}`),
  ]);
  if (hoveredKey && !allKeys.has(hoveredKey)) {
    setHoveredKey(null);
  }

  const totalCount = prompts.length + partitionCategories.length + (partitionCombinations || []).length;
  const partitionClass = `partition-item ${partition.isDefault ? 'is-default' : ''} ${!partition.enabled ? 'disabled' : ''} ${isDragOver ? 'drag-over' : ''}`;

  const scheduleHide = () => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHoveredKey(null), 200);
  };

  const cancelHide = () => {
    clearTimeout(hideTimerRef.current);
  };

  // 用 Preact render 挂载/卸载悬浮滑条到 portal
  useEffect(() => {
    if (!hoveredKey) {
      clearSlider();
      return;
    }

    const tagEl = document.querySelector(`[data-weight-key="${CSS.escape(hoveredKey)}"]`);
    if (!tagEl) return;
    const rect = tagEl.getBoundingClientRect();

    const weights = weightsRef.current;
    const weight = weights && weights[hoveredKey] != null ? weights[hoveredKey] : 1.0;

    renderToBody(
      h(WeightSliderPopup, {
        weight,
        style: {
          position: 'fixed',
          top: `${rect.top - 32}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: 'translateX(-50%)',
          pointerEvents: 'auto',
        },
        onChange: (val) => {
          weightChangeRef.current && weightChangeRef.current(hoveredKey, val);
        },
        onMouseEnter: cancelHide,
        onMouseLeave: scheduleHide,
      }),
    );

    return () => clearSlider();
  }, [hoveredKey]);

  // 拖拽经过
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  // 拖拽离开
  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // 放置
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const data = e.dataTransfer.getData('text/plain');
      if (!data) return;

      const draggedData = JSON.parse(data);

      // 分区拖拽由 PartitionList 处理
      if (draggedData.type === 'partition') return;

      if (draggedData.type === 'prompt') {
        onPromptMove && onPromptMove(draggedData.key, partition.id);
      } else if (draggedData.type === 'category') {
        onCategoryMove && onCategoryMove(draggedData.id, partition.id);
      } else if (draggedData.type === 'combination') {
        onCombinationMove && onCombinationMove(draggedData.key, partition.id);
      }
    } catch (error) {
      console.error('[PartitionItem] Failed to parse drop data:', error);
    }
  };

  // 渲染组合标签
  const renderCombinationTags = () => {
    if (!partitionCombinations || partitionCombinations.length === 0) return [];

    return partitionCombinations.map((combination) => {
      const combKey = `combination:${combination.id}`;
      return h(
        'span',
        {
          key: combKey,
          class: 'prompt-selector-tag combination-tag',
          draggable: true,
          onDragStart: (e) => {
            e.dataTransfer.setData(
              'text/plain',
              JSON.stringify({
                type: 'combination',
                key: combKey,
              }),
            );
            e.dataTransfer.effectAllowed = 'move';
          },
        },
        [
          h('span', { class: 'prompt-selector-tag-icon' }, h(Icon, { name: 'link', size: 12 })),
          combination.name,
          h(
            'button',
            {
              class: 'prompt-remove-btn',
              onClick: (e) => {
                e.stopPropagation();
                onCombinationRemove && onCombinationRemove(combKey);
              },
            },
            h(Icon, { name: 'x', size: 12 }),
          ),
        ],
      );
    });
  };

  return h('div', { class: partitionClass }, [
    // 分区头部
    h(PartitionHeader, {
      partition,
      onAction: onPartitionAction,
      onPreviewEnter: handlePreviewEnter,
      onPreviewLeave: handlePreviewLeave,
    }),

    // 内容区域（启用状态才显示）
    partition.enabled &&
      h(
        'div',
        {
          class: 'partition-prompts',
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
        },
        [
          // 渲染该分区的组合
          ...renderCombinationTags(),

          // 渲染该分区的分类
          ...(partitionCategories || []).map((category) => {
            return h(
              'span',
              {
                key: `cat-${category.id}`,
                class: 'prompt-selector-tag category-tag',
                draggable: true,
                onDragStart: (e) => {
                  e.dataTransfer.setData(
                    'text/plain',
                    JSON.stringify({
                      type: 'category',
                      id: category.id,
                    }),
                  );
                  e.dataTransfer.effectAllowed = 'move';
                },
              },
              [
                h('span', { class: 'prompt-selector-tag-icon' }, h(Icon, { name: 'folder', size: 12 })),
                category.name,
                partition.config?.autoSaveCombinationCategoryId === category.id &&
                  h('span', {
                    class: 'prompt-selector-tag-badge auto-save-badge',
                    title: '组合自动保存到此分类',
                  }, h(Icon, { name: 'bookmark', size: 10 })),
                category.metadata?.blockGallerySave &&
                  h('span', {
                    class: 'prompt-selector-tag-badge gallery-block-badge',
                    title: '已禁止保存到画廊',
                  }, h(Icon, { name: 'ban', size: 10 })),
                h(
                  'button',
                  {
                    class: 'prompt-remove-btn',
                    onClick: (e) => {
                      e.stopPropagation();
                      onCategoryRemove && onCategoryRemove(category.id);
                    },
                  },
                  h(Icon, { name: 'x', size: 12 }),
                ),
              ],
            );
          }),

          // 渲染该分区的Prompt（含孤立项）
          ...prompts.map((prompt) => {
            const key = prompt._orphaned ? prompt._orphanedKey : `${prompt.categoryId}:${prompt.value}`;
            const weight = promptWeights && promptWeights[key] != null ? promptWeights[key] : 1.0;
            const showWeight = !prompt._orphaned && Math.abs(weight - 1.0) > 0.001;
            const tagStyle = prompt._orphaned ? {} : { background: getWeightColor(weight) };
            return h(
              'span',
              {
                key: key,
                'data-weight-key': key,
                class: `prompt-selector-tag ${prompt._orphaned ? 'orphaned' : ''} ${hoveredKey === key ? 'weight-focused' : ''}`,
                style: tagStyle,
                draggable: !prompt._orphaned,
                onDragStart: prompt._orphaned
                  ? undefined
                  : (e) => {
                      e.dataTransfer.setData(
                        'text/plain',
                        JSON.stringify({
                          type: 'prompt',
                          key: key,
                        }),
                      );
                      e.dataTransfer.effectAllowed = 'move';
                    },
                onMouseEnter: prompt._orphaned
                  ? undefined
                  : () => {
                      cancelHide();
                      setHoveredKey(key);
                    },
                onMouseLeave: prompt._orphaned
                  ? undefined
                  : () => {
                      scheduleHide();
                    },
              },
              [
                showWeight && h('span', { class: 'prompt-weight-value' }, weight.toFixed(1)),
                prompt._orphaned &&
                  h(
                    'span',
                    { class: 'prompt-selector-tag-icon' },
                    h(Icon, {
                      name: 'alert-triangle',
                      size: 12,
                    }),
                  ),
                h(
                  'span',
                  { class: 'prompt-name' },
                  (prompt.name || prompt.value) + (prompt._orphaned ? ' (未找到)' : ''),
                ),
                h(
                  'button',
                  {
                    class: 'prompt-remove-btn',
                    onClick: (e) => {
                      e.stopPropagation();
                      onPromptRemove && onPromptRemove(key);
                    },
                  },
                  h(Icon, { name: 'x', size: 12 }),
                ),
              ],
            );
          }),

          // 空状态提示
          totalCount === 0 && h('div', { class: 'partition-empty' }, '拖拽Prompt或分类到此处'),
        ],
      ),
  ]);
}
