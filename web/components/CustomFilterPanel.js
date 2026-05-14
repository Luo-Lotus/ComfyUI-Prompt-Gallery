/**
 * 自定义筛查面板（悬浮浮窗）
 * 展示所有筛查项，每个筛查项有输入框（带下拉补全）
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback, useRef } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';

export function CustomFilterPanel({
  filters,
  filterValues,
  onFilterChange,
  onEdit,
  onDelete,
  onExtract,
  onAdd,
  onClearAll,
  onMouseEnter,
  onMouseLeave,
}) {
  return h('div', {
    class: 'custom-filter-panel',
    onMouseEnter,
    onMouseLeave,
  }, [
    // 标题行
    h('div', { class: 'custom-filter-panel-header' }, [
      h('span', { class: 'custom-filter-panel-title' }, '自定义筛查'),
      h('button', {
        class: 'gallery-modal-btn small',
        onClick: onAdd,
        title: '新建筛查项',
      }, [
        h(Icon, { name: 'plus', size: 12 }),
        ' 新建',
      ]),
    ]),

    // 筛查项列表
    h('div', { class: 'custom-filter-panel-body' },
      filters.length === 0
        ? h('div', { class: 'custom-filter-empty' }, '暂无筛查项，点击「新建」创建')
        : filters.map(flt =>
            h(FilterItemRow, {
              key: flt.id,
              filter: flt,
              value: filterValues[flt.id] || '',
              onChange: (val) => onFilterChange(flt.id, val),
              onEdit: () => onEdit(flt),
              onDelete: () => onDelete(flt.id),
              onExtract: () => onExtract(flt.id),
            })
          )
    ),

    // 清空按钮（仅在有筛选值时显示）
    Object.values(filterValues).some(v => v) &&
      h('div', { class: 'custom-filter-panel-footer' }, [
        h('button', {
          class: 'custom-filter-clear-btn',
          onClick: onClearAll,
        }, '清空所有筛选'),
      ]),
  ]);
}

function FilterItemRow({ filter, value, onChange, onEdit, onDelete, onExtract }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInput = useCallback((e) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    if (filter.options && filter.options.length > 0) {
      setShowDropdown(true);
    }
  }, [onChange, filter.options]);

  const handleSelect = useCallback((opt) => {
    setInputValue(opt);
    onChange(opt);
    setShowDropdown(false);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    setTimeout(() => setShowDropdown(false), 200);
  }, []);

  const handleFocus = useCallback(() => {
    if (filter.options && filter.options.length > 0) {
      setShowDropdown(true);
    }
  }, [filter.options]);

  const filteredOptions = (filter.options || []).filter(opt =>
    !inputValue || opt.toLowerCase().includes(inputValue.toLowerCase())
  );

  return h('div', { class: 'custom-filter-row' }, [
    h('div', { class: 'custom-filter-row-label' }, [
      h('span', { class: 'custom-filter-row-name' }, filter.name),
    ]),

    h('div', { class: 'custom-filter-row-input-wrap' }, [
      h('input', {
        class: 'custom-filter-input',
        type: 'text',
        value: inputValue,
        onInput: handleInput,
        onFocus: handleFocus,
        onBlur: handleBlur,
        placeholder: '输入筛选值...',
      }),
      showDropdown && filteredOptions.length > 0 &&
        h('div', { class: 'custom-filter-dropdown' },
          filteredOptions.slice(0, 50).map(opt =>
            h('div', {
              class: 'custom-filter-dropdown-item',
              onMouseDown: (e) => {
                e.preventDefault();
                handleSelect(opt);
              },
            }, opt)
          )
        ),
    ]),

    h('div', { class: 'custom-filter-row-actions' }, [
      h('button', {
        class: 'custom-filter-action-btn',
        onClick: onExtract,
        title: '重新提取选项',
      }, h(Icon, { name: 'refresh-cw', size: 12 })),
      h('button', {
        class: 'custom-filter-action-btn',
        onClick: onEdit,
        title: '编辑',
      }, h(Icon, { name: 'edit', size: 12 })),
      h('button', {
        class: 'custom-filter-action-btn danger',
        onClick: onDelete,
        title: '删除',
      }, h(Icon, { name: 'trash-2', size: 12 })),
    ]),
  ]);
}
