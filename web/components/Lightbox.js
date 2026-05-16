/**
 * 图片灯箱组件
 * 全屏查看图片 + 右侧信息面板 + 编辑模式（混淆/画笔）
 */
import { h } from '../lib/preact.mjs';
import { useState, useEffect, useCallback } from '../lib/hooks.mjs';
import { Icon } from '../lib/icons.mjs';
import { buildImageUrl } from '../utils.js';
import { showToast } from './Toast.js';
import { useLightboxEditor } from './hooks/useLightboxEditor.js';

function CopyButton({ text, label }) {
  return h(
    'button',
    {
      class: 'lightbox-info-copy-btn',
      onClick: (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(
          () => showToast(`${label || '内容'}已复制`, 'success'),
          () => showToast('复制失败', 'error'),
        );
      },
      title: '复制',
    },
    h(Icon, { name: 'copy', size: 12 }),
  );
}

function InfoBlock({ title, icon, children, copyText, copyLabel }) {
  return h('div', { class: 'lightbox-info-block' }, [
    h('div', { class: 'lightbox-info-block-title' }, [
      h(Icon, { name: icon, size: 14 }),
      h('span', {}, title),
      copyText && h(CopyButton, { text: copyText, label: copyLabel }),
    ]),
    h('div', { class: 'lightbox-info-block-content' }, children),
  ]);
}

function parseImageInfo(info, imagePath) {
  if (!info) return null;

  const mapping = info.mapping;
  const pnginfo = info.pnginfo || {};
  const fileInfo = info.fileInfo || {};

  let galleryData = {};
  try {
    if (pnginfo.prompt_gallery) galleryData = JSON.parse(pnginfo.prompt_gallery);
  } catch {}

  let promptText = '';
  try {
    if (pnginfo.prompt) {
      const parsed = JSON.parse(pnginfo.prompt);
      promptText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
    }
  } catch {
    promptText = pnginfo.prompt || '';
  }

  const metaPromptString = mapping?.promptString || galleryData.prompt_string || '';
  const metaPrompt = mapping?.generatePrompt || '';
  const displayPrompt = promptText || metaPrompt;

  let workflowText = '';
  try {
    if (pnginfo.workflow) {
      const wf = JSON.parse(pnginfo.workflow);
      workflowText = JSON.stringify(wf, null, 2);
    }
  } catch {
    workflowText = pnginfo.workflow || '';
  }

  const promptNames = mapping?.prompts || galleryData.prompt_names || [];
  const promptJson = promptNames.length > 0 ? JSON.stringify(promptNames, null, 2) : '';

  return {
    fileInfo,
    promptNames,
    promptJson,
    metaPromptString,
    displayPrompt,
    workflowText,
    imagePath,
  };
}

function InfoPanel({ info, loading, imagePath }) {
  if (loading) {
    return h('div', { class: 'lightbox-info-loading' }, h(Icon, { name: 'loader', size: 20, class: 'spin' }));
  }

  if (!info) {
    return h('div', { class: 'lightbox-info-empty' }, '暂无信息');
  }

  const { fileInfo, promptJson, promptNames, metaPromptString, displayPrompt, workflowText, imagePath: path } = info;

  return h('div', { class: 'lightbox-info-content' }, [
    h(InfoBlock, { title: '文件信息', icon: 'image' }, [
      h('div', { class: 'lightbox-info-grid' }, [
        h('div', { class: 'lightbox-info-row' }, [
          h('span', { class: 'lightbox-info-label' }, '尺寸'),
          h(
            'span',
            { class: 'lightbox-info-value' },
            fileInfo.width && fileInfo.height ? `${fileInfo.width} x ${fileInfo.height}` : '-',
          ),
        ]),
        h('div', { class: 'lightbox-info-row' }, [
          h('span', { class: 'lightbox-info-label' }, '大小'),
          h('span', { class: 'lightbox-info-value' }, fileInfo.sizeFormatted || '-'),
        ]),
        h('div', { class: 'lightbox-info-row' }, [
          h('span', { class: 'lightbox-info-label' }, '路径'),
          h('span', { class: 'lightbox-info-value lightbox-info-path' }, path || '-'),
        ]),
      ]),
    ]),

    path && h('div', { class: 'lightbox-info-copy-row' }, [h(CopyButton, { text: path, label: '路径' })]),

    promptJson &&
      h(
        InfoBlock,
        {
          title: `Prompt (${promptNames.length})`,
          icon: 'star',
          copyText: promptJson,
          copyLabel: 'Prompt列表',
        },
        [h('pre', { class: 'lightbox-info-pre' }, promptJson)],
      ),

    metaPromptString &&
      h(
        InfoBlock,
        {
          title: 'Prompt String',
          icon: 'edit',
          copyText: metaPromptString,
          copyLabel: 'Prompt String',
        },
        [h('pre', { class: 'lightbox-info-pre' }, metaPromptString)],
      ),

    displayPrompt &&
      h(
        InfoBlock,
        {
          title: 'Prompt',
          icon: 'edit',
          copyText: displayPrompt,
          copyLabel: 'Prompt',
        },
        [h('pre', { class: 'lightbox-info-pre' }, displayPrompt)],
      ),

    workflowText &&
      h(
        InfoBlock,
        {
          title: '工作流',
          icon: 'package',
          copyText: workflowText,
          copyLabel: '工作流',
        },
        [h('pre', { class: 'lightbox-info-pre lightbox-info-workflow' }, workflowText)],
      ),

    !promptNames?.length &&
      !displayPrompt &&
      !metaPromptString &&
      !workflowText &&
      h('div', { class: 'lightbox-info-empty' }, '暂无额外信息'),
  ]);
}

function EditToolbar({ editor }) {
  const { activeTool, setActiveTool, applyObfuscation, restoreOriginal, handleUndo, exitEditMode } = editor;

  const toolbarBtn = (icon, title, onClick, isActive) =>
    h(
      'button',
      {
        class: isActive ? 'active' : '',
        onClick: (e) => { e.stopPropagation(); onClick(); },
        title,
      },
      h(Icon, { name: icon, size: 16 }),
    );

  return h('div', { class: 'gallery-lightbox-edit-toolbar' }, [
    toolbarBtn('shuffle', '混淆', applyObfuscation, false),
    toolbarBtn('refresh-cw', '还原', restoreOriginal, false),
    toolbarBtn('brush', '画笔', () => setActiveTool(activeTool === 'brush' ? 'none' : 'brush'), activeTool === 'brush'),
    toolbarBtn('undo', '撤销', handleUndo, false),
    toolbarBtn('x', '退出编辑', exitEditMode, false),
  ]);
}

function BrushPanel({ brushColor, brushSize, onColorChange, onSizeChange }) {
  return h('div', { class: 'gallery-lightbox-brush-panel' }, [
    h('input', {
      type: 'color',
      value: brushColor,
      onInput: (e) => onColorChange(e.target.value),
      title: '画笔颜色',
    }),
    h('span', { class: 'brush-size-label' }, `${brushSize}px`),
    h('input', {
      type: 'range',
      min: 1,
      max: 50,
      value: brushSize,
      onInput: (e) => onSizeChange(parseInt(e.target.value)),
      title: '画笔大小',
    }),
    h('div', {
      class: 'brush-size-preview',
      style: {
        width: `${Math.max(4, brushSize)}px`,
        height: `${Math.max(4, brushSize)}px`,
        borderRadius: '50%',
        background: brushColor,
      },
    }),
  ]);
}

export function Lightbox({ isOpen, prompt, imageIndex, onClose, onNavigate }) {
  const [showInfo, setShowInfo] = useState(true);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const editor = useLightboxEditor();

  const img = prompt ? prompt.images[imageIndex] : null;
  const imagePath = img?.path;

  useEffect(() => {
    if (isOpen && imagePath) {
      setLoading(true);
      setInfo(null);
      fetch(`/prompt_gallery/image/info?path=${encodeURIComponent(imagePath)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setInfo(parseImageInfo(data.info, imagePath));
          } else {
            showToast('获取图片信息失败: ' + (data.error || ''), 'error');
          }
        })
        .catch((err) => showToast('请求失败: ' + err.message, 'error'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, imagePath]);

  useEffect(() => {
    if (editor.editMode) {
      editor.exitEditMode();
    }
  }, [imagePath]);

  const handlePrev = () => onNavigate(-1);
  const handleNext = () => onNavigate(1);

  const handleKeyDown = useCallback(
    (e) => {
      if (editor.editMode) {
        if (e.key === 'Escape') {
          editor.exitEditMode();
          return;
        }
      }
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(-1);
      if (e.key === 'ArrowRight') onNavigate(1);
    },
    [onClose, onNavigate, editor.editMode, editor.exitEditMode],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen || !prompt || !img) return null;

  const cursorStyle = editor.editMode && editor.activeTool === 'brush'
    ? 'crosshair'
    : editor.editMode && editor.activeTool === 'obfuscate'
      ? 'pointer'
      : undefined;

  return h(
    'div',
    {
      class: `gallery-lightbox ${isOpen ? 'open' : ''}`,
      onClick: (e) => {
        if (editor.editMode) return;
        if (
          e.target.classList.contains('gallery-lightbox') ||
          e.target.classList.contains('gallery-lightbox-image-section')
        )
          onClose();
      },
    },
    [
      h('div', { class: 'gallery-lightbox-image-section' }, [
        editor.editMode
          ? h('canvas', {
              ref: (el) => { editor.canvasRef.current = el; },
              class: 'gallery-lightbox-canvas',
              style: cursorStyle ? { cursor: cursorStyle } : undefined,
              onMouseDown: editor.handleBrushStart,
              onMouseMove: editor.handleBrushMove,
              onMouseUp: editor.handleBrushEnd,
              onMouseLeave: editor.handleBrushEnd,
              onTouchStart: editor.handleBrushStart,
              onTouchMove: editor.handleBrushMove,
              onTouchEnd: editor.handleBrushEnd,
            })
          : h('img', {
              class: 'gallery-lightbox-img',
              src: buildImageUrl(img.path, img.type),
              alt: prompt.name || prompt.value,
            }),

        !editor.editMode &&
          h(
            'button',
            {
              class: 'gallery-lightbox-nav gallery-lightbox-prev',
              onClick: handlePrev,
            },
            h(Icon, { name: 'chevron-left', size: 24 }),
          ),

        !editor.editMode &&
          h(
            'button',
            {
              class: 'gallery-lightbox-nav gallery-lightbox-next',
              onClick: handleNext,
            },
            h(Icon, { name: 'chevron-right', size: 24 }),
          ),

        !editor.editMode &&
          h(
            'button',
            {
              class: 'gallery-lightbox-edit-btn',
              onClick: (e) => {
                e.stopPropagation();
                editor.enterEditMode(img.path, img.type);
              },
              title: '编辑图片',
            },
            h(Icon, { name: 'edit', size: 18 }),
            h('span', {}, '编辑'),
          ),

        editor.editMode &&
          h(EditToolbar, { editor }),

        editor.editMode && editor.activeTool === 'brush' &&
          h(BrushPanel, {
            brushColor: editor.brushColor,
            brushSize: editor.brushSize,
            onColorChange: editor.setBrushColor,
            onSizeChange: editor.setBrushSize,
          }),

        h('div', { class: 'gallery-lightbox-info' }, [
          h('span', {}, `${prompt.name || prompt.value} · ${imageIndex + 1} / ${prompt.images.length}`),
          h(
            'button',
            {
              class: `gallery-lightbox-info-toggle ${showInfo ? 'active' : ''}`,
              onClick: () => setShowInfo((prev) => !prev),
              title: showInfo ? '隐藏信息' : '显示信息',
            },
            h(Icon, { name: 'info-circle', size: 14 }),
          ),
        ]),
      ]),

      showInfo &&
        h('div', { class: 'gallery-lightbox-info-panel' }, [
          h('div', { class: 'lightbox-info-header' }, [
            h(Icon, { name: 'info-circle', size: 16 }),
            h('span', {}, '图片信息'),
          ]),
          h(InfoPanel, { info, loading, imagePath: img?.path }),
        ]),
    ],
  );
}
