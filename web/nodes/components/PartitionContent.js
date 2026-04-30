/**
 * 分区内容组件
 * 显示分区中的Prompt和分类标签
 */
import { h } from '../../lib/preact.mjs';
import { Icon } from '../../lib/icons.mjs';

export function PartitionContent({
  prompts,
  partitionCategories,
  partitionId,
  onPromptMove,
  onCategoryMove,
  onPromptRemove,
  onCategoryRemove,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  // 渲染分类标签
  const renderCategoryTag = (category) => {
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
        h(
          'button',
          {
            class: 'prompt-remove-btn',
            onClick: (e) => {
              e.stopPropagation();
              onCategoryRemove(category.id);
            },
          },
          h(Icon, { name: 'x', size: 12 }),
        ),
      ],
    );
  };

  // 渲染Prompt标签
  const renderPromptTag = (prompt) => {
    const key = `${prompt.categoryId}:${prompt.value}`;

    return h(
      'span',
      {
        key: key,
        class: 'prompt-selector-tag',
        draggable: true,
        onDragStart: (e) => {
          e.dataTransfer.setData(
            'text/plain',
            JSON.stringify({
              type: 'prompt',
              key: key,
            }),
          );
          e.dataTransfer.effectAllowed = 'move';
        },
      },
      [
        h('span', { class: 'prompt-name' }, prompt.name || prompt.value),
        h(
          'button',
          {
            class: 'prompt-remove-btn',
            onClick: (e) => {
              e.stopPropagation();
              onPromptRemove(key);
            },
          },
          h(Icon, { name: 'x', size: 12 }),
        ),
      ],
    );
  };

  const hasContent = prompts.length > 0 || partitionCategories.length > 0;

  return h(
    'div',
    {
      class: 'partition-prompts',
      onDragOver: (e) => onDragOver(e),
      onDragLeave: () => onDragLeave(),
      onDrop: (e) => onDrop(e),
    },
    [
      // 渲染该分区的分类
      ...partitionCategories.map(renderCategoryTag),

      // 渲染该分区的Prompt
      hasContent ? prompts.map(renderPromptTag) : h('div', { class: 'partition-empty' }, '拖拽Prompt或分类到此处'),
    ],
  );
}
