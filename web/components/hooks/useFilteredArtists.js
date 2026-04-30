/**
 * Prompt过滤和排序 Hook
 */
import { useMemo } from '../../lib/hooks.mjs';

export function useFilteredArtists(data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites) {
  const filteredArtists = useMemo(() => {
    if (!data) return [];
    let result = [...data.artists];

    // 搜索过滤（搜索 value、name、alias）
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((a) => {
        const value = (a.value || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        const alias = (a.alias || '').toLowerCase();
        return value.includes(query) || name.includes(query) || alias.includes(query);
      });
    }

    // 收藏过滤
    if (showFavoritesOnly) {
      result = result.filter((a) => favorites.has(a.value));
    }

    // 排序
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.value.localeCompare(b.value, 'zh-CN');
      } else if (sortBy === 'count' || sortBy === 'image_count') {
        comparison = a.imageCount - b.imageCount;
      } else if (sortBy === 'time' || sortBy === 'created_at') {
        comparison = (a.maxTime || 0) - (b.maxTime || 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [data, searchQuery, sortBy, sortOrder, showFavoritesOnly, favorites]);

  return filteredArtists;
}
