/**
 * 分区预览 Hook
 * 悬浮预览图标时弹出浮窗，展示分区内所有 prompt/组合的封面图
 * 使用 useBodyRender 渲染到 body，不受节点 transform 影响
 */
import { h } from '../../../lib/preact.mjs';
import { useRef, useEffect, useCallback } from '../../../lib/hooks.mjs';
import { buildImageUrl } from '../../../utils.js';
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
    (event, items) => {
      clearTimeout(hideTimerRef.current);
      // currentTarget 在事件回调返回后会被清空，必须同步捕获
      const rect = event.currentTarget.getBoundingClientRect();
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

  const onPreviewLeave = useCallback(() => {
    clearTimeout(showTimerRef.current);
    hideTimerRef.current = setTimeout(() => clear(), 200);
  }, [clear]);

  const buildPreviewItems = useCallback(
    (partition, prompts, partitionCategories, partitionCombinations, allPrompts) => {
      const items = [];

      // 直接 prompt
      for (const prompt of prompts) {
        if (prompt._orphaned) continue;
        items.push({
          type: 'prompt',
          name: prompt.name || prompt.value,
          coverImagePath: prompt.coverImagePath,
        });
      }

      // 直接组合
      if (partitionCombinations) {
        for (const comb of partitionCombinations) {
          items.push({
            type: 'combination',
            name: comb.name,
            coverImagePath: comb.coverImagePath,
          });
        }
      }

      // 分类展开：从 allPrompts 中找属于该分类的 prompt
      if (partitionCategories && allPrompts) {
        for (const cat of partitionCategories) {
          const catPrompts = allPrompts.filter((p) => p.categoryId === cat.id);
          for (const prompt of catPrompts) {
            items.push({
              type: 'prompt',
              name: `${cat.name} / ${prompt.name || prompt.value}`,
              coverImagePath: prompt.coverImagePath,
            });
          }
        }
      }

      return items;
    },
    [],
  );

  return { onPreviewEnter, onPreviewLeave, buildPreviewItems };
}
