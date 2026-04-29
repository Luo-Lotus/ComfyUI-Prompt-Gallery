/**
 * 分区列表组件
 * 显示所有分区及其包含的画师，支持分区拖拽排序
 */
import { h } from '../../lib/preact.mjs';
import { useState, useRef } from '../../lib/hooks.mjs';
import { PartitionItem } from './PartitionItem.js';
import { AddPartitionForm } from './AddPartitionForm.js';

export function PartitionList({
    partitions,
    artistsByPartition,
    categoriesByPartition,
    combinationsByPartition,
    artistWeights,
    onPartitionAction,
    onPartitionReorder,
    onArtistMove,
    onArtistRemove,
    onCategoryMove,
    onCategoryRemove,
    onCombinationMove,
    onCombinationRemove,
    onArtistWeightChange,
}) {
    const [showAddPartition, setShowAddPartition] = useState(false);
    const [dragOverInfo, setDragOverInfo] = useState(null); // { partitionId, position: 'before'|'after' }
    const draggedPartitionIdRef = useRef(null);

    const sortedPartitions = [...partitions].sort((a, b) => a.order - b.order);

    const handlePartitionDragOver = (e, partitionId) => {
        const data = e.dataTransfer;
        if (!data) return;
        // 只处理分区类型的拖拽
        try {
            // dataTransfer.types 在 dragover 中可用
            if (!data.types || !data.types.includes('text/plain')) return;
        } catch { return; }

        // 延迟读取 dataTransfer 数据不可行（dragover 中无法 getData），
        // 所以通过 ref 判断是否是分区拖拽
        if (!draggedPartitionIdRef.current) return;
        if (draggedPartitionIdRef.current === partitionId) return;

        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        setDragOverInfo({ partitionId, position });
    };

    const handlePartitionDragLeave = (e) => {
        // 只在真正离开元素时清除
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right ||
            e.clientY < rect.top || e.clientY > rect.bottom) {
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

            const fromIndex = sortedPartitions.findIndex(p => p.id === data.partitionId);
            const targetIndex = sortedPartitions.findIndex(p => p.id === info.partitionId);
            if (fromIndex < 0 || targetIndex < 0) return;

            // 计算 toIndex
            let toIndex = info.position === 'before' ? targetIndex : targetIndex + 1;
            if (fromIndex < toIndex) toIndex--;

            if (fromIndex !== toIndex) {
                onPartitionReorder && onPartitionReorder(fromIndex, toIndex);
            }
        } catch { } finally {
            draggedPartitionIdRef.current = null;
        }
    };

    const handlePartitionDragEnd = () => {
        draggedPartitionIdRef.current = null;
        setDragOverInfo(null);
    };

    // 全局 dragstart 监听：记录拖拽的分区 ID
    const handleGlobalDragStart = (e) => {
        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.type === 'partition') {
                draggedPartitionIdRef.current = data.partitionId;
            }
        } catch { }
    };

    // 渲染添加分区表单
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

    // 渲染添加分区按钮
    const renderAddButton = () => {
        if (showAddPartition) return null;

        return h('button', {
            class: 'add-partition-btn',
            onClick: () => setShowAddPartition(true),
            disabled: partitions.length >= 10,
        }, '+ 添加分区');
    };

    // 计算总画师数
    const totalArtists = Object.values(artistsByPartition || {}).reduce((sum, artists) => sum + artists.length, 0);
    const totalCombinations = Object.values(combinationsByPartition || {}).reduce((sum, combs) => sum + combs.length, 0);

    // 渲染分区项（含插入指示线）
    const renderPartitionWithIndicator = (partition, index) => {
        const result = [];
        const isDragOver = dragOverInfo && dragOverInfo.partitionId === partition.id;

        // 上方插入指示线
        if (isDragOver && dragOverInfo.position === 'before') {
            result.push(h('div', { key: `indicator-before-${partition.id}`, class: 'partition-drop-indicator' }));
        }

        result.push(h('div', {
            key: partition.id,
            class: `partition-wrapper ${draggedPartitionIdRef.current === partition.id ? 'partition-dragging' : ''}`,
            'data-partition-id': partition.id,
            onDragOver: (e) => handlePartitionDragOver(e, partition.id),
            onDragLeave: handlePartitionDragLeave,
            onDrop: handlePartitionDrop,
            onDragEnd: handlePartitionDragEnd,
        }, h(PartitionItem, {
            partition,
            artists: (artistsByPartition || {})[partition.id] || [],
            partitionCategories: (categoriesByPartition || {})[partition.id] || [],
            partitionCombinations: (combinationsByPartition || {})[partition.id] || [],
            artistWeights,
            onPartitionAction,
            onArtistMove,
            onCategoryMove,
            onArtistRemove,
            onCategoryRemove,
            onCombinationMove,
            onCombinationRemove,
            onArtistWeightChange,
        })));

        // 下方插入指示线
        if (isDragOver && dragOverInfo.position === 'after') {
            result.push(h('div', { key: `indicator-after-${partition.id}`, class: 'partition-drop-indicator' }));
        }

        return result;
    };

    return h('div', {
        class: 'partition-list',
        onDragStart: handleGlobalDragStart,
    }, [
        // 头部
        h('div', { class: 'partition-list-header' }, [
            h('span', { class: 'partition-list-title' }, `已选择 (${totalArtists + totalCombinations})`),
            renderAddButton(),
        ]),

        // 添加分区表单
        renderAddPartitionForm(),

        // 分区列表
        h('div', { class: 'partition-list-content' },
            sortedPartitions.flatMap((partition, index) =>
                renderPartitionWithIndicator(partition, index)
            )
        ),
    ]);
}
