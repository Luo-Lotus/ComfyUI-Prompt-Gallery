/**
 * 分区预览 Hook
 * 悬浮预览图标时弹出浮窗，展示分区内所有 prompt/组合的封面图
 * 使用 useBodyRender 渲染到 body，不受节点 transform 影响
 * 支持按需获取封面和分类展开
 */
import { h } from '../../../lib/preact.mjs';
import { useRef, useEffect, useCallback } from '../../../lib/hooks.mjs';
import { buildImageUrl, fetchCovers } from '../../../utils.js';
import { useBodyRender } from './useBodyRender.js';

function PartitionPreviewPopup({ items, style, onMouseEnter, onMouseLeave }) {
  if (!items || items.length === 0) {
    return h(
      'div',
      { class: 'partition-preview-popup', style, onMouseEnter, onMouseLeave },
      h('div', { class: 'partition-preview-empty' }, '无预览内容'),
    );
  }

  return h(
    'div',
    { class: 'partition-preview-popup', style, onMouseEnter, onMouseLeave },
    h(
      'div',
      { class: 'partition-preview-grid' },
      items.map((item, i) =>
        h('div', { key: i, class: 'partition-preview-item' }, [
          item.coverImagePath
            ? h('img', {
                class: 'partition-preview-img',
                src: buildImageUrl(item.coverImagePath),
                alt: item.name,
                loading: 'lazy',
              })
            : h('div', { class: 'partition-preview-placeholder' }, '无封面'),
          h('div', { class: 'partition-preview-overlay' }, [
            h('span', { class: 'partition-preview-name', title: item.name }, item.name),
          ]),
        ]),
      ),
    ),
  );
}

export function usePartitionPreview() {
  const { renderToBody, clear } = useBodyRender();
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  // 清理定时器
  useEffect(
    () => () => {
      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      clear();
    },
    [],
  );

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimerRef.current);
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimeout(showTimerRef.current);
    hideTimerRef.current = setTimeout(() => clear(), 200);
  }, [clear]);

  const onPreviewEnter = useCallback(
    (eventOrRect, items) => {
      clearTimeout(hideTimerRef.current);
      // currentTarget 在事件回调返回后会被清空，必须同步捕获
      const rect = eventOrRect instanceof DOMRect ? eventOrRect : eventOrRect.currentTarget.getBoundingClientRect();
      showTimerRef.current = setTimeout(() => {
        const popupWidth = 640;
        let left = rect.left;
        if (left + popupWidth > window.innerWidth) {
          left = window.innerWidth - popupWidth - 8;
        }
        if (left < 8) left = 8;

        renderToBody(
          h(PartitionPreviewPopup, {
            items,
            style: {
              position: 'fixed',
              top: `${rect.bottom + 4}px`,
              left: `${left}px`,
              pointerEvents: 'auto',
            },
            onMouseEnter: cancelHide,
            onMouseLeave: scheduleHide,
          }),
        );
      }, 300);
    },
    [renderToBody, cancelHide, scheduleHide],
  );

  const onPreviewEnterWithFetch = useCallback(
    async (event, partition, prompts, partitionCategories, partitionCombinations, coversCache) => {
      // currentTarget 在 async 后会被清空，必须同步捕获
      const rect = event.currentTarget.getBoundingClientRect();
      const items = await buildPreviewItemsWithFetch(
        partition, prompts, partitionCategories, partitionCombinations, coversCache,
      );
      onPreviewEnter(rect, items);
    },
    [onPreviewEnter],
  );

  const onPreviewLeave = useCallback(() => {
    clearTimeout(showTimerRef.current);
    hideTimerRef.current = setTimeout(() => clear(), 200);
  }, [clear]);

  // 构建预览项（含按需获取封面和分类展开）
  const buildPreviewItemsWithFetch = useCallback(
    async (partition, prompts, partitionCategories, partitionCombinations, coversCache) => {
      const items = [];
      const coverKeysToFetch = [];
      const combCoverIdsToFetch = [];

      // 直接 prompt
      for (const prompt of prompts) {
        if (prompt._orphaned) continue;
        const coverPath = prompt.coverImagePath;
        if (!coverPath) {
          coverKeysToFetch.push(`${prompt.categoryId || 'root'}:${prompt.value}`);
        }
        items.push({
          type: 'prompt',
          name: prompt.name || prompt.value,
          coverImagePath: coverPath || null,
          _key: `${prompt.categoryId || 'root'}:${prompt.value}`,
        });
      }

      // 直接组合
      if (partitionCombinations) {
        for (const comb of partitionCombinations) {
          const coverPath = comb.coverImagePath;
          if (!coverPath) {
            combCoverIdsToFetch.push(comb.id);
          }
          items.push({
            type: 'combination',
            name: comb.name,
            coverImagePath: coverPath || null,
            _key: `combination:${comb.id}`,
          });
        }
      }

      // 分类展开：通过 /data?category= 获取该分类下的 prompt
      if (partitionCategories) {
        for (const cat of partitionCategories) {
          try {
            const response = await fetch(`/prompt_gallery/data?category=${cat.id}`);
            const data = await response.json();
            for (const prompt of (data.prompts || [])) {
              const coverPath = prompt.coverImagePath;
              if (!coverPath) {
                coverKeysToFetch.push(`${cat.id}:${prompt.value}`);
              }
              items.push({
                type: 'prompt',
                name: `${cat.name} / ${prompt.name || prompt.value}`,
                coverImagePath: coverPath || null,
                _key: `${cat.id}:${prompt.value}`,
              });
            }
          } catch (err) {
            console.error('[PartitionPreview] Failed to load category prompts:', err);
          }
        }
      }

      // 批量获取缺失的封面
      if (coverKeysToFetch.length > 0 || combCoverIdsToFetch.length > 0) {
        try {
          const result = await fetchCovers(coverKeysToFetch, combCoverIdsToFetch);
          const covers = result.covers || {};
          // 更新 items 中的 coverImagePath
          for (const item of items) {
            if (!item.coverImagePath && item._key) {
              item.coverImagePath = covers[item._key] || null;
            }
          }
        } catch (err) {
          console.error('[PartitionPreview] Failed to fetch covers:', err);
        }
      }

      // 清理临时 _key 字段
      return items.map(({ _key, ...rest }) => rest);
    },
    [],
  );

  return { onPreviewEnter, onPreviewEnterWithFetch, onPreviewLeave, buildPreviewItemsWithFetch };
}
