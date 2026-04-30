/**
 * 画廊数据获取 Hook
 */
import { useState, useRef, useCallback } from '../../lib/hooks.mjs';
import { fetchGalleryData } from '../../utils.js';

export function useGalleryData(categoryId = 'root') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 使用 ref 跟踪最新的 categoryId，避免 loadData 闭包过期
  const categoryIdRef = useRef(categoryId);
  categoryIdRef.current = categoryId;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGalleryData(categoryIdRef.current);
      // 预计算最大时间用于排序优化
      result.prompts = result.prompts.map((prompt) => ({
        ...prompt,
        maxTime:
          prompt.images && prompt.images.length > 0
            ? Math.max(...prompt.images.map((img) => img.mtime))
            : prompt.createdAt || 0,
      }));
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    data,
    loading,
    error,
    loadData,
    setData,
  };
}
