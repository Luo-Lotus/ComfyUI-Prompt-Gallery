/**
 * 分区列表组件
 * 显示所有分区及其内容，支持分区拖拽排序
 */
import { h } from '../../lib/preact.mjs';
import { useState, useRef } from '../../lib/hooks.mjs';
import { PartitionItem } from './PartitionItem.js';
import { AddPartitionForm } from './AddPartitionForm.js';

export function PartitionList({
  partitions,
  itemsByPartition,
  promptWeights,
  coversCache,
  onPartitionAction,
  onPartitionReorder,
  onItemMove,
  onItemRemove,
  onItemReorder,
  onPromptWeightChange,
}) {
  const [showAddPartition, setShowAddPartition] = useState(false);
  const [dragOverInfo, setDragOverInfo] = useState(null);
  const draggedPartitionIdRef = useRef(null);

  const sortedPartitions = [...partitions].sort((a, b) => a.order - b.order);

  const handlePartitionDragOver = (e, partitionId) => {
    const data = e.dataTransfer;
    if (!data) return;
    try {
      if (!data.types || !data.types.includes('text/plain')) return;
    } catch {
      return;
    }

    if (!draggedPartitionIdRef.current) return;
    if (draggedPartitionIdRef.current === partitionId) return;

    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDragOverInfo({ partitionId, position });
  };

  const handlePartitionDragLeave = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDragOverInfo(null);
    }
  };

  const handlePartitionDrop = (e) => {
    e.preventDefault();
    const info = dragOverInfo;
    setDragOverInfo(null);

    if (!draggedPartitionIdRef.current || !info) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type !== 'partition') return;

      const fromIndex = sortedPartitions.findIndex((p) => p.id === data.partitionId);
      const targetIndex = sortedPartitions.findIndex((p) => p.id === info.partitionId);
      if (fromIndex < 0 || targetIndex < 0) return;

      let toIndex = info.position === 'before' ? targetIndex : targetIndex + 1;
      if (fromIndex < toIndex) toIndex--;

      if (fromIndex !== toIndex) {
        onPartitionReorder && onPartitionReorder(fromIndex, toIndex);
      }
    } catch {
    } finally {
      draggedPartitionIdRef.current = null;
    }
  };

  const handlePartitionDragEnd = () => {
    draggedPartitionIdRef.current = null;
    setDragOverInfo(null);
  };

  const handleGlobalDragStart = (e) => {
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type === 'partition') {
        draggedPartitionIdRef.current = data.partitionId;
      }
    } catch {}
  };

  const renderAddPartitionForm = () => {
    if (!showAddPartition) return null;

    return h(AddPartitionForm, {
      onConfirm: (name) => {
        onPartitionAction('add', name);
        setShowAddPartition(false);
      },
      onCancel: () => {
        setShowAddPartition(false);
      },
      maxPartitions: 10,
      currentPartitionCount: partitions.length,
    });
  };

  const renderAddButton = () => {
    if (showAddPartition) return null;

    return h(
      'button',
      {
        class: 'add-partition-btn',
        onClick: () => setShowAddPartition(true),
        disabled: partitions.length >= 10,
      },
      '+ 添加分区',
    );
  };

  // 计算总项数
  const totalItems = Object.values(itemsByPartition || {}).reduce((sum, items) => sum + items.length, 0);

  const renderPartitionWithIndicator = (partition, index) => {
    const result = [];
    const isDragOver = dragOverInfo && dragOverInfo.partitionId === partition.id;

    if (isDragOver && dragOverInfo.position === 'before') {
      result.push(
        h('div', {
          key: `indicator-before-${partition.id}`,
          class: 'partition-drop-indicator',
        }),
      );
    }

    result.push(
      h(
        'div',
        {
          key: partition.id,
          class: `partition-wrapper ${draggedPartitionIdRef.current === partition.id ? 'partition-dragging' : ''}`,
          'data-partition-id': partition.id,
          onDragOver: (e) => handlePartitionDragOver(e, partition.id),
          onDragLeave: handlePartitionDragLeave,
          onDrop: handlePartitionDrop,
          onDragEnd: handlePartitionDragEnd,
        },
        h(PartitionItem, {
          partition,
          items: (itemsByPartition || {})[partition.id] || [],
          promptWeights,
          coversCache,
          onPartitionAction,
          onItemMove,
          onItemRemove: (type, key) => onItemRemove && onItemRemove(type, key, partition.id),
          onItemReorder: (fromIndex, toIndex) => onItemReorder && onItemReorder(partition.id, fromIndex, toIndex),
          onPromptWeightChange,
        }),
      ),
    );

    if (isDragOver && dragOverInfo.position === 'after') {
      result.push(
        h('div', {
          key: `indicator-after-${partition.id}`,
          class: 'partition-drop-indicator',
        }),
      );
    }

    return result;
  };

  return h(
    'div',
    {
      class: 'partition-list',
      onDragStart: handleGlobalDragStart,
    },
    [
      h('div', { class: 'partition-list-header' }, [
        h('span', { class: 'partition-list-title' }, `已选择 (${totalItems})`),
        renderAddButton(),
      ]),

      renderAddPartitionForm(),

      h(
        'div',
        { class: 'partition-list-content' },
        sortedPartitions.flatMap((partition, index) => renderPartitionWithIndicator(partition, index)),
      ),
    ],
  );
}
