/**
 * 画师选择逻辑 Hook
 * 处理画师数据加载、选择状态管理、排序过滤等逻辑
 */
import { useState, useEffect, useMemo, useCallback } from '../../../lib/hooks.mjs';
import { useImagePreview } from './useImagePreview.js';
import { useNodeSync } from './useNodeSync.js';
import { usePartitionState } from './usePartitionState.js';

// 辅助函数：构建面包屑路径
function buildBreadcrumbPath(categoryId, categories) {
  const path = [];

  function findPath(id) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;

    path.unshift(cat);

    if (cat.parentId) {
      findPath(cat.parentId);
    }
  }

  if (categoryId && categoryId !== 'root') {
    findPath(categoryId);
  }

  return path;
}

export function usePromptSelector(nodeInstance, selectedInput, metadataInput) {
  // 使用图片预览 hook
  const { showPreview, removePreview } = useImagePreview();

  // 基础状态管理
  const [prompts, setPrompts] = useState([]); // 当前分类的画师
  const [allPrompts, setAllPrompts] = useState([]); // 所有画师（用于分类选择）
  const [categories, setCategories] = useState([]);
  const [selectedPromptsCache, setSelectedPromptsCache] = useState({}); // 缓存所有已选择的画师信息
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentCategory, setCurrentCategory] = useState('root');
  const [refreshing, setRefreshing] = useState(false);
  const [combinations, setCombinations] = useState([]); // 当前分类的组合
  const [allCombinations, setAllCombinations] = useState([]); // 所有组合（需要在 usePartitionState 之前定义）

  // 分区系统状态（由 usePartitionState hook 管理）
  const {
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
  } = usePartitionState({
    selectedPromptsCache,
    categories,
    combinations: allCombinations,
    metadataInput,
  });

  // 选择状态从分区映射中推导（分区映射是唯一真相来源）
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(Object.keys(partitionData.promptPartitionMap || {})));
  const [selectedCategories, setSelectedCategories] = useState(
    () => new Set(Object.keys(partitionData.categoryPartitionMap || {})),
  );

  // 组合系统状态
  const selectedCombinationKeys = useMemo(() => {
    return new Set(Object.keys(partitionData.combinationPartitionMap || {}));
  }, [partitionData.combinationPartitionMap]);

  // 计算面包屑路径
  const breadcrumbPath = useMemo(() => {
    return buildBreadcrumbPath(currentCategory, categories);
  }, [currentCategory, categories]);

  // 计算已选择的画师列表（从缓存中获取）
  const selectedPromptsList = useMemo(() => {
    return Array.from(selectedKeys)
      .map((key) => selectedPromptsCache[key])
      .filter(Boolean);
  }, [selectedKeys, selectedPromptsCache]);

  // 计算已选择的分类列表
  const selectedCategoriesList = useMemo(() => {
    return Array.from(selectedCategories)
      .map((catId) => {
        return categories.find((c) => c.id === catId);
      })
      .filter(Boolean);
  }, [selectedCategories, categories]);

  // 辅助函数：生成组合键
  const makePromptKey = (categoryId, value) => `${categoryId}:${value}`;

  // 辅助函数：解析组合键
  const parsePromptKey = (key) => {
    const [categoryId, value] = key.split(':');
    return { categoryId, value };
  };

  // 一次性加载分类树、所有画师和所有组合
  useEffect(() => {
    const loadInitData = async () => {
      try {
        const response = await fetch('/prompt_gallery/init');
        const data = await response.json();
        setCategories(data.categories || []);
        setAllPrompts(data.prompts || []);
        setAllCombinations(data.combinations || []);
      } catch (error) {
        console.error('[PromptSelector] Failed to load init data:', error);
      }
    };
    loadInitData();
  }, []);

  // 当 allPrompts 加载完成后，补全缓存中缺失的画师信息
  useEffect(() => {
    if (!allPrompts || allPrompts.length === 0 || selectedKeys.size === 0) return;

    setSelectedPromptsCache((prev) => {
      const newCache = { ...prev };
      let changed = false;
      selectedKeys.forEach((key) => {
        if (newCache[key]) return;
        const { categoryId, value } = parsePromptKey(key);
        const prompt = allPrompts.find((a) => a.categoryId === categoryId && a.value === value);
        if (prompt) {
          newCache[key] = prompt;
          changed = true;
        }
      });
      return changed ? newCache : prev;
    });
  }, [allPrompts, selectedKeys]);

  // 加载画师列表（根据分类筛选）
  useEffect(() => {
    const loadPrompts = async () => {
      setLoading(true);
      try {
        // 加载当前分类的画师
        const url =
          currentCategory === 'root'
            ? '/prompt_gallery/data?category=root'
            : `/prompt_gallery/data?category=${currentCategory}`;
        const response = await fetch(url);
        const data = await response.json();

        // 从响应中提取画师数据
        const promptsList = data.prompts || [];
        setPrompts(promptsList);

        // 直接使用 data 接口返回的组合数据（不再单独请求）
        setCombinations(data.combinations || []);
      } catch (error) {
        console.error('[PromptSelector] Failed to load prompts:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPrompts();
  }, [currentCategory]);

  // 过滤和排序
  const filteredPrompts = useMemo(() => {
    if (!prompts || prompts.length === 0) return [];
    let result = [...prompts];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((a) => a.value.toLowerCase().includes(query) || a.name.toLowerCase().includes(query));
    }

    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.value.localeCompare(b.value, 'zh-CN');
      } else if (sortBy === 'created_at') {
        comparison = a.createdAt - b.createdAt;
      } else if (sortBy === 'image_count') {
        comparison = (a.imageCount || 0) - (b.imageCount || 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [prompts, searchQuery, sortBy, sortOrder]);

  // 切换画师选择状态（扁平化更新，消除嵌套 setter）
  const toggleSelection = useCallback(
    (categoryId, value) => {
      const key = makePromptKey(categoryId, value);
      const isAdding = !selectedKeys.has(key);

      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (isAdding) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });

      setSelectedPromptsCache((prev) => {
        const next = { ...prev };
        if (isAdding) {
          const prompt = prompts.find((a) => a.categoryId === categoryId && a.value === value);
          if (prompt) next[key] = prompt;
        } else {
          delete next[key];
        }
        return next;
      });

      // 分区映射更新委托给 usePartitionState（自动持久化）
      if (isAdding) {
        const defaultPartition = partitionData.partitions.find((p) => p.isDefault);
        if (defaultPartition) {
          movePromptToPartition(key, defaultPartition.id);
        }
      } else {
        movePromptToPartition(key, null);
      }
    },
    [selectedKeys, prompts, partitionData, makePromptKey, movePromptToPartition],
  );

  // 切换分类选择状态（扁平化更新）
  const toggleCategorySelection = useCallback(
    (categoryId) => {
      const isAdding = !selectedCategories.has(categoryId);

      setSelectedCategories((prev) => {
        const next = new Set(prev);
        if (isAdding) {
          next.add(categoryId);
        } else {
          next.delete(categoryId);
        }
        return next;
      });

      // 分区映射更新委托给 usePartitionState（自动持久化）
      if (isAdding) {
        const defaultPartition = partitionData.partitions.find((p) => p.isDefault);
        if (defaultPartition) {
          moveCategoryToPartition(categoryId, defaultPartition.id);
        }
      } else {
        moveCategoryToPartition(categoryId, null);
      }
    },
    [selectedCategories, partitionData, moveCategoryToPartition],
  );

  // 切换组合选择状态
  const toggleCombinationSelection = useCallback(
    (combinationId) => {
      const combinationKey = `combination:${combinationId}`;
      const isAdding = !selectedCombinationKeys.has(combinationKey);

      // 分区映射更新委托给 usePartitionState（自动持久化）
      if (isAdding) {
        const defaultPartition = partitionData.partitions.find((p) => p.isDefault);
        if (defaultPartition) {
          moveCombinationToPartition(combinationKey, defaultPartition.id);
        }
      } else {
        moveCombinationToPartition(combinationKey, null);
      }
    },
    [selectedCombinationKeys, partitionData, moveCombinationToPartition],
  );

  // 节点同步：通过 useNodeSync hook 处理
  const { updateNodeValue } = useNodeSync({
    nodeInstance,
    selectedInput,
    metadataInput,
    selectedKeys,
    selectedPromptsCache,
    partitionData,
  });

  // 分类切换处理
  const handleCategoryChange = (categoryId) => {
    setCurrentCategory(categoryId);
    // 切换分类时清空搜索
    setSearchQuery('');
  };

  // 刷新数据
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // 刷新初始化数据（分类、所有画师、所有组合）
      const initResponse = await fetch('/prompt_gallery/init');
      const initData = await initResponse.json();
      setCategories(initData.categories || []);
      setAllPrompts(initData.prompts || []);
      setAllCombinations(initData.combinations || []);

      // 同时刷新当前分类的画师
      const url =
        currentCategory === 'root'
          ? '/prompt_gallery/data?category=root'
          : `/prompt_gallery/data?category=${currentCategory}`;
      const response = await fetch(url);
      const data = await response.json();
      setPrompts(data.prompts || []);
      setCombinations(data.combinations || []);
    } catch (error) {
      console.error('[PromptSelector] Failed to refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // 分区操作函数由 usePartitionState hook 提供（见上方解构赋值）

  return {
    // 状态
    prompts,
    categories,
    selectedKeys,
    selectedCategories,
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

    // 组合系统
    combinations,
    selectedCombinationKeys,
    toggleCombinationSelection,

    // 分区系统状态和操作
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

    // 操作
    setSearchQuery,
    setSortBy,
    setSortOrder,
    toggleSelection,
    toggleCategorySelection,
    handleCategoryChange,
    handleRefresh,
    makePromptKey,
    parsePromptKey,
    updateNodeValue, // 导出 updateNodeValue 函数
  };
}
