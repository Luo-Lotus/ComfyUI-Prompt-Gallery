/**
 * Prompt Selector Preact 组件
 * Prompt选择器的 UI 渲染部分
 */
import { h } from '../../lib/preact.mjs';
import { useState, useMemo, useCallback, useRef, useEffect } from '../../lib/hooks.mjs';
import { Icon } from '../../lib/icons.mjs';
import { usePromptSelector } from './hooks/usePromptSelector.js';
import { useImagePreview } from './hooks/useImagePreview.js';
import { useContextMenu } from '../../components/ContextMenu.js';
import { PartitionList } from './PartitionList.js';
import { PartitionConfigPanel } from './PartitionConfigPanel.js';
import { LazyList } from '../../components/LazyList.js';
import { showToast } from '../../components/Toast.js';

export function PromptSelectorWidget({ nodeInstance, selectedInput, metadataInput }) {
  const {
    prompts,
    categories,
    combinations,
    selectedKeys,
    selectedCategories,
    selectedCombinationKeys,
    selectedPromptsCache,
    loading,
    searchQuery,
    sortBy,
    sortOrder,
    currentCategory,
    filteredPrompts,
    selectedPromptsList,
    selectedCategoriesList,
    refreshing,
    breadcrumbPath,
    partitionData,
    getPromptsByPartition,
    getCategoriesByPartition,
    getCombinationsByPartition,
    addPartition,
    deletePartition,
    updatePartition,
    movePromptToPartition,
    setPromptWeight,
    moveCategoryToPartition,
    moveCombinationToPartition,
    togglePartition,
    setAsDefaultPartition,
    reorderPartitions,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    toggleSelection,
    toggleCategorySelection,
    toggleCombinationSelection,
    handleCategoryChange,
    handleRefresh,
    makePromptKey,
    parsePromptKey,
    updateNodeValue,
    allPrompts,
  } = usePromptSelector(nodeInstance, selectedInput, metadataInput);

  // 使用图片预览 hook
  const { showPreview, removePreview } = useImagePreview();

  // 使用右键菜单 hook
  const { showContextMenu } = useContextMenu();

  // 分区配置面板状态
  const [showPartitionConfig, setShowPartitionConfig] = useState(false);
  const [editingPartitionId, setEditingPartitionId] = useState(null);

  // 拖拽分隔条状态
  const [splitPercent, setSplitPercent] = useState(35);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const draggingRef = useRef(false);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(70, Math.max(15, rawPercent)));
    };
    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // ============ 子组件渲染函数 ============

  /**
   * 渲染面包屑导航
   */
  const renderBreadcrumb = () => {
    if (breadcrumbPath.length === 0) return null;

    return h(
      'div',
      { class: 'prompt-selector-breadcrumb' },
      h('div', { class: 'prompt-selector-breadcrumb-list' }, [
        // 只显示子分类路径
        breadcrumbPath.map((cat, index) => [
          index > 0 &&
            h(
              'span',
              {
                key: `sep-${index}`,
                class: 'prompt-selector-breadcrumb-separator',
              },
              '/',
            ),
          h(
            'span',
            {
              key: cat.id,
              class: `prompt-selector-breadcrumb-item ${currentCategory === cat.id ? 'active' : ''}`,
              onClick: () => handleCategoryChange(cat.id),
            },
            cat.name,
          ),
        ]),
      ]),
    );
  };

  // 鼠标悬停处理
  const handleMouseEnter = (prompt, event) => {
    showPreview(prompt, event);
  };

  // 鼠标离开处理
  const handleMouseLeave = () => {
    removePreview();
  };

  /**
   * 渲染已选择的Prompt和分类标签列表
   */
  const renderSelectedPrompts = () => {
    return h(PartitionList, {
      partitions: partitionData.partitions,
      promptsByPartition: getPromptsByPartition,
      categoriesByPartition: getCategoriesByPartition,
      combinationsByPartition: getCombinationsByPartition,
      promptWeights: partitionData.promptWeights,
      selectedCategories: selectedCategoriesList,
      categories: categories,
      onPartitionAction: (action, data) => {
        if (action === 'add') {
          addPartition(data);
        } else if (action === 'delete') {
          deletePartition(data);
        } else if (action === 'config') {
          setEditingPartitionId(data);
          setShowPartitionConfig(true);
        } else if (action === 'toggle') {
          togglePartition(data);
        } else if (action === 'setDefault') {
          setAsDefaultPartition(data);
        }
      },
      onPartitionReorder: reorderPartitions,
      onPromptMove: (promptKey, partitionId) => {
        movePromptToPartition(promptKey, partitionId);
      },
      onPromptRemove: (promptKey) => {
        const { categoryId, value } = parsePromptKey(promptKey);
        toggleSelection(categoryId, value);
      },
      onCategoryMove: (categoryId, partitionId) => {
        moveCategoryToPartition(categoryId, partitionId);
      },
      onCategoryRemove: (categoryId) => {
        toggleCategorySelection(categoryId);
      },
      onCombinationMove: (combinationKey, partitionId) => {
        moveCombinationToPartition(combinationKey, partitionId);
      },
      onCombinationRemove: (combinationKey) => {
        // 从 key 提取 combination id
        const combId = combinationKey.replace('combination:', '');
        toggleCombinationSelection(combId);
      },
      onPromptWeightChange: (promptKey, weight) => {
        setPromptWeight(promptKey, weight);
      },
    });
  };

  /**
   * 渲染分类卡片
   */
  const renderCategoryCard = (cat) => {
    const isSelected = selectedCategories.has(cat.id);
    return h(
      'div',
      {
        key: cat.id,
        class: `prompt-selector-category-card ${currentCategory === cat.id ? 'active' : ''} ${isSelected ? 'selected' : ''}`,
        onClick: (e) => {
          // 点击分类卡片选择/取消选择分类
          toggleCategorySelection(cat.id);
        },
        onContextMenu: (e) => {
          e.preventDefault();
          showContextMenu(e, [
            {
              icon: 'copy',
              label: '复制文本',
              action: () => {
                navigator.clipboard.writeText(cat.name);
                showToast('已复制', 'success');
              },
            },
            {
              icon: 'image',
              label: '在画廊中打开',
              action: () => {
                if (window.__openPromptGalleryTo) {
                  window.__openPromptGalleryTo({
                    type: 'category',
                    categoryId: cat.id,
                  });
                }
              },
            },
          ]);
        },
        title: '点击选择分类，点击 > 进入分类',
      },
      [
        h('span', { class: 'prompt-selector-category-icon' }, h(Icon, { name: 'folder', size: 16 })),
        h('span', { class: 'prompt-selector-category-name' }, cat.name),
        h(
          'span',
          {
            class: 'prompt-selector-category-enter',
            onClick: (e) => {
              e.stopPropagation();
              handleCategoryChange(cat.id);
            },
            title: '进入分类',
          },
          h(Icon, { name: 'chevron-right', size: 14 }),
        ),
      ],
    );
  };

  /**
   * 渲染搜索和排序控件（同一行）
   */
  const renderControls = () => {
    return h('div', { class: 'prompt-selector-controls-row' }, [
      h('input', {
        type: 'text',
        class: 'prompt-selector-search',
        placeholder: '搜索Prompt...',
        value: searchQuery,
        onInput: (e) => setSearchQuery(e.target.value),
      }),
      h('div', { class: 'prompt-selector-sort-controls' }, [
        h(
          'select',
          {
            class: 'prompt-selector-sort-select',
            value: sortBy,
            onChange: (e) => setSortBy(e.target.value),
          },
          [
            h('option', { value: 'name' }, '名称'),
            h('option', { value: 'created_at' }, '创建时间'),
            h('option', { value: 'image_count' }, '图片数量'),
          ],
        ),
        h(
          'button',
          {
            class: 'prompt-selector-sort-button',
            onClick: () => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'),
          },
          sortOrder === 'asc'
            ? [h(Icon, { name: 'arrow-up', size: 12 }), ' 升序']
            : [h(Icon, { name: 'arrow-down', size: 12 }), ' 降序'],
        ),
        h(
          'button',
          {
            class: 'prompt-selector-refresh-button',
            onClick: handleRefresh,
            disabled: refreshing,
            title: '刷新',
          },
          refreshing ? h(Icon, { name: 'loader', size: 14, class: 'spin' }) : h(Icon, { name: 'refresh-cw', size: 14 }),
        ),
      ]),
    ]);
  };

  /**
   * 渲染单个Prompt项
   */
  const renderPromptItem = (prompt) => {
    const key = makePromptKey(prompt.categoryId, prompt.value);
    const isSelected = selectedKeys.has(key);
    return h(
      'div',
      {
        key: key,
        class: `prompt-selector-item ${isSelected ? 'selected' : ''}`,
        onClick: () => toggleSelection(prompt.categoryId, prompt.value),
        onMouseEnter: (e) => handleMouseEnter(prompt, e),
        onMouseLeave: () => handleMouseLeave(),
        onContextMenu: (e) => {
          e.preventDefault();
          const text = prompt.value;
          showContextMenu(e, [
            {
              icon: 'copy',
              label: '复制文本',
              action: () => {
                navigator.clipboard.writeText(text);
                showToast('已复制', 'success');
              },
            },
            {
              icon: 'image',
              label: '在画廊中打开',
              action: () => {
                if (window.__openPromptGalleryTo) {
                  window.__openPromptGalleryTo({
                    type: 'prompt',
                    categoryId: prompt.categoryId,
                    promptName: prompt.name,
                  });
                }
              },
            },
          ]);
        },
      },
      [h('span', { class: 'prompt-selector-item-name' }, prompt.name || prompt.value)],
    );
  };

  /**
   * 渲染组合项
   */
  const renderCombinationItem = (combination) => {
    const key = `combination:${combination.id}`;
    const isSelected = selectedCombinationKeys.has(key);
    return h(
      'div',
      {
        key: key,
        class: `prompt-selector-item combination-item ${isSelected ? 'selected' : ''}`,
        onClick: () => toggleCombinationSelection(combination.id),
        onMouseEnter: (e) => handleMouseEnter(combination, e),
        onMouseLeave: () => handleMouseLeave(),
        onContextMenu: (e) => {
          e.preventDefault();
          showContextMenu(e, [
            {
              icon: 'copy',
              label: '复制文本',
              action: () => {
                navigator.clipboard.writeText(combination.outputContent);
                showToast('已复制', 'success');
              },
            },
            {
              icon: 'image',
              label: '在画廊中打开',
              action: () => {
                if (window.__openPromptGalleryTo) {
                  window.__openPromptGalleryTo({
                    type: 'combination',
                    categoryId: combination.categoryId || currentCategory,
                    combinationId: combination.id,
                  });
                }
              },
            },
            {
              icon: 'unlink',
              label: '拆分选择',
              action: () => {
                const promptMap = partitionData.promptPartitionMap || {};
                (combination.prompts || []).forEach((promptValue) => {
                  const promptInfo = (allPrompts || []).find((p) => p.value === promptValue);
                  const categoryId = promptInfo ? promptInfo.categoryId : combination.categoryId;
                  const key = makePromptKey(categoryId, promptValue);
                  if (!(key in promptMap)) {
                    toggleSelection(categoryId, promptValue);
                  }
                });
                const comboKey = `combination:${combination.id}`;
                if (comboKey in (partitionData.combinationPartitionMap || {})) {
                  toggleCombinationSelection(combination.id);
                }
                showToast(`已拆分组合「${combination.name}」`, 'success');
              },
            },
          ]);
        },
      },
      [
        h('span', { class: 'prompt-selector-item-icon' }, h(Icon, { name: 'link', size: 14 })),
        h('span', { class: 'prompt-selector-item-name' }, combination.name),
        h('span', { class: 'prompt-selector-combination-count' }, `${(combination.prompts || []).length}人`),
      ],
    );
  };

  /**
   * 渲染Prompt列表（包含分类和Prompt）- 使用 LazyList 懒加载
   */
  const renderPromptList = () => {
    if (loading) {
      return h('div', { class: 'prompt-selector-list' }, h('div', { class: 'prompt-selector-loading' }, '加载中...'));
    }

    // 获取当前分类的子分类（从扁平列表中按 parentId 过滤）
    const childrenCategories = categories.filter((c) => c.parentId === currentCategory);

    // 合并为扁平数组
    const listItems = [
      ...childrenCategories.map((cat) => ({
        type: 'category',
        data: cat,
      })),
      ...(combinations || []).map((comb) => ({
        type: 'combination',
        data: comb,
      })),
      ...filteredPrompts.map((prompt) => ({
        type: 'prompt',
        data: prompt,
      })),
    ];

    const renderListItem = (item, index) => {
      if (item.type === 'category') return renderCategoryCard(item.data);
      if (item.type === 'combination') return renderCombinationItem(item.data);
      return renderPromptItem(item.data);
    };

    return h(LazyList, {
      items: listItems,
      renderItem: renderListItem,
      layout: 'flex',
      className: 'prompt-selector-list',
      scrollContainer: 'self',
      emptyMessage: h('div', { class: 'prompt-selector-empty-prompts' }, '没有找到Prompt'),
    });
  };

  // ============ 主渲染 ============

  // 处理全局配置保存
  return h('div', { class: 'prompt-selector-container', ref: containerRef }, [
    // 分区配置面板（覆盖在内容之上）
    showPartitionConfig &&
      h('div', { class: 'prompt-selector-config-overlay' }, [
        h(PartitionConfigPanel, {
          partition: partitionData.partitions.find((p) => p.id === editingPartitionId) || partitionData.partitions[0],
          globalConfig: partitionData.globalConfig,
          onChange: (updates) => updatePartition(editingPartitionId, updates),
          onClose: () => setShowPartitionConfig(false),
        }),
      ]),

    // 主内容
    !showPartitionConfig && [
      // 已选择区域（分区列表）
      h('div', {
        class: 'prompt-selector-section',
        style: { flex: `${splitPercent} 1 0%` },
      }, [renderSelectedPrompts()]),

      // 拖拽分隔条
      h('div', {
        class: `prompt-selector-resize-handle${isDragging ? ' active' : ''}`,
        onMouseDown: handleResizeStart,
      }),

      // 浏览区域
      h('div', {
        class: 'prompt-selector-section',
        style: { flex: `${100 - splitPercent} 1 0%` },
      }, [
        // 面包屑导航
        renderBreadcrumb(),

        // 搜索和排序控件（同一行）
        renderControls(),

        // Prompt列表（包含分类和Prompt）
        renderPromptList(),
      ]),
    ],
  ]);
}
